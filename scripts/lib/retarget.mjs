// Converte landmarks 3D do MediaPipe Pose (33 pontos, metros, origem no quadril) em um AnimationClip
// para um esqueleto Mixamo, usando a pose de bind (T-pose) do próprio personagem.
//  - suaviza o ruído do vídeo (interpolação de pontos com baixa visibilidade, mediana e gaussiana)
//  - normaliza o heading: o personagem começa olhando para +Z (a frente do modelo)
//  - rotações de membros por direção (sem "twist"); tronco/cabeça por base completa
import * as THREE from 'three';
import fs from 'node:fs/promises';

const LM = { nose: 0, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lPi: 17, rPi: 18, lIn: 19, rIn: 20,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lHe: 29, rHe: 30, lFt: 31, rFt: 32 };
const Y = new THREE.Vector3(0, 1, 0);

export async function loadLandmarks(file) {
  const d = JSON.parse(await fs.readFile(file, 'utf8'));
  const n = d.length;
  const P = Array.from({ length: n }, (_, f) => d[f].landmarks_3d.map((p) => [p.x, -p.y, -p.z]));   // y p/ cima, mão direita
  const V = Array.from({ length: n }, (_, f) => d[f].landmarks_3d.map((p) => p.visibility));
  return { n, P, V };
}

function gaussKernel(sigma) {
  const r = Math.ceil(sigma * 3), k = []; let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); s += v; }
  return k.map((v) => v / s);
}

/** Suaviza P[frame][lm][xyz] (modifica e devolve). */
export function smoothLandmarks({ n, P, V }, { sigma = 2, medianWin = 5, minVis = 0.35 } = {}) {
  const K = 33;
  for (let l = 0; l < K; l++) for (let c = 0; c < 3; c++) {
    let s = Array.from({ length: n }, (_, f) => P[f][l][c]);
    // 1) pontos com baixa visibilidade são refeitos por interpolação linear
    const ok = Array.from({ length: n }, (_, f) => V[f][l] >= minVis);
    let last = -1;
    for (let f = 0; f < n; f++) {
      if (!ok[f]) continue;
      if (last >= 0 && f - last > 1) for (let g = last + 1; g < f; g++) s[g] = s[last] + ((s[f] - s[last]) * (g - last)) / (f - last);
      if (last < 0) for (let g = 0; g < f; g++) s[g] = s[f];
      last = f;
    }
    if (last >= 0) for (let g = last + 1; g < n; g++) s[g] = s[last];
    // 2) mediana (remove picos)
    const h = (medianWin - 1) / 2;
    s = s.map((_, f) => { const w = []; for (let g = f - h; g <= f + h; g++) w.push(s[Math.min(n - 1, Math.max(0, g))]); w.sort((a, b) => a - b); return w[h]; });
    // 3) gaussiana
    const k = gaussKernel(sigma), r = (k.length - 1) / 2;
    const o = s.map((_, f) => { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * s[Math.min(n - 1, Math.max(0, f + i))]; return a; });
    for (let f = 0; f < n; f++) P[f][l][c] = o[f];
  }
  return { n, P, V };
}

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const mid = (a, b) => v3(a).add(v3(b)).multiplyScalar(0.5);

function facingOf(P) {
  const l2r = v3(P[LM.lHip]).sub(v3(P[LM.rHip])), s2 = v3(P[LM.lSh]).sub(v3(P[LM.rSh]));
  const f1 = l2r.clone().setY(0).cross(Y), f2 = s2.clone().setY(0).cross(Y);
  return f1.normalize().add(f2.normalize());
}

/** Gira todos os pontos para que o personagem comece olhando para +Z. */
export function normalizeHeading({ n, P }, frames = 5) {
  const f = new THREE.Vector3();
  for (let i = 0; i < Math.min(frames, n); i++) f.add(facingOf(P[i]));
  const yaw = Math.atan2(f.x, f.z);
  for (let i = 0; i < n; i++) for (let l = 0; l < 33; l++) { const q = v3(P[i][l]).applyAxisAngle(Y, -yaw); P[i][l] = [q.x, q.y, q.z]; }
  return yaw;
}

function basisQuat(x, y, z) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); }

/** Base ortonormal (esquerda=+X, cima=+Y, frente=+Z) a partir de esquerda + cima. */
function frameFromLeftUp(left, up) {
  const x = left.clone().normalize(); const z = x.clone().cross(up).normalize(); const y = z.clone().cross(x).normalize();
  return basisQuat(x, y, z);
}
function frameFromLeftForward(left, fwd) {
  const x = left.clone().normalize(); const z = fwd.clone().sub(x.clone().multiplyScalar(fwd.dot(x))).normalize(); const y = z.clone().cross(x).normalize();
  return basisQuat(x, y, z);
}

