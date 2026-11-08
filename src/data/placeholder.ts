import { FighterData } from '../combat/types.js';

/** Lutadores sintéticos usados só nos testes (valores estáveis, independentes do balanceamento real). */
export const PLACEHOLDER_A: FighterData = {
  id: 'a', name: 'Lutador A', color: '#e0a030', heightCm: 170, maxHealth: 1000,
  walkSpeed: 3, backSpeed: 2, jumpVelocity: 11, gravity: 0.6, jumpSquat: 5,
  hurt: { x: -20, y: 0, w: 40, h: 165 },
  moves: {
    punch: { startup: 5, active: 3, recovery: 10, damage: 60, hitstun: 16, knockback: 4, hitbox: { x: 10, y: 100, w: 70, h: 30 } },
    kick: { startup: 8, active: 3, recovery: 14, damage: 90, hitstun: 20, knockback: 6, hitbox: { x: 10, y: 40, w: 90, h: 40 } },
  },
};
export const PLACEHOLDER_B: FighterData = { ...PLACEHOLDER_A, id: 'b', name: 'Lutador B', color: '#3aa0c8' };
