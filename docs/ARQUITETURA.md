# Arquitetura – Luta Moçambicana (protótipo 0.1)

## 1. Arquitetura recomendada
Motor (`src/combat`, `core`, `input`, `rendering`) separado do conteúdo (`src/data`).
A simulação é **pura e determinística** (sem DOM, sem `Math.random`, sem relógio): `Match.step(input1, input2)` avança 1 frame.
Renderização e entrada ficam nas bordas. Isso permite testar no Node, gravar/reproduzir partidas (replay) e, no futuro, rollback netcode.

## 2. Estrutura de pastas
```
src/core       loop de passo fixo
src/input      teclado + Gamepad API (controles sem fio)
src/combat     tipos, Fighter (máquina de estados), Match (hits, pushbox, round)
src/data       dados dos lutadores (placeholder -> personagens reais)
src/rendering  Canvas 2D + overlay de debug
src/tests      testes headless (node:test)
(futuro) animation, audio, stages, ui, ai, debug
```

## 3. Tecnologias
TypeScript + Canvas 2D + Web Audio (futuro) + Node só para build/servidor/testes. Roda em Chrome/Edge.

## 4. Pacotes npm
Somente `typescript` e `@types/node` (dev). Zero dependências em runtime.

## 5. Game loop
Passo fixo 60 Hz com acumulador; render a cada `requestAnimationFrame`; limite de 100 ms por quadro. Ordem do frame: poll de entrada -> update dos lutadores -> pushbox -> detecção de acertos (os dois lados calculados antes de aplicar) -> fim de round.

## 6. Máquina de estados do lutador
`idle | walk | crouch | jump | attack(startup→active→recovery) | hitstun | ko`.
Ações só são aceitas em `idle/walk/crouch`. Ataque dispara na borda de subida do botão (segurar não repete).

## 7. Hitbox / hurtbox
Retângulos relativos aos pés, definidos olhando para a direita e espelhados conforme `facing`. Hurtbox muda ao agachar. Hitbox só existe na fase `active`; cada golpe acerta uma vez (`hasHit`). Pushbox simples por distância mínima.

## 8. Esquema de dados do personagem (atual)
`FighterData`: nome, cor, vida, velocidades, gravidade, `standHurt`, `crouchHurt`, `light: AttackData`.
`AttackData`: `startup, active, recovery, damage, hitstun, knockback, hitbox`.
Marcos seguintes acrescentam: `blockstun, pushback, cancelRules, invulnerability, resourceCost`, lista de golpes por nome, especiais, projéteis, recursos (ex.: inventário por ronda).

## 9. Roteiro
Seguir os 8 marcos do pedido. Marco 1 = este protótipo (falta: animações reais, timer).

## 10. Metodologia de pesquisa no jogo de referência
Para cada subsistema, preencher a ficha SYSTEM / FEATURE / OBSERVED / EVIDENCE / HYPOTHESIS / CONFIDENCE / TEST / RESULT / ORIGINAL IMPLEMENTATION.
Medições por observação: gravar a tela a 60 fps e contar frames (startup/active/recovery, hitstun, blockstun); medir deslocamento em pixels por frame para velocidades; usar modo treino se existir. Tudo registrado como CONFIRMED / HYPOTHESIS / UNKNOWN. Nada de copiar código ou assets.
**Pendente:** você ainda não disse qual é o jogo de referência; sem isso não há observações a registrar.

## 11. Estratégia de testes
Testes unitários headless dos comportamentos de frame data (acerta/não acerta, hit único, hitstun, KO). Futuro: replays determinísticos como testes de regressão; teste de entrada com gamepad simulado.

## 12. Estratégia de debug
Overlay (F1 ou Select/Back no controle): hurtbox verde, hitbox vermelha, pontos dos pés, estado/frame/fase do golpe, posição, velocidade, knockback, log de eventos de acerto, FPS.
Futuro: pausa e avanço frame a frame, buffer de entrada visível, gravação de replay.

## Controles sem fio
- Gamepad API do navegador; Bluetooth ou dongle 2.4 GHz, tanto faz para o código.
- Mapeamento "standard": D-pad (botões 12-15) e analógico esquerdo (zona morta 0.5); A/B/X/Y atacam; Select/Back alterna debug.
- 1º controle = P1, 2º = P2; teclado sempre funciona junto.
- O navegador só "enxerga" o controle depois de um botão ser pressionado.
- Controles fora do padrão (arcade stick genérico) mostram aviso "mapeamento NÃO padrão"; tela de remapeamento fica para o Marco 4 (menus).
- Latência: dongle 2.4 GHz costuma ser menor que Bluetooth; para jogo competitivo, preferir o dongle ou cabo.
