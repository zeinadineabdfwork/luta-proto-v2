import * as THREE from 'three';
import { Fighter } from '../combat/fighter.js';
import { Match } from '../combat/match.js';
import {
  CAM_Y, CM_PER_PX, FEET_PX, STAGE_IMAGE, STAGE_IMG_H, STAGE_IMG_W, VIEW_H, VIEW_W,
} from '../data/stage.js';
import { CharacterView } from './character-view.js';
import { Hud, HUD_H, HUD_W } from './hud.js';

/** Cena 3D (cenário 2D como plano + lutadores 3D) com câmera ortográfica lateral que acompanha os lutadores. */
export class Renderer {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private views: CharacterView[] = [];
  private shadows: THREE.Mesh[] = [];
  private hud: Hud;
  private last = performance.now();

  constructor(private canvas: HTMLCanvasElement, hudCanvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.OrthographicCamera(-VIEW_W / 2, VIEW_W / 2, VIEW_H / 2, -VIEW_H / 2, 1, 5000);
    this.camera.position.set(0, CAM_Y, 1500);
    this.hud = new Hud(hudCanvas.getContext('2d')!);
    this.hudCanvas = hudCanvas;
    this.setupLights();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  private hudCanvas: HTMLCanvasElement;

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(640, Math.min(1920, Math.round(this.canvas.clientWidth * dpr)));
    const h = Math.round((w * 9) / 16);
    this.gl.setSize(w, h, false);
    this.hudCanvas.width = w; this.hudCanvas.height = h;
    this.hudScale = w / HUD_W;
  }
  private hudScale = 1;

  private setupLights(): void {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xcfe6ff, 0x9a7a5c, 1.35));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
    sun.position.set(-350, 600, 700); s.add(sun);
    const rim = new THREE.DirectionalLight(0xbcd8ff, 0.9);       // luz de recorte para destacar a silhueta
    rim.position.set(300, 250, -500); s.add(rim);
  }

  async load(fighters: Fighter[], onProgress: (msg: string) => void): Promise<void> {
    onProgress('Carregando cenário…');
    const tex = await new THREE.TextureLoader().loadAsync(STAGE_IMAGE);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.gl.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    const w = STAGE_IMG_W * CM_PER_PX, h = STAGE_IMG_H * CM_PER_PX;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    bg.position.set(0, (FEET_PX - STAGE_IMG_H / 2) * CM_PER_PX, -400);      // pés (y=0) caem em FEET_PX da imagem
    this.scene.add(bg);

    // sombra "blob" (ortográfica lateral: precisa ser um sprite de frente para a câmera)
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d')!, g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.6, 'rgba(0,0,0,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(cv);

    for (const f of fighters) {
      onProgress(`Carregando ${f.data.name}…`);
      const v = await CharacterView.load(f, this.gl.capabilities.getMaxAnisotropy());
      this.views.push(v); this.scene.add(v.root);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(110, 22), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      sh.renderOrder = -1; sh.position.z = -50; this.scene.add(sh); this.shadows.push(sh);
    }
  }

  draw(m: Match, debug: boolean, fps: number, padNotes: string[]): void {
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const vdt = m.hitstop > 0 ? 0 : dt;                        // anima congela durante o hit-stop

    this.views.forEach((v, i) => {
      v.update(vdt);
      const f = i === 0 ? m.p1 : m.p2, sh = this.shadows[i];
      sh.position.set(f.x, 1, -50);
      const k = Math.max(0.35, 1 - f.y / 220);
      sh.scale.set(k, k, 1); (sh.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
    });

    const sx = m.shake > 0.3 ? (Math.random() - 0.5) * m.shake : 0, sy = m.shake > 0.3 ? (Math.random() - 0.5) * m.shake * 0.7 : 0;
    this.camera.position.x = m.camX + sx; this.camera.position.y = CAM_Y + sy;
    this.gl.render(this.scene, this.camera);

    const c = this.hudCanvas.getContext('2d')!;
    c.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
    this.hud.draw(m, m.camX + sx, debug, fps, padNotes, dt);
    void HUD_H;
  }
}
