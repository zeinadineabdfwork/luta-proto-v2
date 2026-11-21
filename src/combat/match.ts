import { CAM_SMOOTH, CAM_START_X, SCREEN_MARGIN, STAGE_HALF, VIEW_W } from '../data/stage.js';
import { Fighter } from './fighter.js';
import { AttackData, EMPTY_INPUT, GrabData, InputState, ProjectileData, Rect } from './types.js';

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export type Phase = 'intro' | 'fight' | 'over';

export interface Spark { x: number; y: number; age: number; big: boolean }
export interface Projectile { owner: Fighter; target: Fighter; data: AttackData; proj: ProjectileData; x: number; y: number; dir: 1 | -1; age: number }
/** Explosão de fogo (flipbook). kind 'cast' = pequena, na mão; 'impact' = grande, no alvo. */
export interface Blast { x: number; y: number; age: number; kind: 'cast' | 'impact' }
export const BLAST_LIFE = 30;

/** Cena de agarrão em curso (atacante e vítima presos aos clips sincronizados). */
export interface GrabScene { att: Fighter; def: Fighter; frame: number; total: number; data: GrabData; done: number }

const PUSH_MIN = 52;          // distância mínima entre os centros (cm)
const HITSTOP = 6;
const HITSTOP_KO = 14;

export class Match {
  phase: Phase;
  winner: 0 | 1 | 2 = 0;      // 0 = empate
  phaseFrames = 0;            // frames na fase atual
  hitstop = 0;                // frames congelados após um acerto
  shake = 0;                  // intensidade de tremor de câmera (só visual)
  camX = CAM_START_X;
  sparks: Spark[] = [];
  projectiles: Projectile[] = [];
  blasts: Blast[] = [];
  grab: GrabScene | null = null;
  events: string[] = [];
  private prevAny = false;

  constructor(readonly p1: Fighter, readonly p2: Fighter, private introFrames = 0) {
    this.phase = introFrames > 0 ? 'intro' : 'fight';
    this.camX = this.targetCam();
  }

  restart(): void {
    this.p1.reset(); this.p2.reset();
    this.phase = this.introFrames > 0 ? 'intro' : 'fight';
    this.winner = 0; this.phaseFrames = 0; this.hitstop = 0; this.shake = 0; this.sparks = []; this.projectiles = []; this.blasts = []; this.grab = null; this.events = [];
    this.camX = this.targetCam();
  }

  private log(msg: string): void { this.events.unshift(msg); this.events.length = Math.min(this.events.length, 6); }

  private targetCam(): number {
    const mid = (this.p1.x + this.p2.x) / 2;
    const lim = STAGE_HALF - VIEW_W / 2;
    return Math.max(-lim, Math.min(lim, mid));
  }

  /** Nenhum lutador sai da tela nem do cenário (como em KOF / Mortal Kombat). */
  private confine(): void {
    const left = Math.max(-STAGE_HALF + SCREEN_MARGIN, this.camX - VIEW_W / 2 + SCREEN_MARGIN);
    const right = Math.min(STAGE_HALF - SCREEN_MARGIN, this.camX + VIEW_W / 2 - SCREEN_MARGIN);
    for (const f of [this.p1, this.p2]) f.x = Math.max(left, Math.min(right, f.x));
  }

  private updateCamera(): void {
    this.camX += (this.targetCam() - this.camX) * CAM_SMOOTH;
  }

  step(i1: InputState, i2: InputState): void {
    this.phaseFrames++;
    for (const s of this.sparks) s.age++;
    this.sparks = this.sparks.filter((s) => s.age < 14);
    for (const b of this.blasts) b.age++;
    this.blasts = this.blasts.filter((b) => b.age < BLAST_LIFE);
    this.shake *= 0.82;

    if (this.phase === 'intro') {
      this.p1.update(EMPTY_INPUT, this.p2.x); this.p2.update(EMPTY_INPUT, this.p1.x);
      this.updateCamera();
      if (this.phaseFrames >= this.introFrames) { this.phase = 'fight'; this.phaseFrames = 0; }
      return;
    }

    if (this.phase === 'over') {
      const any = i1.punch || i1.kick || i2.punch || i2.kick;
      const restart = any && !this.prevAny && this.phaseFrames > 120;
      this.prevAny = any;
      if (restart) { this.restart(); return; }
      if (this.hitstop > 0) { this.hitstop--; return; }
      this.p1.update(EMPTY_INPUT, this.p2.x); this.p2.update(EMPTY_INPUT, this.p1.x);
      this.confine(); this.updateCamera();
      return;
    }
    this.prevAny = i1.punch || i1.kick || i2.punch || i2.kick;

    if (this.hitstop > 0) { this.hitstop--; return; }   // congela o acerto por alguns frames

    this.p1.update(i1, this.p2.x);
    this.p2.update(i2, this.p1.x);
    if (this.grab) { this.stepGrab(); this.updateCamera(); this.stepProjectiles(); return; }
    this.tryGrab();
    this.pushApart();
    this.confine();
    this.updateCamera();
    this.spawnProjectiles();

    // Calcula os dois acertos antes de aplicar (permite trocas simultâneas).
    const hit1 = this.checkHit(this.p1, this.p2);
    const hit2 = this.checkHit(this.p2, this.p1);
    if (hit1) this.applyHit(this.p1, this.p2, 'P1');
    if (hit2) this.applyHit(this.p2, this.p1, 'P2');

    this.stepProjectiles();

    if (this.p1.health <= 0 || this.p2.health <= 0) {
      this.phase = 'over'; this.phaseFrames = 0;
      this.winner = this.p1.health === this.p2.health ? 0 : this.p1.health > this.p2.health ? 1 : 2;
      this.log(`KO! vencedor: ${this.winner || 'empate'}`);
    }
  }

