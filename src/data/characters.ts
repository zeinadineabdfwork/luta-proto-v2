import { FighterData } from '../combat/types.js';

// Todas as medidas em cm e frames (60/s). Os alcances dos golpes vêm de assets/characters/<id>/meta.json
// (medidos nas animações pelo scripts/build-characters.mjs): alcance da mão/pé a partir do quadril.

/** Nelton: ágil, golpes rápidos e menos dano. */
export const NELTON: FighterData = {
  id: 'nelton', name: 'Nelton', color: '#3aa0c8', heightCm: 175, maxHealth: 1000,
  walkSpeed: 3.2, backSpeed: 2.0,
  jumpVelocity: 11.5, gravity: 0.6, jumpSquat: 5,
  hurt: { x: -22, y: 0, w: 44, h: 168 },
  moves: {
    punch: { startup: 8, active: 3, recovery: 16, damage: 55, hitstun: 17, knockback: 3.5, hitbox: { x: 10, y: 108, w: 66, h: 32 } },
    kick:  { startup: 12, active: 4, recovery: 22, damage: 85, hitstun: 22, knockback: 6, hitbox: { x: 18, y: 38, w: 80, h: 38 } },
    // Hadouken de fogo: o golpe em si não tem hitbox, o dano vem da bola de fogo (só uma em cena por vez).
    special: {
      startup: 20, active: 2, recovery: 26, damage: 95, hitstun: 26, knockback: 7,
      hitbox: { x: 0, y: 0, w: 0, h: 0 },
      projectile: { speed: 9, spawn: { x: 62, y: 122 }, w: 46, h: 40, life: 140 },
    },
  },
  // Sequência de chutes (cena cinematográfica, a partir do vídeo): 3 chutes; o 2º derruba; a vítima fica deitada e se levanta.
  // Os frames abaixo são da cena (60/s); o vídeo é 30 fps tocado a 1,25x -> frame da cena = frame do vídeo x 1,6.
  grab: {
    range: 120, gap: 78, rate: 1.25, frames: 360, cooldown: 300, koFrame: 240,
    hits: [
      { frame: 62, damage: 70, y: 108 },                 // chute 1 (vídeo, frame 39)
      { frame: 125, damage: 110, y: 92, big: true },     // chute 2 (frame 78) - derruba
      { frame: 176, damage: 130, y: 85, big: true },     // chute 3 (frame 110) - finaliza
    ],
    moves: [
      { who: 'def', from: 147, to: 189, cm: 85 },        // a vítima voa para trás e cai
      { who: 'att', from: 138, to: 179, cm: 55 },        // o atacante avança atrás dela
    ],
  },
};

/** Dona Ivone: mais lenta, golpes pesados. */
export const IVONE: FighterData = {
  id: 'ivone', name: 'Dona Ivone', color: '#e0a030', heightCm: 165, maxHealth: 1000,
  walkSpeed: 2.2, backSpeed: 1.6,
  jumpVelocity: 11, gravity: 0.6, jumpSquat: 5,
  hurt: { x: -23, y: 0, w: 46, h: 158 },
  moves: {
    punch: { startup: 10, active: 3, recovery: 18, damage: 75, hitstun: 19, knockback: 4.5, hitbox: { x: 10, y: 98, w: 56, h: 34 } },
    kick:  { startup: 15, active: 4, recovery: 25, damage: 110, hitstun: 25, knockback: 8, hitbox: { x: 15, y: 82, w: 68, h: 38 } },
  },
};

export const ROSTER: Record<string, FighterData> = { nelton: NELTON, ivone: IVONE };
