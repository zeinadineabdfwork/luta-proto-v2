import { EMPTY_INPUT, InputState } from '../combat/types.js';

type Key = keyof InputState;
const KEYMAP: Record<Key, string[]>[] = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], punch: ['KeyJ'], kick: ['KeyK'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], punch: ['Numpad1', 'Slash'], kick: ['Numpad2', 'Period'] },
];

const DEADZONE = 0.5;

/**
 * Entrada unificada: teclado + controles (Gamepad API).
 * Controles sem fio (Bluetooth ou dongle) aparecem para o navegador como qualquer gamepad.
 * Controle 1 -> Jogador 1, controle 2 -> Jogador 2. Teclado funciona sempre como reserva.
 */
export class InputManager {
  private keys = new Set<string>();
  private prevSelect = false;
  debugToggle = false;       // true em 1 poll() quando Select/Back é pressionado
  padNotes: string[] = [];

  constructor() {
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  private connectedPads(): Gamepad[] {
    const list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    return list.filter((g): g is Gamepad => !!g && g.connected).sort((a, b) => a.index - b.index);
  }

  private static readPad(gp: Gamepad): InputState {
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
    return {
      left: b(14) || ax < -DEADZONE,
      right: b(15) || ax > DEADZONE,
      up: b(12) || ay < -DEADZONE,
      down: b(13) || ay > DEADZONE,
      punch: b(0) || b(2),   // A / X  (Cruz / Quadrado)
      kick: b(1) || b(3),    // B / Y  (Círculo / Triângulo)
    };
  }

  private readKeys(p: number): InputState {
    const m = KEYMAP[p];
    const down = (k: Key) => m[k].some((c) => this.keys.has(c));
    return { left: down('left'), right: down('right'), up: down('up'), down: down('down'), punch: down('punch'), kick: down('kick') };
  }

  /** Chamar uma vez por frame lógico. */
  poll(): [InputState, InputState] {
    const pads = this.connectedPads();
    this.padNotes = [];
    let select = false;
    const out: InputState[] = [];
    for (let p = 0; p < 2; p++) {
      const k = this.readKeys(p);
      const gp = pads[p];
      let s = k;
      if (gp) {
        const g = InputManager.readPad(gp);
        s = { left: k.left || g.left, right: k.right || g.right, up: k.up || g.up, down: k.down || g.down, punch: k.punch || g.punch, kick: k.kick || g.kick };
        select ||= !!gp.buttons[8]?.pressed;
        this.padNotes.push(`P${p + 1}: controle "${gp.id.slice(0, 40)}"${gp.mapping === 'standard' ? '' : ' (mapeamento NAO padrao)'}`);
      } else {
        this.padNotes.push(`P${p + 1}: teclado (aperte um botao no controle para ativar)`);
      }
      out.push(s);
    }
    this.debugToggle = select && !this.prevSelect;
    this.prevSelect = select;
    return [out[0] ?? EMPTY_INPUT, out[1] ?? EMPTY_INPUT];
  }
}
