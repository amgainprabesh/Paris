import * as THREE from 'three';
import {
  MONUMENT_AXIS_RAD,
  RADIUS_3KM2,
  SEINE_CENTERLINE,
  latLngToLocal,
  terrainHeightAt,
} from './parisGeo';
import { SketchLineCollector } from './sketchMath';

import {
  createBridgeElement,
  createMetroTrainElement,
  createMonumentElement,
  createRiverBargeElement,
  createRiverShipElement,
  type InspectableElement,
} from './elementCatalog';
import type { CityTreePlacement } from './buildParisCityFabric';

export interface AnimatedRiverBoat {
  group: THREE.Group;
  t: number;
  speed: number;
  laneOffset: number;
  direction: 1 | -1;
}

export interface AnimatedMetroTrain {
  group: THREE.Group;
  t: number;
  speed: number;
  direction: 1 | -1;
}

export interface ParisLandmarksResult {
  group: THREE.Group;
  solidMeshes: THREE.Mesh[];
  pickableMeshes: THREE.Mesh[];
  treePlacements: CityTreePlacement[];
  lineObjects: THREE.LineSegments[];
  seineCurve: THREE.CatmullRomCurve3;
  metroCurve: THREE.CatmullRomCurve3;
  boats: AnimatedRiverBoat[];
  metroTrain: AnimatedMetroTrain;
}

/**
 * Builds high-detail 3D architectural ink-sketch models of every Parisian landmark,
 * bridge, embankment, moored river barge, garden, and monument within the 3 km² zone.
 */