/**
 * @param base  objeto carregado do FBX (esqueleto Mixamo, em pose de bind)
 * @param lm    { n, P } já suavizado/normalizado
 * @param opts  { name, fps, scale, floorRef, footY(): menor altura do pé no mundo (cm), idleHold: Map<boneName,quat> }
 */
export function retargetClip(base, lm, opts) {
  const { n, P } = lm; const { name, fps, scale, floorRef, footY, idleHold } = opts;
  const bone = (nm) => base.getObjectByName('mixamorig' + nm);
  base.updateMatrixWorld(true);
  const bindW = {}, bindPos = {}, bindLocal = {};
  const names = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
  for (const nm of names) {
    const b = bone(nm); if (!b) throw new Error('osso ausente: ' + nm);
    bindW[nm] = b.getWorldQuaternion(new THREE.Quaternion()); bindPos[nm] = b.getWorldPosition(new THREE.Vector3()); bindLocal[nm] = b.quaternion.clone();
  }
  const bindDir = (a, b) => bindPos[b].clone().sub(bindPos[a]).normalize();
  const hipsBind = bone('Hips').position.clone();

  const times = Array.from({ length: n }, (_, i) => i / fps);
  const out = {}; for (const nm of names) out[nm] = [];
  const hipsY = [];
  const ID = new THREE.Quaternion();

  for (let f = 0; f < n; f++) {
    const p = P[f]; const L = (i) => v3(p[i]);
    const hipM = mid(p[LM.lHip], p[LM.rHip]), shM = mid(p[LM.lSh], p[LM.rSh]), earM = mid(p[LM.lEar], p[LM.rEar]);
    const torsoUp = shM.clone().sub(hipM).normalize();

    // deltas em mundo (relativos ao bind)
    const dHips = frameFromLeftUp(L(LM.lHip).sub(L(LM.rHip)), Y.clone().lerp(torsoUp, 0.4).normalize());
    const dChest = frameFromLeftUp(L(LM.lSh).sub(L(LM.rSh)), torsoUp);
    const dHead = frameFromLeftForward(L(LM.lEar).sub(L(LM.rEar)), L(LM.nose).sub(earM));
    const D = {
      Hips: dHips,
      Spine: ID.clone().slerp(dHips, 1).slerp(dChest, 1 / 3),
      Spine1: dHips.clone().slerp(dChest, 2 / 3),
      Spine2: dChest.clone(),
      Neck: dChest.clone().slerp(dHead, 0.5),
      Head: dHead,
      LeftShoulder: dChest.clone(), RightShoulder: dChest.clone(),
    };
    const dirDelta = (a, b, target) => new THREE.Quaternion().setFromUnitVectors(bindDir(a, b), target.clone().normalize());
    D.LeftArm = dirDelta('LeftArm', 'LeftForeArm', L(LM.lEl).sub(L(LM.lSh)));
    D.LeftForeArm = dirDelta('LeftForeArm', 'LeftHand', L(LM.lWr).sub(L(LM.lEl)));
    D.LeftHand = dirDelta('LeftForeArm', 'LeftHand', mid(p[LM.lPi], p[LM.lIn]).sub(L(LM.lWr)));
    D.RightArm = dirDelta('RightArm', 'RightForeArm', L(LM.rEl).sub(L(LM.rSh)));
    D.RightForeArm = dirDelta('RightForeArm', 'RightHand', L(LM.rWr).sub(L(LM.rEl)));
    D.RightHand = dirDelta('RightForeArm', 'RightHand', mid(p[LM.rPi], p[LM.rIn]).sub(L(LM.rWr)));
    D.LeftUpLeg = dirDelta('LeftUpLeg', 'LeftLeg', L(LM.lKn).sub(L(LM.lHip)));
    D.LeftLeg = dirDelta('LeftLeg', 'LeftFoot', L(LM.lAn).sub(L(LM.lKn)));
    D.LeftFoot = dirDelta('LeftFoot', 'LeftToeBase', L(LM.lFt).sub(L(LM.lAn)));
    D.LeftToeBase = D.LeftFoot.clone();
    D.RightUpLeg = dirDelta('RightUpLeg', 'RightLeg', L(LM.rKn).sub(L(LM.rHip)));
    D.RightLeg = dirDelta('RightLeg', 'RightFoot', L(LM.rAn).sub(L(LM.rKn)));
    D.RightFoot = dirDelta('RightFoot', 'RightToeBase', L(LM.rFt).sub(L(LM.rAn)));
    D.RightToeBase = D.RightFoot.clone();

    // mundo -> local, de cima para baixo
    const W = {};
    const parentOf = { Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck',
      LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
      RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
      LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot',
      RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot' };
    for (const nm of names) {
      const par = parentOf[nm];
      W[nm] = D[nm].clone().multiply(bindW[nm]);
      // ancestral fora do conjunto (ex.: o pai do Hips) mantém a pose de bind
      const parentW = par ? W[par] : bone('Hips').parent.getWorldQuaternion(new THREE.Quaternion());
      out[nm].push(parentW.clone().invert().multiply(W[nm]));
    }
  }

  // altura do quadril: o pé mais baixo encosta no chão (ground-lock), depois suaviza
  const tmp = new THREE.Quaternion();
  const applyFrame = (f) => { for (const nm of names) bone(nm).quaternion.copy(out[nm][f]); };
  for (let f = 0; f < n; f++) {
    bone('Hips').position.copy(hipsBind); applyFrame(f); base.updateMatrixWorld(true);
    hipsY.push(hipsBind.y - (footY() - floorRef) / scale);
  }
  const ky = gaussKernel(2.5), ry = (ky.length - 1) / 2;
  const hy = hipsY.map((_, f) => { let a = 0; for (let i = -ry; i <= ry; i++) a += ky[i + ry] * hipsY[Math.min(n - 1, Math.max(0, f + i))]; return a; });

  // restaura bind (o chamador reaplica a pose que quiser)
  for (const nm of names) bone(nm).quaternion.copy(bindLocal[nm]);
  bone('Hips').position.copy(hipsBind); base.updateMatrixWorld(true);

  const tracks = [];
  for (const nm of names) {
    const flat = []; let prev = null;
    for (const q of out[nm]) { const c = q.clone(); if (prev && prev.dot(c) < 0) { c.x = -c.x; c.y = -c.y; c.z = -c.z; c.w = -c.w; } flat.push(c.x, c.y, c.z, c.w); prev = c; }
    tracks.push(new THREE.QuaternionKeyframeTrack(`mixamorig${nm}.quaternion`, times, flat));
  }
  tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, hy.flatMap((y) => [hipsBind.x, y, hipsBind.z])));
  // ossos sem alvo (dedos etc.) ficam na pose de repouso do idle (punhos fechados)
  if (idleHold) for (const [boneName, q] of idleHold) if (!names.includes(boneName.replace('mixamorig', ''))) tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, [0, (n - 1) / fps], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]));
  void tmp;
  return new THREE.AnimationClip(name, (n - 1) / fps, tracks);
}