  private checkHit(att: Fighter, def: Fighter): boolean {
    if (att.hasHit || def.state === 'ko') return false;
    const hb = att.hitbox();
    return hb !== null && overlap(hb, def.hurtbox());
  }

  private applyHit(att: Fighter, def: Fighter, who: string): void {
    const hb = att.hitbox()!, hu = def.hurtbox();
    att.hasHit = true;
    this.land(att.attack!, att.facing, def, hb, who, att.move!);
  }

  /** Aplica o dano e os efeitos de um acerto (golpe corpo a corpo ou projétil). */
  private land(a: AttackData, dir: 1 | -1, def: Fighter, hb: Rect, who: string, label: string): void {
    const hu = def.hurtbox();
    const cx = (Math.max(hb.x, hu.x) + Math.min(hb.x + hb.w, hu.x + hu.w)) / 2;
    const cy = (Math.max(hb.y, hu.y) + Math.min(hb.y + hb.h, hu.y + hu.h)) / 2;
    def.takeHit(a, dir);
    const ko = def.state === 'ko';
    this.hitstop = ko ? HITSTOP_KO : HITSTOP;
    this.shake = ko ? 14 : Math.min(9, 3 + a.damage / 25);
    this.sparks.push({ x: cx, y: cy, age: 0, big: ko || a.damage >= 90 });
    this.log(`${who} acertou ${label}: -${a.damage} (vida ${def.health})`);
  }

  /** Se alguém pediu agarrão e o oponente está ao alcance (no chão, de pé), a cena começa na hora. */
  private tryGrab(): void {
    for (const att of [this.p1, this.p2]) {
      if (!att.grabRequested) continue;
      att.grabRequested = false;
      const def = att === this.p1 ? this.p2 : this.p1, g = att.data.grab;
      if (!g || !att.grounded || !def.grounded || def.state === 'ko' || def.state === 'grabbed' || def.state === 'jump') continue;
      if (Math.abs(def.x - att.x) > g.range) continue;
      const dir: 1 | -1 = def.x >= att.x ? 1 : -1;
      // posiciona os dois frente a frente, à distância da cena, sem sair da tela
      const lo = Math.max(-STAGE_HALF + SCREEN_MARGIN, this.camX - VIEW_W / 2 + SCREEN_MARGIN) + g.gap / 2;
      const hi = Math.min(STAGE_HALF - SCREEN_MARGIN, this.camX + VIEW_W / 2 - SCREEN_MARGIN) - g.gap / 2;
      const c = Math.max(lo, Math.min(hi, (att.x + def.x) / 2));
      att.x = c - dir * g.gap / 2; def.x = c + dir * g.gap / 2;
      att.beginGrab('grab', dir, g.rate); def.beginGrab('grabbed', (-dir) as 1 | -1, g.rate);
      this.grab = { att, def, frame: 0, total: g.frames, data: g, done: 0 };
      this.log(`${att.data.name} agarrou ${def.data.name}!`);
      this.shake = 8; this.sparks.push({ x: (att.x + def.x) / 2, y: 110, age: 0, big: false });
      return;
    }
  }

