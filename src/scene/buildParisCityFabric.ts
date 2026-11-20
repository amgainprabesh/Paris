import * as THREE from 'three';
import {
  MONUMENT_AXIS_RAD,
  RADIUS_3KM2,
  latLngToLocal,
  sampleSeineProximity,
  terrainHeightAt,
} from './parisGeo';
import { SketchLineCollector, createRng } from './sketchMath';

export interface CityWingPlacement {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rotY: number;
  mansardH: number;
  floors: number;
  cornerRotunda: boolean;
  arrondissement: string;
}

export interface CityTreePlacement {
  x: number;
  y: number;
  z: number;
  height: number;
  canopyRadius: number;
  locationLabel: string;
}

export interface ParisCityFabricResult {
  group: THREE.Group;
  solidMeshes: THREE.Mesh[];
  lineObjects: THREE.LineSegments[];
  boundaryRingGroup: THREE.Group;
  buildingCount: number;
  bodyInstanced: THREE.InstancedMesh;
  roofInstanced: THREE.InstancedMesh;
  wingSpecs: CityWingPlacement[];
  treePlacements: CityTreePlacement[];
}

interface StreetSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
  isGrandBoulevard: boolean;
}

function pointToSegmentDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + dx * u), pz - (az + dz * u));
}

/**
 * Generates high-density, wall-to-wall Haussmannian Parisian city blocks (îlots)
 * across the entire 3 km² circle (radius 977.2 m around the Eiffel Tower):
 *  - 24 real Parisian avenues & secondary streets with sidewalk curbs, crosswalks,
 *    avenue trees, and classic cast-iron réverbère lampposts
 *  - Multi-wing courtyard Haussmannian perimeter blocks (L-shaped, U-shaped & closed
 *    4-wing blocks sharing party walls around recessed inner courtyards)
 *  - Every building rendered with arched ground-floor shopfronts, framed French windows,
 *    projecting 2nd- and 5th-floor wrought-iron balconies, zinc mansard roofs with
 *    standing seams, protruding lucarne dormer windows, chimney clusters & corner rotundas
 *  - Batched into just 2 InstancedMeshes (occlusion) + 3 LineSegments (ink) for 60fps
 */
