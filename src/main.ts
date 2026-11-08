import { Fighter } from './combat/fighter.js';
import { Match } from './combat/match.js';
import { startLoop } from './core/loop.js';
import { IVONE, NELTON } from './data/characters.js';
import { InputManager } from './input/input.js';
import { Renderer } from './rendering/renderer.js';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLCanvasElement;
const loading = document.getElementById('loading') as HTMLElement;
const input = new InputManager();
const renderer = new Renderer(canvas, hud);

// P1 à esquerda, P2 à direita, a 2,6 m de distância, no centro do cenário.
const p1 = new Fighter(NELTON, -130, 1), p2 = new Fighter(IVONE, 130, -1);
const match = new Match(p1, p2, 110);
let debug = false;
// ganchos para testes automatizados (captura de telas frame a frame)
const hook = { match, p1, p2, manual: false };
(globalThis as unknown as { __game: unknown }).__game = hook;
addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); debug = !debug; } });

try {
  await renderer.load([p1, p2], (msg) => { loading.textContent = msg; });
  loading.remove();
  startLoop(
    () => {
      const [i1, i2] = input.poll();
      if (input.debugToggle) debug = !debug;
      if (!hook.manual) match.step(i1, i2);
    },
    (fps) => renderer.draw(match, debug, fps, input.padNotes),
    () => (match.phase === 'over' && match.phaseFrames < 100 ? 0.4 : 1),   // câmera lenta no K.O.
  );
} catch (e) {
  loading.textContent = 'Erro ao carregar: ' + (e as Error).message;
  console.error(e);
}
