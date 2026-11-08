// Cenário "Anime School Perimeter Street": medidas reais em centímetros.
// O muro mede 208 px na imagem original (y=374 topo, y=582 base) e é tratado como 2,5 m de altura;
// daí sai a escala px -> cm e, portanto, o tamanho dos personagens em relação ao muro.
export const STAGE_IMAGE = 'cenarios/Anime School Perimeter Street.png';
export const STAGE_IMG_W = 1919;
export const STAGE_IMG_H = 820;
export const WALL_PX = 208;
export const WALL_CM = 250;                    // ajuste aqui se o muro for mais alto/baixo
export const CM_PER_PX = WALL_CM / WALL_PX;
export const FEET_PX = 660;                    // linha dos pés na imagem (calçada, à frente do muro)

export const STAGE_WIDTH_CM = STAGE_IMG_W * CM_PER_PX;     // ~2307 cm
export const STAGE_HALF = STAGE_WIDTH_CM / 2;

// Câmera ortográfica (altura visível em cm). Largura = altura * 16/9.
export const VIEW_H = 500;
export const VIEW_W = VIEW_H * 16 / 9;
export const FEET_FROM_BOTTOM = 100;           // quanto do chão aparece abaixo dos pés
export const CAM_Y = -FEET_FROM_BOTTOM + VIEW_H / 2;

export const SCREEN_MARGIN = 75;               // distância mínima dos lutadores à borda da tela
export const CAM_SMOOTH = 0.14;
export const CAM_START_X = 0;                  // centro do cenário: esquerda e direita ainda escondidas
