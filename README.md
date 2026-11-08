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
Controle: D-pad/analógico, A/X = soco, B/Y = chute. F1 = debug (hurtbox verde, hitbox vermelha).

## O que há de novo
- Nelton (P1) e Dona Ivone (P2) em 3D, com idle, andar, andar para trás, pulo, soco, chute e reação a golpe.
- Escala real: Nelton 1,75 m, Ivone 1,65 m, muro = 2,5 m (`src/data/stage.ts`, `WALL_CM`). Ninguém passa do muro.
- Câmera estilo KOF/MK: o cenário é maior que a tela; o lado esquerdo (e o direito) só aparece quando os dois lutadores caminham para lá. Ninguém sai da tela.
- Hit-stop, tremor de câmera, faíscas, câmera lenta no K.O., abertura "ROUND 1 / LUTEM!".
- Malhas reduzidas (224k/387k → 60k/70k triângulos) e texturas em WebP: ~8 MB no total.

## Observação importante
Os arquivos não têm animação de morte. O K.O. usa a reação a golpe + queda procedural. Para usar uma animação real, adicione o FBX em `scripts/characters.config.json` e rode `npm run build:assets`.
