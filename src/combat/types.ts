export const FPS = 60;

/** Retângulo relativo aos pés do lutador (olhando para a direita), em cm. y = base do retângulo acima do chão. */
export interface Rect { x: number; y: number; w: number; h: number }

export type MoveName = 'punch' | 'kick' | 'special';

/** Projétil lançado por um golpe especial (ex.: bola de fogo). */
export interface ProjectileData {
  speed: number;            // cm/frame
  spawn: { x: number; y: number }; // relativo aos pés, na frente do lutador
  w: number; h: number;     // tamanho da hitbox (cm)
  life: number;             // frames de vida máxima
}

export interface AttackData {
  startup: number;   // frames antes de poder acertar
  active: number;    // frames em que a hitbox existe
  recovery: number;  // frames de recuperação
  damage: number;
  hitstun: number;   // frames de hitstun no defensor
  knockback: number; // velocidade horizontal inicial do defensor (cm/frame)
  hitbox: Rect;
  projectile?: ProjectileData; // se existir, o golpe não tem hitbox corpo a corpo: o dano vem do projétil
}

export interface FighterData {
  id: string;
  name: string;
  color: string;
  heightCm: number;
  maxHealth: number;
  walkSpeed: number;       // cm/frame para frente
  backSpeed: number;       // cm/frame para trás
  jumpVelocity: number;    // cm/frame
  gravity: number;         // cm/frame²
  jumpSquat: number;       // frames de agachada antes de sair do chão
  hurt: Rect;
  moves: { punch: AttackData; kick: AttackData; special?: AttackData };
}

export interface InputState { left: boolean; right: boolean; up: boolean; down: boolean; punch: boolean; kick: boolean; special: boolean }
export const EMPTY_INPUT: InputState = { left: false, right: false, up: false, down: false, punch: false, kick: false, special: false };
