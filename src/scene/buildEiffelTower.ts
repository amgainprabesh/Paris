import * as THREE from 'three';
import {
  EIFFEL_SPECS,
  MONUMENT_AXIS_RAD,
  eiffelInnerHalfWidthAt,
  eiffelOuterHalfWidthAt,
} from './parisGeo';
import { SketchLineCollector } from './sketchMath';

export interface EiffelTowerBuildResult {
  group: THREE.Group;
  solidMeshes: THREE.Mesh[];
  stickMeshes: THREE.Mesh[];
  lineObjects: THREE.LineSegments[];
}

/**
 * Helper to create a slim 3D structural black beam between two 3D points.
 * Uses a shared unit cylinder geometry scaled & oriented via Matrix4 into an InstancedMesh,
 * giving the Eiffel Tower true 3D "stick black" structural weight from every camera angle!
 */
interface BeamSpec {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  radius: number;
}

function buildInstancedBeams(
  beams: BeamSpec[],
  material: THREE.Material,
  radialSegments = 5
): THREE.InstancedMesh {
  const unitGeo = new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1, false);
  const mesh = new THREE.InstancedMesh(unitGeo, material, beams.length);
  const up = new THREE.Vector3(0, 1, 0);
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const mat = new THREE.Matrix4();

  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    p1.set(b.x1, b.y1, b.z1);
    p2.set(b.x2, b.y2, b.z2);
    dir.subVectors(p2, p1);
    const len = dir.length();
    if (len < 1e-4) {
      mat.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, mat);
      continue;
    }
    mid.addVectors(p1, p2).multiplyScalar(0.5);
    dir.divideScalar(len);
    quat.setFromUnitVectors(up, dir);
    scale.set(b.radius, len, b.radius);
    mat.compose(mid, quat, scale);
    mesh.setMatrixAt(i, mat);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  return mesh;
}

/**
 * Builds the hero 330m Eiffel Tower in ultra-detailed 3D black-ink stick & lattice style.
 * Oriented along the true Champ de Mars – Trocadéro Parisian axis.
 */
