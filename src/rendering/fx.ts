import * as THREE from 'three';
import { Fighter } from '../combat/fighter.js';
import { BLAST_LIFE, Match } from '../combat/match.js';

/** Flipbook em atlas (colunas x linhas), desenhado em plano 3D com mistura aditiva (fogo "brilha"). */
class Flipbook {
  constructor(readonly tex: THREE.Texture, readonly cols: number, readonly rows: number, readonly frames: number) {}
}

class FxSprite {
  readonly mesh: THREE.Mesh;
  private tex: THREE.Texture;
  constructor(private book: Flipbook, scene: THREE.Scene) {
    this.tex = book.tex.clone(); this.tex.needsUpdate = true;
    this.tex.repeat.set(1 / book.cols, 1 / book.rows);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
    }));
    this.mesh.renderOrder = 20; this.mesh.visible = false; scene.add(this.mesh);
  }
  show(x: number, y: number, size: number, frame: number, rotZ = 0, flipX = 1, opacity = 1): void {
    const f = Math.max(0, Math.min(this.book.frames - 1, Math.floor(frame)));
    const col = f % this.book.cols, row = Math.floor(f / this.book.cols);
    this.tex.offset.set(col / this.book.cols, 1 - (row + 1) / this.book.rows);
    this.mesh.position.set(x, y, 70); this.mesh.scale.set(size * flipX, size, 1); this.mesh.rotation.z = rotZ;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
    this.mesh.visible = true;
  }
  hide(): void { this.mesh.visible = false; }
}

/** Efeitos especiais de fogo: bola de fogo (Nelton), carga na mão e explosão de impacto. */
export class FxLayer {
  private blastPool: FxSprite[] = [];
  private flamePool: FxSprite[] = [];   // corpo da bola / carga
  private corePool: FxSprite[] = [];    // núcleo brilhante
  private clock = 0;

  constructor(private scene: THREE.Scene) {}

  async load(): Promise<void> {
    const tl = new THREE.TextureLoader();
    const load = async (f: string) => { const t = await tl.loadAsync(f); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const [exp, flame] = await Promise.all([load('assets/fx/fire-explosion.webp'), load('assets/fx/flame-loop.webp')]);
    const explosion = new Flipbook(exp, 4, 4, 16), loop = new Flipbook(flame, 8, 8, 64);
    for (let i = 0; i < 6; i++) this.blastPool.push(new FxSprite(explosion, this.scene));
    for (let i = 0; i < 4; i++) { this.flamePool.push(new FxSprite(loop, this.scene)); this.corePool.push(new FxSprite(explosion, this.scene)); }
  }

  update(m: Match, fighters: Fighter[], dt: number): void {
    this.clock += dt;
    const flameFrame = (off = 0) => ((this.clock * 30) + off) % 64;
    let fi = 0;

    // carga na mão enquanto o especial é preparado
    for (const f of fighters) {
      const sp = f.data.moves.special;
      if (f.state === 'attack' && f.move === 'special' && sp?.projectile && f.frame < sp.startup + 4) {
        const k = Math.min(1, f.frame / sp.startup);
        const s = this.flamePool[fi++];
        s.show(f.x + f.facing * (sp.projectile.spawn.x - 8), f.y + sp.projectile.spawn.y, 70 + 110 * k, flameFrame(fi * 9), 0, 1, 0.5 + 0.4 * k);
      }
    }
    // bolas de fogo em voo: núcleo + rastro de chamas apontando para trás
    let ci = 0;
    for (const p of m.projectiles) {
      const flick = 1 + 0.08 * Math.sin(this.clock * 40 + p.x * 0.1);
      const f = this.flamePool[fi++], c = this.corePool[ci++];
      if (f) f.show(p.x - p.dir * 34, p.y + 4, 170, flameFrame(p.age * 2), p.dir * Math.PI / 2, 1, 0.85);
      if (c) c.show(p.x, p.y, 118 * flick, 6, p.age * 0.35, 1, 0.95);
    }
    for (; fi < this.flamePool.length; fi++) this.flamePool[fi].hide();
    for (; ci < this.corePool.length; ci++) this.corePool[ci].hide();

    // explosões (disparo pequeno / impacto grande)
    this.blastPool.forEach((s, i) => {
      const b = m.blasts[i];
      if (!b) { s.hide(); return; }
      const k = b.age / BLAST_LIFE;
      s.show(b.x, b.y, b.kind === 'impact' ? 210 : 100, k * 16, 0, 1, 1 - k * k * 0.6);
    });
  }
}
