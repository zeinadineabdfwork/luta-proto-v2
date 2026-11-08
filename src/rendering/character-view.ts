import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Fighter } from '../combat/fighter.js';
import { FPS } from '../combat/types.js';

export interface ClipMeta {
  duration: number; authoredSpeedCmS?: number;
  tStart?: number; tImpact?: number; tEnd?: number; takeoff?: number; landing?: number; reachCm?: number;
}
export interface CharMeta { id: string; scale: number; groundOffsetCm: number; clips: Record<string, ClipMeta> }

/** Janela da animação de "levar golpe" (s) usada durante o hitstun; o resto do clip não é usado. */
const HIT_WINDOW: Record<string, [number, number]> = { nelton: [0, 0.5], ivone: [0, 0.45] };
const KO_FRAMES = 40;           // duração da queda
const LEAN = 0.33;              // rad: personagem levemente virado para a câmera
const BODY_HALF_DEPTH = 13;     // cm: espessura do corpo deitado

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Pose { clip: string; t: number; fade: number }

/** Modelo 3D de um lutador: transforma o estado (determinístico) do Fighter em pose + posição. */
export class CharacterView {
  readonly root = new THREE.Group();     // posição no mundo + queda (KO)
  private readonly yaw = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: { name: string; t: number } = { name: 'idle', t: 0 };
  private prev: { name: string; t: number } | null = null;
  private fade = 1; private fadeDur = 0.12;
  private idleT = 0; private walkT = 0;
  private yawNow: number | null = null;

  private constructor(readonly data: { id: string }, readonly meta: CharMeta, model: THREE.Group, clips: THREE.AnimationClip[], private fighter: Fighter) {
    model.scale.setScalar(meta.scale);
    model.position.y = meta.groundOffsetCm;
    this.yaw.add(model); this.root.add(this.yaw);
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of clips) {
      const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); this.actions.set(c.name, a);
    }
  }

  static async load(fighter: Fighter, anisotropy: number): Promise<CharacterView> {
    const id = fighter.data.id, base = `assets/characters/${id}`;
    const meta: CharMeta = await (await fetch(`${base}/meta.json`)).json();
    const tl = new THREE.TextureLoader();
    const tex = async (file: string, srgb: boolean) => {
      const t = await tl.loadAsync(`${base}/${file}`);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = anisotropy; return t;
    };
    const [map, normalMap, gltf] = await Promise.all([tex('diffuse.webp', true), tex('normal.webp', false), new GLTFLoader().loadAsync(`${base}/model.glb`)]);
    const mat = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.78, metalness: 0, envMapIntensity: 0.6 });
    gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) { const m = o as THREE.SkinnedMesh; m.material = mat; m.frustumCulled = false; } });
    return new CharacterView({ id }, meta, gltf.scene, gltf.animations, fighter);
  }

  private clipMeta(name: string): ClipMeta { return this.meta.clips[name]; }

  /** Decide qual animação tocar e em que instante, a partir do estado do lutador. */
  private desired(f: Fighter, dt: number): Pose {
    const m = this.meta.clips;
    switch (f.state) {
      case 'attack': {
        const mv = f.move!, a = f.attack!, c = m[mv];
        const ts = c.tStart!, ti = c.tImpact!, te = c.tEnd!;
        const peak = a.startup + a.active / 2;
        const t = f.frame < peak ? lerp(ts, ti, f.frame / peak) : lerp(ti, te, (f.frame - peak) / (a.active / 2 + a.recovery));
        return { clip: mv, t, fade: 0.05 };
      }
      case 'jump': {
        const c = m.jump, sq = f.data.jumpSquat;
        const t = f.frame < sq
          ? lerp(Math.max(0, c.takeoff! - 0.42), c.takeoff!, f.frame / sq)
          : lerp(c.takeoff!, c.landing!, Math.min(1, f.airFrame / f.airFrames));
        return { clip: 'jump', t, fade: 0.06 };
      }
      case 'hitstun': {
        const [a, b] = HIT_WINDOW[this.data.id] ?? [0, 0.5];
        return { clip: 'hit', t: lerp(a, b, Math.min(1, f.frame / Math.max(1, f.hitstunTotal * 0.6))), fade: 0.04 };
      }
      case 'ko': {
        // Não há clip de morte nos arquivos: reação ao golpe e, caindo, o corpo se estica (pose de guarda) enquanto tomba.
        const [, b] = HIT_WINDOW[this.data.id] ?? [0, 0.5];
        if (f.frame < 7) return { clip: 'hit', t: lerp(0, b, f.frame / 7), fade: 0.04 };
        return { clip: 'idle', t: 0, fade: 0.28 };
      }
      case 'walk': {
        const fwd = f.walkDir === f.facing;
        const clip = fwd ? 'walk' : 'walkBack', c = m[clip];
        const speed = (fwd ? f.data.walkSpeed : f.data.backSpeed) * FPS;           // cm/s no jogo
        const rate = speed / Math.abs(c.authoredSpeedCmS!);                         // sem "patinar" no chão
        this.walkT += dt * rate;
        return { clip, t: this.walkT % c.duration, fade: 0.1 };
      }
      default: {
        this.idleT += dt;
        this.walkT = 0;
        return { clip: 'idle', t: this.idleT % m.idle.duration, fade: 0.14 };
      }
    }
  }

  /** dt em segundos reais (0 durante o hit-stop). */
  update(dt: number): void {
    const f = this.fighter;
    const want = this.desired(f, dt);
    const dur = this.clipMeta(want.clip).duration;
    const t = Math.min(Math.max(want.t, 0), dur - 1e-3);

    if (want.clip !== this.cur.name) {
      this.prev = { ...this.cur };
      this.cur = { name: want.clip, t };
      this.fade = 0; this.fadeDur = want.fade;
    } else this.cur.t = t;
    if (this.prev) { this.fade += dt / this.fadeDur; if (this.fade >= 1) this.prev = null; }
    const w = this.prev ? smooth(this.fade) : 1;

    for (const [name, a] of this.actions) {
      const weight = name === this.cur.name ? w : this.prev && name === this.prev.name ? 1 - w : 0;
      a.setEffectiveWeight(weight);
      if (name === this.cur.name) a.time = this.cur.t; else if (this.prev && name === this.prev.name) a.time = Math.min(this.prev.t, this.clipMeta(name).duration - 1e-3);
    }
    this.mixer.update(0);

    // posição e orientação
    this.root.position.set(f.x, f.y, 0);
    const targetYaw = f.facing === 1 ? Math.PI / 2 - LEAN : -Math.PI / 2 + LEAN;
    this.yawNow = this.yawNow === null ? targetYaw : this.yawNow + (targetYaw - this.yawNow) * Math.min(1, dt * 14);
    this.yaw.rotation.y = this.yawNow;

    if (f.state === 'ko') {
      const k = Math.min(1, f.frame / KO_FRAMES);
      const bounce = f.frame > KO_FRAMES ? 0.13 * Math.sin(Math.min(1, (f.frame - KO_FRAMES) / 12) * Math.PI) : 0;
      const ang = (Math.PI / 2) * k * k - bounce;        // cai acelerando, como um corpo de verdade, e quica de leve
      this.root.rotation.z = ang * f.facing;
      this.root.position.y += BODY_HALF_DEPTH * Math.sin(ang);
    } else this.root.rotation.z = 0;
  }
}