export function buildEiffelTower(materials: {
  inkLinePrimary: THREE.LineBasicMaterial;
  inkLineFine: THREE.LineBasicMaterial;
  stickBlackMat: THREE.MeshStandardMaterial;
  whiteOcclusionMat: THREE.MeshStandardMaterial;
  whiteHatchMat: THREE.MeshStandardMaterial;
}): EiffelTowerBuildResult {
  const group = new THREE.Group();
  group.name = 'EiffelTower';
  // Align tower legs with real Paris Champ de Mars – Pont d'Iéna axis
  group.rotation.y = -MONUMENT_AXIS_RAD + Math.PI / 4;

  const primaryInk = new SketchLineCollector(1889);
  const fineInk = new SketchLineCollector(1890);
  const beams: BeamSpec[] = [];
  const solidMeshes: THREE.Mesh[] = [];
  const stickMeshes: THREE.Mesh[] = [];
  const lineObjects: THREE.LineSegments[] = [];

  const signs: Array<[number, number]> = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];

  const addBeamAndInk = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    radius: number,
    overshoot = 0.25
  ) => {
    beams.push({ x1, y1, z1, x2, y2, z2, radius });
    primaryInk.addInkStroke(x1, y1, z1, x2, y2, z2, { overshoot });
  };

  // ---------------------------------------------------------------------------
  // 1. FOUR MASONRY FOUNDATION PIERS (y = 0 .. 4.5m)
  // ---------------------------------------------------------------------------
  const pierGeo = new THREE.BoxGeometry(26.5, 4.5, 26.5);
  for (const [sx, sz] of signs) {
    const cx = sx * 50.0;
    const cz = sz * 50.0;
    const pier = new THREE.Mesh(pierGeo, materials.whiteHatchMat);
    pier.position.set(cx, 2.25, cz);
    pier.receiveShadow = true;
    group.add(pier);
    solidMeshes.push(pier);

    primaryInk.addOrientedBox(cx, 0.05, cz, 26.5, 4.45, 26.5, 0, {
      overshoot: 0.45,
      floors: 2,
    });
    // Stepped upper masonry cap
    primaryInk.addOrientedBox(cx, 4.5, cz, 24.0, 2.2, 24.0, 0, {
      overshoot: 0.3,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. FOUR CURVED PARABOLIC LEGS (y = 4.5m .. 138m)
  //    Each leg is a 4-corner hollow iron truss with full X-bracing on all 4 faces.
  // ---------------------------------------------------------------------------
  const lowerHeights = [
    4.5, 11, 18, 25, 32, 39, 46, 52.5, // Base to 1st floor skirt
    58.5, 66, 74, 82, 90, 98, 106, 113.0, // 1st floor to 2nd floor skirt
    120.5, 129, 138, 148, // Leg convergence into central pylon
  ];

  const getLegCorners = (y: number, sx: number, sz: number): Array<[number, number, number]> => {
    const outer = eiffelOuterHalfWidthAt(y);
    const inner = eiffelInnerHalfWidthAt(y);
    // 4 corners of the square cross-section of this leg at height y
    return [
      [sx * outer, y, sz * outer], // 0: outer corner
      [sx * inner, y, sz * outer], // 1: adjacent along X
      [sx * inner, y, sz * inner], // 2: inner corner
      [sx * outer, y, sz * inner], // 3: adjacent along Z
    ];
  };

  for (const [sx, sz] of signs) {
    for (let hIdx = 0; hIdx < lowerHeights.length - 1; hIdx++) {
      const y0 = lowerHeights[hIdx];
      const y1 = lowerHeights[hIdx + 1];
      // Skip the solid deck fascia zones slightly for cleaner deck integration
      const c0 = getLegCorners(y0, sx, sz);
      const c1 = getLegCorners(y1, sx, sz);

      const chordRadius = y0 < 60 ? 0.85 : y0 < 118 ? 0.72 : 0.62;
      const braceRadius = y0 < 60 ? 0.32 : 0.25;

      // 4 main longitudinal chords of the leg
      for (let k = 0; k < 4; k++) {
        addBeamAndInk(
          c0[k][0],
          c0[k][1],
          c0[k][2],
          c1[k][0],
          c1[k][1],
          c1[k][2],
          chordRadius,
          0.18
        );
      }

      // Horizontal ring ties + diagonal X-bracing on all 4 faces of each leg bay
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        // Horizontal rung at bottom of bay
        beams.push({
          x1: c0[k][0],
          y1: c0[k][1],
          z1: c0[k][2],
          x2: c0[next][0],
          y2: c0[next][1],
          z2: c0[next][2],
          radius: braceRadius,
        });
        primaryInk.addSegment(
          c0[k][0],
          c0[k][1],
          c0[k][2],
          c0[next][0],
          c0[next][1],
          c0[next][2]
        );

        // X-brace diagonals across the face (crisp black fine lattice + structural beams on outer faces)
        fineInk.addSegment(
          c0[k][0],
          c0[k][1],
          c0[k][2],
          c1[next][0],
          c1[next][1],
          c1[next][2]
        );
        fineInk.addSegment(
          c0[next][0],
          c0[next][1],
          c0[next][2],
          c1[k][0],
          c1[k][1],
          c1[k][2]
        );

        // Secondary mid-bay horizontal & sub-diamond iron filigree for iconic Gustave Eiffel texture
        const mx0 = (c0[k][0] + c0[next][0]) * 0.5;
        const mz0 = (c0[k][2] + c0[next][2]) * 0.5;
        const mx1 = (c1[k][0] + c1[next][0]) * 0.5;
        const mz1 = (c1[k][2] + c1[next][2]) * 0.5;
        const my = (y0 + y1) * 0.5;
        const sideA = [
          (c0[k][0] + c1[k][0]) * 0.5,
          my,
          (c0[k][2] + c1[k][2]) * 0.5,
        ];
        const sideB = [
          (c0[next][0] + c1[next][0]) * 0.5,
          my,
          (c0[next][2] + c1[next][2]) * 0.5,
        ];
        fineInk.addSegment(sideA[0], sideA[1], sideA[2], sideB[0], sideB[1], sideB[2]);
        fineInk.addSegment(mx0, y0, mz0, sideA[0], sideA[1], sideA[2]);
        fineInk.addSegment(mx0, y0, mz0, sideB[0], sideB[1], sideB[2]);
        fineInk.addSegment(mx1, y1, mz1, sideA[0], sideA[1], sideA[2]);
        fineInk.addSegment(mx1, y1, mz1, sideB[0], sideB[1], sideB[2]);

        // Add subtle 3D stick diagonals on outer faces so the lattice pops at distance
        if (k === 0 || k === 3) {
          beams.push({
            x1: c0[k][0],
            y1: c0[k][1],
            z1: c0[k][2],
            x2: c1[next][0],
            y2: c1[next][1],
            z2: c1[next][2],
            radius: braceRadius * 0.72,
          });
          beams.push({
            x1: c0[next][0],
            y1: c0[next][1],
            z1: c0[next][2],
            x2: c1[k][0],
            y2: c1[k][1],
            z2: c1[k][2],
            radius: braceRadius * 0.72,
          });
        }
      }

      // Inclined elevator track pair inside each lower leg
      if (y1 <= 116) {
        const cx0 = (c0[0][0] + c0[2][0]) * 0.5;
        const cz0 = (c0[0][2] + c0[2][2]) * 0.5;
        const cx1 = (c1[0][0] + c1[2][0]) * 0.5;
        const cz1 = (c1[0][2] + c1[2][2]) * 0.5;
        fineInk.addSegment(cx0, y0, cz0, cx1, y1, cz1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. FOUR ICONIC SEMICIRCULAR DECORATIVE ARCHES (below 1st Floor, span ~74m, crown y=39m)
  // ---------------------------------------------------------------------------
  const archSegments = 28;
  const archSpanHalf = 37.5;
  const archSpringY = 12.0;
  const archCrownY = 40.5;
  const archDepthOuter = 38.2;
  const archDepthInner = 34.4;

  // 4 sides: +Z, -Z, +X, -X
  const archSides: Array<{ axis: 'x' | 'z'; sign: number }> = [
    { axis: 'z', sign: 1 },
    { axis: 'z', sign: -1 },
    { axis: 'x', sign: 1 },
    { axis: 'x', sign: -1 },
  ];

  for (const side of archSides) {
    const outerPts: Array<[number, number, number]> = [];
    const innerPts: Array<[number, number, number]> = [];
    const upperPts: Array<[number, number, number]> = [];

    for (let i = 0; i <= archSegments; i++) {
      const t = i / archSegments;
      const theta = Math.PI * t; // 0 .. PI
      const along = -Math.cos(theta) * archSpanHalf;
      const rise = Math.sin(theta);
      const yLower = archSpringY + rise * (archCrownY - archSpringY);
      const yUpper = yLower + 4.4 + (1 - rise) * 2.2;
      // Follow the slight inward lean of the tower legs with height
      const lean = eiffelOuterHalfWidthAt(yLower);
      const leanIn = lean - 3.6;

      if (side.axis === 'z') {
        outerPts.push([along, yLower, side.sign * lean]);
        innerPts.push([along, yLower, side.sign * leanIn]);
        upperPts.push([along, Math.min(52.0, yUpper), side.sign * (lean - 0.6)]);
      } else {
        outerPts.push([side.sign * lean, yLower, along]);
        innerPts.push([side.sign * leanIn, yLower, along]);
        upperPts.push([side.sign * (lean - 0.6), Math.min(52.0, yUpper), along]);
      }
    }

    for (let i = 0; i < archSegments; i++) {
      // Main lower arch rim in 3D black stick beams
      addBeamAndInk(
        outerPts[i][0],
        outerPts[i][1],
        outerPts[i][2],
        outerPts[i + 1][0],
        outerPts[i + 1][1],
        outerPts[i + 1][2],
        0.58,
        0.1
      );
      addBeamAndInk(
        innerPts[i][0],
        innerPts[i][1],
        innerPts[i][2],
        innerPts[i + 1][0],
        innerPts[i + 1][1],
        innerPts[i + 1][2],
        0.48,
        0.1
      );
      // Upper arch ring + radial filigree struts
      primaryInk.addSegment(
        upperPts[i][0],
        upperPts[i][1],
        upperPts[i][2],
        upperPts[i + 1][0],
        upperPts[i + 1][1],
        upperPts[i + 1][2]
      );
      fineInk.addSegment(
        outerPts[i][0],
        outerPts[i][1],
        outerPts[i][2],
        innerPts[i][0],
        innerPts[i][1],
        innerPts[i][2]
      );
      fineInk.addSegment(
        outerPts[i][0],
        outerPts[i][1],
        outerPts[i][2],
        upperPts[i][0],
        upperPts[i][1],
        upperPts[i][2]
      );
      // Spandrel vertical hangers up to the 1st-floor horizontal girder (y = 52.5m)
      if (i > 1 && i < archSegments - 1) {
        const topY = 52.5;
        const p = outerPts[i];
        const topHalf = eiffelOuterHalfWidthAt(topY);
        const tx = side.axis === 'z' ? p[0] * (topHalf / archDepthOuter) : side.sign * topHalf;
        const tz = side.axis === 'z' ? side.sign * topHalf : p[2] * (topHalf / archDepthOuter);
        fineInk.addSegment(upperPts[i][0], upperPts[i][1], upperPts[i][2], tx, topY, tz);
        // Diagonal arch lace between ribs
        fineInk.addSegment(
          outerPts[i][0],
          outerPts[i][1],
          outerPts[i][2],
          upperPts[i + 1][0],
          upperPts[i + 1][1],
          upperPts[i + 1][2]
        );
      }
    }
    void archDepthInner;
  }

  // ---------------------------------------------------------------------------
  // 4. FIRST FLOOR OBSERVATION DECK (y = 52.5m .. 62.5m, width 70.7m, open center atrium)
  // ---------------------------------------------------------------------------
  const addHollowDeck = (
    yBottom: number,
    yTop: number,
    outerHalf: number,
    innerHalf: number,
    railHeight: number,
    bayTicks: number
  ) => {
    const h = yTop - yBottom;
    const thickness = outerHalf - innerHalf;
    const midOff = innerHalf + thickness * 0.5;
    // 4 perimeter white occlusion beams leaving open central atrium!
    const sideSpecs: Array<[number, number, number, number]> = [
      [0, midOff, outerHalf * 2, thickness],
      [0, -midOff, outerHalf * 2, thickness],
      [midOff, 0, thickness, innerHalf * 2],
      [-midOff, 0, thickness, innerHalf * 2],
    ];
    for (const [ox, oz, w, d] of sideSpecs) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, materials.whiteOcclusionMat);
      mesh.position.set(ox, yBottom + h * 0.5, oz);
      group.add(mesh);
      solidMeshes.push(mesh);
    }

    // Heavy structural black stick girders along all 4 outer & inner rims
    const levels = [yBottom, yTop, yTop + railHeight];
    for (let li = 0; li < levels.length; li++) {
      const ly = levels[li];
      const rad = li === 2 ? 0.25 : 0.68;
      const hw = li === 2 ? outerHalf + 0.6 : outerHalf;
      const pts: Array<[number, number, number]> = [
        [-hw, ly, -hw],
        [hw, ly, -hw],
        [hw, ly, hw],
        [-hw, ly, hw],
      ];
      for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        addBeamAndInk(
          pts[i][0],
          pts[i][1],
          pts[i][2],
          pts[next][0],
          pts[next][1],
          pts[next][2],
          rad,
          0.4
        );
      }
      if (li < 2 && innerHalf > 1) {
        const ipts: Array<[number, number, number]> = [
          [-innerHalf, ly, -innerHalf],
          [innerHalf, ly, -innerHalf],
          [innerHalf, ly, innerHalf],
          [-innerHalf, ly, innerHalf],
        ];
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          primaryInk.addSegment(
            ipts[i][0],
            ipts[i][1],
            ipts[i][2],
            ipts[next][0],
            ipts[next][1],
            ipts[next][2]
          );
        }
      }
    }

    // Frieze truss rhythm & balcony railing stanchions around all 4 sides
    for (let side = 0; side < 4; side++) {
      for (let b = 0; b <= bayTicks; b++) {
        const u = -1 + (2 * b) / bayTicks;
        const x = side < 2 ? u * outerHalf : (side === 2 ? 1 : -1) * outerHalf;
        const z = side < 2 ? (side === 0 ? 1 : -1) * outerHalf : u * outerHalf;
        primaryInk.addSegment(x, yBottom, z, x, yTop + railHeight, z);
        if (b < bayTicks) {
          const uNext = -1 + (2 * (b + 1)) / bayTicks;
          const nx = side < 2 ? uNext * outerHalf : x;
          const nz = side < 2 ? z : uNext * outerHalf;
          fineInk.addSegment(x, yBottom, z, nx, yTop, nz);
          fineInk.addSegment(nx, yBottom, nz, x, yTop, z);
        }
      }
    }
  };

  // 1st Floor Deck (52.5..58.0m, gallery pavilion accents on top)
  addHollowDeck(52.5, 58.2, EIFFEL_SPECS.firstFloorHalfWidth, 18.0, 2.8, 22);
  // Subtle glass-turned-ink pavilions on 1st floor deck
  for (const [px, pz, pw, pd] of [
    [0, 26.5, 28, 8.5],
    [0, -26.5, 28, 8.5],
    [26.5, 0, 8.5, 28],
    [-26.5, 0, 8.5, 28],
  ] as Array<[number, number, number, number]>) {
    primaryInk.addOrientedBox(px, 58.2, pz, pw, 5.2, pd, 0, {
      overshoot: 0.2,
      windowBays: 6,
    });
  }

  // ---------------------------------------------------------------------------
  // 5. SECOND FLOOR OBSERVATION DECK (y = 112.5m .. 122.0m, width 40.9m)
  // ---------------------------------------------------------------------------
  addHollowDeck(112.5, 116.8, EIFFEL_SPECS.secondFloorHalfWidth, 8.0, 2.2, 16);
  // Second tier of the 2nd floor (upper Jules Verne gallery)
  addHollowDeck(116.8, 121.0, 17.6, 6.5, 2.0, 12);

  // ---------------------------------------------------------------------------
  // 6. UPPER PARABOLIC SHAFT (y = 121m .. 276.13m)
  //    4 sweeping curved corner ribs + 24 tiers of dense diagonal X-bracing + core lift
  // ---------------------------------------------------------------------------
  const shaftTiers = 24;
  const shaftStartY = 121.0;
  const shaftEndY = EIFFEL_SPECS.thirdFloorY;

  for (let i = 0; i < shaftTiers; i++) {
    const t0 = i / shaftTiers;
    const t1 = (i + 1) / shaftTiers;
    const y0 = shaftStartY + t0 * (shaftEndY - shaftStartY);
    const y1 = shaftStartY + t1 * (shaftEndY - shaftStartY);
    const w0 = eiffelOuterHalfWidthAt(y0);
    const w1 = eiffelOuterHalfWidthAt(y1);

    const p0: Array<[number, number, number]> = [
      [-w0, y0, -w0],
      [w0, y0, -w0],
      [w0, y0, w0],
      [-w0, y0, w0],
    ];
    const p1: Array<[number, number, number]> = [
      [-w1, y1, -w1],
      [w1, y1, -w1],
      [w1, y1, w1],
      [-w1, y1, w1],
    ];

    const cornerRad = THREE.MathUtils.lerp(0.68, 0.42, t0);
    const braceRad = THREE.MathUtils.lerp(0.24, 0.16, t0);

    for (let k = 0; k < 4; k++) {
      const next = (k + 1) % 4;
      // 4 sweeping main corner spines (thick enough to read crisply against white sky!)
      addBeamAndInk(
        p0[k][0],
        p0[k][1],
        p0[k][2],
        p1[k][0],
        p1[k][1],
        p1[k][2],
        cornerRad,
        0.12
      );
      // Horizontal tier ring
      beams.push({
        x1: p0[k][0],
        y1: p0[k][1],
        z1: p0[k][2],
        x2: p0[next][0],
        y2: p0[next][1],
        z2: p0[next][2],
        radius: braceRad,
      });
      primaryInk.addSegment(
        p0[k][0],
        p0[k][1],
        p0[k][2],
        p0[next][0],
        p0[next][1],
        p0[next][2]
      );

      // X-bracing diagonals on all 4 faces (both 3D stick + crisp ink)
      beams.push({
        x1: p0[k][0],
        y1: p0[k][1],
        z1: p0[k][2],
        x2: p1[next][0],
        y2: p1[next][1],
        z2: p1[next][2],
        radius: braceRad * 0.72,
      });
      beams.push({
        x1: p0[next][0],
        y1: p0[next][1],
        z1: p0[next][2],
        x2: p1[k][0],
        y2: p1[k][1],
        z2: p1[k][2],
        radius: braceRad * 0.72,
      });
      fineInk.addSegment(p0[k][0], p0[k][1], p0[k][2], p1[next][0], p1[next][1], p1[next][2]);
      fineInk.addSegment(p0[next][0], p0[next][1], p0[next][2], p1[k][0], p1[k][1], p1[k][2]);

      // Mid-tier vertical stiffener spine
      const mx0 = (p0[k][0] + p0[next][0]) * 0.5;
      const mz0 = (p0[k][2] + p0[next][2]) * 0.5;
      const mx1 = (p1[k][0] + p1[next][0]) * 0.5;
      const mz1 = (p1[k][2] + p1[next][2]) * 0.5;
      fineInk.addSegment(mx0, y0, mz0, mx1, y1, mz1);
    }

    // Internal central elevator shaft truss
    const coreW = 2.6;
    const cp0: Array<[number, number, number]> = [
      [-coreW, y0, -coreW],
      [coreW, y0, -coreW],
      [coreW, y0, coreW],
      [-coreW, y0, coreW],
    ];
    const cp1: Array<[number, number, number]> = [
      [-coreW, y1, -coreW],
      [coreW, y1, -coreW],
      [coreW, y1, coreW],
      [-coreW, y1, coreW],
    ];
    for (let k = 0; k < 4; k++) {
      fineInk.addSegment(cp0[k][0], cp0[k][1], cp0[k][2], cp1[k][0], cp1[k][1], cp1[k][2]);
    }
  }

  // Intermediate technical ring gallery around y = 196m
  addHollowDeck(194.5, 197.5, eiffelOuterHalfWidthAt(196) + 1.3, 4.0, 1.2, 8);

  // ---------------------------------------------------------------------------
  // 7. THIRD FLOOR SUMMIT, CUPOLA LANTERN & 330m BROADCAST ANTENNA
  // ---------------------------------------------------------------------------
  // Lower & upper summit observation platforms (y = 274..285m)
  addHollowDeck(273.5, 277.5, 10.6, 3.0, 1.8, 10);
  addHollowDeck(280.5, 283.2, 8.6, 2.5, 1.5, 8);

  // Summit enclosed glass-and-iron pavilion core
  const summitCoreGeo = new THREE.BoxGeometry(14.5, 6.2, 14.5);
  const summitCore = new THREE.Mesh(summitCoreGeo, materials.whiteOcclusionMat);
  summitCore.position.set(0, 278.5, 0);
  group.add(summitCore);
  solidMeshes.push(summitCore);
  primaryInk.addOrientedBox(0, 275.4, 0, 14.5, 6.2, 14.5, 0, {
    overshoot: 0.25,
    floors: 2,
    windowBays: 6,
  });

  // Tapered cupola dome & lighthouse lantern (y = 283.2m .. 300.65m)
  const cupolaLevels = [
    { y: 283.2, r: 7.4 },
    { y: 287.5, r: 6.2 },
    { y: 292.0, r: 4.5 },
    { y: 296.5, r: 3.1 },
    { y: 300.65, r: 1.8 },
  ];
  const domeRibs = 12;
  for (let l = 0; l < cupolaLevels.length - 1; l++) {
    const a = cupolaLevels[l];
    const b = cupolaLevels[l + 1];
    primaryInk.addHorizontalCircle(0, a.y, 0, a.r, domeRibs);
    for (let r = 0; r < domeRibs; r++) {
      const ang = (r / domeRibs) * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      addBeamAndInk(ca * a.r, a.y, sa * a.r, ca * b.r, b.y, sa * b.r, 0.22, 0.05);
    }
  }
  primaryInk.addHorizontalCircle(0, 300.65, 0, 1.8, domeRibs);

  // Broadcast Antenna Spire (y = 300.65m .. 330.0m)
  addBeamAndInk(0, 300.0, 0, 0, 316.0, 0, 0.65, 0);
  addBeamAndInk(0, 316.0, 0, 0, 324.5, 0, 0.42, 0);
  addBeamAndInk(0, 324.5, 0, 0, EIFFEL_SPECS.antennaTipY, 0, 0.22, 0);
  // Antenna transmitter collars & crossbars
  for (const [ay, ar] of [
    [305, 2.4],
    [311, 2.0],
    [317, 1.6],
    [323, 1.1],
  ]) {
    primaryInk.addHorizontalCircle(0, ay, 0, ar, 8);
    primaryInk.addSegment(-ar * 1.4, ay, 0, ar * 1.4, ay, 0);
    primaryInk.addSegment(0, ay, -ar * 1.4, 0, ay, ar * 1.4);
  }

  // ---------------------------------------------------------------------------
  // 8. ASSEMBLE OPTIMIZED DRAW CALLS
  // ---------------------------------------------------------------------------
  const instancedBeams = buildInstancedBeams(beams, materials.stickBlackMat, 5);
  instancedBeams.name = 'EiffelStructuralSticks';
  group.add(instancedBeams);
  stickMeshes.push(instancedBeams);

  const primaryGeo = new THREE.BufferGeometry();
  primaryGeo.setAttribute('position', new THREE.BufferAttribute(primaryInk.toFloat32Array(), 3));
  const primaryLines = new THREE.LineSegments(primaryGeo, materials.inkLinePrimary);
  primaryLines.name = 'EiffelPrimaryInk';
  group.add(primaryLines);
  lineObjects.push(primaryLines);

  const fineGeo = new THREE.BufferGeometry();
  fineGeo.setAttribute('position', new THREE.BufferAttribute(fineInk.toFloat32Array(), 3));
  const fineLines = new THREE.LineSegments(fineGeo, materials.inkLineFine);
  fineLines.name = 'EiffelLatticeInk';
  group.add(fineLines);
  lineObjects.push(fineLines);

  return { group, solidMeshes, stickMeshes, lineObjects };
}