  private stepGrab(): void {
    const gs = this.grab!; const { att, def, data } = gs;
    gs.frame++; att.frame = gs.frame; def.frame = gs.frame;
    // deslocamentos suaves (ex.: vítima desliza ao cair, atacante avança)
    for (const mv of data.moves) {
      if (gs.frame <= mv.from || gs.frame > mv.to + 1) continue;
      const k0 = Math.min(1, Math.max(0, (gs.frame - 1 - mv.from) / (mv.to - mv.from))), k1 = Math.min(1, (gs.frame - mv.from) / (mv.to - mv.from));
      const ease = (k: number) => k * k * (3 - 2 * k);
      const who = mv.who === 'att' ? att : def;
      who.x += att.facing * mv.cm * (ease(k1) - ease(k0));
    }
    const left = Math.max(-STAGE_HALF + SCREEN_MARGIN, this.camX - VIEW_W / 2 + SCREEN_MARGIN), right = Math.min(STAGE_HALF - SCREEN_MARGIN, this.camX + VIEW_W / 2 - SCREEN_MARGIN);
    for (const f of [att, def]) f.x = Math.max(left, Math.min(right, f.x));
    while (gs.done < data.hits.length && gs.frame >= data.hits[gs.done].frame) {
      const h = data.hits[gs.done++];
      def.health = Math.max(0, def.health - h.damage);
      this.hitstop = h.big ? 8 : 4; this.shake = h.big ? 12 : 7;
      this.sparks.push({ x: (att.x + def.x) / 2 + att.facing * 6, y: h.y, age: 0, big: !!h.big });
      this.log(`cena: -${h.damage} (vida ${def.health})`);
    }
    const dead = def.health <= 0 && gs.done >= data.hits.length;   // só morre depois do último golpe
    if (gs.frame >= (dead ? data.koFrame : gs.total)) {
      att.endGrab(); att.grabCd = data.cooldown;
      def.releaseVictim(att.facing, (data.koFrame / 60) * data.rate); this.grab = null;
      this.finishIfOver();
    }
  }

  private finishIfOver(): void {
    if (this.p1.health <= 0 || this.p2.health <= 0) {
      this.phase = 'over'; this.phaseFrames = 0;
      this.winner = this.p1.health === this.p2.health ? 0 : this.p1.health > this.p2.health ? 1 : 2;
      this.hitstop = Math.max(this.hitstop, 10);
      this.log(`KO! vencedor: ${this.winner || 'empate'}`);
    }
  }

  private spawnProjectiles(): void {
    for (const f of [this.p1, this.p2]) {
      const sp = f.data.moves.special;
      if (f.pendingProjectile && sp?.projectile) {
        f.pendingProjectile = false;
        const pr = sp.projectile, other = f === this.p1 ? this.p2 : this.p1;
        const x = f.x + f.facing * pr.spawn.x, y = f.y + pr.spawn.y;
        this.projectiles.push({ owner: f, target: other, data: sp, proj: pr, x, y, dir: f.facing, age: 0 });
        this.blasts.push({ x, y, age: 0, kind: 'cast' });
        this.log(`${f.data.name} lançou a bola de fogo`);
      }
    }
    for (const f of [this.p1, this.p2]) f.fireballOut = this.projectiles.some((p) => p.owner === f);
  }

  private stepProjectiles(): void {
    const view = VIEW_W / 2 + 120;
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.dir * p.proj.speed; p.age++;
      const box: Rect = { x: p.x - p.proj.w / 2, y: p.y - p.proj.h / 2, w: p.proj.w, h: p.proj.h };
      if (p.target.state !== 'ko' && p.target.state !== 'grabbed' && p.target.state !== 'grab' && overlap(box, p.target.hurtbox())) {
        this.land(p.data, p.dir, p.target, box, p.owner === this.p1 ? 'P1' : 'P2', 'bola de fogo');
        this.blasts.push({ x: p.x + p.dir * 20, y: p.y, age: 0, kind: 'impact' });
        return false;
      }
      return p.age < p.proj.life && Math.abs(p.x - this.camX) < view && Math.abs(p.x) < STAGE_HALF;
    });
    for (const f of [this.p1, this.p2]) f.fireballOut = this.projectiles.some((p) => p.owner === f);
  }

  /** Pushbox simples: impede sobreposição quando ambos estão no chão; o muro/borda também empurra de volta. */
  private pushApart(): void {
    const { p1, p2 } = this;
    const dx = p2.x - p1.x;
    if (p1.grounded && p2.grounded && Math.abs(dx) < PUSH_MIN) {
      const dir = dx > 0 ? 1 : dx < 0 ? -1 : (p1.facing === 1 ? 1 : -1);
      const push = (PUSH_MIN - Math.abs(dx)) / 2;
      p1.x -= push * dir; p2.x += push * dir;
      // se um deles bateu na borda, o outro absorve a diferença
      const b1 = p1.x, b2 = p2.x;
      this.confine();
      const c1 = p1.x - b1, c2 = p2.x - b2;   // correção imposta pela borda
      p2.x += c1; p1.x += c2;
      this.confine();
    }
  }
}
