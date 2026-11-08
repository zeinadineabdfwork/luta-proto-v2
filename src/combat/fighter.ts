import { AttackData, FighterData, InputState, MoveName, Rect } from './types.js';

export type FighterState = 'idle' | 'walk' | 'jump' | 'attack' | 'hitstun' | 'ko';
export type AttackPhase = 'startup' | 'active' | 'recovery';

/** Lutador: máquina de estados determinística. Unidades: cm, frames de 1/60 s. y = altura dos pés (0 = chão). */
export class Fighter {
  x: number;
  y = 0;
  vy = 0;
  vx = 0;                // velocidade horizontal do salto
  kb = 0;                // knockback horizontal atual
  facing: 1 | -1;
  health: number;
  state: FighterState = 'idle';
  move: MoveName | null = null;
  walkDir: -1 | 0 | 1 = 0; // direção do passo no mundo
  frame = 0;
  hitstunTotal = 0;
  hasHit = false;
  private prevPunch = false;
  private prevKick = false;

  constructor(readonly data: FighterData, private startX: number, private startFacing: 1 | -1) {
    this.x = startX;
    this.facing = startFacing;
    this.health = data.maxHealth;
  }

  reset(): void {
    this.x = this.startX; this.y = 0; this.vy = 0; this.vx = 0; this.kb = 0;
    this.facing = this.startFacing; this.health = this.data.maxHealth;
    this.state = 'idle'; this.move = null; this.walkDir = 0; this.frame = 0; this.hitstunTotal = 0;
    this.hasHit = false; this.prevPunch = false; this.prevKick = false;
  }

  get grounded(): boolean { return this.y <= 0; }
  get actionable(): boolean { return this.state === 'idle' || this.state === 'walk'; }
  get attack(): AttackData | null { return this.move ? this.data.moves[this.move] : null; }
  /** Quanto tempo (frames) dura o salto no ar, calculado pela física. */
  get airFrames(): number { return (2 * this.data.jumpVelocity) / this.data.gravity; }
  /** Frames desde que saiu do chão (0 durante a agachada). */
  get airFrame(): number { return this.state === 'jump' ? Math.max(0, this.frame - this.data.jumpSquat) : 0; }

  get attackPhase(): AttackPhase | null {
    const a = this.attack;
    if (this.state !== 'attack' || !a) return null;
    if (this.frame < a.startup) return 'startup';
    if (this.frame < a.startup + a.active) return 'active';
    return 'recovery';
  }

  private setState(s: FighterState): void { this.state = s; this.frame = 0; }

  /** Avança 1 frame lógico. A posição lateral é limitada depois, pela Match (borda de tela e cenário). */
  update(input: InputState, opponentX: number): void {
    const punchP = input.punch && !this.prevPunch; this.prevPunch = input.punch;
    const kickP = input.kick && !this.prevKick; this.prevKick = input.kick;

    switch (this.state) {
      case 'ko':
        this.x += this.kb; this.kb *= 0.86; this.applyGravity(); this.frame++;
        break;

      case 'hitstun':
        this.x += this.kb; this.kb *= 0.86; this.applyGravity(); this.frame++;
        if (this.frame >= this.hitstunTotal && this.grounded) { this.move = null; this.setState('idle'); }
        break;

      case 'attack': {
        const a = this.attack!;
        this.frame++;
        if (this.frame >= a.startup + a.active + a.recovery) { this.move = null; this.setState('idle'); }
        break;
      }

      case 'jump':
        this.frame++;
        if (this.frame >= this.data.jumpSquat) {          // saiu do chão
          this.x += this.vx; this.y += this.vy; this.vy -= this.data.gravity;
          if (this.y <= 0) { this.y = 0; this.vy = 0; this.vx = 0; this.setState('idle'); }
        }
        break;

      default: { // idle | walk
        this.facing = opponentX >= this.x ? 1 : -1;
        this.walkDir = 0;
        if (kickP || punchP) {
          this.move = kickP ? 'kick' : 'punch';
          this.hasHit = false;
          this.setState('attack');
          return;
        }
        if (input.up) {
          const d = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          const fwd = d === this.facing;
          this.vx = d === 0 ? 0 : d * (fwd ? this.data.walkSpeed : this.data.backSpeed);
          this.vy = this.data.jumpVelocity;
          this.setState('jump');
          return;
        }
        if (input.left !== input.right) {
          const d: 1 | -1 = input.right ? 1 : -1;
          this.walkDir = d;
          this.x += d * (d === this.facing ? this.data.walkSpeed : this.data.backSpeed);
          if (this.state !== 'walk') this.setState('walk');
          else this.frame++;
        } else if (this.state !== 'idle') {
          this.setState('idle');
        } else this.frame++;
      }
    }
  }

  private applyGravity(): void {
    if (this.y > 0 || this.vy > 0) {
      this.y += this.vy; this.vy -= this.data.gravity;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
    }
  }

  takeHit(a: AttackData, attackerFacing: 1 | -1): void {
    this.health = Math.max(0, this.health - a.damage);
    this.hasHit = false; this.move = null;
    this.kb = a.knockback * attackerFacing;
    this.hitstunTotal = a.hitstun;
    if (this.health <= 0) { this.kb *= 1.8; this.setState('ko'); return; }
    this.setState('hitstun');
  }

  private toWorld(r: Rect): Rect {
    const wx = this.facing === 1 ? this.x + r.x : this.x - r.x - r.w;
    return { x: wx, y: this.y + r.y, w: r.w, h: r.h };
  }

  hurtbox(): Rect { return this.toWorld(this.data.hurt); }

  hitbox(): Rect | null {
    const a = this.attack;
    return a && this.attackPhase === 'active' ? this.toWorld(a.hitbox) : null;
  }
}