/** Eventos de "golpe": picos de velocidade (m/s) das mãos/pés suavizados. */
export function strikeEvents({ n, P }, fps, { minSpeed = 2.2, minGapSec = 0.5 } = {}) {
  const idx = [LM.lWr, LM.rWr, LM.lFt, LM.rFt];
  const sp = Array.from({ length: n }, (_, f) => f === 0 ? 0 : Math.max(...idx.map((i) => v3(P[f][i]).distanceTo(v3(P[f - 1][i])) * fps)));
  const ev = [];
  for (let f = 1; f < n - 1; f++) if (sp[f] > minSpeed && sp[f] >= sp[f - 1] && sp[f] >= sp[f + 1] && (!ev.length || (f - ev[ev.length - 1].frame) / fps >= minGapSec)) ev.push({ frame: f, sec: +(f / fps).toFixed(2), speed: +sp[f].toFixed(1) });
  return { events: ev, speeds: sp };
}

/** Último frame com movimento relevante (corta o trecho parado no final). */
export function activeEnd({ n, P }, fps, thresh = 0.35) {
  const idx = [LM.nose, LM.lWr, LM.rWr, LM.lAn, LM.rAn, LM.lKn, LM.rKn];
  const sp = Array.from({ length: n }, (_, f) => f === 0 ? 0 : idx.reduce((a, i) => a + v3(P[f][i]).distanceTo(v3(P[f - 1][i])) * fps, 0));
  let last = 0; for (let f = 0; f < n; f++) if (sp[f] > thresh) last = f;
  return Math.min(n - 1, last + Math.round(fps * 0.4));
}
