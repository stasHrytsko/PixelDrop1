import * as THREE from 'three';
import type { ColorId, VoxelObjectConfig } from '../engine/types.ts';

const COLORS: Readonly<Record<ColorId, number>> = {
  coral: 0xf5a454, rose: 0xe96f94, purple: 0x9b81d5, tan: 0xe7c58a,
  brown: 0x845536, black: 0x29282c, white: 0xfffdf7, red: 0xd94b48,
};

export class VoxelReveal {
  readonly #root = document.createElement('section');
  readonly #canvas = document.createElement('canvas');
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
  readonly #group = new THREE.Group();
  readonly #onContinue: () => void;
  #frame: number | null = null;
  #drag: { x: number; y: number; pointerId: number } | null = null;
  #destroyed = false;

  constructor(object: VoxelObjectConfig, onContinue: () => void) {
    this.#onContinue = onContinue;
    this.#root.className = 'pixel-drop-reveal';
    this.#root.dataset['testid'] = 'voxel-reveal';
    const title = document.createElement('h1');
    title.textContent = 'Это ' + object.label.toLowerCase() + '!';
    const copy = document.createElement('p');
    copy.textContent = 'Три картинки сложились в один объект. Поверни его пальцем.';
    this.#canvas.className = 'pixel-drop-reveal__canvas';
    this.#canvas.setAttribute('aria-label', object.label + ', интерактивная 3D-модель');
    const button = document.createElement('button');
    button.className = 'pixel-drop-reveal__continue';
    button.dataset['testid'] = 'voxel-continue';
    button.textContent = 'Продолжить';
    button.addEventListener('click', this.#continue);
    this.#root.append(title, copy, this.#canvas, button);

    this.#renderer = new THREE.WebGLRenderer({ canvas: this.#canvas, alpha: true, antialias: true });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#scene.background = new THREE.Color(0xf5f6fb);
    this.#scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0bd, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(8, 14, 10);
    this.#scene.add(key, this.#group);

    const geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
    const byColor = new Map<ColorId, typeof object.voxels>();
    for (const voxel of object.voxels) byColor.set(voxel.color, [...(byColor.get(voxel.color) ?? []), voxel]);
    const matrix = new THREE.Matrix4();
    for (const [color, voxels] of byColor) {
      const material = new THREE.MeshStandardMaterial({ color: COLORS[color], roughness: 0.72, metalness: 0.03 });
      const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
      voxels.forEach((voxel, index) => {
        matrix.makeTranslation(voxel.x - (object.size[0] - 1) / 2, voxel.y - (object.size[1] - 1) / 2, voxel.z - (object.size[2] - 1) / 2);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.#group.add(mesh);
    }
    this.#group.rotation.x = -0.2;
    this.#group.rotation.y = -0.55;
    this.#camera.position.set(12, 9, 16);
    this.#camera.lookAt(0, 0, 0);
    this.#canvas.addEventListener('pointerdown', this.#pointerDown);
    window.addEventListener('pointermove', this.#pointerMove);
    window.addEventListener('pointerup', this.#pointerUp);
    window.addEventListener('resize', this.#resize);
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.#root);
    this.#resize();
    this.#animate();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#canvas.removeEventListener('pointerdown', this.#pointerDown);
    window.removeEventListener('pointermove', this.#pointerMove);
    window.removeEventListener('pointerup', this.#pointerUp);
    window.removeEventListener('resize', this.#resize);
    this.#group.traverse((child) => {
      if (child instanceof THREE.InstancedMesh) {
        (child.geometry as THREE.BufferGeometry).dispose();
        const material = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      }
    });
    this.#renderer.dispose();
    this.#root.remove();
  }

  readonly #continue = (): void => { this.#onContinue(); };
  readonly #pointerDown = (event: PointerEvent): void => {
    this.#drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    this.#canvas.setPointerCapture?.(event.pointerId);
  };
  readonly #pointerMove = (event: PointerEvent): void => {
    if (this.#drag?.pointerId !== event.pointerId) return;
    this.#group.rotation.y += (event.clientX - this.#drag.x) * 0.012;
    this.#group.rotation.x += (event.clientY - this.#drag.y) * 0.008;
    this.#drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };
  readonly #pointerUp = (event: PointerEvent): void => { if (this.#drag?.pointerId === event.pointerId) this.#drag = null; };
  readonly #resize = (): void => {
    const size = Math.max(280, Math.min(this.#canvas.clientWidth || 360, 430));
    this.#renderer.setSize(size, size, false);
    const span = 8.3;
    this.#camera.left = -span; this.#camera.right = span; this.#camera.top = span; this.#camera.bottom = -span;
    this.#camera.updateProjectionMatrix();
  };
  readonly #animate = (): void => {
    if (this.#destroyed) return;
    if (this.#drag === null && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.#group.rotation.y += 0.004;
    this.#renderer.render(this.#scene, this.#camera);
    this.#frame = requestAnimationFrame(this.#animate);
  };
}