export function buildParisLandmarks(materials: {
  inkLinePrimary: THREE.LineBasicMaterial;
  inkLineFine: THREE.LineBasicMaterial;
  inkLineFaint: THREE.LineBasicMaterial;
  stickBlackMat: THREE.MeshStandardMaterial;
  whiteOcclusionMat: THREE.MeshStandardMaterial;
  whiteHatchMat: THREE.MeshStandardMaterial;
}): ParisLandmarksResult {
  const group = new THREE.Group();
  group.name = 'ParisLandmarks';

  const ink = new SketchLineCollector(1900);
  const fine = new SketchLineCollector(1901);
  const faint = new SketchLineCollector(1902);
  const solidMeshes: THREE.Mesh[] = [];
  const pickableMeshes: THREE.Mesh[] = [];
  const treePlacements: CityTreePlacement[] = [];
  const lineObjects: THREE.LineSegments[] = [];

  const addSolidBox = (
    cx: number,
    baseY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    rotY: number,
    mat: THREE.Material = materials.whiteHatchMat,
    pickElement?: InspectableElement
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, baseY + h * 0.5, cz);
    mesh.rotation.y = -rotY;
    mesh.receiveShadow = true;
    if (pickElement) {
      mesh.userData.pickElement = pickElement;
      pickableMeshes.push(mesh);
    }
    group.add(mesh);
    solidMeshes.push(mesh);
    return mesh;
  };

  /** Draw a sketched sculptural equestrian silhouette on a stone plinth (Pont d'Iéna / Trocadéro / Place Joffre). */
  const addEquestrianStatue = (x: number, baseY: number, z: number, rotY: number, scale = 1.0) => {
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const toW = (lx: number, ly: number, lz: number): [number, number, number] => [
      x + (lx * cos - lz * sin) * scale,
      baseY + ly * scale,
      z + (lx * sin + lz * cos) * scale,
    ];
    // Stepped stone pedestal
    ink.addOrientedBox(x, baseY, z, 3.6 * scale, 4.2 * scale, 2.4 * scale, rotY, { overshoot: 0.12 });
    ink.addOrientedBox(x, baseY + 4.2 * scale, z, 4.0 * scale, 0.55 * scale, 2.8 * scale, rotY, {
      overshoot: 0.08,
    });
    // Stylized rearing horse & rider ink wireframe silhouette
    const p = (lx: number, ly: number, lz: number) => toW(lx, 4.75 + ly, lz);
    const backLeg = p(-1.1, 0, 0);
    const frontLeg = p(1.0, 0.2, 0);
    const rump = p(-1.0, 1.8, 0);
    const chest = p(0.9, 2.1, 0);
    const neck = p(1.3, 3.2, 0);
    const head = p(1.8, 3.0, 0);
    const riderSeat = p(-0.1, 2.0, 0);
    const riderHead = p(0.0, 3.7, 0);
    const riderArm = p(0.85, 4.3, 0);
    ink.addPolyline([backLeg, rump, chest, frontLeg], false);
    ink.addPolyline([chest, neck, head], false);
    ink.addPolyline([riderSeat, riderHead, riderArm], false);
    fine.addSegment(rump[0], rump[1], rump[2], p(-1.6, 1.1, 0)[0], p(-1.6, 1.1, 0)[1], p(-1.6, 1.1, 0)[2]);
  };

  // ---------------------------------------------------------------------------
  // 1. THE SEINE RIVER, DUAL-LEVEL QUAY EMBANKMENTS, MOORED BARGES & ÎLE AUX CYGNES
  // ---------------------------------------------------------------------------
  const seineCurve = new THREE.CatmullRomCurve3(
    SEINE_CENTERLINE.map((p) => new THREE.Vector3(p.x, -5.2, p.z))
  );

  const riverSamples = 110;
  const riverLeftBank: Array<[number, number, number]> = [];
  const riverRightBank: Array<[number, number, number]> = [];
  const lowerPortLeft: Array<[number, number, number]> = [];
  const lowerPortRight: Array<[number, number, number]> = [];
  const quayLeftTop: Array<[number, number, number]> = [];
  const quayRightTop: Array<[number, number, number]> = [];
  const parapetLeftTop: Array<[number, number, number]> = [];
  const parapetRightTop: Array<[number, number, number]> = [];

  const pCur = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const norm = new THREE.Vector3();

  for (let i = 0; i <= riverSamples; i++) {
    const t = i / riverSamples;
    seineCurve.getPointAt(t, pCur);
    seineCurve.getTangentAt(t, tan);
    norm.set(-tan.z, 0, tan.x).normalize();
    if (norm.x + norm.z < 0) norm.negate();

    const halfW = t > 0.62 ? 84 : 68;
    const portW = halfW + 10.5; // Lower stone berges promenade along both banks!
    const lx = pCur.x + norm.x * halfW;
    const lz = pCur.z + norm.z * halfW;
    const rx = pCur.x - norm.x * halfW;
    const rz = pCur.z - norm.z * halfW;

    const plx = pCur.x + norm.x * portW;
    const plz = pCur.z + norm.z * portW;
    const prx = pCur.x - norm.x * portW;
    const prz = pCur.z - norm.z * portW;

    riverLeftBank.push([lx, -5.1, lz]);
    riverRightBank.push([rx, -5.1, rz]);
    lowerPortLeft.push([lx, -3.4, lz]);
    lowerPortRight.push([rx, -3.4, rz]);
    quayLeftTop.push([plx, 0.25, plz]);
    quayRightTop.push([prx, 0.25, prz]);
    parapetLeftTop.push([plx, 1.35, plz]);
    parapetRightTop.push([prx, 1.35, prz]);

    // Masonry ashlar joint vertical ticks & riverside quay lamps
    if (i % 2 === 0) {
      fine.addSegment(lx, -5.1, lz, lx, -3.4, lz);
      fine.addSegment(rx, -5.1, rz, rx, -3.4, rz);
      fine.addSegment(plx, -3.4, plz, plx, 1.35, plz);
      fine.addSegment(prx, -3.4, prz, prx, 1.35, prz);
      // Lower port promenade cobblestone cross-seams
      faint.addSegment(lx, -3.4, lz, plx, -3.4, plz);
      faint.addSegment(rx, -3.4, rz, prx, -3.4, prz);
    }
    if (i % 6 === 0 && i > 2 && i < riverSamples - 2) {
      fine.addParisStreetLamp(plx + norm.x * 1.4, 0.25, plz + norm.z * 1.4, 5.2);
      fine.addParisStreetLamp(prx - norm.x * 1.4, 0.25, prz - norm.z * 1.4, 5.2);
    }
  }

  ink.addPolyline(riverLeftBank, false);
  ink.addPolyline(riverRightBank, false);
  ink.addPolyline(lowerPortLeft, false);
  ink.addPolyline(lowerPortRight, false);
  ink.addPolyline(quayLeftTop, false);
  ink.addPolyline(quayRightTop, false);
  fine.addPolyline(parapetLeftTop, false);
  fine.addPolyline(parapetRightTop, false);

  // Flowing architectural ink streamlines + fine hand-drawn ripples on the Seine
  const streamOffsets = [-0.84, -0.66, -0.46, -0.26, -0.08, 0.1, 0.28, 0.48, 0.68, 0.84];
  for (let sIdx = 0; sIdx < streamOffsets.length; sIdx++) {
    const offFrac = streamOffsets[sIdx];
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 85; i++) {
      const t = i / 85;
      seineCurve.getPointAt(t, pCur);
      seineCurve.getTangentAt(t, tan);
      norm.set(-tan.z, 0, tan.x).normalize();
      if (norm.x + norm.z < 0) norm.negate();
      const halfW = t > 0.62 ? 84 : 68;
      const wave = Math.sin(t * 32 + sIdx * 1.9) * 2.0;
      const dist = offFrac * halfW + wave;
      if (t > 0.63 && t < 0.96 && Math.abs(offFrac) < 0.22) {
        if (pts.length > 1) faint.addPolyline(pts, false);
        pts.length = 0;
        continue;
      }
      pts.push([pCur.x + norm.x * dist, -5.0, pCur.z + norm.z * dist]);
    }
    if (pts.length > 1) faint.addPolyline(pts, false);
  }

  // Moored Parisian river barges (péniches) & Bateaux Parisiens floating piers along Port de la Bourdonnais & Port Debilly
  const mooredBarges: Array<{ t: number; bank: 1 | -1; len: number; beam: number; portName: string }> = [
    { t: 0.18, bank: 1, len: 34, beam: 6.2, portName: 'Port du Gros-Caillou' },
    { t: 0.25, bank: -1, len: 32, beam: 5.8, portName: 'Port de la Conférence' },
    { t: 0.34, bank: 1, len: 38, beam: 6.8, portName: 'Port de la Bourdonnais' },
    { t: 0.40, bank: -1, len: 30, beam: 5.6, portName: 'Port Debilly' },
    { t: 0.48, bank: 1, len: 36, beam: 6.5, portName: 'Port de la Bourdonnais' },
    { t: 0.56, bank: 1, len: 34, beam: 6.0, portName: 'Port de Suffren' },
    { t: 0.58, bank: -1, len: 29, beam: 5.5, portName: 'Port de Passy' },
    { t: 0.72, bank: 1, len: 33, beam: 6.0, portName: 'Port de Grenelle' },
    { t: 0.80, bank: -1, len: 31, beam: 5.8, portName: 'Port de Passy' },
    { t: 0.86, bank: 1, len: 35, beam: 6.2, portName: 'Port de Grenelle' },
  ];
  mooredBarges.forEach((bg, idx) => {
    seineCurve.getPointAt(bg.t, pCur);
    seineCurve.getTangentAt(bg.t, tan);
    norm.set(-tan.z, 0, tan.x).normalize();
    if (norm.x + norm.z < 0) norm.negate();
    const halfW = bg.t > 0.62 ? 84 : 68;
    const dockDist = halfW - bg.beam * 0.5 - 2.2;
    const bx = pCur.x + norm.x * dockDist * bg.bank;
    const bz = pCur.z + norm.z * dockDist * bg.bank;
    const rotY = Math.atan2(tan.z, tan.x);
    const bargeElement = createRiverBargeElement({
      index: idx,
      length: bg.len,
      beam: bg.beam,
      portName: bg.portName,
    });
    addSolidBox(bx, -5.0, bz, bg.len * 0.88, 3.8, bg.beam, rotY, materials.whiteOcclusionMat, bargeElement);
    fine.addMooredBarge(bx, -5.0, bz, bg.len, bg.beam, rotY, faint);
  });

  // Île aux Cygnes (narrow 850m artificial island with stone retaining walls, lamps, double trees & Statue of Liberty)
  const islandLeft: Array<[number, number, number]> = [];
  const islandRight: Array<[number, number, number]> = [];
  const islandTopL: Array<[number, number, number]> = [];
  const islandTopR: Array<[number, number, number]> = [];
  for (let i = 0; i <= 32; i++) {
    const u = i / 32;
    const t = 0.64 + u * 0.32;
    seineCurve.getPointAt(t, pCur);
    seineCurve.getTangentAt(t, tan);
    norm.set(-tan.z, 0, tan.x).normalize();
    if (norm.x + norm.z < 0) norm.negate();
    const taper = Math.sin(u * Math.PI);
    const iw = 1.6 + 8.6 * Math.pow(taper, 0.36);
    const lx = pCur.x + norm.x * iw;
    const lz = pCur.z + norm.z * iw;
    const rx = pCur.x - norm.x * iw;
    const rz = pCur.z - norm.z * iw;
    islandLeft.push([lx, -5.0, lz]);
    islandRight.push([rx, -5.0, rz]);
    islandTopL.push([lx, 0.6, lz]);
    islandTopR.push([rx, 0.6, rz]);
    if (i % 2 === 0) {
      fine.addSegment(lx, -5.0, lz, lx, 0.6, lz);
      fine.addSegment(rx, -5.0, rz, rx, 0.6, rz);
    }
    if (i > 1 && i < 31 && i % 2 === 0) {
      const tx1 = pCur.x + norm.x * (iw * 0.52);
      const tz1 = pCur.z + norm.z * (iw * 0.52);
      const tx2 = pCur.x - norm.x * (iw * 0.52);
      const tz2 = pCur.z - norm.z * (iw * 0.52);
      fine.addSketchTree(tx1, 0.6, tz1, 11.5, 4.0);
      fine.addSketchTree(tx2, 0.6, tz2, 11.5, 4.0);
      treePlacements.push(
        { x: tx1, y: 0.6, z: tz1, height: 11.5, canopyRadius: 4.0, locationLabel: 'Île aux Cygnes Allée' },
        { x: tx2, y: 0.6, z: tz2, height: 11.5, canopyRadius: 4.0, locationLabel: 'Île aux Cygnes Allée' }
      );
    }
    if (i > 2 && i < 30 && i % 4 === 0) {
      fine.addParisStreetLamp(pCur.x, 0.6, pCur.z, 4.8);
    }
  }
  ink.addPolyline(islandLeft, false);
  ink.addPolyline(islandRight, false);
  ink.addPolyline(islandTopL, false);
  ink.addPolyline(islandTopR, false);

  // Quarter-scale Statue of Liberty at SW tip of Île aux Cygnes
  const libPos = seineCurve.getPointAt(0.955);
  const libertyEl = createMonumentElement('statue-liberty');
  addSolidBox(libPos.x, 0.5, libPos.z, 6.0, 18.0, 6.0, MONUMENT_AXIS_RAD, materials.whiteHatchMat, libertyEl);
  ink.addOrientedBox(libPos.x, 0.5, libPos.z, 5.5, 6.5, 5.5, MONUMENT_AXIS_RAD, { overshoot: 0.2, floors: 2 });
  ink.addSegment(libPos.x, 7.0, libPos.z, libPos.x, 16.5, libPos.z);
  ink.addSegment(libPos.x - 1.5, 7.0, libPos.z, libPos.x - 0.8, 14.5, libPos.z);
  ink.addSegment(libPos.x + 1.5, 7.0, libPos.z, libPos.x + 0.8, 14.5, libPos.z);
  ink.addSegment(libPos.x + 0.6, 14.5, libPos.z, libPos.x + 2.1, 18.8, libPos.z);
  ink.addHorizontalCircle(libPos.x, 15.6, libPos.z, 1.35, 7);

  // ---------------------------------------------------------------------------
  // 2. FOUR ORNATE PARISIAN BRIDGES ACROSS THE SEINE
  // ---------------------------------------------------------------------------
  const addParisBridge = (spec: {
    bridgeId: 'pont-iena' | 'pont-bir-hakeim' | 'passerelle-debilly' | 'pont-alma';
    lat: number;
    lng: number;
    width: number;
    span: number;
    arches: number;
    deckY: number;
    doubleDeckViaduct?: boolean;
    pedestrianArch?: boolean;
    equestrianCorners?: boolean;
  }) => {
    const bridgeEl = createBridgeElement(spec.bridgeId);
    const pos = latLngToLocal(spec.lat, spec.lng);
    let bestT = 0.5;
    let bestD = Infinity;
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const pt = seineCurve.getPointAt(t);
      const d = Math.hypot(pt.x - pos.x, pt.z - pos.z);
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    const center = seineCurve.getPointAt(bestT);
    const tangent = seineCurve.getTangentAt(bestT);
    const crossDir = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const rotY = Math.atan2(crossDir.z, crossDir.x);

    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const toW = (lx: number, ly: number, lz: number): [number, number, number] => [
      center.x + lx * cos - lz * sin,
      ly,
      center.z + lx * sin + lz * cos,
    ];

    // Bridge deck white occlusion core + cornice & balustrade
    addSolidBox(center.x, spec.deckY - 1.8, center.z, spec.span, 2.0, spec.width, rotY, materials.whiteOcclusionMat, bridgeEl);
    ink.addOrientedBox(center.x, spec.deckY - 1.8, center.z, spec.span, 2.0, spec.width, rotY, {
      overshoot: 0.45,
    });
    // Stone balustrade parapet + fine balustrade pickets along both sides
    ink.addOrientedBox(center.x, spec.deckY + 0.2, center.z, spec.span, 1.35, spec.width, rotY, {
      overshoot: 0.2,
      windowBays: 32,
    });
    // Sidewalk curb lines & lane divider markings across bridge roadway
    for (const lz of [-spec.width * 0.34, 0, spec.width * 0.34]) {
      const sA = toW(-spec.span * 0.5, spec.deckY + 0.25, lz);
      const sB = toW(spec.span * 0.5, spec.deckY + 0.25, lz);
      faint.addSegment(sA[0], sA[1], sA[2], sB[0], sB[1], sB[2]);
    }

    // Ornate Parisian bridge lamps along both parapets
    const lampPairs = spec.pedestrianArch ? 5 : 7;
    for (let l = 0; l < lampPairs; l++) {
      const lx = -spec.span * 0.42 + (l / (lampPairs - 1)) * spec.span * 0.84;
      for (const lz of [-spec.width * 0.48, spec.width * 0.48]) {
        const lp = toW(lx, spec.deckY + 1.55, lz);
        fine.addParisStreetLamp(lp[0], lp[1], lp[2], 4.4);
      }
    }

    // Pont d'Iéna 4 corner equestrian statues (Gaul, Roman, Arab & Greek warriors)
    if (spec.equestrianCorners) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const ep = toW(sx * (spec.span * 0.5 + 3.5), 0.3, sz * (spec.width * 0.5 + 2.2));
          addEquestrianStatue(ep[0], ep[1], ep[2], rotY + (sx > 0 ? Math.PI : 0), 1.05);
        }
      }
    }

    // Segmental arches, voussoir stone rings, spandrel lattice & cutwater masonry piers
    const archSpan = spec.span / spec.arches;
    for (let a = 0; a < spec.arches; a++) {
      const xStart = -spec.span * 0.5 + a * archSpan;
      if (a > 0) {
        const px = xStart;
        const pCenter = toW(px, 0, 0);
        addSolidBox(pCenter[0], -5.3, pCenter[2], 4.8, spec.deckY + 4.8, spec.width + 4.4, rotY, materials.whiteHatchMat, bridgeEl);
        ink.addOrientedBox(pCenter[0], -5.3, pCenter[2], 4.8, spec.deckY + 4.8, spec.width + 4.4, rotY, {
          overshoot: 0.2,
          floors: 3,
        });
        // Triangular cutwater river prows on upstream & downstream faces of each pier
        for (const sz of [-1, 1]) {
          const prowTipBot = toW(px, -5.2, sz * (spec.width * 0.5 + 4.8));
          const prowTipTop = toW(px, spec.deckY - 1.2, sz * (spec.width * 0.5 + 4.0));
          const cornerL = toW(px - 2.4, spec.deckY - 1.2, sz * (spec.width * 0.5 + 2.2));
          const cornerR = toW(px + 2.4, spec.deckY - 1.2, sz * (spec.width * 0.5 + 2.2));
          ink.addSegment(prowTipBot[0], prowTipBot[1], prowTipBot[2], prowTipTop[0], prowTipTop[1], prowTipTop[2]);
          ink.addSegment(prowTipTop[0], prowTipTop[1], prowTipTop[2], cornerL[0], cornerL[1], cornerL[2]);
          ink.addSegment(prowTipTop[0], prowTipTop[1], prowTipTop[2], cornerR[0], cornerR[1], cornerR[2]);
        }
      }

      for (const zSide of [-spec.width * 0.5, spec.width * 0.5]) {
        const pts: Array<[number, number, number]> = [];
        const outerRingPts: Array<[number, number, number]> = [];
        const steps = 16;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const lx = xStart + 1.8 + u * (archSpan - 3.6);
          const archRise = Math.sin(u * Math.PI);
          const ly = spec.pedestrianArch
            ? -2.8 + archRise * 13.5
            : -2.4 + archRise * (spec.deckY + 0.9);
          pts.push(toW(lx, ly, zSide));
          outerRingPts.push(toW(lx, ly + (spec.pedestrianArch ? 1.8 : 0.75), zSide));

          // Vertical hangers & X-bracing for Passerelle Debilly steel arch
          if (spec.pedestrianArch && s > 0 && s < steps) {
            const deckPt = toW(lx, spec.deckY, zSide);
            fine.addSegment(pts[s][0], pts[s][1], pts[s][2], deckPt[0], deckPt[1], deckPt[2]);
            fine.addSegment(pts[s][0], pts[s][1], pts[s][2], outerRingPts[s][0], outerRingPts[s][1], outerRingPts[s][2]);
          } else if (s > 0 && s < steps) {
            // Stone voussoir ticks & steel spandrel verticals up to roadway cornice
            const spandrelTop = toW(lx, spec.deckY - 1.6, zSide);
            fine.addSegment(pts[s][0], pts[s][1], pts[s][2], outerRingPts[s][0], outerRingPts[s][1], outerRingPts[s][2]);
            if (spec.doubleDeckViaduct && s % 2 === 0) {
              fine.addSegment(outerRingPts[s][0], outerRingPts[s][1], outerRingPts[s][2], spandrelTop[0], spandrelTop[1], spandrelTop[2]);
            }
          }
        }
        ink.addPolyline(pts, false);
        fine.addPolyline(outerRingPts, false);
      }
    }

    // Pont de Bir-Hakeim iconic upper Métro Line 6 colonnade viaduct & triumphal island arch!
    if (spec.doubleDeckViaduct) {
      const viaY = spec.deckY + 7.2;
      const viaW = 8.4;
      addSolidBox(center.x, viaY, center.z, spec.span + 44, 2.3, viaW, rotY, materials.whiteOcclusionMat, bridgeEl);
      ink.addOrientedBox(center.x, viaY, center.z, spec.span + 44, 2.3, viaW, rotY, {
        overshoot: 0.4,
        windowBays: 28,
      });
      // Riveted iron girder diagonal X-truss along elevated metro deck fascia
      const trussBays = 26;
      for (let i = 0; i < trussBays; i++) {
        const x0 = -(spec.span + 44) * 0.5 + (i / trussBays) * (spec.span + 44);
        const x1 = -(spec.span + 44) * 0.5 + ((i + 1) / trussBays) * (spec.span + 44);
        for (const lz of [-viaW * 0.5, viaW * 0.5]) {
          const a = toW(x0, viaY, lz);
          const b = toW(x1, viaY + 2.3, lz);
          const c = toW(x1, viaY, lz);
          const d = toW(x0, viaY + 2.3, lz);
          fine.addSegment(a[0], a[1], a[2], b[0], b[1], b[2]);
          fine.addSegment(c[0], c[1], c[2], d[0], d[1], d[2]);
        }
      }
      // Iconic paired cast-iron colonnade pillars with ornate arched knee braces!
      const pillarCount = 18;
      for (let i = 0; i <= pillarCount; i++) {
        const lx = -(spec.span + 34) * 0.5 + (i / pillarCount) * (spec.span + 34);
        for (const lz of [-viaW * 0.44, viaW * 0.44]) {
          const bPt = toW(lx, spec.deckY + 0.2, lz);
          const tPt = toW(lx, viaY, lz);
          ink.addSegment(bPt[0], bPt[1], bPt[2], tPt[0], tPt[1], tPt[2]);
          // Arch knee brace
          const kA = toW(lx, viaY - 1.8, lz);
          const kB = toW(lx + 1.6, viaY, lz);
          const kC = toW(lx - 1.6, viaY, lz);
          fine.addSegment(kA[0], kA[1], kA[2], kB[0], kB[1], kB[2]);
          fine.addSegment(kA[0], kA[1], kA[2], kC[0], kC[1], kC[2]);
        }
        const lTop = toW(lx, viaY - 0.2, -viaW * 0.44);
        const rTop = toW(lx, viaY - 0.2, viaW * 0.44);
        fine.addSegment(lTop[0], lTop[1], lTop[2], rTop[0], rTop[1], rTop[2]);
      }
      // Central stone belvedere pier & La France Renaissante equestrian statue at Île aux Cygnes!
      const belvPos = toW(0, spec.deckY + 0.2, spec.width * 0.5 + 4.5);
      addEquestrianStatue(belvPos[0], belvPos[1], belvPos[2], rotY + Math.PI * 0.5, 0.9);
    }
  };

  addParisBridge({
    bridgeId: 'pont-iena',
    lat: 48.86015,
    lng: 2.2922,
    width: 34,
    span: 146,
    arches: 5,
    deckY: 2.4,
    equestrianCorners: true,
  });
  addParisBridge({
    bridgeId: 'pont-bir-hakeim',
    lat: 48.8556,
    lng: 2.2876,
    width: 25,
    span: 176,
    arches: 4,
    deckY: 2.8,
    doubleDeckViaduct: true,
  });
  addParisBridge({
    bridgeId: 'passerelle-debilly',
    lat: 48.8629,
    lng: 2.2971,
    width: 8.5,
    span: 140,
    arches: 1,
    deckY: 3.4,
    pedestrianArch: true,
  });
  addParisBridge({
    bridgeId: 'pont-alma',
    lat: 48.86395,
    lng: 2.30175,
    width: 40,
    span: 148,
    arches: 3,
    deckY: 2.6,
  });

  // Flamme de la Liberté monument at Place Diana (north end of Pont de l'Alma)
  const flame = latLngToLocal(48.8644, 2.3012);
  const flameY = Math.max(0.2, terrainHeightAt(flame.x, flame.z));
  ink.addOrientedBox(flame.x, flameY, flame.z, 3.2, 3.6, 3.2, 0.4, { overshoot: 0.1 });
  ink.addPolyline(
    [
      [flame.x, flameY + 3.6, flame.z],
      [flame.x - 1.1, flameY + 5.8, flame.z],
      [flame.x + 0.2, flameY + 8.6, flame.z],
      [flame.x + 1.1, flameY + 5.5, flame.z],
      [flame.x, flameY + 3.6, flame.z],
    ],
    false
  );

  // ---------------------------------------------------------------------------
  // 3. MÉTRO LINE 6 ELEVATED VIADUCT ALONG BOULEVARD DE GRENELLE (with truss & stations)
  // ---------------------------------------------------------------------------
  const metroWaypointsLatLng: Array<[number, number]> = [
    [48.8573, 2.2852],
    [48.8556, 2.2876],
    [48.8539, 2.2896],
    [48.8515, 2.2925],
    [48.8501, 2.2943],
    [48.8492, 2.2978],
  ];
  const metroCurve = new THREE.CatmullRomCurve3(
    metroWaypointsLatLng.map(([lat, lng]) => {
      const p = latLngToLocal(lat, lng);
      return new THREE.Vector3(p.x, 10.6, p.z);
    })
  );

  const viaSteps = 54;
  const viaLeft: Array<[number, number, number]> = [];
  const viaRight: Array<[number, number, number]> = [];
  const viaLeftTop: Array<[number, number, number]> = [];
  const viaRightTop: Array<[number, number, number]> = [];
  for (let i = 0; i <= viaSteps; i++) {
    const t = 0.26 + (i / viaSteps) * 0.74;
    const pt = metroCurve.getPointAt(t);
    const tg = metroCurve.getTangentAt(t);
    const n = new THREE.Vector3(-tg.z, 0, tg.x).normalize();
    const hw = 4.2;
    viaLeft.push([pt.x + n.x * hw, pt.y, pt.z + n.z * hw]);
    viaRight.push([pt.x - n.x * hw, pt.y, pt.z - n.z * hw]);
    viaLeftTop.push([pt.x + n.x * hw, pt.y + 1.9, pt.z + n.z * hw]);
    viaRightTop.push([pt.x - n.x * hw, pt.y + 1.9, pt.z - n.z * hw]);
    if (i % 3 === 0) {
      const gy = Math.max(0, terrainHeightAt(pt.x, pt.z));
      ink.addSegment(pt.x + n.x * 3.4, gy, pt.z + n.z * 3.4, pt.x + n.x * 3.4, pt.y, pt.z + n.z * 3.4);
      ink.addSegment(pt.x - n.x * 3.4, gy, pt.z - n.z * 3.4, pt.x - n.x * 3.4, pt.y, pt.z - n.z * 3.4);
      fine.addSegment(pt.x + n.x * hw, pt.y, pt.z + n.z * hw, pt.x - n.x * hw, pt.y, pt.z - n.z * hw);
    }
    if (i > 0) {
      fine.addSegment(viaLeft[i - 1][0], viaLeft[i - 1][1], viaLeft[i - 1][2], viaLeftTop[i][0], viaLeftTop[i][1], viaLeftTop[i][2]);
      fine.addSegment(viaRight[i - 1][0], viaRight[i - 1][1], viaRight[i - 1][2], viaRightTop[i][0], viaRightTop[i][1], viaRightTop[i][2]);
    }
    // Arched glass-and-iron Métro station canopies at Bir-Hakeim (t ~ 0.42) & Dupleix (t ~ 0.78)
    if (i === 12 || i === 38) {
      const rotY = Math.atan2(tg.z, tg.x);
      ink.addOrientedBox(pt.x, pt.y + 1.9, pt.z, 52, 5.2, 13.5, rotY, {
        overshoot: 0.25,
        windowBays: 12,
        mansardHeight: 2.2,
      });
    }
  }
  ink.addPolyline(viaLeft, false);
  ink.addPolyline(viaRight, false);
  fine.addPolyline(viaLeftTop, false);
  fine.addPolyline(viaRightTop, false);

  // ---------------------------------------------------------------------------
  // 4. EIFFEL TOWER ESPLANADE & CHAMP DE MARS FORMAL FRENCH GARDENS
  // ---------------------------------------------------------------------------
  const axisCos = Math.cos(MONUMENT_AXIS_RAD);
  const axisSin = Math.sin(MONUMENT_AXIS_RAD);
  const axisPoint = (along: number, across: number, yOffset = 0.12): [number, number, number] => {
    const x = along * axisCos - across * axisSin;
    const z = along * axisSin + across * axisCos;
    const gy = Math.max(0, terrainHeightAt(x, z));
    return [x, gy + yOffset, z];
  };

  // Detailed Eiffel Tower Esplanade: concentric compass rings, radial paving rays & flanking English garden ponds!
  ink.addHorizontalCircle(0, 0.14, 0, 26, 32);
  ink.addHorizontalCircle(0, 0.14, 0, 86, 64);
  ink.addHorizontalCircle(0, 0.14, 0, 102, 64);
  for (let r = 0; r < 16; r++) {
    const a = (r / 16) * Math.PI * 2;
    faint.addSegment(Math.cos(a) * 26, 0.14, Math.sin(a) * 26, Math.cos(a) * 86, 0.14, Math.sin(a) * 86);
  }
  // Flanking West & East Eiffel Esplanade garden ponds & tree groves
  for (const side of [-1, 1]) {
    const pondC = axisPoint(14, side * 124, 0.16);
    ink.addHorizontalCircle(pondC[0], pondC[1], pondC[2], 22, 20);
    faint.addHorizontalCircle(pondC[0], pondC[1], pondC[2], 16, 16);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const tx = pondC[0] + Math.cos(a) * 29;
      const tz = pondC[2] + Math.sin(a) * 29;
      fine.addSketchTree(tx, 0, tz, 13.5, 5.2);
      treePlacements.push({
        x: tx,
        y: 0,
        z: tz,
        height: 13.5,
        canopyRadius: 5.2,
        locationLabel: 'Eiffel Tower Esplanade Garden',
      });
    }
  }

  // Formal Champ de Mars lawns, floral parterre scrolls, crossing alleys, lampposts & double tree allées
  const lawnSegments: Array<[number, number, number]> = [
    [115, 295, 58],
    [325, 485, 58],
    [515, 725, 58],
  ];
  for (const [a0, a1, hw] of lawnSegments) {
    for (const inset of [0, 5.5, 9.0]) {
      const p0 = axisPoint(a0 + inset, -hw + inset);
      const p1 = axisPoint(a1 - inset, -hw + inset);
      const p2 = axisPoint(a1 - inset, hw - inset);
      const p3 = axisPoint(a0 + inset, hw - inset);
      (inset === 9.0 ? faint : ink).addPolyline([p0, p1, p2, p3], true);
    }
    // Central axial oval floral medallion in each parterre
    const midC = axisPoint((a0 + a1) * 0.5, 0, 0.15);
    fine.addHorizontalCircle(midC[0], midC[1], midC[2], 14, 24);
    faint.addHorizontalCircle(midC[0], midC[1], midC[2], 9, 18);
    // Fine diagonal lawn drafting hatch along perimeter
    for (let s = a0 + 14; s < a1 - 10; s += 16) {
      const h1 = axisPoint(s, -hw + 9, 0.14);
      const h2 = axisPoint(s + 12, -hw + 22, 0.14);
      const h3 = axisPoint(s, hw - 9, 0.14);
      const h4 = axisPoint(s + 12, hw - 22, 0.14);
      faint.addSegment(h1[0], h1[1], h1[2], h2[0], h2[1], h2[2]);
      faint.addSegment(h3[0], h3[1], h3[2], h4[0], h4[1], h4[2]);
    }
  }

  // Crossing alleys & Place Jacques Rueff central monument plinth
  for (const crossAlong of [310, 500]) {
    for (const off of [-11, 11]) {
      const cL = axisPoint(crossAlong + off, -112, 0.15);
      const cR = axisPoint(crossAlong + off, 112, 0.15);
      fine.addSegment(cL[0], cL[1], cL[2], cR[0], cR[1], cR[2]);
    }
  }
  const rueffC = axisPoint(310, 0, 0.16);
  ink.addHorizontalCircle(rueffC[0], rueffC[1], rueffC[2], 18, 28);
  ink.addHorizontalCircle(rueffC[0], rueffC[1], rueffC[2], 11, 20);

  // Outer allées, lampposts, benches & dense double tree rows flanking Champ de Mars
  for (const side of [-1, 1]) {
    const pStart = axisPoint(95, side * 108);
    const pEnd = axisPoint(765, side * 108);
    ink.addSegment(pStart[0], pStart[1], pStart[2], pEnd[0], pEnd[1], pEnd[2]);
    const pInnerStart = axisPoint(108, side * 64);
    const pInnerEnd = axisPoint(745, side * 64);
    fine.addSegment(pInnerStart[0], pInnerStart[1], pInnerStart[2], pInnerEnd[0], pInnerEnd[1], pInnerEnd[2]);

    for (let along = 115; along <= 745; along += 22) {
      if (Math.abs(along - 310) < 15 || Math.abs(along - 500) < 15) continue;
      for (const lane of [72, 90, 103]) {
        const tp = axisPoint(along, side * lane, 0);
        const th = 12.0 + ((along * 7 + lane) % 4);
        fine.addSketchTree(tp[0], tp[1], tp[2], th, 4.9);
        treePlacements.push({
          x: tp[0],
          y: tp[1],
          z: tp[2],
          height: th,
          canopyRadius: 4.9,
          locationLabel: 'Champ de Mars Allée',
        });
      }
      if (along % 44 === 15) {
        const lp = axisPoint(along, side * 61.5, 0);
        fine.addParisStreetLamp(lp[0], lp[1], lp[2], 4.8);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. ÉCOLE MILITAIRE (Masterpiece 18th-century Gabriel Complex + Place Joffre)
  // ---------------------------------------------------------------------------
  const ecoleEl = createMonumentElement('ecole-militaire');
  const ecoleCenter = axisPoint(870, 0, 0);
  addSolidBox(ecoleCenter[0], 0, ecoleCenter[2], 48, 22, 124, MONUMENT_AXIS_RAD, materials.whiteHatchMat, ecoleEl);
  ink.addHaussmannBuilding(ecoleCenter[0], 0, ecoleCenter[2], 48, 22, 124, MONUMENT_AXIS_RAD, {
    overshoot: 0.45,
    floors: 4,
    mansardHeight: 6.5,
    detailTier: 'hero',
    balconyFloors: [2],
    crossHatchShadowFace: true,
    fineTarget: fine,
    faintTarget: faint,
  });

  // Iconic central quadrangular mansard dome, pediment & 8 tall fluted Corinthian portico columns!
  const domeCenter = axisPoint(858, 0, 0);
  addSolidBox(domeCenter[0], 22, domeCenter[2], 26, 12, 30, MONUMENT_AXIS_RAD, materials.whiteHatchMat, ecoleEl);
  ink.addOrientedBox(domeCenter[0], 22, domeCenter[2], 26, 12, 30, MONUMENT_AXIS_RAD, {
    overshoot: 0.35,
    mansardHeight: 9.5,
  });
  // Crowning lantern cupola above École Militaire dome
  ink.addHorizontalCircle(domeCenter[0], 43.5, domeCenter[2], 3.8, 12);
  ink.addSegment(domeCenter[0], 43.5, domeCenter[2], domeCenter[0], 49.5, domeCenter[2]);

  // 8 Corinthian columns + triangular sculptural pediment facing Champ de Mars
  const pedLeft = axisPoint(842, -16, 19.5);
  const pedRight = axisPoint(842, 16, 19.5);
  const pedPeak = axisPoint(842, 0, 25.5);
  ink.addPolyline([pedLeft, pedPeak, pedRight, pedLeft], false);
  for (let c = -3.5; c <= 3.5; c += 1) {
    const colP = axisPoint(843, c * 4.2, 0);
    ink.addSegment(colP[0], 0, colP[2], colP[0], 19.5, colP[2]);
    fine.addHorizontalCircle(colP[0], 19.2, colP[2], 0.75, 6);
  }
  // Semicircular Place Joffre forecourt + Maréchal Joffre equestrian statue
  const joffreCenter = axisPoint(796, 0, 0.16);
  ink.addHorizontalCircle(joffreCenter[0], joffreCenter[1], joffreCenter[2], 32, 32);
  addEquestrianStatue(joffreCenter[0], 0.16, joffreCenter[2], MONUMENT_AXIS_RAD + Math.PI, 1.15);

  // Symmetrical flanking courtyard wings of École Militaire
  for (const side of [-1, 1]) {
    const wingP = axisPoint(902, side * 98, 0);
    addSolidBox(wingP[0], 0, wingP[2], 98, 17.5, 36, MONUMENT_AXIS_RAD, materials.whiteHatchMat, ecoleEl);
    ink.addHaussmannBuilding(wingP[0], 0, wingP[2], 98, 17.5, 36, MONUMENT_AXIS_RAD, {
      overshoot: 0.35,
      floors: 3,
      mansardHeight: 4.8,
      detailTier: 'high',
      balconyFloors: [],
      fineTarget: fine,
      faintTarget: faint,
    });
  }

  // ---------------------------------------------------------------------------
  // 6. JARDINS DU TROCADÉRO, FONTAINE DE VARSOVIE & PALAIS DE CHAILLOT (NW)
  // ---------------------------------------------------------------------------
  // Stepped cascading Warsaw Fountains reflecting pool + 20 arched water cannon plumes
  for (const inset of [0, 3.2]) {
    const poolP0 = axisPoint(-335 - inset, -25 + inset, 0.25);
    const poolP1 = axisPoint(-498 + inset, -25 + inset, 0.25);
    const poolP2 = axisPoint(-498 + inset, 25 - inset, 0.25);
    const poolP3 = axisPoint(-335 - inset, 25 - inset, 0.25);
    (inset === 0 ? ink : fine).addPolyline([poolP0, poolP1, poolP2, poolP3], true);
  }
  // Cascading stepped upper basin walls + arched fountain plumes
  for (let along = -355; along >= -485; along -= 18) {
    for (const across of [-13, 13]) {
      const jp = axisPoint(along, across, 0.3);
      // Tall fountain water arc leaning toward pool center
      const top = axisPoint(along + 14, across * 0.45, 11.5);
      const splash = axisPoint(along + 28, across * 0.15, 0.4);
      fine.addPolyline([jp, top, splash], false);
      // Secondary spray plume ticks
      faint.addSegment(top[0], top[1], top[2], top[0], top[1] - 3.5, top[2]);
    }
  }
  // Monumental flanking terrace stairs ascending toward Parvis des Droits de l'Homme
  for (let step = 0; step < 9; step++) {
    const a = -504 - step * 7.5;
    const sL = axisPoint(a, -52, 0.25);
    const sR = axisPoint(a, 52, 0.25);
    ink.addSegment(sL[0], sL[1], sL[2], sR[0], sR[1], sR[2]);
  }
  // Dense Trocadéro sloped gardens, winding paths & Parisian lamps
  for (const side of [-1, 1]) {
    for (let along = -335; along >= -520; along -= 22) {
      for (const across of [46, 70, 96, 120]) {
        const tp = axisPoint(along, side * across, 0);
        fine.addSketchTree(tp[0], tp[1], tp[2], 12.5, 4.9);
        treePlacements.push({
          x: tp[0],
          y: tp[1],
          z: tp[2],
          height: 12.5,
          canopyRadius: 4.9,
          locationLabel: 'Jardins du Trocadéro',
        });
      }
      if (along % 44 === -335 % 44) {
        const lp = axisPoint(along, side * 32, 0.2);
        fine.addParisStreetLamp(lp[0], lp[1], lp[2], 4.8);
      }
    }
  }

  // PALAIS DE CHAILLOT — Monumental twin pavilions + seamless curved fluted colonnade wings!
  const chaillotEl = createMonumentElement('palais-chaillot');
  for (const side of [-1, 1]) {
    const pavP = axisPoint(-585, side * 56, 0);
    const pavY = Math.max(16, terrainHeightAt(pavP[0], pavP[2]));
    addSolidBox(pavP[0], pavY, pavP[2], 44, 24, 36, MONUMENT_AXIS_RAD, materials.whiteHatchMat, chaillotEl);
    ink.addHaussmannBuilding(pavP[0], pavY, pavP[2], 44, 24, 36, MONUMENT_AXIS_RAD, {
      overshoot: 0.45,
      floors: 4,
      mansardHeight: 0,
      detailTier: 'hero',
      balconyFloors: [],
      crossHatchShadowFace: true,
      fineTarget: fine,
      faintTarget: faint,
    });
    // Monumental fluted pilasters & entablature colonnade facing Eiffel Tower
    for (let c = -3; c <= 3; c++) {
      const colP = axisPoint(-561, side * 56 + c * 4.6, 0);
      ink.addSegment(colP[0], pavY, colP[2], colP[0], pavY + 23.5, colP[2]);
      fine.addSegment(colP[0] + 0.5, pavY, colP[2] + 0.5, colP[0] + 0.5, pavY + 23.5, colP[2] + 0.5);
    }

    // 7 overlapping seamless curved arc bays forming the famous crescent wings of Palais de Chaillot
    const wingArcSegments = 7;
    const arcRadius = 195;
    for (let s = 0; s < wingArcSegments; s++) {
      const frac = (s + 0.5) / wingArcSegments;
      const theta = frac * 0.92;
      const along = -585 + (1 - Math.cos(theta)) * arcRadius * 0.85;
      const across = side * (66 + Math.sin(theta) * arcRadius);
      const wp = axisPoint(along, across, 0);
      const wy = Math.max(14, terrainHeightAt(wp[0], wp[2]));
      const segAngle = MONUMENT_AXIS_RAD - side * theta * 0.85;
      addSolidBox(wp[0], wy, wp[2], 24, 21, 33, segAngle, materials.whiteHatchMat, chaillotEl);
      ink.addHaussmannBuilding(wp[0], wy, wp[2], 24, 21, 33, segAngle, {
        overshoot: 0.25,
        floors: 3,
        mansardHeight: 0,
        detailTier: 'high',
        balconyFloors: [],
        fineTarget: fine,
        faintTarget: faint,
      });
    }
  }

  // Parvis des Droits de l'Homme paving grid & Place du Trocadéro circular plaza + Maréchal Foch statue
  for (let gx = -38; gx <= 38; gx += 12) {
    const a = axisPoint(-555, gx, 0.35);
    const b = axisPoint(-645, gx, 0.35);
    faint.addSegment(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  const trocRound = axisPoint(-705, 0, 0.25);
  ink.addHorizontalCircle(trocRound[0], trocRound[1], trocRound[2], 46, 40);
  ink.addHorizontalCircle(trocRound[0], trocRound[1], trocRound[2], 32, 32);
  fine.addHorizontalCircle(trocRound[0], trocRound[1], trocRound[2], 14, 24);
  addEquestrianStatue(trocRound[0], trocRound[1], trocRound[2], MONUMENT_AXIS_RAD, 1.2);

  // ---------------------------------------------------------------------------
  // 7. MUSÉE DU QUAI BRANLY – JACQUES CHIRAC (Jean Nouvel bridge gallery & garden)
  // ---------------------------------------------------------------------------
  const branlyEl = createMonumentElement('musee-quai-branly');
  const branly = latLngToLocal(48.8609, 2.2979);
  const branlyRot = -0.58;
  const bCos = Math.cos(branlyRot);
  const bSin = Math.sin(branlyRot);
  addSolidBox(branly.x, 5.5, branly.z, 178, 13.5, 25, branlyRot, materials.whiteHatchMat, branlyEl);
  ink.addOrientedBox(branly.x, 5.5, branly.z, 178, 13.5, 25, branlyRot, {
    overshoot: 0.4,
    floors: 3,
    windowBays: 24,
  });
  // Angled steel pilotis stilts, 12 cantilevered gallery boxes & dense riverside garden grove
  for (let i = -6; i <= 6; i++) {
    const lx = i * 14;
    const px = branly.x + lx * bCos;
    const pz = branly.z + lx * bSin;
    ink.addSegment(px, 0, pz, px, 5.5, pz);
    ink.addSegment(px - 2.5 * bCos, 0, pz - 2.5 * bSin, px + 1.5 * bCos, 5.5, pz + 1.5 * bSin);
    // Cantilevered protruding Jean Nouvel architectural boxes!
    if (i > -6 && i < 6) {
      const boxH = 5.5 + ((Math.abs(i) * 3) % 4);
      const boxD = 7.5 + (Math.abs(i) % 2) * 3.0;
      const bx = branly.x + lx * bCos - (-14.5) * bSin;
      const bz = branly.z + lx * bSin + (-14.5) * bCos;
      addSolidBox(bx, 7.2 + (i % 2) * 1.4, bz, 10.5, boxH, boxD, branlyRot, materials.whiteOcclusionMat, branlyEl);
      ink.addOrientedBox(bx, 7.2 + (i % 2) * 1.4, bz, 10.5, boxH, boxD, branlyRot, {
        overshoot: 0.2,
        windowBays: 3,
      });
    }
    // Lush museum garden trees between gallery and Quai Branly glass screen
    const tx = branly.x + lx * bCos - (-28) * bSin;
    const tz = branly.z + lx * bSin + (-28) * bCos;
    fine.addSketchTree(tx, 0, tz, 11.5, 4.4);
    treePlacements.push({
      x: tx,
      y: 0,
      z: tz,
      height: 11.5,
      canopyRadius: 4.4,
      locationLabel: 'Musée du Quai Branly Garden',
    });
  }
  // Iconic glass curtain screen wall along Quai Branly
  const gwA = [branly.x - 90 * bCos - (-38) * bSin, 0.2, branly.z - 90 * bSin + (-38) * bCos] as [number, number, number];
  const gwB = [branly.x + 90 * bCos - (-38) * bSin, 0.2, branly.z + 90 * bSin + (-38) * bCos] as [number, number, number];
  ink.addSegment(gwA[0], 0.2, gwA[2], gwB[0], 0.2, gwB[2]);
  ink.addSegment(gwA[0], 8.5, gwA[2], gwB[0], 8.5, gwB[2]);

  // ---------------------------------------------------------------------------
  // 8. PALAIS DE TOKYO & MUSÉE D'ART MODERNE (1937 Colonnaded Twin Wings)
  // ---------------------------------------------------------------------------
  const tokyoEl = createMonumentElement('palais-tokyo');
  const tokyo = latLngToLocal(48.8641, 2.2966);
  const tokyoY = Math.max(8, terrainHeightAt(tokyo.x, tokyo.z));
  const tokyoRot = -0.54;
  const tCos = Math.cos(tokyoRot);
  const tSin = Math.sin(tokyoRot);
  for (const offset of [-58, 58]) {
    const wx = tokyo.x + offset * tCos;
    const wz = tokyo.z + offset * tSin;
    addSolidBox(wx, tokyoY, wz, 78, 19.5, 38, tokyoRot, materials.whiteHatchMat, tokyoEl);
    ink.addHaussmannBuilding(wx, tokyoY, wz, 78, 19.5, 38, tokyoRot, {
      overshoot: 0.35,
      floors: 3,
      mansardHeight: 0,
      detailTier: 'high',
      balconyFloors: [],
      fineTarget: fine,
      faintTarget: faint,
    });
  }
  // Connecting central colonnade peristyle + stepped basin terrace toward Seine
  addSolidBox(tokyo.x - 10, tokyoY, tokyo.z - 16, 178, 16.5, 16, tokyoRot, materials.whiteHatchMat, tokyoEl);
  ink.addOrientedBox(tokyo.x - 10, tokyoY, tokyo.z - 16, 178, 16.5, 16, tokyoRot, {
    overshoot: 0.3,
    windowBays: 24,
  });
  for (let c = -8; c <= 8; c++) {
    const cx = tokyo.x + c * 9 * tCos;
    const cz = tokyo.z + c * 9 * tSin;
    ink.addSegment(cx, tokyoY, cz, cx, tokyoY + 16.5, cz);
  }

  // ---------------------------------------------------------------------------
  // 9. CATHÉDRALE DE LA SAINTE-TRINITÉ (5 Detailed Ribbed Onion Domes + Sanctuary)
  // ---------------------------------------------------------------------------
  const cathEl = createMonumentElement('holy-trinity');
  const cath = latLngToLocal(48.8617, 2.3011);
  addSolidBox(cath.x, 0, cath.z, 28, 20.5, 28, 0.35, materials.whiteHatchMat, cathEl);
  ink.addHaussmannBuilding(cath.x, 0, cath.z, 28, 20.5, 28, 0.35, {
    overshoot: 0.35,
    floors: 3,
    mansardHeight: 0,
    detailTier: 'hero',
    balconyFloors: [],
    fineTarget: fine,
    faintTarget: faint,
  });
  const addOnionDome = (dx: number, baseY: number, dz: number, maxR: number, height: number) => {
    const rings = 8;
    const ribs = 12;
    const profile = (u: number) => Math.sin(u * Math.PI) * (1 - 0.24 * u) * maxR;
    for (let r = 0; r < rings; r++) {
      const u0 = r / rings;
      const u1 = (r + 1) / rings;
      const r0 = profile(u0);
      const r1 = profile(u1);
      const y0 = baseY + u0 * height;
      const y1 = baseY + u1 * height;
      if (r0 > 0.2) ink.addHorizontalCircle(dx, y0, dz, r0, ribs);
      for (let k = 0; k < ribs; k++) {
        const a = (k / ribs) * Math.PI * 2;
        ink.addSegment(
          dx + Math.cos(a) * r0,
          y0,
          dz + Math.sin(a) * r0,
          dx + Math.cos(a) * r1,
          y1,
          dz + Math.sin(a) * r1
        );
      }
    }
    // Orthodox triple-bar cross finial
    ink.addSegment(dx, baseY + height, dz, dx, baseY + height + 4.2, dz);
    ink.addSegment(dx - 1.1, baseY + height + 2.8, dz, dx + 1.1, baseY + height + 2.8, dz);
    ink.addSegment(dx - 0.7, baseY + height + 3.6, dz, dx + 0.7, baseY + height + 3.6, dz);
  };
  addOnionDome(cath.x, 20.5, cath.z, 5.4, 15.0);
  for (const [ox, oz] of [
    [8.6, 8.6],
    [-8.6, 8.6],
    [8.6, -8.6],
    [-8.6, -8.6],
  ]) {
    addOnionDome(cath.x + ox, 20.5, cath.z + oz, 3.0, 9.8);
  }

  // ---------------------------------------------------------------------------
  // 10. FRONT DE SEINE / BEAUGRENELLE MODERNIST TOWERS (SW riverfront inside 3 km²)
  // ---------------------------------------------------------------------------
  const frontEl = createMonumentElement('front-de-seine');
  const frontDeSeineTowers: Array<{ lat: number; lng: number; w: number; d: number; h: number; rot: number; totem?: boolean }> = [
    { lat: 48.8529, lng: 2.2881, w: 32, d: 28, h: 98, rot: 0.65, totem: true }, // Iconic stacked Tour Totem
    { lat: 48.8522, lng: 2.2869, w: 28, d: 28, h: 98, rot: 0.55 },
    { lat: 48.8515, lng: 2.2858, w: 30, d: 26, h: 94, rot: 0.62 },
    { lat: 48.8510, lng: 2.2874, w: 34, d: 24, h: 98, rot: 0.58 },
    { lat: 48.8504, lng: 2.2845, w: 28, d: 28, h: 92, rot: 0.52 },
  ];
  for (const tw of frontDeSeineTowers) {
    const p = latLngToLocal(tw.lat, tw.lng);
    if (Math.hypot(p.x, p.z) > RADIUS_3KM2 - 25) continue;
    if (tw.totem) {
      // Tour Totem: sculptural stacked cantilevered concrete blocks around central core
      addSolidBox(p.x, 0, p.z, 18, tw.h, 18, tw.rot, materials.whiteHatchMat, frontEl);
      ink.addOrientedBox(p.x, 0, p.z, 18, tw.h, 18, tw.rot, { overshoot: 0.4, floors: 24 });
      for (let tier = 0; tier < 5; tier++) {
        const ty = 12 + tier * 17;
        const bw = tier % 2 === 0 ? 34 : 24;
        const bd = tier % 2 === 0 ? 22 : 32;
        addSolidBox(p.x, ty, p.z, bw, 13, bd, tw.rot, materials.whiteHatchMat, frontEl);
        ink.addOrientedBox(p.x, ty, p.z, bw, 13, bd, tw.rot, {
          overshoot: 0.3,
          floors: 3,
          windowBays: 8,
        });
      }
    } else {
      addSolidBox(p.x, 0, p.z, tw.w, tw.h, tw.d, tw.rot, materials.whiteHatchMat, frontEl);
      ink.addOrientedBox(p.x, 0, p.z, tw.w, tw.h, tw.d, tw.rot, {
        overshoot: 0.45,
        floors: 22,
        windowBays: 9,
      });
      // Rooftop mechanical crown
      ink.addOrientedBox(p.x, tw.h, p.z, tw.w * 0.55, 5.5, tw.d * 0.55, tw.rot, { overshoot: 0.2 });
    }
  }

  // ---------------------------------------------------------------------------
  // 11. ANIMATED 3D BLACK-INK BATEAUX MOUCHES (3 detailed riverboats gliding on Seine)
  // ---------------------------------------------------------------------------
  const createBoatGroup = (boatIndex: number): THREE.Group => {
    const bGroup = new THREE.Group();
    const bInk = new SketchLineCollector(777 + boatIndex);
    const shipEl = createRiverShipElement(boatIndex);

    const hullGeo = new THREE.BoxGeometry(30, 2.6, 7.6);
    const hull = new THREE.Mesh(hullGeo, materials.whiteOcclusionMat);
    hull.position.set(0, 1.3, 0);
    hull.userData.pickElement = shipEl;
    bGroup.add(hull);
    solidMeshes.push(hull);
    pickableMeshes.push(hull);

    const cabinGeo = new THREE.BoxGeometry(22, 3.2, 6.2);
    const cabin = new THREE.Mesh(cabinGeo, materials.whiteOcclusionMat);
    cabin.position.set(-1.0, 3.9, 0);
    cabin.userData.pickElement = shipEl;
    bGroup.add(cabin);
    solidMeshes.push(cabin);
    pickableMeshes.push(cabin);

    bInk.addOrientedBox(0, 0.1, 0, 28, 2.4, 7.2, 0, { overshoot: 0.25 });
    bInk.addOrientedBox(-1.0, 2.5, 0, 21, 2.6, 5.8, 0, { overshoot: 0.2, windowBays: 10 });
    // Upper open sightseeing deck railing
    bInk.addOrientedBox(-1.0, 5.1, 0, 19, 0.9, 5.2, 0, { overshoot: 0.1, windowBays: 10 });
    bInk.addSegment(14, 0.2, -3.6, 18.8, 1.6, 0);
    bInk.addSegment(14, 0.2, 3.6, 18.8, 1.6, 0);
    bInk.addSegment(14, 2.5, -3.6, 18.8, 2.4, 0);
    bInk.addSegment(14, 2.5, 3.6, 18.8, 2.4, 0);
    // Sketched V-wake lines trailing behind stern
    bInk.addSegment(-14, 0.1, -3.2, -36, 0.1, -10.5);
    bInk.addSegment(-14, 0.1, 3.2, -36, 0.1, 10.5);
    bInk.addSegment(-15, 0.1, 0, -32, 0.1, 0);

    const bLineGeo = new THREE.BufferGeometry();
    bLineGeo.setAttribute('position', new THREE.BufferAttribute(bInk.toFloat32Array(), 3));
    const bLines = new THREE.LineSegments(bLineGeo, materials.inkLinePrimary);
    bGroup.add(bLines);
    lineObjects.push(bLines);
    return bGroup;
  };

  const boats: AnimatedRiverBoat[] = [
    { group: createBoatGroup(0), t: 0.22, speed: 0.0085, laneOffset: 24, direction: 1 },
    { group: createBoatGroup(1), t: 0.54, speed: 0.0075, laneOffset: -24, direction: -1 },
    { group: createBoatGroup(2), t: 0.78, speed: 0.008, laneOffset: 38, direction: 1 },
  ];
  for (const b of boats) group.add(b.group);

  // ---------------------------------------------------------------------------
  // 12. ANIMATED PARIS MÉTRO LINE 6 TRAIN ON BIR-HAKEIM VIADUCT
  // ---------------------------------------------------------------------------
  const metroEl = createMetroTrainElement();
  const metroGroup = new THREE.Group();
  const mInk = new SketchLineCollector(606);
  const carCount = 5;
  const carLen = 13.5;
  for (let c = 0; c < carCount; c++) {
    const ox = (c - (carCount - 1) * 0.5) * (carLen + 1.0);
    const cGeo = new THREE.BoxGeometry(carLen, 3.1, 2.8);
    const cMesh = new THREE.Mesh(cGeo, materials.whiteOcclusionMat);
    cMesh.position.set(ox, 1.7, 0);
    cMesh.userData.pickElement = metroEl;
    metroGroup.add(cMesh);
    solidMeshes.push(cMesh);
    pickableMeshes.push(cMesh);
    mInk.addOrientedBox(ox, 0.2, 0, carLen, 3.1, 2.8, 0, { overshoot: 0.12, windowBays: 6 });
  }
  const mLineGeo = new THREE.BufferGeometry();
  mLineGeo.setAttribute('position', new THREE.BufferAttribute(mInk.toFloat32Array(), 3));
  const mLines = new THREE.LineSegments(mLineGeo, materials.inkLinePrimary);
  metroGroup.add(mLines);
  lineObjects.push(mLines);
  group.add(metroGroup);

  const metroTrain: AnimatedMetroTrain = {
    group: metroGroup,
    t: 0.35,
    speed: 0.032,
    direction: 1,
  };

  // Assemble batched landmark ink layers
  const primaryGeo = new THREE.BufferGeometry();
  primaryGeo.setAttribute('position', new THREE.BufferAttribute(ink.toFloat32Array(), 3));
  const primaryLines = new THREE.LineSegments(primaryGeo, materials.inkLinePrimary);
  primaryLines.name = 'LandmarksPrimaryInk';
  group.add(primaryLines);
  lineObjects.push(primaryLines);

  const fineGeo = new THREE.BufferGeometry();
  fineGeo.setAttribute('position', new THREE.BufferAttribute(fine.toFloat32Array(), 3));
  const fineLines = new THREE.LineSegments(fineGeo, materials.inkLineFine);
  fineLines.name = 'LandmarksFineInk';
  group.add(fineLines);
  lineObjects.push(fineLines);

  const faintGeo = new THREE.BufferGeometry();
  faintGeo.setAttribute('position', new THREE.BufferAttribute(faint.toFloat32Array(), 3));
  const faintLines = new THREE.LineSegments(faintGeo, materials.inkLineFaint);
  faintLines.name = 'LandmarksFaintInk';
  group.add(faintLines);
  lineObjects.push(faintLines);

  return {
    group,
    solidMeshes,
    pickableMeshes,
    treePlacements,
    lineObjects,
    seineCurve,
    metroCurve,
    boats,
    metroTrain,
  };
}
