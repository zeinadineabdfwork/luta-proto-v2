import { Fighter } from '../combat/fighter.js';
import { Match } from '../combat/match.js';
import { Rect } from '../combat/types.js';
import { CAM_Y, VIEW_H, VIEW_W } from '../data/stage.js';

export const HUD_W = 1280, HUD_H = 720;
const FONT = '"Impact","Arial Black","Helvetica Neue",Arial,sans-serif';

/** Interface 2D desenhada por cima do 3D (barras de vida, textos, faíscas, debug). Coordenadas lógicas 1280x720. */
export class Hud {
  private lag = [1, 1];            // barra "branca" que escorrega atrás da vida
  private helpAge = 0;
  constructor(private ctx: CanvasRenderingContext2D) {}

  private proj(x: number, y: number, camX: number): [number, number] {
    return [HUD_W / 2 + ((x - camX) / VIEW_W) * HUD_W, HUD_H / 2 - ((y - CAM_Y) / VIEW_H) * HUD_H];
  }

  private text(s: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center', stroke = '#000', lw = 6): void {
    const c = this.ctx;
    c.font = `${size}px ${FONT}`; c.textAlign = align; c.lineJoin = 'round'; c.lineWidth = lw;
    c.strokeStyle = stroke; c.strokeText(s, x, y); c.fillStyle = fill; c.fillText(s, x, y);
  }

  private bar(f: Fighter, idx: number, right: boolean): void {
    const c = this.ctx, W = 520, H = 28, y = 34, skew = 22;
    const x0 = right ? HUD_W - 60 - W : 60;
    const pct = f.health / f.data.maxHealth;
    this.lag[idx] += (pct - this.lag[idx]) * (pct < this.lag[idx] ? 0.03 : 1);
    const path = (w: number, fromRight: boolean) => {
      // paralelogramo; "w" em px a partir da extremidade externa
      const xs = fromRight ? x0 + W - w : x0;
      c.beginPath();
      if (!right) { c.moveTo(xs, y); c.lineTo(xs + w, y); c.lineTo(xs + w - skew, y + H); c.lineTo(xs, y + H); }
      else { c.moveTo(xs, y); c.lineTo(xs + w, y); c.lineTo(xs + w, y + H); c.lineTo(xs + skew, y + H); }
      c.closePath();
    };
    c.save();
    path(W, right); c.fillStyle = 'rgba(10,10,14,.78)'; c.fill();
    c.save(); path(W, right); c.clip();
    // dano recente
    c.fillStyle = '#f4f0e6'; c.fillRect(right ? x0 + W * (1 - this.lag[idx]) : x0, y, W * this.lag[idx], H);
    const g = c.createLinearGradient(0, y, 0, y + H);
    const col = pct > 0.5 ? ['#7dff6b', '#27b043'] : pct > 0.25 ? ['#ffe55c', '#e0a21a'] : ['#ff6b5c', '#c4261a'];
    g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    c.fillStyle = g; c.fillRect(right ? x0 + W * (1 - pct) : x0, y, W * pct, H);
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(x0, y, W, H * 0.4);
    c.restore();
    path(W, right); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
    c.restore();
    this.text(f.data.name.toUpperCase(), right ? x0 + W : x0, y + H + 30, 26, f.data.color, right ? 'right' : 'left', '#000', 5);
  }

  draw(m: Match, camX: number, debug: boolean, fps: number, padNotes: string[], dtReal: number): void {
    const c = this.ctx;
    c.clearRect(0, 0, HUD_W, HUD_H);
    this.helpAge += dtReal;

    // faíscas de impacto
    for (const s of m.sparks) {
      const [sx, sy] = this.proj(s.x, s.y, camX), k = s.age / 14, R = (s.big ? 95 : 62) * (0.35 + k * 0.9);
      c.save(); c.translate(sx, sy); c.globalAlpha = 1 - k; c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.35, 'rgba(255,220,120,.7)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
      c.strokeStyle = '#fff6c8'; c.lineWidth = 4 * (1 - k) + 1;
      const n = s.big ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (s.big ? 0.2 : 0), r0 = R * 0.45, r1 = R * (0.9 + 0.5 * ((i * 7) % 3) / 3);
        c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke();
      }
      c.restore();
    }