export function buildParisCityFabric(materials: {
  inkLinePrimary: THREE.LineBasicMaterial;
  inkLineFine: THREE.LineBasicMaterial;
  inkLineFaint: THREE.LineBasicMaterial;
  whiteHatchMat: THREE.MeshStandardMaterial;
}): ParisCityFabricResult {
  const group = new THREE.Group();
  group.name = 'ParisCityFabric';

  const ink = new SketchLineCollector(1870);
  const fine = new SketchLineCollector(1871);
  const faint = new SketchLineCollector(1872);
  const ringInk = new SketchLineCollector(1873);
  const rng = createRng(75007);

  const solidMeshes: THREE.Mesh[] = [];
  const lineObjects: THREE.LineSegments[] = [];
  const treePlacements: CityTreePlacement[] = [];

  // ---------------------------------------------------------------------------
  // 1. REAL PARISIAN GRAND BOULEVARDS & SECONDARY STREET NETWORK WITHIN 3 KM²
  // ---------------------------------------------------------------------------
  const avenueSpecsLatLng: Array<[[number, number], [number, number], number, boolean]> = [
    // Left Bank — 7th & 15th Arrondissements (Grand Boulevards)
    [[48.8628, 2.3035], [48.8550, 2.2865], 15, true], // Quai Branly / Quai Jacques Chirac
    [[48.8602, 2.2974], [48.8515, 2.3075], 13, true], // Avenue de la Bourdonnais
    [[48.8565, 2.2903], [48.8475, 2.3012], 14, true], // Avenue de Suffren
    [[48.8618, 2.3016], [48.8532, 2.3070], 13, true], // Avenue Bosquet
    [[48.8613, 2.2994], [48.8548, 2.3035], 11, true], // Avenue Rapp
    [[48.8560, 2.2878], [48.8492, 2.2980], 14, true], // Boulevard de Grenelle
    [[48.8520, 2.3065], [48.8493, 2.2940], 13, true], // Avenue de la Motte-Picquet
    // Secondary Left Bank Streets (Gros-Caillou & Grenelle)
    [[48.8600, 2.3065], [48.8576, 2.2966], 9, false], // Rue Saint-Dominique
    [[48.8564, 2.2998], [48.8594, 2.3062], 9, false], // Rue de Grenelle
    [[48.8612, 2.3055], [48.8595, 2.2970], 9, false], // Rue de l'Université
    [[48.8590, 2.3025], [48.8545, 2.3052], 8, false], // Rue Cler
    [[48.8556, 2.2916], [48.8518, 2.2882], 9, false], // Rue de la Fédération
    [[48.8568, 2.2905], [48.8540, 2.2872], 8, false], // Rue Jean Rey
    [[48.8534, 2.2932], [48.8494, 2.2888], 9, false], // Rue Dupleix / Rue Desaix
    [[48.8522, 2.2960], [48.8482, 2.2922], 9, false], // Rue du Commerce approach
    // Right Bank — 16th Arrondissement (Radiating from Place du Trocadéro!)
    [[48.8629, 2.2872], [48.8665, 2.2965], 14, true], // Avenue du Président Wilson
    [[48.8629, 2.2872], [48.8685, 2.2915], 13, true], // Avenue Kléber
    [[48.8629, 2.2872], [48.8685, 2.2855], 12, true], // Avenue Raymond Poincaré
    [[48.8629, 2.2872], [48.8645, 2.2775], 13, true], // Avenue Georges Mandel
    [[48.8629, 2.2872], [48.8590, 2.2785], 13, true], // Avenue Paul Doumer
    [[48.8648, 2.3010], [48.8572, 2.2855], 13, true], // Avenue de New York / Voie Georges-Pompidou
    // Secondary Right Bank Streets (Passy & Chaillot)
    [[48.8608, 2.2872], [48.8565, 2.2815], 9, false], // Rue Benjamin Franklin / Rue de Passy
    [[48.8592, 2.2845], [48.8545, 2.2800], 8, false], // Rue Raynouard
    [[48.8615, 2.2835], [48.8588, 2.2862], 8, false], // Rue Vineuse / Rue Scheffer
  ];

  const streets: StreetSegment[] = avenueSpecsLatLng.map(([a, b, halfWidth, isGrandBoulevard]) => {
    const pa = latLngToLocal(a[0], a[1]);
    const pb = latLngToLocal(b[0], b[1]);
    return { ax: pa.x, az: pa.z, bx: pb.x, bz: pb.z, halfWidth, isGrandBoulevard };
  });

  // Draw Parisian boulevards: roadway edges, inset sidewalk curbs, centerline dashes, trees & streetlamps!
  for (const st of streets) {
    const dx = st.bx - st.ax;
    const dz = st.bz - st.az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const steps = 20;

    const curbOuterL: Array<[number, number, number]> = [];
    const curbOuterR: Array<[number, number, number]> = [];
    const curbInnerL: Array<[number, number, number]> = [];
    const curbInnerR: Array<[number, number, number]> = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = st.ax + dx * t;
      const cz = st.az + dz * t;
      if (Math.hypot(cx, cz) > RADIUS_3KM2) continue;

      const seineCheck = sampleSeineProximity(cx, cz);
      if (seineCheck.dist < seineCheck.halfWidth + 5) continue;

      const sidewalkInset = Math.max(2.2, st.halfWidth * 0.24);
      const roadHalf = st.halfWidth - sidewalkInset;

      const lx = cx + nx * st.halfWidth;
      const lz = cz + nz * st.halfWidth;
      const rx = cx - nx * st.halfWidth;
      const rz = cz - nz * st.halfWidth;
      const ilx = cx + nx * roadHalf;
      const ilz = cz + nz * roadHalf;
      const irx = cx - nx * roadHalf;
      const irz = cz - nz * roadHalf;

      const ly = Math.max(0, terrainHeightAt(lx, lz)) + 0.14;
      const ry = Math.max(0, terrainHeightAt(rx, rz)) + 0.14;
      curbOuterL.push([lx, ly, lz]);
      curbOuterR.push([rx, ry, rz]);
      curbInnerL.push([ilx, ly, ilz]);
      curbInnerR.push([irx, ry, irz]);

      // Dashed Parisian roadway centerline & crosswalk stripes on grand boulevards
      if (st.isGrandBoulevard && i > 0 && i < steps) {
        if (i % 2 === 0) {
          const tNext = Math.min(1, t + 0.025);
          const x2 = st.ax + dx * tNext;
          const z2 = st.az + dz * tNext;
          const cy = Math.max(0, terrainHeightAt(cx, cz)) + 0.14;
          faint.addSegment(cx, cy, cz, x2, cy, z2);
        }
        if (i % 5 === 0) {
          // Pedestrian crosswalk zebra stripes
          const ux = dx / len;
          const uz = dz / len;
          for (let s = -roadHalf + 1.5; s <= roadHalf - 1.5; s += 2.2) {
            const sx = cx + nx * s;
            const sz = cz + nz * s;
            const sy = Math.max(0, terrainHeightAt(sx, sz)) + 0.15;
            faint.addSegment(sx - ux * 1.8, sy, sz - uz * 1.8, sx + ux * 1.8, sy, sz + uz * 1.8);
          }
        }
      }

      // Boulevard trees & cast-iron Parisian streetlamps along sidewalks
      const distCenter = Math.hypot(cx, cz);
      if (
        st.isGrandBoulevard &&
        i > 0 &&
        i < steps &&
        seineCheck.dist > seineCheck.halfWidth + 22 &&
        distCenter > 132 &&
        distCenter < RADIUS_3KM2 - 36
      ) {
        if (i % 2 === 0) {
          const tx1 = lx - nx * 1.2;
          const tz1 = lz - nz * 1.2;
          fine.addSketchTree(tx1, ly, tz1, 10.5, 3.8);
          treePlacements.push({
            x: tx1,
            y: ly,
            z: tz1,
            height: 10.5,
            canopyRadius: 3.8,
            locationLabel: seineCheck.signedDist < 0 ? '16th Arr. Boulevard' : '7th Arr. Boulevard',
          });
          if (i % 4 === 0) {
            const tx2 = rx + nx * 1.2;
            const tz2 = rz + nz * 1.2;
            fine.addSketchTree(tx2, ry, tz2, 10.5, 3.8);
            treePlacements.push({
              x: tx2,
              y: ry,
              z: tz2,
              height: 10.5,
              canopyRadius: 3.8,
              locationLabel: seineCheck.signedDist < 0 ? '16th Arr. Boulevard' : '7th Arr. Boulevard',
            });
          }
        }
        if (i % 3 === 1) {
          fine.addParisStreetLamp(ilx + nx * 0.6, ly, ilz + nz * 0.6, 5.2);
          fine.addParisStreetLamp(irx - nx * 0.6, ry, irz - nz * 0.6, 5.2);
        }
      }
    }

    if (curbOuterL.length > 1) fine.addPolyline(curbOuterL, false);
    if (curbOuterR.length > 1) fine.addPolyline(curbOuterR, false);
    if (curbInnerL.length > 1) faint.addPolyline(curbInnerL, false);
    if (curbInnerR.length > 1) faint.addPolyline(curbInnerR, false);
  }

  // ---------------------------------------------------------------------------
  // 2. EXCLUSION ZONES (preserve parks, river, bridges & hero monuments cleanly)
  // ---------------------------------------------------------------------------
  const axisCos = Math.cos(MONUMENT_AXIS_RAD);
  const axisSin = Math.sin(MONUMENT_AXIS_RAD);

  const landmarkFootprints: Array<{ x: number; z: number; r: number }> = [
    { ...latLngToLocal(48.8609, 2.2979), r: 108 }, // Musée du Quai Branly
    { ...latLngToLocal(48.8641, 2.2966), r: 112 }, // Palais de Tokyo
    { ...latLngToLocal(48.8617, 2.3011), r: 38 }, // Holy Trinity Cathedral
    { ...latLngToLocal(48.8529, 2.2881), r: 52 }, // Front de Seine cluster
    { ...latLngToLocal(48.8515, 2.2858), r: 62 },
    { ...latLngToLocal(48.8508, 2.2865), r: 58 },
  ];

  const isExcludedForBlock = (x: number, z: number, blockMargin = 10): boolean => {
    const r = Math.hypot(x, z);
    if (r > RADIUS_3KM2 - 30) return true;
    // Eiffel Tower esplanade & flanking garden ponds
    if (r < 128) return true;

    const along = x * axisCos + z * axisSin;
    const across = -x * axisSin + z * axisCos;
    // Champ de Mars + École Militaire corridor
    if (along > 75 && along < 975 && Math.abs(across) < 136) return true;
    // Flanking Eiffel Esplanade garden ponds (along -40..80, across ±165)
    if (along > -55 && along < 85 && Math.abs(across) < 168) return true;
    // Trocadéro Gardens + Palais de Chaillot + Place du Trocadéro
    if (along < -115 && along > -775 && Math.abs(across) < 238) return true;

    // Seine River + lower & upper quays clearance
    const seine = sampleSeineProximity(x, z);
    if (seine.dist < seine.halfWidth + 26 + blockMargin) return true;

    // Grand boulevards clearance
    for (const st of streets) {
      if (!st.isGrandBoulevard) continue;
      if (pointToSegmentDist(x, z, st.ax, st.az, st.bx, st.bz) < st.halfWidth + blockMargin) {
        return true;
      }
    }

    // Hero landmarks clearance
    for (const fp of landmarkFootprints) {
      if (Math.hypot(x - fp.x, z - fp.z) < fp.r) return true;
    }

    return false;
  };

  // ---------------------------------------------------------------------------
  // 3. WALL-TO-WALL MULTI-WING HAUSSMANNIAN PERIMETER BLOCKS (ÎLOTS PARISIENS)
  //    Each urban parcel builds 2 to 4 joined Haussmannian wings around an interior
  //    courtyard, complete with arched shopfronts, framed French windows, projecting
  //    2nd/5th-floor balconies, zinc mansard roofs, lucarne dormers & chimneys!
  // ---------------------------------------------------------------------------
  const wings: CityWingPlacement[] = [];
  const stepAlong = 52;
  const stepAcross = 46;

  // Draw crisp secondary block-grid street sidewalks between Haussmannian îlots
  for (let u = -940; u <= 940; u += stepAlong) {
    for (let v = -940; v <= 940; v += stepAcross) {
      const ju = u + (rng() - 0.5) * 4.5;
      const jv = v + (rng() - 0.5) * 4.5;
      const bx = ju * axisCos - jv * axisSin;
      const bz = ju * axisSin + jv * axisCos;

      if (isExcludedForBlock(bx, bz, 12)) continue;

      const distFromTower = Math.hypot(bx, bz);
      const baseY = Math.max(0, terrainHeightAt(bx, bz));
      const seine = sampleSeineProximity(bx, bz);
      const rotY =
        seine.signedDist < 0
          ? MONUMENT_AXIS_RAD + (rng() < 0.5 ? 0.1 : -0.09)
          : MONUMENT_AXIS_RAD;

      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const localToWorld = (lx: number, lz: number): [number, number] => [
        bx + lx * cos - lz * sin,
        bz + lx * sin + lz * cos,
      ];

      // Block footprint (tight Parisian îlot with ~10–12m streets between neighboring blocks)
      const blockW = 38 + rng() * 5;
      const blockD = 32 + rng() * 5;
      const wingThick = 10.5 + rng() * 2.2;

      // Sidewalk perimeter curb hugging the entire Haussmannian îlot!
      const swW = blockW + 4.4;
      const swD = blockD + 4.4;
      const swCorners: Array<[number, number, number]> = [
        [-swW * 0.5, -swD * 0.5],
        [swW * 0.5, -swD * 0.5],
        [swW * 0.5, swD * 0.5],
        [-swW * 0.5, swD * 0.5],
      ].map(([lx, lz]) => {
        const [wx, wz] = localToWorld(lx, lz);
        return [wx, Math.max(0, terrainHeightAt(wx, wz)) + 0.14, wz];
      });
      faint.addPolyline(swCorners, true);

      // Detail tier: ultra-rich hero detail near Eiffel Tower / Seine / Champ de Mars, high/medium further out
      const detailTier: 'hero' | 'high' | 'medium' =
        distFromTower < 430 ? 'hero' : distFromTower < 730 ? 'high' : 'medium';

      // Choose authentic Parisian courtyard block typology: closed O-courtyard, U-courtyard, or L-corner
      const layoutRoll = rng();
      const baseH = 18.2 + rng() * 5.2; // Classic 6-floor Haussmannian cornice regulation (~18–23.5m)
      const mansardH = 3.2 + rng() * 1.1;
      const floors = baseH > 21 ? 6 : 5;

      const arrondissement =
        seine.signedDist < 0
          ? '16th Arrondissement · Passy & Chaillot'
          : bz > 220 && bx < 120
            ? '15th Arrondissement · Grenelle'
            : '7th Arrondissement · Gros-Caillou';

      const addWing = (
        lx: number,
        lz: number,
        w: number,
        d: number,
        hOffset: number,
        isCornerHero: boolean
      ) => {
        const [wx, wz] = localToWorld(lx, lz);
        if (Math.hypot(wx, wz) > RADIUS_3KM2 - 22) return;
        const wy = Math.max(0, terrainHeightAt(wx, wz));
        const h = Math.max(15.5, baseH + hOffset);
        const mh = mansardH + (hOffset > 0 ? 0.35 : 0);
        const hasRotunda = isCornerHero && distFromTower < 760 && rng() < 0.24;

        wings.push({
          x: wx,
          y: wy,
          z: wz,
          w,
          h,
          d,
          rotY,
          mansardH: mh,
          floors,
          cornerRotunda: hasRotunda,
          arrondissement,
        });

        ink.addHaussmannBuilding(wx, wy, wz, w, h, d, rotY, {
          overshoot: detailTier === 'hero' ? 0.35 : 0.22,
          floors,
          mansardHeight: mh,
          detailTier,
          balconyFloors: detailTier === 'medium' ? [floors - 1] : [2, floors - 1],
          cornerRotunda: hasRotunda,
          crossHatchShadowFace: detailTier !== 'medium',
          fineTarget: fine,
          faintTarget: faint,
        });
      };

      const halfW = blockW * 0.5;
      const halfD = blockD * 0.5;
      const innerSpanD = Math.max(8, blockD - wingThick * 2);

      // Front street wing (always present)
      addWing(0, halfD - wingThick * 0.5, blockW, wingThick, 0, true);
      // Left side wing joining cleanly at party wall
      addWing(-halfW + wingThick * 0.5, -wingThick * 0.5, wingThick, blockD - wingThick, (rng() - 0.5) * 2.2, false);

      if (layoutRoll < 0.72) {
        // U-shaped or closed 4-wing Haussmannian courtyard îlot
        addWing(halfW - wingThick * 0.5, -wingThick * 0.5, wingThick, blockD - wingThick, (rng() - 0.5) * 2.4, false);
        if (layoutRoll < 0.44) {
          // Closed 4th rear wing enclosing a true Parisian inner courtyard!
          addWing(0, -halfD + wingThick * 0.5, Math.max(10, blockW - wingThick * 2), wingThick * 0.92, -1.4, false);
        }
      } else {
        // L-shaped block with an interior garden courtyard tree!
        const [tx, tz] = localToWorld(halfW * 0.3, -halfD * 0.25);
        fine.addSketchTree(tx, baseY, tz, 11.5, 4.4);
        treePlacements.push({
          x: tx,
          y: baseY,
          z: tz,
          height: 11.5,
          canopyRadius: 4.4,
          locationLabel: `${arrondissement} Courtyard`,
        });
      }

      // Interior courtyard paving cross & occasional courtyard tree inside larger O/U blocks
      if (innerSpanD > 8 && detailTier === 'hero' && rng() < 0.45) {
        const [cx, cz] = localToWorld(0, 0);
        faint.addHorizontalCircle(cx, baseY + 0.16, cz, 3.6, 12);
      }
    }
  }

  // Batch ALL Haussmannian white occlusion masses + sloped mansard roofs into just 2 InstancedMeshes!
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const bodyInstanced = new THREE.InstancedMesh(bodyGeo, materials.whiteHatchMat, wings.length);
  bodyInstanced.name = 'HaussmannBuildingsOcclusion';

  const roofGeo = new THREE.CylinderGeometry(0.56, 0.7071, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  const roofInstanced = new THREE.InstancedMesh(roofGeo, materials.whiteHatchMat, wings.length);
  roofInstanced.name = 'HaussmannMansardRoofs';

  const dummy = new THREE.Object3D();
  for (let i = 0; i < wings.length; i++) {
    const b = wings[i];
    dummy.position.set(b.x, b.y + b.h * 0.5, b.z);
    dummy.rotation.set(0, -b.rotY, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    bodyInstanced.setMatrixAt(i, dummy.matrix);

    dummy.position.set(b.x, b.y + b.h + b.mansardH * 0.5, b.z);
    dummy.scale.set(b.w, b.mansardH, b.d);
    dummy.updateMatrix();
    roofInstanced.setMatrixAt(i, dummy.matrix);
  }
  bodyInstanced.instanceMatrix.needsUpdate = true;
  bodyInstanced.computeBoundingSphere();
  bodyInstanced.receiveShadow = true;

  roofInstanced.instanceMatrix.needsUpdate = true;
  roofInstanced.computeBoundingSphere();

  group.add(bodyInstanced);
  group.add(roofInstanced);
  solidMeshes.push(bodyInstanced, roofInstanced);

  // ---------------------------------------------------------------------------
  // 4. TOPOGRAPHIC ELEVATION CONTOUR LINES RISING UP CHAILLOT HILL (Right Bank)
  // ---------------------------------------------------------------------------
  const contourElevations = [4, 8, 12, 16, 20];
  for (const targetElev of contourElevations) {
    const pts: Array<[number, number, number]> = [];
    for (let angle = Math.PI * 0.78; angle <= Math.PI * 1.68; angle += 0.035) {
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      let lo = 180;
      let hi = 760;
      for (let iter = 0; iter < 8; iter++) {
        const mid = (lo + hi) * 0.5;
        const h = terrainHeightAt(dirX * mid, dirZ * mid);
        if (h < targetElev) lo = mid;
        else hi = mid;
      }
      const r = (lo + hi) * 0.5;
      if (r < RADIUS_3KM2 - 20 && terrainHeightAt(dirX * r, dirZ * r) >= targetElev - 0.8) {
        pts.push([dirX * r, targetElev + 0.15, dirZ * r]);
      }
    }
    if (pts.length > 2) faint.addPolyline(pts, false);
  }

  // ---------------------------------------------------------------------------
  // 5. ARCHITECTURAL 3 KM² SITE-PLAN BOUNDARY & COMPASS RING (r = 977.205 m)
  // ---------------------------------------------------------------------------
  const boundaryRingGroup = new THREE.Group();
  boundaryRingGroup.name = 'Boundary3Km2Ring';

  const drawTerrainRing = (radius: number, segs: number, target: SketchLineCollector) => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const y = Math.max(0.2, terrainHeightAt(x, z) + 0.35);
      pts.push([x, y, z]);
    }
    target.addPolyline(pts, false);
  };

  drawTerrainRing(RADIUS_3KM2, 160, ringInk);
  drawTerrainRing(RADIUS_3KM2 + 8, 160, ringInk);
  drawTerrainRing(500, 120, faint);
  drawTerrainRing(250, 96, faint);

  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const isCardinal = i % 18 === 0;
    const isMajor = i % 6 === 0;
    const tickLen = isCardinal ? 38 : isMajor ? 20 : 10;
    const r0 = RADIUS_3KM2;
    const r1 = RADIUS_3KM2 + tickLen;
    const x0 = Math.cos(a) * r0;
    const z0 = Math.sin(a) * r0;
    const x1 = Math.cos(a) * r1;
    const z1 = Math.sin(a) * r1;
    const y0 = Math.max(0.2, terrainHeightAt(x0, z0) + 0.35);
    const y1 = Math.max(0.2, terrainHeightAt(x1, z1) + 0.35);
    ringInk.addSegment(x0, y0, z0, x1, y1, z1);

    if (i === 54) {
      ringInk.addSegment(x1, y1, z1, x1 - 14, y1, z1 + 22);
      ringInk.addSegment(x1, y1, z1, x1 + 14, y1, z1 + 22);
    }
  }

  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringInk.toFloat32Array(), 3));
  const ringLines = new THREE.LineSegments(ringGeo, materials.inkLinePrimary);
  boundaryRingGroup.add(ringLines);
  group.add(boundaryRingGroup);
  lineObjects.push(ringLines);

  // Assemble city fabric ink layers
  const cityPrimaryGeo = new THREE.BufferGeometry();
  cityPrimaryGeo.setAttribute('position', new THREE.BufferAttribute(ink.toFloat32Array(), 3));
  const cityPrimaryLines = new THREE.LineSegments(cityPrimaryGeo, materials.inkLinePrimary);
  cityPrimaryLines.name = 'ParisBlocksPrimaryInk';
  group.add(cityPrimaryLines);
  lineObjects.push(cityPrimaryLines);

  const cityFineGeo = new THREE.BufferGeometry();
  cityFineGeo.setAttribute('position', new THREE.BufferAttribute(fine.toFloat32Array(), 3));
  const cityFineLines = new THREE.LineSegments(cityFineGeo, materials.inkLineFine);
  cityFineLines.name = 'ParisBlocksFineInk';
  group.add(cityFineLines);
  lineObjects.push(cityFineLines);

  const cityFaintGeo = new THREE.BufferGeometry();
  cityFaintGeo.setAttribute('position', new THREE.BufferAttribute(faint.toFloat32Array(), 3));
  const cityFaintLines = new THREE.LineSegments(cityFaintGeo, materials.inkLineFaint);
  cityFaintLines.name = 'ParisTerrainFaintInk';
  group.add(cityFaintLines);
  lineObjects.push(cityFaintLines);

  return {
    group,
    solidMeshes,
    lineObjects,
    boundaryRingGroup,
    buildingCount: wings.length,
    bodyInstanced,
    roofInstanced,
    wingSpecs: wings,
    treePlacements,
  };
}
