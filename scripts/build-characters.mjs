// Gera assets leves para o jogo a partir dos FBX/texturas originais (Mixamo + Meshy/Tripo).
//   node scripts/build-characters.mjs [id ...]
// Saída: assets/characters/<id>/{model.glb, diffuse.webp, normal.webp, meta.json}
//  - reduz a malha (200k-400k triângulos -> ~60k) mantendo UV/pesos de pele
//  - junta todas as animações num único GLB, removendo o "root motion" (o jogo move o personagem)
//  - mede alcance/impacto dos golpes, velocidade de passada e instantes do salto
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.({ target: this }); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.({ target: this });
    });
  }
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgAll = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/characters.config.json'), 'utf8'));
const only = process.argv.slice(2);
const log = (...a) => console.log(...a);
const origWarn = console.warn; console.warn = (m, ...r) => { if (!String(m).includes('skinning weights')) origWarn(m, ...r); };

async function loadFbx(file) {
  const buf = await fs.readFile(file);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
}

function findSkinned(root) { let s = null; root.traverse((o) => { if (o.isSkinnedMesh) s = o; }); return s; }

/** Reduz a malha preservando UV, normais e pesos de pele. */
async function decimate(skinned, targetTris) {
  await MeshoptSimplifier.ready;
  let g = BGU.mergeVertices(skinned.geometry, 1e-5);
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv.array, sw = g.attributes.skinWeight.array;
  const n = g.attributes.position.count, stride = 9;
  const attrs = new Float32Array(n * stride);
  for (let i = 0; i < n; i++) {
    attrs.set([uv[i * 2], uv[i * 2 + 1]], i * stride);
    attrs.set([nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]], i * stride + 2);
    attrs.set([sw[i * 4], sw[i * 4 + 1], sw[i * 4 + 2], sw[i * 4 + 3]], i * stride + 5);
  }
  const idx = Uint32Array.from(g.index.array);
  const before = idx.length / 3;
  const [out, err] = MeshoptSimplifier.simplifyWithAttributes(
    idx, new Float32Array(pos), 3, attrs, stride, [2.0, 2.0, 0.5, 0.5, 0.5, 0.4, 0.4, 0.4, 0.4], null, targetTris * 3, 0.05, []);
  // compacta vértices usados
  const remap = new Map(); const used = [];
  const newIdx = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    let r = remap.get(out[i]);
    if (r === undefined) { r = used.length; remap.set(out[i], r); used.push(out[i]); }
    newIdx[i] = r;
  }
  const ng = new THREE.BufferGeometry();
  const pick = (name, size, Arr) => {
    const src = g.attributes[name].array, dst = new Arr(used.length * size);
    used.forEach((v, k) => { for (let c = 0; c < size; c++) dst[k * size + c] = src[v * size + c]; });
    ng.setAttribute(name, new THREE.BufferAttribute(dst, size));
  };
  pick('position', 3, Float32Array); pick('normal', 3, Float32Array); pick('uv', 2, Float32Array);
  pick('skinIndex', 4, Uint16Array); pick('skinWeight', 4, Float32Array);
  ng.setIndex(new THREE.BufferAttribute(used.length > 65535 ? newIdx : Uint16Array.from(newIdx), 1));
  ng.computeBoundingBox();
  log(`  malha: ${before} -> ${out.length / 3} triângulos, ${used.length} vértices (erro ${err.toFixed(4)})`);
  return ng;
}

/** Remove escala e o deslocamento horizontal do quadril (o jogo move o personagem). */
function cleanClip(clip, name, flattenJumpRise) {
  const tracks = [];
  for (const t of clip.tracks) {
    if (t.name.endsWith('.scale')) continue;
    if (t.name === 'mixamorigHips.position') {
      const v = Float32Array.from(t.values);
      const x0 = v[0], y0 = v[1], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0; v[i + 2] = z0;
        if (flattenJumpRise) v[i + 1] = y0 + Math.min(v[i + 1] - y0, 0); // sobe pelo jogo, não pelo clip
      }
      tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
      continue;
    }
    tracks.push(t);
  }
  const c = new THREE.AnimationClip(name, clip.duration, tracks);
  return c;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

