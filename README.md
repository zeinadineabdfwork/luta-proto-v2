# Luta Moçambicana – protótipo 0.2 (3D em cenário 2D)
Requisitos: Node 18+.
```
npm install
npm start          # compila e abre http://localhost:5173
npm test           # testes headless do combate
npm run build:assets   # (opcional) regenera assets/ a partir de character/*.fbx
```
## Controles
| | P1 | P2 |
|---|---|---|
| Andar | A / D | ← / → |
| Pular | W | ↑ |
| Soco | J | Num1 ou / |
| Chute | K | Num2 ou . |
| Bola de fogo (só Nelton) | L | Num3 ou , |
| Agarrão (só Nelton) | H | Num0 ou ; |
Controle: D-pad/analógico, A/X = soco, B/Y = chute. F1 = debug (hurtbox verde, hitbox vermelha).

## O que há de novo
- Nelton (P1) e Dona Ivone (P2) em 3D, com idle, andar, andar para trás, pulo, soco, chute e reação a golpe.
- Escala real: Nelton 1,75 m, Ivone 1,65 m, muro = 2,5 m (`src/data/stage.ts`, `WALL_CM`). Ninguém passa do muro.
- Câmera estilo KOF/MK: o cenário é maior que a tela; o lado esquerdo (e o direito) só aparece quando os dois lutadores caminham para lá. Ninguém sai da tela.
- Hit-stop, tremor de câmera, faíscas, câmera lenta no K.O., abertura "ROUND 1 / LUTEM!".
- Malhas reduzidas (224k/387k → 60k/70k triângulos) e texturas em WebP: ~8 MB no total.

## Observação importante
Os arquivos não têm animação de morte. O K.O. usa a reação a golpe + queda procedural. Para usar uma animação real, adicione o FBX em `scripts/characters.config.json` e rode `npm run build:assets`.

## Efeitos de fogo
Bola de fogo do Nelton: carga na mão, projétil que atravessa a tela (só uma por vez) e explosão no impacto. Efeitos em `assets/fx/` (atlas WebP feitos a partir dos pacotes Fantasy VFX Fire Magic e Ember Flipbooks Lite; verifique as licenças antes de publicar os arquivos num repositório público).

## Sequência de chutes (botão H, só Nelton)
`scripts/data/dando_chute.json` (atacante) e `recebendo_chute.json` (vítima) são landmarks 3D (MediaPipe) extraídos dos vídeos. O `npm run build:assets` suaviza os pontos, alinha a direção do chute com a frente do jogo (e a vítima com o lado oposto) e converte tudo em rotações do esqueleto Mixamo de cada personagem (clips `grabAttack` e `grabVictim`, dentro do `model.glb`). Deitado, o corpo é apoiado no chão pelas costas/cabeça.
No jogo: o Nelton aperta H a até 1,2 m do adversário (no chão); a cena começa na hora, com os dois a 78 cm. São 3 chutes (o 2º derruba), a vítima fica deitada e se levanta, ~5,8 s no total. Se a vida zera, ela fica deitada (K.O.). Tempos, dano e deslocamentos em `src/data/characters.ts` (bloco `grab`).
