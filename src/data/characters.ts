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
  // Agarrão: cena de ~6 s (8 s do vídeo a 1.3x). Os golpes caem nos picos de movimento detectados no vídeo.
  grab: {
    range: 115, gap: 62, rate: 1.3, frames: 369, cooldown: 300,
    hits: [
      { frame: 17, damage: 20 }, { frame: 48, damage: 20 }, { frame: 76, damage: 25 }, { frame: 130, damage: 25 },
      { frame: 168, damage: 35 }, { frame: 191, damage: 35 }, { frame: 238, damage: 40 }, { frame: 300, damage: 60, big: true }, { frame: 338, damage: 70, big: true },
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