    this.bar(m.p1, 0, false); this.bar(m.p2, 1, true);
    this.text('VS', HUD_W / 2, 62, 30, '#fff', 'center', '#000', 6);

    if (m.phase === 'intro') {
      const half = m.phaseFrames < 55;
      const k = (half ? m.phaseFrames : m.phaseFrames - 55) / 55;
      const pop = 1 + Math.max(0, 0.6 - k * 2.4);
      c.save(); c.translate(HUD_W / 2, 300); c.scale(pop, pop); c.globalAlpha = Math.min(1, k * 6) * (k > 0.85 ? (1 - k) / 0.15 : 1);
      this.text(half ? 'ROUND 1' : 'LUTEM!', 0, 0, half ? 84 : 120, half ? '#fff' : '#ffd23c', 'center', '#000', 10);
      c.restore();
    }
    if (m.phase === 'fight' && m.phaseFrames < 40 && m.events.length === 0) { /* espaço para efeitos futuros */ }

    if (m.phase === 'over') {
      const k = Math.min(1, m.phaseFrames / 18), pop = 1 + (1 - k) * 1.2;
      c.save(); c.translate(HUD_W / 2, 280); c.scale(pop, pop); c.globalAlpha = k;
      this.text('K.O.', 0, 0, 150, '#ff3b2f', 'center', '#fff', 12);
      c.restore();
      if (m.phaseFrames > 70) {
        const w = m.winner === 0 ? 'EMPATE' : `${(m.winner === 1 ? m.p1 : m.p2).data.name.toUpperCase()} VENCE!`;
        this.text(w, HUD_W / 2, 400, 64, '#ffd23c', 'center', '#000', 9);
      }
      if (m.phaseFrames > 120) this.text('Aperte SOCO ou CHUTE para lutar de novo', HUD_W / 2, 450, 26, '#fff', 'center', '#000', 5);
    }

    // ajuda de controles (some depois de alguns segundos)
    if (this.helpAge < 12 || debug) {
      c.globalAlpha = debug ? 1 : Math.min(1, (12 - this.helpAge) / 2);
      this.text('P1: A/D andar · W pular · J soco · K chute', 24, HUD_H - 40, 18, '#fff', 'left', '#000', 4);
      this.text('P2: ←/→ andar · ↑ pular · 1(num) ou / soco · 2(num) ou . chute', 24, HUD_H - 14, 18, '#fff', 'left', '#000', 4);
      c.globalAlpha = 1;
    }

    if (debug) this.debug(m, camX, fps, padNotes);
  }

  private box(r: Rect, camX: number, color: string, fill: boolean): void {
    const c = this.ctx;
    const [x0, y0] = this.proj(r.x, r.y + r.h, camX), [x1, y1] = this.proj(r.x + r.w, r.y, camX);
    if (fill) { c.fillStyle = color; c.globalAlpha = 0.35; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1; }
    c.strokeStyle = color; c.lineWidth = 2; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  private debug(m: Match, camX: number, fps: number, padNotes: string[]): void {
    const c = this.ctx;
    for (const f of [m.p1, m.p2]) {
      this.box(f.hurtbox(), camX, '#2f2', false);
      const hb = f.hitbox(); if (hb) this.box(hb, camX, '#f33', true);
      const [px, py] = this.proj(f.x, f.y, camX); c.fillStyle = '#ff0'; c.fillRect(px - 3, py - 3, 6, 6);
    }
    c.font = '14px monospace'; c.textAlign = 'left'; c.fillStyle = '#9f9';
    const lines = [`FPS ${fps.toFixed(0)}  cam ${m.camX.toFixed(0)} cm  hitstop ${m.hitstop}`, ...padNotes];
    for (const f of [m.p1, m.p2]) lines.push(`${f.data.name}: ${f.state}${f.move ? '/' + f.move : ''} f=${f.frame} ${f.attackPhase ?? ''} x=${f.x.toFixed(0)} y=${f.y.toFixed(0)}`);
    lines.push(...m.events);
    lines.forEach((l, i) => c.fillText(l, 24, 130 + i * 17));
  }
}