for (const [id, cfg] of Object.entries(cfgAll)) {
  if (only.length && !only.includes(id)) continue;
  log(`\n== ${cfg.name} (${id}) ==`);
  const dir = path.join(ROOT, cfg.dir);
  const outDir = path.join(ROOT, 'assets/characters', id);
  await fs.mkdir(outDir, { recursive: true });

  // 1) malha + esqueleto
  const base = await loadFbx(path.join(dir, 'animacoes', cfg.meshFrom));
  const skinned = findSkinned(base);
  skinned.geometry.computeBoundingBox();
  const bb = skinned.geometry.boundingBox;
  const geomH = bb.max.y - bb.min.y;
  const scale = cfg.heightCm / geomH;   // cm por unidade do modelo (altura em pé / T-pose)
  log(`  altura T-pose ${geomH.toFixed(3)} un -> escala ${scale.toFixed(2)} (alvo ${cfg.heightCm} cm)`);
  skinned.geometry = await decimate(skinned, cfg.targetTris);
  skinned.material = new THREE.MeshStandardMaterial({ name: `${id}_mat`, color: 0xffffff, roughness: 0.85, metalness: 0 });

  // 2) clips
  const clips = [];
  const meta = { id, name: cfg.name, heightCm: cfg.heightCm, scale, clips: {} };
  for (const [key, file] of Object.entries(cfg.clips)) {
    const fbx = file === cfg.meshFrom ? base : await loadFbx(path.join(dir, 'animacoes', file));
    const clip = cleanClip(fbx.animations[0], key, key === 'jump');
    clips.push(clip);
    meta.clips[key] = { duration: +clip.duration.toFixed(4), source: file };
  }

  // 3) medições por FK
  const mixer = new THREE.AnimationMixer(base);
  const bone = (n) => base.getObjectByName(n);
  const wp = (n) => bone(n).getWorldPosition(new THREE.Vector3()).multiplyScalar(scale);
  const poseAt = (clip, t) => { mixer.stopAllAction(); const a = mixer.clipAction(clip); a.play(); mixer.setTime(t); base.updateMatrixWorld(true); };
  const clipOf = (k) => clips.find((c) => c.name === k);

  // frente do personagem a partir da pose de bind (T-pose): (direita->esquerda) x (cima)
  base.updateMatrixWorld(true);
  const r2l = wp('mixamorigLeftUpLeg').sub(wp('mixamorigRightUpLeg')); r2l.y = 0;
  const fwd = r2l.normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
  poseAt(clipOf('idle'), 0);
  log(`  frente: ${fwd.toArray().map((n) => n.toFixed(2)).join(',')}`);
  meta.forward = fwd.toArray();
  // altura do chão: menor y da malha na pose idle
  skinned.skeleton.update();
  const v = new THREE.Vector3(); let minY = Infinity, maxY = -Infinity;
  const cnt = skinned.geometry.attributes.position.count;
  for (let i = 0; i < cnt; i++) { skinned.getVertexPosition(i, v); v.applyMatrix4(skinned.matrixWorld); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
  meta.groundOffsetCm = +(-minY * scale).toFixed(2);
  meta.idleHeightCm = +((maxY - minY) * scale).toFixed(1);
  log(`  idle: altura ${meta.idleHeightCm} cm, y do chão ${(minY * scale).toFixed(1)} cm`);
  const floorToe = Math.min(wp('mixamorigLeftToeBase').y, wp('mixamorigRightToeBase').y);

  // "Ground lock": em golpes/idle/reações o pé de apoio deve tocar o chão. Alguns clips do Mixamo levantam o
  // quadril (ex.: chute com saltinho) e o personagem ficaria flutuando; abaixamos o quadril na medida certa.
  const footY = () => Math.min(wp('mixamorigLeftToeBase').y, wp('mixamorigRightToeBase').y, wp('mixamorigLeftFoot').y - 8, wp('mixamorigRightFoot').y - 8);
  const floorRef = footY();
  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci];
    if (clip.name === 'jump') continue;
    const tr = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
    const v = Float32Array.from(tr.values); let maxFix = 0;
    for (let k = 0; k < tr.times.length; k++) {
      poseAt(clip, tr.times[k]);
      const lift = footY() - floorRef;                  // >0 = flutuando
      const fix = Math.max(-0.0, lift) / scale;         // em unidades do modelo
      v[k * 3 + 1] -= fix; maxFix = Math.max(maxFix, lift);
    }
    clips[ci] = new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map((t) => t === tr ? new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)) : t));
    if (maxFix > 1) log(`  ground-lock ${clip.name}: quadril abaixado até ${maxFix.toFixed(1)} cm`);
  }

  const sample = (clip, fn, step = 1 / 60) => { const out = []; for (let t = 0; t <= clip.duration + 1e-6; t += step) { poseAt(clip, Math.min(t, clip.duration)); out.push({ t, ...fn() }); } return out; };

  // golpes
  for (const key of ['punch', 'kick']) {
    const clip = clipOf(key), tips = cfg.tips[key];
    const S = sample(clip, () => {
      const hip = wp('mixamorigHips'); let best = { r: -1e9, y: 0, tip: '' }, prev = {};
      const tipPos = {};
      for (const tp of tips) { const p = wp(tp); tipPos[tp] = p; const r = p.clone().sub(hip).dot(fwd); if (r > best.r) best = { r, y: p.y - floorToe, tip: tp }; }
      return { ...best, tipPos };
    });
    // velocidade da ponta que atinge o máximo
    let iMax = 0; S.forEach((s, i) => { if (s.r > S[iMax].r) iMax = i; });
    const tipName = S[iMax].tip;
    const spd = S.map((s, i) => i === 0 ? 0 : s.tipPos[tipName].distanceTo(S[i - 1].tipPos[tipName]) * 60);
    const peak = Math.max(...spd), r0 = S[0].r, rm = S[iMax].r;
    let iS = iMax; while (iS > 0 && spd[iS] > peak * 0.12) iS--;
    let iE = iMax; while (iE < S.length - 1 && (S[iE].r - r0) > 0.25 * (rm - r0)) iE++;
    // início do movimento: um pouco antes (antecipação do corpo)
    const tStart = Math.max(0, S[iS].t - 0.08), tImpact = S[iMax].t, tEnd = Math.min(clip.duration, S[iE].t + 0.1);
    Object.assign(meta.clips[key], {
      tip: tipName, tStart: +tStart.toFixed(3), tImpact: +tImpact.toFixed(3), tEnd: +tEnd.toFixed(3),
      reachCm: +rm.toFixed(1), impactHeightCm: +S[iMax].y.toFixed(1),
    });
    log(`  ${key}: ponta ${tipName.replace('mixamorig', '')}  início ${tStart.toFixed(2)}s  impacto ${tImpact.toFixed(2)}s  fim ${tEnd.toFixed(2)}s  alcance ${rm.toFixed(0)} cm  altura ${S[iMax].y.toFixed(0)} cm (clip ${clip.duration.toFixed(2)}s)`);
  }

  // caminhada: velocidade do pé apoiado
  for (const key of ['walk', 'walkBack']) {
    const clip = clipOf(key);
    const S = sample(clip, () => {
      const hip = wp('mixamorigHips');
      const f = (n) => { const p = wp(n); return { x: p.clone().sub(hip).dot(fwd), y: p.y - floorToe }; };
      return { L: f('mixamorigLeftToeBase'), R: f('mixamorigRightToeBase') };
    });
    const speeds = [];
    for (let i = 1; i < S.length; i++) for (const side of ['L', 'R']) {
      if (S[i][side].y < 4 && S[i - 1][side].y < 4) speeds.push(-(S[i][side].x - S[i - 1][side].x) * 60);
    }
    const sp = median(speeds);
    meta.clips[key].authoredSpeedCmS = +sp.toFixed(1);   // + = anda para frente; - = para trás
    log(`  ${key}: velocidade original ${sp.toFixed(0)} cm/s (${speeds.length} amostras de pé apoiado), clip ${clip.duration.toFixed(2)}s`);
  }

  // salto: instantes de decolagem e aterrissagem
  {
    const clip = clipOf('jump');
    const S = sample(clip, () => ({ h: Math.min(wp('mixamorigLeftToeBase').y, wp('mixamorigRightToeBase').y) - floorToe }));
    const air = S.filter((s) => s.h > 5);
    const takeoff = air.length ? air[0].t : 0.3, landing = air.length ? air[air.length - 1].t : clip.duration - 0.3;
    meta.clips.jump.takeoff = +takeoff.toFixed(3); meta.clips.jump.landing = +landing.toFixed(3);
    log(`  jump: decola ${takeoff.toFixed(2)}s, aterrissa ${landing.toFixed(2)}s (clip ${clip.duration.toFixed(2)}s)`);
  }
  mixer.stopAllAction();
  base.traverse((o) => { if (o.isBone) { /* pose limpa não é necessária: o jogo recalcula */ } });

  // 4) exporta GLB (sem texturas: carregadas como WebP separado)
  const scene = new THREE.Scene(); scene.add(base);
  const glb = await new Promise((res, rej) => new GLTFExporter().parse(scene, res, rej, { binary: true, animations: clips, trs: true, onlyVisible: false }));
  await fs.writeFile(path.join(outDir, 'model.glb'), Buffer.from(glb));

  // 5) texturas
  const tex = async (srcName, dst, q) => {
    const info = await sharp(path.join(dir, srcName)).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: q }).toFile(path.join(outDir, dst));
    return info.size;
  };
  const sd = await tex(cfg.diffuse, 'diffuse.webp', 90), sn = await tex(cfg.normal, 'normal.webp', 90);
  await fs.writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  const sz = (await fs.stat(path.join(outDir, 'model.glb'))).size;
  log(`  salvo: model.glb ${(sz / 1e6).toFixed(1)} MB, diffuse ${(sd / 1e6).toFixed(2)} MB, normal ${(sn / 1e6).toFixed(2)} MB`);
}
