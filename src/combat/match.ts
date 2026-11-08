import { CAM_SMOOTH, CAM_START_X, SCREEN_MARGIN, STAGE_HALF, VIEW_W } from '../data/stage.js';
import { Fighter } from './fighter.js';
import { EMPTY_INPUT, InputState, Rect } from './types.js';

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export type Phase = 'intro' | 'fight' | 'over';

export interface Spark { x: number; y: number; age: number; big: boolean }

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
  events: string[] = [];
  private prevAny = false;

  constructor(readonly p1: Fighter, readonly p2: Fighter, private introFrames = 0) {
    this.phase = introFrames > 0 ? 'intro' : 'fight';
    this.camX = this.targetCam();
  }

  restart(): void {
    this.p1.reset(); this.p2.reset();
    this.phase = this.introFrames > 0 ? 'intro' : 'fight';
    this.winner = 0; this.phaseFrames = 0; this.hitstop = 0; this.shake = 0; this.sparks = []; this.events = [];
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
    this.pushApart();
    this.confine();
    this.updateCamera();

    // Calcula os dois acertos antes de aplicar (permite trocas simultâneas).
    const hit1 = this.checkHit(this.p1, this.p2);
    const hit2 = this.checkHit(this.p2, this.p1);
    if (hit1) this.applyHit(this.p1, this.p2, 'P1');
    if (hit2) this.applyHit(this.p2, this.p1, 'P2');

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
    const a = att.attack!;
    att.hasHit = true;
    const hb = att.hitbox()!, hu = def.hurtbox();
    const cx = (Math.max(hb.x, hu.x) + Math.min(hb.x + hb.w, hu.x + hu.w)) / 2;
    const cy = (Math.max(hb.y, hu.y) + Math.min(hb.y + hb.h, hu.y + hu.h)) / 2;
    def.takeHit(a, att.facing);
    const ko = def.state === 'ko';
    this.hitstop = ko ? HITSTOP_KO : HITSTOP;
    this.shake = ko ? 14 : Math.min(9, 3 + a.damage / 25);
    this.sparks.push({ x: cx, y: cy, age: 0, big: ko || a.damage >= 90 });
    this.log(`${who} acertou ${att.move}: -${a.damage} (vida ${def.health})`);
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
