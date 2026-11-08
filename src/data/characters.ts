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
