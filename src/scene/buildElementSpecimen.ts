import * as THREE from 'three';
import { buildEiffelTower } from './buildEiffelTower';
import {
  computeSpecimenCameraFrame,
  type InspectableElement,
  type SpecimenCameraFrame,
} from './elementCatalog';
import { SketchLineCollector, createRng } from './sketchMath';

export interface SpecimenBuildResult {
  group: THREE.Group;
  solidMeshes: THREE.Mesh[];
  lineObjects: THREE.LineSegments[];
  frame: SpecimenCameraFrame;
}

interface SpecimenMaterials {
  inkLinePrimary: THREE.LineBasicMaterial;
  inkLineFine: THREE.LineBasicMaterial;
  inkLineFaint: THREE.LineBasicMaterial;
  stickBlackMat: THREE.MeshStandardMaterial;
  whiteOcclusionMat: THREE.MeshStandardMaterial;
  whiteHatchMat: THREE.MeshStandardMaterial;
}

/**
 * Constructs a high-detail, centered 3D architectural ink-sketch specimen model
 * on a pure white circular drafting plinth for interactive 360° inspection.
 */
export function buildElementSpecimen(
  element: InspectableElement,
  materials: SpecimenMaterials
): SpecimenBuildResult {
  const root = new THREE.Group();
  root.name = `Specimen_${element.id}`;

  const solidMeshes: THREE.Mesh[] = [];
  const lineObjects: THREE.LineSegments[] = [];

  const ink = new SketchLineCollector(element.params?.seed ?? 1889);
  const fine = new SketchLineCollector((element.params?.seed ?? 1889) + 17);
  const faint = new SketchLineCollector((element.params?.seed ?? 1889) + 37);

  const addBox = (
    cx: number,
    baseY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    rotY = 0,
    mat: THREE.Material = materials.whiteHatchMat
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, baseY + h * 0.5, cz);
    mesh.rotation.y = -rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    solidMeshes.push(mesh);
    return mesh;
  };

  let boundW = 24;
  let boundH = 24;
  let boundD = 24;

  // ---------------------------------------------------------------------------
  // 1. EIFFEL TOWER — Full 330m true-scale structural iron lattice specimen
  // ---------------------------------------------------------------------------
  if (element.kind === 'eiffel-tower') {
    const eiffel = buildEiffelTower({
      inkLinePrimary: materials.inkLinePrimary,
      inkLineFine: materials.inkLineFine,
      stickBlackMat: materials.stickBlackMat,
      whiteOcclusionMat: materials.whiteOcclusionMat,
      whiteHatchMat: materials.whiteHatchMat,
    });
    root.add(eiffel.group);
    solidMeshes.push(...eiffel.solidMeshes);
    lineObjects.push(...eiffel.lineObjects);
    boundW = 132;
    boundH = 332;
    boundD = 132;
  }

  // ---------------------------------------------------------------------------
  // 2. HAUSSMANNIAN BUILDING — Ultra-detailed architectural facade study
  // ---------------------------------------------------------------------------
  else if (element.kind === 'haussmann-building') {
    const w = element.params?.width ?? 28;
    const h = element.params?.height ?? 20;
    const d = element.params?.depth ?? 13;
    const floors = element.params?.floors ?? 6;
    const mansardH = element.params?.mansardHeight ?? 3.8;
    const cornerRotunda = element.params?.cornerRotunda ?? false;

    // White paper building core + sloped mansard prism
    addBox(0, 0, 0, w, h, d, 0, materials.whiteHatchMat);
    const roofGeo = new THREE.CylinderGeometry(0.56, 0.7071, mansardH, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    const roofMesh = new THREE.Mesh(roofGeo, materials.whiteHatchMat);
    roofMesh.position.set(0, h + mansardH * 0.5, 0);
    roofMesh.scale.set(w, 1, d);
    root.add(roofMesh);
    solidMeshes.push(roofMesh);

    ink.addHaussmannBuilding(0, 0, 0, w, h, d, 0, {
      overshoot: 0.32,
      floors,
      mansardHeight: mansardH,
      detailTier: 'hero',
      balconyFloors: [2, Math.max(3, floors - 1)],
      cornerRotunda,
      crossHatchShadowFace: true,
      fineTarget: fine,
      faintTarget: faint,
    });

    // Extra specimen-grade wrought-iron vertical balcony balusters & porte-cochère entry + sidewalk lamps
    const floorH = h / floors;
    for (const bf of [2, Math.max(3, floors - 1)]) {
      const fy = bf * floorH;
      const proj = 0.85;
      const railH = 1.05;
      for (let x = -w * 0.5 - proj; x <= w * 0.5 + proj; x += 0.9) {
        faint.addSegment(x, fy, d * 0.5 + proj, x, fy + railH, d * 0.5 + proj);
        faint.addSegment(x, fy, -d * 0.5 - proj, x, fy + railH, -d * 0.5 - proj);
      }
      for (let z = -d * 0.5 - proj; z <= d * 0.5 + proj; z += 0.9) {
        faint.addSegment(w * 0.5 + proj, fy, z, w * 0.5 + proj, fy + railH, z);
        faint.addSegment(-w * 0.5 - proj, fy, z, -w * 0.5 - proj, fy + railH, z);
      }
    }

    // Sidewalk apron + Parisian corner lamppost beside building
    const swW = w + 5.0;
    const swD = d + 5.0;
    fine.addPolyline(
      [
        [-swW * 0.5, 0.08, -swD * 0.5],
        [swW * 0.5, 0.08, -swD * 0.5],
        [swW * 0.5, 0.08, swD * 0.5],
        [-swW * 0.5, 0.08, swD * 0.5],
      ],
      true
    );
    fine.addParisStreetLamp(swW * 0.45, 0.08, swD * 0.48, 5.2);

    boundW = swW;
    boundH = h + mansardH + (cornerRotunda ? 7.5 : 4.2);
    boundD = swD;
  }

  // ---------------------------------------------------------------------------
  // 3. SEINE RIVER SIGHTSEEING SHIP (Bateau Mouche) — Rich maritime sketch
  // ---------------------------------------------------------------------------
  else if (element.kind === 'river-ship') {
    const len = element.params?.length ?? 28;
    const beam = element.params?.beam ?? 7.2;
    const hl = len * 0.5;
    const hb = beam * 0.5;

    // Lower hull white occlusion core + tapered bow wedge
    addBox(0, 0.1, 0, len * 0.78, 2.3, beam, 0, materials.whiteOcclusionMat);
    const bowShape = new THREE.Shape();
    bowShape.moveTo(0, -hb);
    bowShape.lineTo(len * 0.25, 0);
    bowShape.lineTo(0, hb);
    bowShape.closePath();
    const bowGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 2.2, bevelEnabled: false });
    bowGeo.rotateX(-Math.PI / 2);
    const bowMesh = new THREE.Mesh(bowGeo, materials.whiteOcclusionMat);
    bowMesh.position.set(len * 0.39, 0.1, 0);
    root.add(bowMesh);
    solidMeshes.push(bowMesh);

    // Glazed main saloon & aft wheelhouse cores
    addBox(-1.2, 2.4, 0, len * 0.72, 2.6, beam * 0.84, 0, materials.whiteHatchMat);
    addBox(-hl * 0.62, 5.0, 0, 4.8, 1.9, beam * 0.56, 0, materials.whiteOcclusionMat);

    // Detailed ink hull outline, shear line, rubbing strakes & raked bow stem
    ink.addOrientedBox(0, 0.1, 0, len * 0.78, 2.3, beam, 0, { overshoot: 0.22 });
    const bowBase = [len * 0.64, 1.35, 0] as [number, number, number];
    const bowTop = [len * 0.67, 2.65, 0] as [number, number, number];
    ink.addSegment(bowBase[0], bowBase[1], bowBase[2], bowTop[0], bowTop[1], bowTop[2]);
    for (const s of [-1, 1]) {
      ink.addSegment(len * 0.39, 0.15, s * hb, bowBase[0], bowBase[1], bowBase[2]);
      ink.addSegment(len * 0.39, 2.4, s * hb, bowTop[0], bowTop[1], bowTop[2]);
      // Hull horizontal strake & hull ribs
      fine.addSegment(-len * 0.39, 1.25, s * (hb + 0.04), len * 0.39, 1.25, s * (hb + 0.04));
      fine.addSegment(len * 0.39, 1.25, s * hb, len * 0.65, 1.9, 0);
      for (let x = -len * 0.34; x <= len * 0.34; x += 2.6) {
        faint.addSegment(x, 0.2, s * (hb + 0.03), x, 2.35, s * (hb + 0.03));
      }
      // Foredeck safety rail converging to bow jackstaff
      fine.addSegment(len * 0.32, 2.4, s * (hb * 0.82), len * 0.32, 3.25, s * (hb * 0.82));
      fine.addSegment(len * 0.32, 3.25, s * (hb * 0.82), len * 0.61, 3.35, 0);
    }
    // Bow jackstaff & flag pennant
    ink.addSegment(len * 0.61, 2.6, 0, len * 0.61, 5.2, 0);
    fine.addPolyline(
      [
        [len * 0.61, 5.2, 0],
        [len * 0.53, 4.9, 0],
        [len * 0.61, 4.55, 0],
      ],
      false
    );

    // Panoramic glazed lower saloon with slanted mullions & curved skylight roof
    ink.addOrientedBox(-1.2, 2.4, 0, len * 0.72, 2.6, beam * 0.84, 0, {
      overshoot: 0.18,
      windowBays: 12,
    });
    // Upper open-air sightseeing deck railings + rows of passenger benches
    ink.addOrientedBox(-1.2, 5.0, 0, len * 0.68, 1.0, beam * 0.78, 0, {
      overshoot: 0.1,
      windowBays: 14,
    });
    for (let x = -len * 0.24; x <= len * 0.26; x += 2.2) {
      for (const s of [-1, 1]) {
        fine.addSegment(x, 5.05, s * 0.55, x, 5.05, s * (beam * 0.32));
        fine.addSegment(x, 5.55, s * 0.55, x, 5.55, s * (beam * 0.32));
        fine.addSegment(x, 5.05, s * 0.55, x, 5.55, s * 0.55);
        fine.addSegment(x, 5.05, s * (beam * 0.32), x, 5.55, s * (beam * 0.32));
      }
    }

    // Aft wheelhouse bridge + radar mast + twin exhaust funnels
    ink.addOrientedBox(-hl * 0.62, 5.0, 0, 4.8, 1.9, beam * 0.56, 0, {
      overshoot: 0.12,
      windowBays: 4,
    });
    ink.addSegment(-hl * 0.58, 6.9, 0, -hl * 0.64, 9.2, 0);
    fine.addSegment(-hl * 0.61, 8.2, -1.2, -hl * 0.61, 8.2, 1.2);
    // Life buoys mounted on deck railings
    for (const bx of [-4.5, 4.5]) {
      for (const s of [-1, 1]) {
        fine.addHorizontalCircle(bx, 5.45, s * (beam * 0.4), 0.38, 8);
      }
    }

    // Sketched river wake & concentric waterline ripples on plinth
    for (const s of [-1, 1]) {
      faint.addPolyline(
        [
          [len * 0.64, 0.08, 0],
          [len * 0.2, 0.08, s * (hb + 1.4)],
          [-len * 0.58, 0.08, s * (hb + 3.8)],
        ],
        false
      );
      faint.addPolyline(
        [
          [-len * 0.39, 0.08, s * (hb * 0.6)],
          [-len * 0.66, 0.08, s * (hb + 2.2)],
        ],
        false
      );
    }

    boundW = len * 1.15;
    boundH = 9.8;
    boundD = beam * 1.9;
  }

  // ---------------------------------------------------------------------------
  // 4. MOORED PARISIAN RIVER BARGE (Péniche) — Freycinet canal boat
  // ---------------------------------------------------------------------------
  else if (element.kind === 'river-barge') {
    const len = element.params?.length ?? 34;
    const beam = element.params?.beam ?? 6.2;

    addBox(0, 0.1, 0, len * 0.84, 1.85, beam, 0, materials.whiteOcclusionMat);
    addBox(0, 1.95, 0, len * 0.58, 1.95, beam * 0.78, 0, materials.whiteHatchMat);
    addBox(-len * 0.28, 3.9, 0, 4.4, 1.9, beam * 0.62, 0, materials.whiteOcclusionMat);

    ink.addMooredBarge(0, 0.1, 0, len, beam, 0, faint);
    // Extra specimen details: deck bollards, roof hatch skylights, stern chimney, gangplank
    for (const bx of [-len * 0.38, len * 0.38]) {
      for (const bz of [-beam * 0.42, beam * 0.42]) {
        fine.addHorizontalCircle(bx, 2.05, bz, 0.24, 6);
        fine.addSegment(bx, 1.9, bz, bx, 2.45, bz);
      }
    }
    for (let sx = -len * 0.2; sx <= len * 0.22; sx += 3.8) {
      fine.addOrientedBox(sx, 3.9, 0, 1.8, 0.45, beam * 0.42, 0, { overshoot: 0.05 });
    }
    ink.addSegment(-len * 0.24, 5.8, 0.7, -len * 0.24, 7.6, 0.7);
    fine.addHorizontalCircle(-len * 0.24, 7.6, 0.7, 0.22, 8);

    boundW = len * 1.08;
    boundH = 8.2;
    boundD = beam * 1.8;
  }

  // ---------------------------------------------------------------------------
  // 5. PARISIAN PLANE TREE — Botanical ink-sketch specimen with iron grate
  // ---------------------------------------------------------------------------
  else if (element.kind === 'paris-tree') {
    const h = element.params?.height ?? 13.5;
    const rad = element.params?.canopyRadius ?? 5.0;
    const rng = createRng(element.params?.seed ?? 1201);

    // Subtle white paper canopy core so rear branches cleanly separate in Ink Sketch mode
    const crownGeo = new THREE.IcosahedronGeometry(rad * 0.76, 1);
    const crownMesh = new THREE.Mesh(crownGeo, materials.whiteHatchMat);
    crownMesh.position.set(0, h * 0.7, 0);
    crownMesh.scale.set(1.0, (h * 0.29) / (rad * 0.76), 1.0);
    root.add(crownMesh);
    solidMeshes.push(crownMesh);

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.56, h * 0.46, 8);
    const trunkMesh = new THREE.Mesh(trunkGeo, materials.whiteOcclusionMat);
    trunkMesh.position.set(0, h * 0.23, 0);
    root.add(trunkMesh);
    solidMeshes.push(trunkMesh);

    // Parisian cast-iron sidewalk tree grate (grille d'arbre) at base
    ink.addHorizontalCircle(0, 0.08, 0, 1.9, 20);
    fine.addHorizontalCircle(0, 0.08, 0, 1.25, 16);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      faint.addSegment(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6, Math.cos(a) * 1.9, 0.08, Math.sin(a) * 1.9);
    }

    // Multi-rib sculpted trunk with flared root buttresses
    const trunkTopY = h * 0.45;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const r0 = 0.68;
      const r1 = 0.42;
      const r2 = 0.28;
      ink.addPolyline(
        [
          [Math.cos(a) * r0, 0.08, Math.sin(a) * r0],
          [Math.cos(a) * r1, h * 0.14, Math.sin(a) * r1],
          [Math.cos(a) * r2, trunkTopY, Math.sin(a) * r2],
        ],
        false
      );
    }

    // 7 primary scaffold limbs splitting into 14 secondary branches & twigs
    const primaryLimbs = 7;
    for (let i = 0; i < primaryLimbs; i++) {
      const a = (i / primaryLimbs) * Math.PI * 2 + rng() * 0.35;
      const midR = rad * (0.38 + rng() * 0.16);
      const midY = h * (0.62 + rng() * 0.1);
      const endR = rad * (0.76 + rng() * 0.16);
      const endY = h * (0.78 + rng() * 0.15);

      const startPt: [number, number, number] = [Math.cos(a) * 0.22, trunkTopY * 0.9, Math.sin(a) * 0.22];
      const midPt: [number, number, number] = [Math.cos(a) * midR, midY, Math.sin(a) * midR];
      const endPt: [number, number, number] = [Math.cos(a) * endR, endY, Math.sin(a) * endR];
      ink.addPolyline([startPt, midPt, endPt], false);

      // Forked secondary branchlets
      for (const forkSign of [-1, 1]) {
        const fa = a + forkSign * (0.42 + rng() * 0.25);
        const fR = rad * (0.78 + rng() * 0.18);
        const fY = midY + h * (0.14 + rng() * 0.12);
        fine.addSegment(midPt[0], midPt[1], midPt[2], Math.cos(fa) * fR, fY, Math.sin(fa) * fR);
      }
    }

    // Calligraphic multi-plane botanical crown sketches + horizontal foliage bands
    const cy = h * 0.71;
    const ry = h * 0.31;
    for (let plane = 0; plane < 6; plane++) {
      const phi = (plane / 6) * Math.PI + rng() * 0.2;
      const cPhi = Math.cos(phi);
      const sPhi = Math.sin(phi);
      const pts: Array<[number, number, number]> = [];
      const segs = 22;
      for (let i = 0; i <= segs; i++) {
        const t = (i / segs) * Math.PI * 2;
        const wobble = 0.86 + 0.18 * Math.sin(t * 5 + plane) + 0.12 * rng();
        const lx = Math.cos(t) * rad * wobble;
        const ly = Math.sin(t) * ry * (0.92 + 0.14 * Math.cos(t * 3));
        pts.push([lx * cPhi, cy + ly, lx * sPhi]);
      }
      (plane % 2 === 0 ? ink : fine).addPolyline(pts, false);
    }
    for (const band of [-0.45, 0, 0.45]) {
      const bR = rad * Math.cos(band * 1.15) * 0.94;
      faint.addHorizontalCircle(0, cy + band * ry, 0, bR, 20);
    }

    boundW = rad * 2.3;
    boundH = h * 1.06;
    boundD = rad * 2.3;
  }

  // ---------------------------------------------------------------------------
  // 6. PARISIAN BRIDGES (Pont d'Iéna, Bir-Hakeim, Passerelle Debilly, Alma)
  // ---------------------------------------------------------------------------
  else if (element.kind === 'bridge') {
    const bridgeId = element.params?.bridgeId ?? 'pont-iena';
    const isBirHakeim = bridgeId === 'pont-bir-hakeim';
    const isDebilly = bridgeId === 'passerelle-debilly';
    const span = isDebilly ? 68 : 76;
    const width = isDebilly ? 9 : isBirHakeim ? 20 : 24;
    const arches = isDebilly ? 1 : 3;
    const deckY = 7.2;

    addBox(0, deckY - 1.8, 0, span, 2.0, width, 0, materials.whiteOcclusionMat);
    ink.addOrientedBox(0, deckY - 1.8, 0, span, 2.0, width, 0, { overshoot: 0.35 });
    ink.addOrientedBox(0, deckY + 0.2, 0, span, 1.35, width, 0, {
      overshoot: 0.2,
      windowBays: 24,
    });

    // Bridge lamps along both parapets
    for (let l = 0; l < 5; l++) {
      const lx = -span * 0.4 + (l / 4) * span * 0.8;
      for (const lz of [-width * 0.47, width * 0.47]) {
        fine.addParisStreetLamp(lx, deckY + 1.55, lz, 4.4);
      }
    }

    // Arches + masonry piers with cutwater river prows
    const archSpan = span / arches;
    for (let a = 0; a < arches; a++) {
      const xStart = -span * 0.5 + a * archSpan;
      if (a > 0) {
        addBox(xStart, 0, 0, 4.2, deckY - 0.2, width + 3.6, 0, materials.whiteHatchMat);
        ink.addOrientedBox(xStart, 0, 0, 4.2, deckY - 0.2, width + 3.6, 0, { overshoot: 0.15, floors: 3 });
        for (const sz of [-1, 1]) {
          ink.addSegment(xStart, 0, sz * (width * 0.5 + 3.6), xStart, deckY - 1.0, sz * (width * 0.5 + 3.0));
          ink.addSegment(xStart, deckY - 1.0, sz * (width * 0.5 + 3.0), xStart - 2.1, deckY - 1.0, sz * (width * 0.5 + 1.8));
          ink.addSegment(xStart, deckY - 1.0, sz * (width * 0.5 + 3.0), xStart + 2.1, deckY - 1.0, sz * (width * 0.5 + 1.8));
        }
      }

      for (const zSide of [-width * 0.5, width * 0.5]) {
        const innerPts: Array<[number, number, number]> = [];
        const outerPts: Array<[number, number, number]> = [];
        const steps = 18;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const lx = xStart + 1.5 + u * (archSpan - 3.0);
          const rise = Math.sin(u * Math.PI);
          const ly = isDebilly ? 1.5 + rise * 14.5 : 1.2 + rise * (deckY - 2.4);
          innerPts.push([lx, ly, zSide]);
          outerPts.push([lx, ly + (isDebilly ? 1.8 : 0.75), zSide]);
          if (s > 0 && s < steps) {
            fine.addSegment(lx, ly, zSide, lx, ly + (isDebilly ? 1.8 : 0.75), zSide);
            if (isDebilly) {
              fine.addSegment(lx, ly, zSide, lx, deckY, zSide);
            } else if (s % 2 === 0) {
              faint.addSegment(lx, ly + 0.75, zSide, lx, deckY - 1.8, zSide);
            }
          }
        }
        ink.addPolyline(innerPts, false);
        fine.addPolyline(outerPts, false);
      }
    }

    // Bir-Hakeim upper Métro Line 6 colonnade viaduct
    if (isBirHakeim) {
      const viaY = deckY + 7.2;
      const viaW = 8.2;
      addBox(0, viaY, 0, span + 6, 2.3, viaW, 0, materials.whiteOcclusionMat);
      ink.addOrientedBox(0, viaY, 0, span + 6, 2.3, viaW, 0, { overshoot: 0.3, windowBays: 18 });
      for (let i = 0; i <= 10; i++) {
        const lx = -span * 0.48 + (i / 10) * span * 0.96;
        for (const lz of [-viaW * 0.44, viaW * 0.44]) {
          ink.addSegment(lx, deckY + 0.2, lz, lx, viaY, lz);
          fine.addSegment(lx, viaY - 1.8, lz, lx + 1.6, viaY, lz);
          fine.addSegment(lx, viaY - 1.8, lz, lx - 1.6, viaY, lz);
        }
      }
    }

    // Waterline ripples below arches
    for (const wz of [-width * 0.7, 0, width * 0.7]) {
      faint.addSegment(-span * 0.52, 0.08, wz, span * 0.52, 0.08, wz);
    }

    boundW = span + 8;
    boundH = isBirHakeim ? 19 : isDebilly ? 19 : 14;
    boundD = width + 10;
  }

  // ---------------------------------------------------------------------------
  // 7. PARIS MÉTRO LINE 6 TRAIN — Multi-car trainset on elevated viaduct span
  // ---------------------------------------------------------------------------
  else if (element.kind === 'metro-train') {
    const carCount = 3;
    const carLen = 14.0;
    const totalLen = carCount * (carLen + 1.1);
    const viaY = 6.2;

    // Elevated iron viaduct span supporting the train
    addBox(0, viaY - 1.8, 0, totalLen + 8, 1.8, 7.6, 0, materials.whiteOcclusionMat);
    ink.addOrientedBox(0, viaY - 1.8, 0, totalLen + 8, 1.8, 7.6, 0, { overshoot: 0.25, windowBays: 16 });
    for (let p = -2; p <= 2; p++) {
      const px = p * (totalLen * 0.24);
      for (const pz of [-2.8, 2.8]) {
        ink.addSegment(px, 0, pz, px, viaY - 1.8, pz);
        fine.addSegment(px, viaY - 3.2, pz, px + 1.5, viaY - 1.8, pz);
        fine.addSegment(px, viaY - 3.2, pz, px - 1.5, viaY - 1.8, pz);
      }
    }
    // Steel track rails
    for (const rz of [-0.75, 0.75]) {
      fine.addSegment(-(totalLen + 8) * 0.5, viaY + 0.08, rz, (totalLen + 8) * 0.5, viaY + 0.08, rz);
    }

    // 3 detailed MP 73 Métro cars with bogies, doors, panoramic windows & roof vents
    for (let c = 0; c < carCount; c++) {
      const ox = (c - (carCount - 1) * 0.5) * (carLen + 1.1);
      addBox(ox, viaY + 0.7, 0, carLen, 3.1, 2.8, 0, materials.whiteHatchMat);
      ink.addOrientedBox(ox, viaY + 0.7, 0, carLen, 3.1, 2.8, 0, {
        overshoot: 0.14,
        windowBays: 8,
      });
      // Rooftop ventilation strip & bogie wheel trucks
      fine.addOrientedBox(ox, viaY + 3.8, 0, carLen * 0.76, 0.35, 1.4, 0, { overshoot: 0.05 });
      for (const bx of [-carLen * 0.32, carLen * 0.32]) {
        ink.addOrientedBox(ox + bx, viaY + 0.1, 0, 2.4, 0.65, 2.2, 0, { overshoot: 0.04 });
      }
    }

    boundW = totalLen + 10;
    boundH = viaY + 5.2;
    boundD = 10;
  }

  // ---------------------------------------------------------------------------
  // 8. PARISIAN MONUMENTS (Chaillot, École Militaire, Quai Branly, Cathedral, etc.)
  // ---------------------------------------------------------------------------
  else if (element.kind === 'monument') {
    const monId = element.params?.monumentId ?? 'ecole-militaire';

    if (monId === 'holy-trinity') {
      addBox(0, 0, 0, 28, 20.5, 28, 0, materials.whiteHatchMat);
      ink.addHaussmannBuilding(0, 0, 0, 28, 20.5, 28, 0, {
        overshoot: 0.35,
        floors: 3,
        mansardHeight: 0,
        detailTier: 'hero',
        balconyFloors: [],
        fineTarget: fine,
        faintTarget: faint,
      });
      const addDome = (dx: number, by: number, dz: number, maxR: number, dh: number) => {
        const rings = 9;
        const ribs = 14;
        const profile = (u: number) => Math.sin(u * Math.PI) * (1 - 0.24 * u) * maxR;
        for (let r = 0; r < rings; r++) {
          const u0 = r / rings;
          const u1 = (r + 1) / rings;
          const r0 = profile(u0);
          const r1 = profile(u1);
          const y0 = by + u0 * dh;
          const y1 = by + u1 * dh;
          if (r0 > 0.2) ink.addHorizontalCircle(dx, y0, dz, r0, ribs);
          for (let k = 0; k < ribs; k++) {
            const a = (k / ribs) * Math.PI * 2;
            ink.addSegment(dx + Math.cos(a) * r0, y0, dz + Math.sin(a) * r0, dx + Math.cos(a) * r1, y1, dz + Math.sin(a) * r1);
          }
        }
        ink.addSegment(dx, by + dh, dz, dx, by + dh + 4.4, dz);
        ink.addSegment(dx - 1.15, by + dh + 2.9, dz, dx + 1.15, by + dh + 2.9, dz);
        ink.addSegment(dx - 0.7, by + dh + 3.7, dz, dx + 0.7, by + dh + 3.7, dz);
      };
      addDome(0, 20.5, 0, 5.6, 15.2);
      for (const [ox, oz] of [[8.6, 8.6], [-8.6, 8.6], [8.6, -8.6], [-8.6, -8.6]]) {
        addDome(ox, 20.5, oz, 3.1, 10.0);
      }
      boundW = 34;
      boundH = 40;
      boundD = 34;
    } else if (monId === 'front-de-seine') {
      // Tour Totem stacked cantilevered blocks
      addBox(0, 0, 0, 18, 96, 18, 0, materials.whiteHatchMat);
      ink.addOrientedBox(0, 0, 0, 18, 96, 18, 0, { overshoot: 0.4, floors: 24 });
      for (let tier = 0; tier < 5; tier++) {
        const ty = 12 + tier * 16.5;
        const bw = tier % 2 === 0 ? 34 : 24;
        const bd = tier % 2 === 0 ? 22 : 32;
        addBox(0, ty, 0, bw, 13, bd, 0, materials.whiteHatchMat);
        ink.addOrientedBox(0, ty, 0, bw, 13, bd, 0, { overshoot: 0.3, floors: 3, windowBays: 8 });
      }
      boundW = 40;
      boundH = 100;
      boundD = 40;
    } else if (monId === 'statue-liberty') {
      addBox(0, 0, 0, 5.6, 6.6, 5.6, 0, materials.whiteHatchMat);
      ink.addOrientedBox(0, 0, 0, 5.6, 6.6, 5.6, 0, { overshoot: 0.2, floors: 2 });
      ink.addOrientedBox(0, 6.6, 0, 4.2, 0.8, 4.2, 0, { overshoot: 0.1 });
      // Robed statue figure + tablet + raised torch + 7-ray crown
      ink.addSegment(0, 7.4, 0, 0, 16.8, 0);
      ink.addSegment(-1.6, 7.4, 0, -0.75, 14.8, 0);
      ink.addSegment(1.6, 7.4, 0, 0.75, 14.8, 0);
      ink.addSegment(0, 7.4, -1.2, 0, 14.8, -0.6);
      ink.addSegment(0, 7.4, 1.2, 0, 14.8, 0.6);
      ink.addSegment(0.6, 14.6, 0, 2.2, 19.2, 0);
      ink.addHorizontalCircle(2.2, 19.4, 0, 0.55, 8);
      ink.addHorizontalCircle(0, 16.1, 0, 1.35, 7);
      for (let r = 0; r < 7; r++) {
        const a = (r / 7) * Math.PI * 2;
        fine.addSegment(Math.cos(a) * 0.9, 16.2, Math.sin(a) * 0.9, Math.cos(a) * 1.9, 16.8, Math.sin(a) * 1.9);
      }
      boundW = 10;
      boundH = 21;
      boundD = 10;
    } else if (monId === 'musee-quai-branly') {
      addBox(0, 5.5, 0, 72, 13.5, 22, 0, materials.whiteHatchMat);
      ink.addOrientedBox(0, 5.5, 0, 72, 13.5, 22, 0, { overshoot: 0.35, floors: 3, windowBays: 16 });
      for (let i = -3; i <= 3; i++) {
        const lx = i * 10.5;
        ink.addSegment(lx, 0, 0, lx, 5.5, 0);
        ink.addSegment(lx - 2.2, 0, 6, lx + 1.4, 5.5, 6);
        ink.addSegment(lx + 2.2, 0, -6, lx - 1.4, 5.5, -6);
        if (i > -3 && i < 3) {
          const bh = 5.4 + (Math.abs(i) % 2) * 2.2;
          const bd = 6.5 + (Math.abs(i) % 2) * 2.5;
          addBox(lx, 7.2 + (i % 2) * 1.4, 12.5, 8.8, bh, bd, 0, materials.whiteOcclusionMat);
          ink.addOrientedBox(lx, 7.2 + (i % 2) * 1.4, 12.5, 8.8, bh, bd, 0, { overshoot: 0.2, windowBays: 3 });
        }
      }
      boundW = 78;
      boundH = 22;
      boundD = 36;
    } else if (monId === 'palais-chaillot' || monId === 'palais-tokyo') {
      const span = 82;
      for (const side of [-1, 1]) {
        addBox(side * 28, 0, 0, 26, 22, 32, side * 0.14, materials.whiteHatchMat);
        ink.addHaussmannBuilding(side * 28, 0, 0, 26, 22, 32, side * 0.14, {
          overshoot: 0.35,
          floors: 4,
          mansardHeight: 0,
          detailTier: 'hero',
          balconyFloors: [],
          fineTarget: fine,
          faintTarget: faint,
        });
      }
      // Central terrace colonnade & grand staircase
      for (let c = -6; c <= 6; c++) {
        ink.addSegment(c * 4.2, 0, -10, c * 4.2, 18, -10);
      }
      for (let step = 0; step < 6; step++) {
        fine.addSegment(-14, step * 0.5, 10 + step * 2.2, 14, step * 0.5, 10 + step * 2.2);
      }
      boundW = span + 12;
      boundH = 26;
      boundD = 48;
    } else {
      // École Militaire — classical main pavilion, 8 Corinthian columns, triangular pediment & quadrangular dome
      addBox(0, 0, 0, 68, 22, 36, 0, materials.whiteHatchMat);
      ink.addHaussmannBuilding(0, 0, 0, 68, 22, 36, 0, {
        overshoot: 0.38,
        floors: 4,
        mansardHeight: 5.5,
        detailTier: 'hero',
        balconyFloors: [2],
        crossHatchShadowFace: true,
        fineTarget: fine,
        faintTarget: faint,
      });
      addBox(0, 22, 0, 24, 11, 22, 0, materials.whiteHatchMat);
      ink.addOrientedBox(0, 22, 0, 24, 11, 22, 0, { overshoot: 0.3, mansardHeight: 8.5 });
      ink.addHorizontalCircle(0, 41.5, 0, 3.4, 12);
      ink.addSegment(0, 41.5, 0, 0, 47.5, 0);
      ink.addPolyline([[-15, 19.5, 19.2], [0, 25.5, 19.2], [15, 19.5, 19.2], [-15, 19.5, 19.2]], false);
      for (let c = -3.5; c <= 3.5; c += 1) {
        ink.addSegment(c * 4.0, 0, 19.0, c * 4.0, 19.5, 19.0);
        fine.addHorizontalCircle(c * 4.0, 19.2, 19.0, 0.75, 8);
      }
      boundW = 74;
      boundH = 49;
      boundD = 44;
    }
  }

  // ---------------------------------------------------------------------------
  // 9. PARISIAN CAST-IRON STREETLAMP (Réverbère)
  // ---------------------------------------------------------------------------
  else {
    ink.addParisStreetLamp(0, 0, 0, 5.6);
    ink.addHorizontalCircle(0, 0.08, 0, 1.2, 16);
    boundW = 3.2;
    boundH = 7.2;
    boundD = 3.2;
  }

  // ---------------------------------------------------------------------------
  // ARCHITECTURAL CIRCULAR DRAFTING PLINTH + COMPASS TICKS AT Y = 0
  // ---------------------------------------------------------------------------
  const frame = computeSpecimenCameraFrame(boundW, boundH, boundD, 38);
  const pr = frame.plinthRadius;
  fine.addHorizontalCircle(0, 0.04, 0, pr, 64);
  faint.addHorizontalCircle(0, 0.04, 0, pr * 0.94, 48);
  faint.addHorizontalCircle(0, 0.04, 0, pr * 0.5, 32);

  // Drafting crosshairs & 36 degree ticks around turntable ring
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const isMajor = i % 9 === 0;
    const r0 = isMajor ? pr * 0.91 : pr * 0.955;
    const r1 = isMajor ? pr * 1.04 : pr * 1.0;
    (isMajor ? fine : faint).addSegment(
      Math.cos(a) * r0,
      0.04,
      Math.sin(a) * r0,
      Math.cos(a) * r1,
      0.04,
      Math.sin(a) * r1
    );
  }

  // Assemble line layers
  const pushLines = (collector: SketchLineCollector, mat: THREE.LineBasicMaterial, name: string) => {
    if (collector.segmentCount === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(collector.toFloat32Array(), 3));
    const lines = new THREE.LineSegments(geo, mat);
    lines.name = name;
    root.add(lines);
    lineObjects.push(lines);
  };

  pushLines(ink, materials.inkLinePrimary, 'SpecimenPrimaryInk');
  pushLines(fine, materials.inkLineFine, 'SpecimenFineInk');
  pushLines(faint, materials.inkLineFaint, 'SpecimenFaintInk');

  return {
    group: root,
    solidMeshes,
    lineObjects,
    frame,
  };
}
