import * as THREE from 'three';

/**
 * Generates a crisp procedural pen-and-ink diagonal hatching texture on pure white paper.
 * Zero external image URLs — 100% procedural CanvasTexture.
 */
export function createInkHatchTexture(
  variant: 'subtle' | 'engraving',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Pure white paper base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const spacing = variant === 'engraving' ? 10 : 18;
  ctx.strokeStyle = variant === 'engraving' ? 'rgba(10, 10, 10, 0.28)' : 'rgba(12, 12, 12, 0.11)';
  ctx.lineWidth = variant === 'engraving' ? 1.15 : 0.9;

  // Primary 45-degree architectural pen hatching
  ctx.beginPath();
  for (let i = -size; i < size * 2; i += spacing) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
  }
  ctx.stroke();

  if (variant === 'engraving') {
    // Secondary cross-hatch strokes for deep engraving shading
    ctx.strokeStyle = 'rgba(10, 10, 10, 0.16)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += spacing * 2) {
      ctx.moveTo(i + size, 0);
      ctx.lineTo(i, size);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a soft graphite pen-stipple radial contact shadow disc for grounding
 * the Eiffel Tower base piers onto the white drawing paper.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, size * 0.06, cx, cx, cx);
  grad.addColorStop(0, 'rgba(10, 10, 10, 0.24)');
  grad.addColorStop(0.55, 'rgba(10, 10, 10, 0.09)');
  grad.addColorStop(1, 'rgba(10, 10, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface SketchMaterialSet {
  inkLinePrimary: THREE.LineBasicMaterial;
  inkLineFine: THREE.LineBasicMaterial;
  inkLineFaint: THREE.LineBasicMaterial;
  stickBlackMat: THREE.MeshStandardMaterial;
  whiteOcclusionMat: THREE.MeshStandardMaterial;
  whiteHatchMat: THREE.MeshStandardMaterial;
  whiteGroundMat: THREE.MeshStandardMaterial;
  subtleHatchTex: THREE.CanvasTexture;
  engravingHatchTex: THREE.CanvasTexture;
  contactShadowTex: THREE.CanvasTexture;
  dispose: () => void;
}

export function createSketchMaterialSet(renderer: THREE.WebGLRenderer): SketchMaterialSet {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const subtleHatchTex = createInkHatchTexture('subtle', maxAniso);
  const engravingHatchTex = createInkHatchTexture('engraving', maxAniso);
  const contactShadowTex = createContactShadowTexture();

  // Crisp jet-black ink strokes for primary architectural contours, eaves, bridges & Eiffel Tower
  const inkLinePrimary = new THREE.LineBasicMaterial({
    color: 0x060606,
    transparent: false,
  });

  // Secondary architectural ink nib for French windows, balconies, dormers, trees, lamps & barges
  const inkLineFine = new THREE.LineBasicMaterial({
    color: 0x161616,
    transparent: true,
    opacity: 0.88,
  });

  // Delicate drafting ink for shadow cross-hatching, window mullions, river ripples & sidewalks
  const inkLineFaint = new THREE.LineBasicMaterial({
    color: 0x383838,
    transparent: true,
    opacity: 0.52,
  });

  // True 3D matte wrought-iron black stick material for the Eiffel Tower structural beams
  const stickBlackMat = new THREE.MeshStandardMaterial({
    color: 0x090909,
    roughness: 0.62,
    metalness: 0.28,
  });

  // Pure white hidden-line occlusion core (polygonOffset pushes slightly behind ink edges)
  const whiteOcclusionMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 1.5,
  });

  // Pure white paper facade with subtle architectural ink-pen hatching
  const whiteHatchMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: subtleHatchTex,
    roughness: 0.94,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 1.5,
  });

  // Pure white studio drawing sheet ground plane
  const whiteGroundMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: 2.0,
    polygonOffsetUnits: 2.0,
  });

  return {
    inkLinePrimary,
    inkLineFine,
    inkLineFaint,
    stickBlackMat,
    whiteOcclusionMat,
    whiteHatchMat,
    whiteGroundMat,
    subtleHatchTex,
    engravingHatchTex,
    contactShadowTex,
    dispose: () => {
      inkLinePrimary.dispose();
      inkLineFine.dispose();
      inkLineFaint.dispose();
      stickBlackMat.dispose();
      whiteOcclusionMat.dispose();
      whiteHatchMat.dispose();
      whiteGroundMat.dispose();
      subtleHatchTex.dispose();
      engravingHatchTex.dispose();
      contactShadowTex.dispose();
    },
  };
}
