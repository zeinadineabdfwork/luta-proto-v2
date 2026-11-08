import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fighter } from '../combat/fighter.js';
import { Match } from '../combat/match.js';
import { EMPTY_INPUT, InputState } from '../combat/types.js';
import { PLACEHOLDER_A, PLACEHOLDER_B } from '../data/placeholder.js';
import { STAGE_HALF, VIEW_W, SCREEN_MARGIN } from '../data/stage.js';
import { IVONE, NELTON } from '../data/characters.js';

const PUNCH: InputState = { ...EMPTY_INPUT, punch: true };
const KICK: InputState = { ...EMPTY_INPUT, kick: true };
const mk = (gap = 60, intro = 0) => new Match(new Fighter(PLACEHOLDER_A, 0, 1), new Fighter(PLACEHOLDER_B, gap, -1), intro);
const idle = (m: Match, n: number) => { for (let i = 0; i < n; i++) m.step(EMPTY_INPUT, EMPTY_INPUT); };
/** aperta um botão 1 frame e espera n frames */
function swing(m: Match, input: InputState, frames: number) {
  m.step(input, EMPTY_INPUT);
  idle(m, frames);
}

test('soco próximo acerta, tira vida, causa hitstun e knockback', () => {
  const m = mk(); const x0 = m.p2.x;
  swing(m, PUNCH, 12);
  assert.equal(m.p2.health, 1000 - PLACEHOLDER_A.moves.punch.damage);
  assert.equal(m.p2.state, 'hitstun');
  assert.ok(m.p2.x > x0, 'defensor deve ser empurrado');
});

test('chute causa mais dano que soco', () => {
  const m = mk(); swing(m, KICK, 14);
  assert.equal(m.p2.health, 1000 - PLACEHOLDER_A.moves.kick.damage);
});

test('golpe longe não acerta', () => {
  const m = mk(400);
  swing(m, PUNCH, 30);
  assert.equal(m.p2.health, 1000);
});

test('um golpe acerta só uma vez', () => {
  const m = mk(); swing(m, PUNCH, 12);
  const h = m.p2.health;
  idle(m, 5);
  assert.equal(m.p2.health, h);
});

test('hit-stop congela a partida por alguns frames', () => {
  const m = mk(); m.step(PUNCH, EMPTY_INPUT);
  let frames = 0; while (m.hitstop === 0 && frames++ < 30) m.step(EMPTY_INPUT, EMPTY_INPUT);
  assert.ok(m.hitstop > 0);
  const x = m.p2.x, f = m.p1.frame; m.step(EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(m.p2.x, x); assert.equal(m.p1.frame, f);
});

test('defensor se recupera do hitstun', () => {
  const m = mk(); swing(m, PUNCH, 12);
  idle(m, PLACEHOLDER_A.moves.punch.hitstun + 15);
  assert.equal(m.p2.state, 'idle');
});

test('pular sobe e volta ao chão', () => {
  const m = mk(400);
  m.step({ ...EMPTY_INPUT, up: true }, EMPTY_INPUT);
  assert.equal(m.p1.state, 'jump');
  let peak = 0;
  for (let i = 0; i < 90; i++) { m.step(EMPTY_INPUT, EMPTY_INPUT); peak = Math.max(peak, m.p1.y); }
  assert.ok(peak > 60 && peak < 140, `altura do pulo ${peak}`);
  assert.equal(m.p1.state, 'idle'); assert.ok(m.p1.grounded);
});

test('personagens reais: salto cabe em ~0,6 s e não passa de 1,3 m', () => {
  for (const d of [NELTON, IVONE]) {
    const peak = (d.jumpVelocity * d.jumpVelocity) / (2 * d.gravity);
    assert.ok(peak > 60 && peak < 130, `${d.name}: ${peak}`);
  }
});

test('lutadores viram um para o outro e andam', () => {
  const m = mk(300);
  m.step({ ...EMPTY_INPUT, right: true }, EMPTY_INPUT);
  assert.equal(m.p1.state, 'walk'); assert.ok(m.p1.x > 0);
  assert.equal(m.p1.facing, 1); assert.equal(m.p2.facing, -1);
});

test('pushbox: não atravessam um ao outro no chão', () => {
  const m = mk(300);
  for (let i = 0; i < 200; i++) m.step({ ...EMPTY_INPUT, right: true }, EMPTY_INPUT);
  assert.ok(m.p2.x - m.p1.x >= 51, `distância ${m.p2.x - m.p1.x}`);
});

test('câmera: ninguém sai da tela e o cenário só se revela ao caminhar', () => {
  const m = new Match(new Fighter(PLACEHOLDER_A, -100, 1), new Fighter(PLACEHOLDER_B, 100, -1));
  idle(m, 120);
  assert.ok(Math.abs(m.camX) < 5, 'câmera começa no centro');
  const right = m.camX + VIEW_W / 2;
  // P1 corre para a esquerda por muito tempo: a borda esquerda da tela o segura, depois a câmera acompanha
  for (let i = 0; i < 60; i++) m.step({ ...EMPTY_INPUT, left: true }, EMPTY_INPUT);
  assert.ok(m.p1.x >= m.camX - VIEW_W / 2 + SCREEN_MARGIN - 1e-6);
  assert.ok(m.p2.x <= m.camX + VIEW_W / 2 - SCREEN_MARGIN + 1e-6);
  // os dois andam para a esquerda: a câmera desliza e revela o lado esquerdo
  for (let i = 0; i < 600; i++) m.step({ ...EMPTY_INPUT, left: true }, { ...EMPTY_INPUT, left: true });
  assert.ok(m.camX < -200, `câmera ${m.camX}`);
  assert.ok(m.camX - VIEW_W / 2 >= -STAGE_HALF - 1e-6, 'câmera não passa do limite da imagem');
  assert.ok(m.p1.x >= -STAGE_HALF + SCREEN_MARGIN - 1e-6);
  assert.ok(right > 0);
});

test('round termina em KO e reinicia com ataque', () => {
  const m = mk();
  for (let n = 0; n < 60 && m.phase === 'fight'; n++) {
    swing(m, PUNCH, 40);
    m.p2.x = 60;  // mantém distância (knockback)
  }
  assert.equal(m.phase, 'over'); assert.equal(m.winner, 1); assert.equal(m.p2.state, 'ko');
  idle(m, 130);
  m.step(PUNCH, EMPTY_INPUT);
  assert.equal(m.phase, 'fight'); assert.equal(m.p2.health, 1000);
});

test('abertura (intro) bloqueia entradas até começar a luta', () => {
  const m = mk(60, 30);
  assert.equal(m.phase, 'intro');
  m.step(PUNCH, EMPTY_INPUT);
  assert.equal(m.p1.state, 'idle');
  idle(m, 40);
  assert.equal(m.phase, 'fight');
});
