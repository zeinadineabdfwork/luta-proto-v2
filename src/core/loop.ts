import { FPS } from '../combat/types.js';

/**
 * Passo fixo de 60 Hz com acumulador: a lógica é determinística, independente do monitor.
 * `timeScale` (opcional) permite câmera lenta sem mexer na simulação (só muda a cadência dos passos).
 */
export function startLoop(step: () => void, render: (fps: number) => void, timeScale: () => number = () => 1): void {
  const dt = 1000 / FPS;
  let last = performance.now(), acc = 0, fps = FPS, frames = 0, fpsT = last;
  const tick = (now: number) => {
    acc += Math.min(now - last, 100) * timeScale(); // evita "espiral da morte" após troca de aba
    last = now;
    while (acc >= dt) { step(); acc -= dt; }
    frames++;
    if (now - fpsT >= 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
    render(fps);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
