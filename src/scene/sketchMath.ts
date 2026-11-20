/**
 * Pure deterministic 3D architectural ink-sketch geometry utilities.
 * Provides master draftsman primitives (Haussmannian facades with arched shopfronts,
 * framed French windows, projecting wrought-iron balconies, zinc mansard roofs with
 * lucarne dormers & chimney clusters, corner rotundas, Parisian lampposts, moored barges,
 * neoclassical colonnades, and calligraphic 3D ink-sketched trees) batched into minimal
 * draw calls.
 */

export type SketchStyleMode = 'ink-sketch' | 'pure-stick' | 'engraving';

/** Deterministic Mulberry32 PRNG for repeatable architectural ink strokes. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface HaussmannDetailOptions {
  overshoot?: number;
  floors?: number;
  mansardHeight?: number;
  detailTier?: 'hero' | 'high' | 'medium';
  balconyFloors?: number[];
  chamfered?: boolean;
  cornerRotunda?: boolean;
  crossHatchShadowFace?: boolean;
  fineTarget?: SketchLineCollector;
  faintTarget?: SketchLineCollector;
}

/**
 * High-performance line-segment accumulator for 3D ink drawing.
 * Stores pairs of 3D endpoints (x1,y1,z1, x2,y2,z2) in a flat JS array,
 * then builds a single Float32Array for a ONE-DRAW-CALL THREE.LineSegments mesh.
 */
export class SketchLineCollector {
  private coords: number[] = [];
  private rng: () => number;

  constructor(seed = 1889) {
    this.rng = createRng(seed);
  }

  get segmentCount(): number {
    return this.coords.length / 6;
  }

  /** Push a crisp structural segment. */
  addSegment(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ): void {
    this.coords.push(x1, y1, z1, x2, y2, z2);
  }

  /**
   * Push an architectural ink-pen stroke with optional slight overshoot at both ends
   * and optional subtle double-stroke sketch pass.
   */
  addInkStroke(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    options?: {
      overshoot?: number;
      jitter?: number;
      doublePass?: boolean;
    }
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;

    const overshoot = options?.overshoot ?? 0;
    const jitter = options?.jitter ?? 0;
    const inv = 1 / len;
    const ux = dx * inv;
    const uy = dy * inv;
    const uz = dz * inv;

    const ext = Math.min(overshoot, len * 0.12);
    const sx = x1 - ux * ext;
    const sy = y1 - uy * ext;
    const sz = z1 - uz * ext;
    const ex = x2 + ux * ext;
    const ey = y2 + uy * ext;
    const ez = z2 + uz * ext;

    this.coords.push(sx, sy, sz, ex, ey, ez);

    if (options?.doublePass && jitter > 0) {
      const jx1 = (this.rng() - 0.5) * jitter;
      const jy1 = (this.rng() - 0.5) * jitter;
      const jz1 = (this.rng() - 0.5) * jitter;
      const jx2 = (this.rng() - 0.5) * jitter;
      const jy2 = (this.rng() - 0.5) * jitter;
      const jz2 = (this.rng() - 0.5) * jitter;
      this.coords.push(
        x1 + jx1,
        y1 + jy1,
        z1 + jz1,
        x2 + jx2,
        y2 + jy2,
        z2 + jz2
      );
    }
  }

  /** Add a connected polyline (closed or open). */
  addPolyline(points: ReadonlyArray<[number, number, number]>, closed = false): void {
    if (points.length < 2) return;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      this.addSegment(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    if (closed && points.length > 2) {
      const last = points[points.length - 1];
      const first = points[0];
      this.addSegment(last[0], last[1], last[2], first[0], first[1], first[2]);
    }
  }

  /** Add a horizontal ring / circle at elevation y. */
  addHorizontalCircle(
    cx: number,
    y: number,
    cz: number,
    radius: number,
    segments = 32
  ): void {
    let px = cx + radius;
    let pz = cz;
    for (let i = 1; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = cx + Math.cos(a) * radius;
      const nz = cz + Math.sin(a) * radius;
      this.addSegment(px, y, pz, nx, y, nz);
      px = nx;
      pz = nz;
    }
  }

  /** Add a rotated architectural box outline (with optional facade floor/window lines). */
  addOrientedBox(
    cx: number,
    baseY: number,
    cz: number,
    width: number,
    height: number,
    depth: number,
    rotY: number,
    options?: {
      overshoot?: number;
      floors?: number;
      windowBays?: number;
      mansardHeight?: number;
    }
  ): void {
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);

    const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
      cx + lx * cos - lz * sin,
      baseY + ly,
      cz + lx * sin + lz * cos,
    ];

    const cornersBottom = [
      toWorld(-hw, 0, -hd),
      toWorld(hw, 0, -hd),
      toWorld(hw, 0, hd),
      toWorld(-hw, 0, hd),
    ];
    const cornersTop = [
      toWorld(-hw, height, -hd),
      toWorld(hw, height, -hd),
      toWorld(hw, height, hd),
      toWorld(-hw, height, hd),
    ];

    const ov = options?.overshoot ?? 0.35;
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      this.addInkStroke(
        cornersBottom[i][0],
        cornersBottom[i][1],
        cornersBottom[i][2],
        cornersBottom[next][0],
        cornersBottom[next][1],
        cornersBottom[next][2],
        { overshoot: ov }
      );
      this.addInkStroke(
        cornersTop[i][0],
        cornersTop[i][1],
        cornersTop[i][2],
        cornersTop[next][0],
        cornersTop[next][1],
        cornersTop[next][2],
        { overshoot: ov }
      );
      this.addInkStroke(
        cornersBottom[i][0],
        cornersBottom[i][1],
        cornersBottom[i][2],
        cornersTop[i][0],
        cornersTop[i][1],
        cornersTop[i][2],
        { overshoot: ov }
      );
    }

    const floors = options?.floors ?? 0;
    if (floors > 1) {
      for (let f = 1; f < floors; f++) {
        const fy = (f / floors) * height;
        const p0 = toWorld(-hw, fy, -hd);
        const p1 = toWorld(hw, fy, -hd);
        const p2 = toWorld(hw, fy, hd);
        const p3 = toWorld(-hw, fy, hd);
        this.addSegment(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
        this.addSegment(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
        this.addSegment(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
        this.addSegment(p3[0], p3[1], p3[2], p0[0], p0[1], p0[2]);
      }
    }

    const bays = options?.windowBays ?? 0;
    if (bays > 1) {
      for (let b = 1; b < bays; b++) {
        const lx = -hw + (b / bays) * width;
        const fBot = toWorld(lx, height * 0.14, hd);
        const fTop = toWorld(lx, height * 0.92, hd);
        this.addSegment(fBot[0], fBot[1], fBot[2], fTop[0], fTop[1], fTop[2]);
        const bBot = toWorld(lx, height * 0.14, -hd);
        const bTop = toWorld(lx, height * 0.92, -hd);
        this.addSegment(bBot[0], bBot[1], bBot[2], bTop[0], bTop[1], bTop[2]);
      }
    }

    const mansard = options?.mansardHeight ?? 0;
    if (mansard > 0.2) {
      const inset = Math.min(2.6, Math.min(hw, hd) * 0.35);
      const rhw = Math.max(0.5, hw - inset);
      const rhd = Math.max(0.5, hd - inset);
      const roofTop = [
        toWorld(-rhw, height + mansard, -rhd),
        toWorld(rhw, height + mansard, -rhd),
        toWorld(rhw, height + mansard, rhd),
        toWorld(-rhw, height + mansard, rhd),
      ];
      for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        this.addSegment(
          roofTop[i][0],
          roofTop[i][1],
          roofTop[i][2],
          roofTop[next][0],
          roofTop[next][1],
          roofTop[next][2]
        );
        this.addSegment(
          cornersTop[i][0],
          cornersTop[i][1],
          cornersTop[i][2],
          roofTop[i][0],
          roofTop[i][1],
          roofTop[i][2]
        );
      }
    }
  }

  /**
   * Draws a richly detailed Haussmannian Parisian building in 3D architectural ink:
   *  - Primary silhouette + heavy eaves cornice + projecting stringcourses
   *  - Arched ground-floor arcade / shopfronts
   *  - Framed French windows (portes-fenêtres) with sill, lintel & central mullion
   *  - Projecting 2nd-floor & 5th-floor continuous wrought-iron balconies (balcons filants)
   *  - Sloped zinc mansard roof with standing seam ribs, protruding lucarne dormers & chimney stacks
   *  - Optional 45° shadow cross-hatching and corner rotunda cupola
   */
  addHaussmannBuilding(
    cx: number,
    baseY: number,
    cz: number,
    width: number,
    height: number,
    depth: number,
    rotY: number,
    options?: HaussmannDetailOptions
  ): void {
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const fine = options?.fineTarget ?? this;
    const faint = options?.faintTarget ?? fine;
    const tier = options?.detailTier ?? 'high';
    const floors = options?.floors ?? 6;
    const mansard = options?.mansardHeight ?? 3.6;
    const ov = options?.overshoot ?? 0.32;

    const toW = (lx: number, ly: number, lz: number): [number, number, number] => [
      cx + lx * cos - lz * sin,
      baseY + ly,
      cz + lx * sin + lz * cos,
    ];

    // 1. Primary building silhouette & heavy cornice overhang
    const bot = [
      toW(-hw, 0, -hd),
      toW(hw, 0, -hd),
      toW(hw, 0, hd),
      toW(-hw, 0, hd),
    ];
    const top = [
      toW(-hw, height, -hd),
      toW(hw, height, -hd),
      toW(hw, height, hd),
      toW(-hw, height, hd),
    ];
    const cornice = [
      toW(-hw - 0.55, height + 0.15, -hd - 0.55),
      toW(hw + 0.55, height + 0.15, -hd - 0.55),
      toW(hw + 0.55, height + 0.15, hd + 0.55),
      toW(-hw - 0.55, height + 0.15, hd + 0.55),
    ];

    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      this.addInkStroke(bot[i][0], bot[i][1], bot[i][2], bot[next][0], bot[next][1], bot[next][2], {
        overshoot: ov,
      });
      this.addInkStroke(top[i][0], top[i][1], top[i][2], top[next][0], top[next][1], top[next][2], {
        overshoot: ov,
      });
      this.addInkStroke(bot[i][0], bot[i][1], bot[i][2], top[i][0], top[i][1], top[i][2], {
        overshoot: ov,
      });
      // Projecting Haussmannian eaves cornice line
      this.addSegment(
        cornice[i][0],
        cornice[i][1],
        cornice[i][2],
        cornice[next][0],
        cornice[next][1],
        cornice[next][2]
      );
    }

    // 2. Horizontal stone stringcourses & projecting wrought-iron balconies (2nd & 5th floors!)
    const floorH = height / floors;
    const balconyFloors = options?.balconyFloors ?? [2, Math.max(3, floors - 1)];

    for (let f = 1; f < floors; f++) {
      const fy = f * floorH;
      const isBalcony = balconyFloors.includes(f);
      const p0 = toW(-hw, fy, -hd);
      const p1 = toW(hw, fy, -hd);
      const p2 = toW(hw, fy, hd);
      const p3 = toW(-hw, fy, hd);

      // Stone stringcourse belt
      fine.addSegment(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
      fine.addSegment(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      fine.addSegment(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
      fine.addSegment(p3[0], p3[1], p3[2], p0[0], p0[1], p0[2]);

      // Iconic projecting Parisian balcony slab & wrought-iron handrail!
      if (isBalcony) {
        const proj = 0.85;
        const railH = 1.05;
        const bSlab = [
          toW(-hw - proj, fy, -hd - proj),
          toW(hw + proj, fy, -hd - proj),
          toW(hw + proj, fy, hd + proj),
          toW(-hw - proj, fy, hd + proj),
        ];
        const bRail = [
          toW(-hw - proj, fy + railH, -hd - proj),
          toW(hw + proj, fy + railH, -hd - proj),
          toW(hw + proj, fy + railH, hd + proj),
          toW(-hw - proj, fy + railH, hd + proj),
        ];
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          this.addSegment(
            bSlab[i][0],
            bSlab[i][1],
            bSlab[i][2],
            bSlab[next][0],
            bSlab[next][1],
            bSlab[next][2]
          );
          fine.addSegment(
            bRail[i][0],
            bRail[i][1],
            bRail[i][2],
            bRail[next][0],
            bRail[next][1],
            bRail[next][2]
          );
          // Corner railing stanchion
          fine.addSegment(
            bSlab[i][0],
            bSlab[i][1],
            bSlab[i][2],
            bRail[i][0],
            bRail[i][1],
            bRail[i][2]
          );
        }
      }
    }

    // 3. Detailed French Window Bays & Arched Ground-Floor Shopfronts on all 4 facades
    const drawFacadeWindows = (
      faceLen: number,
      mapPt: (u: number, ly: number, outOff: number) => [number, number, number]
    ) => {
      const baySpacing = tier === 'hero' ? 3.8 : tier === 'high' ? 4.4 : 5.4;
      const bays = Math.max(2, Math.floor((faceLen - 2.4) / baySpacing));
      const actualSpacing = (faceLen - 2.4) / bays;
      const winHalfW = Math.min(0.88, actualSpacing * 0.28);

      for (let b = 0; b < bays; b++) {
        const uCenter = -faceLen * 0.5 + 1.2 + (b + 0.5) * actualSpacing;

        // Ground-floor arched shopfront / porte-cochère (floor 0)
        const archW = Math.min(1.25, actualSpacing * 0.36);
        const archSpringY = floorH * 0.62;
        const archCrownY = floorH * 0.88;
        const gBL = mapPt(uCenter - archW, 0.15, 0.08);
        const gBR = mapPt(uCenter + archW, 0.15, 0.08);
        const gSL = mapPt(uCenter - archW, archSpringY, 0.08);
        const gSR = mapPt(uCenter + archW, archSpringY, 0.08);
        const gTop = mapPt(uCenter, archCrownY, 0.08);
        const gMidL = mapPt(uCenter - archW * 0.65, archCrownY - 0.25, 0.08);
        const gMidR = mapPt(uCenter + archW * 0.65, archCrownY - 0.25, 0.08);
        fine.addSegment(gBL[0], gBL[1], gBL[2], gSL[0], gSL[1], gSL[2]);
        fine.addSegment(gBR[0], gBR[1], gBR[2], gSR[0], gSR[1], gSR[2]);
        fine.addPolyline([gSL, gMidL, gTop, gMidR, gSR], false);

        // Upper-floor tall Parisian French windows (portes-fenêtres)
        for (let f = 1; f < floors; f++) {
          const sillY = f * floorH + floorH * 0.12;
          const headY = (f + 1) * floorH - floorH * 0.16;
          const wBL = mapPt(uCenter - winHalfW, sillY, 0.08);
          const wBR = mapPt(uCenter + winHalfW, sillY, 0.08);
          const wTL = mapPt(uCenter - winHalfW, headY, 0.08);
          const wTR = mapPt(uCenter + winHalfW, headY, 0.08);

          // Window frame rectangle
          fine.addSegment(wBL[0], wBL[1], wBL[2], wTL[0], wTL[1], wTL[2]);
          fine.addSegment(wBR[0], wBR[1], wBR[2], wTR[0], wTR[1], wTR[2]);
          fine.addSegment(wTL[0], wTL[1], wTL[2], wTR[0], wTR[1], wTR[2]);
          fine.addSegment(wBL[0], wBL[1], wBL[2], wBR[0], wBR[1], wBR[2]);

          // On hero/high tier, add central French casement mullion + pediment cap
          if (tier !== 'medium') {
            const mB = mapPt(uCenter, sillY, 0.08);
            const mT = mapPt(uCenter, headY, 0.08);
            faint.addSegment(mB[0], mB[1], mB[2], mT[0], mT[1], mT[2]);
            // Decorative lintel cap above 2nd & 3rd floor windows
            if (f === 2 || f === 3) {
              const capL = mapPt(uCenter - winHalfW - 0.22, headY + 0.22, 0.14);
              const capR = mapPt(uCenter + winHalfW + 0.22, headY + 0.22, 0.14);
              fine.addSegment(capL[0], capL[1], capL[2], capR[0], capR[1], capR[2]);
            }
          }
        }
      }
    };

    // Draw windows on +Z and -Z faces
    drawFacadeWindows(width, (u, ly, out) => toW(u, ly, hd + out));
    drawFacadeWindows(width, (u, ly, out) => toW(u, ly, -hd - out));
    // Draw windows on +X and -X faces
    drawFacadeWindows(depth, (u, ly, out) => toW(hw + out, ly, u));
    drawFacadeWindows(depth, (u, ly, out) => toW(-hw - out, ly, u));

    // Optional architectural shadow-side diagonal pen hatching on two faces
    if (options?.crossHatchShadowFace) {
      const hatchSpacing = tier === 'hero' ? 2.6 : 3.6;
      const steps = Math.max(3, Math.floor(width / hatchSpacing));
      for (let i = 0; i < steps; i++) {
        const u0 = -hw + (i / steps) * width;
        const u1 = Math.min(hw, u0 + height * 0.45);
        const yEnd = Math.min(height, ((u1 - u0) / 0.45));
        const a = toW(u0, 0.2, -hd - 0.06);
        const b = toW(u1, yEnd, -hd - 0.06);
        faint.addSegment(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }

    // 4. Sloped Parisian Zinc Mansard Roof + Standing Seams + Protruding Lucarne Dormers + Chimneys
    if (mansard > 0.3) {
      const inset = Math.min(2.6, Math.min(hw, hd) * 0.32);
      const rhw = Math.max(0.8, hw - inset);
      const rhd = Math.max(0.8, hd - inset);
      const roofTop = [
        toW(-rhw, height + mansard, -rhd),
        toW(rhw, height + mansard, -rhd),
        toW(rhw, height + mansard, rhd),
        toW(-rhw, height + mansard, rhd),
      ];

      for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        this.addSegment(
          roofTop[i][0],
          roofTop[i][1],
          roofTop[i][2],
          roofTop[next][0],
          roofTop[next][1],
          roofTop[next][2]
        );
        this.addSegment(
          top[i][0],
          top[i][1],
          top[i][2],
          roofTop[i][0],
          roofTop[i][1],
          roofTop[i][2]
        );
      }

      // Standing-seam zinc roof ribs + protruding dormer windows (lucarnes) along long slopes
      const dormerCount = Math.max(2, Math.floor(width / (tier === 'medium' ? 7.5 : 5.4)));
      for (const zSign of [-1, 1]) {
        for (let d = 0; d < dormerCount; d++) {
          const frac = (d + 0.5) / dormerCount;
          const ux = -hw + 2.0 + frac * Math.max(1, width - 4.0);
          const rx = -rhw + 1.4 + frac * Math.max(0.5, rhw * 2 - 2.8);

          // Zinc roof seam rib
          const sBot = toW(ux, height, zSign * hd);
          const sTop = toW(rx, height + mansard, zSign * rhd);
          faint.addSegment(sBot[0], sBot[1], sBot[2], sTop[0], sTop[1], sTop[2]);

          // Protruding Parisian lucarne dormer window frame with curved/gabled hood!
          const dW = 0.85;
          const dBaseY = height + 0.35;
          const dTopY = height + mansard * 0.78;
          const zFace = zSign * (hd - inset * 0.25);
          const zBack = zSign * (hd - inset * 0.82);

          const flB = toW(ux - dW, dBaseY, zFace);
          const frB = toW(ux + dW, dBaseY, zFace);
          const flT = toW(ux - dW, dTopY, zFace);
          const frT = toW(ux + dW, dTopY, zFace);
          const peak = toW(ux, dTopY + 0.65, zFace);
          const peakBack = toW(ux, dTopY + 0.65, zBack);

          fine.addPolyline([flB, flT, peak, frT, frB, flB], false);
          fine.addSegment(peak[0], peak[1], peak[2], peakBack[0], peakBack[1], peakBack[2]);
        }
      }

      // Iconic Parisian brick chimney stacks & terracotta chimney pots along roof ridge
      const chimneyClusters = tier === 'medium' ? 1 : 2;
      for (let c = 0; c < chimneyClusters; c++) {
        const chU = (c === 0 ? -0.3 : 0.3) * rhw * 2;
        const chZ = (c === 0 ? 0.45 : -0.45) * rhd;
        const chCenter = toW(chU, 0, chZ);
        fine.addOrientedBox(
          chCenter[0],
          baseY + height + mansard - 0.1,
          chCenter[2],
          2.6,
          2.8,
          1.2,
          rotY,
          { overshoot: 0.08 }
        );
        // 3 little Parisian chimney pots on top of stack
        for (const pOff of [-0.75, 0, 0.75]) {
          const potBot = toW(chU + pOff, height + mansard + 2.7, chZ);
          const potTop = toW(chU + pOff, height + mansard + 3.45, chZ);
          fine.addSegment(potBot[0], potBot[1], potBot[2], potTop[0], potTop[1], potTop[2]);
        }
      }
    }

    // 5. Optional Parisian Corner Rotunda Dome (classic Haussmannian grand avenue corner!)
    if (options?.cornerRotunda) {
      const rCenter = toW(hw - 1.2, 0, hd - 1.2);
      const rotRadius = Math.min(5.2, Math.min(hw, hd) * 0.36);
      const domeBaseY = baseY + height + mansard * 0.5;
      const domeH = 6.8;
      const ribs = 10;
      const rings = 4;
      for (let r = 0; r < rings; r++) {
        const u0 = r / rings;
        const u1 = (r + 1) / rings;
        const rad0 = Math.cos(u0 * Math.PI * 0.5) * rotRadius;
        const rad1 = Math.cos(u1 * Math.PI * 0.5) * rotRadius;
        const y0 = domeBaseY + Math.sin(u0 * Math.PI * 0.5) * domeH;
        const y1 = domeBaseY + Math.sin(u1 * Math.PI * 0.5) * domeH;
        this.addHorizontalCircle(rCenter[0], y0, rCenter[2], rad0, ribs);
        for (let k = 0; k < ribs; k++) {
          const a = (k / ribs) * Math.PI * 2;
          fine.addSegment(
            rCenter[0] + Math.cos(a) * rad0,
            y0,
            rCenter[2] + Math.sin(a) * rad0,
            rCenter[0] + Math.cos(a) * rad1,
            y1,
            rCenter[2] + Math.sin(a) * rad1
          );
        }
      }
      // Finial spike
      this.addSegment(
        rCenter[0],
        domeBaseY + domeH,
        rCenter[2],
        rCenter[0],
        domeBaseY + domeH + 2.8,
        rCenter[2]
      );
    }
  }

  /**
   * Add a classic Parisian cast-iron streetlamp (réverbère) with pedestal, post,
   * curved bracket and hexagonal lantern frame.
   */
  addParisStreetLamp(x: number, baseY: number, z: number, height = 5.4): void {
    // Pedestal + slender post
    this.addSegment(x, baseY, z, x, baseY + height, z);
    this.addHorizontalCircle(x, baseY + 0.15, z, 0.38, 6);
    this.addHorizontalCircle(x, baseY + 1.1, z, 0.24, 6);
    // Hexagonal lantern globe at crown
    const lanBase = baseY + height;
    const lanTop = baseY + height + 1.05;
    this.addHorizontalCircle(x, lanBase + 0.25, z, 0.36, 6);
    this.addHorizontalCircle(x, lanTop - 0.15, z, 0.48, 6);
    for (let i = 0; i < 6; i += 2) {
      const a = (i / 6) * Math.PI * 2;
      this.addSegment(
        x + Math.cos(a) * 0.36,
        lanBase + 0.25,
        z + Math.sin(a) * 0.36,
        x + Math.cos(a) * 0.48,
        lanTop - 0.15,
        z + Math.sin(a) * 0.48
      );
      this.addSegment(
        x + Math.cos(a) * 0.48,
        lanTop - 0.15,
        z + Math.sin(a) * 0.48,
        x,
        lanTop + 0.28,
        z
      );
    }
  }

  /**
   * Add a moored Parisian Seine river barge (péniche) with tapered bow/stern,
   * cabin windows, wheelhouse, bollards, and sketched water ripples.
   */
  addMooredBarge(
    cx: number,
    waterY: number,
    cz: number,
    length: number,
    beam: number,
    rotY: number,
    faintTarget?: SketchLineCollector
  ): void {
    const hl = length * 0.42;
    const hb = beam * 0.5;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const toW = (lx: number, ly: number, lz: number): [number, number, number] => [
      cx + lx * cos - lz * sin,
      waterY + ly,
      cz + lx * sin + lz * cos,
    ];

    // Hull box + pointed bow & stern prows
    this.addOrientedBox(cx, waterY, cz, length * 0.84, 1.8, beam, rotY, { overshoot: 0.15 });
    const bowTip = toW(length * 0.52, 1.4, 0);
    const sternTip = toW(-length * 0.52, 1.4, 0);
    for (const zS of [-hb, hb]) {
      const fB = toW(hl, 0.1, zS);
      const fT = toW(hl, 1.8, zS);
      const rB = toW(-hl, 0.1, zS);
      const rT = toW(-hl, 1.8, zS);
      this.addSegment(fB[0], fB[1], fB[2], bowTip[0], bowTip[1], bowTip[2]);
      this.addSegment(fT[0], fT[1], fT[2], bowTip[0], bowTip[1], bowTip[2]);
      this.addSegment(rB[0], rB[1], rB[2], sternTip[0], sternTip[1], sternTip[2]);
      this.addSegment(rT[0], rT[1], rT[2], sternTip[0], sternTip[1], sternTip[2]);
    }
    // Long low deckhouse cabin + aft wheelhouse
    this.addOrientedBox(cx, waterY + 1.8, cz, length * 0.58, 1.9, beam * 0.78, rotY, {
      overshoot: 0.1,
      windowBays: 7,
    });
    const wheelPos = toW(-length * 0.28, 0, 0);
    this.addOrientedBox(wheelPos[0], waterY + 3.7, wheelPos[2], 4.2, 1.8, beam * 0.62, rotY, {
      overshoot: 0.08,
      windowBays: 2,
    });

    // Subtle water reflection lines around the hull
    const faint = faintTarget ?? this;
    for (const zOff of [-hb - 1.1, hb + 1.1]) {
      const a = toW(-length * 0.45, 0.06, zOff);
      const b = toW(length * 0.45, 0.06, zOff);
      faint.addSegment(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  /**
   * Add a lush 3D ink-sketched Parisian tree (tapered trunk, branching limbs,
   * calligraphic multi-loop foliage crown, and square tree grate).
   */
  addSketchTree(
    x: number,
    baseY: number,
    z: number,
    height: number,
    canopyRadius: number
  ): void {
    const trunkTop = baseY + height * 0.44;
    // Double-stroke trunk for architectural weight
    this.addSegment(x - 0.18, baseY, z, x - 0.08, trunkTop, z);
    this.addSegment(x + 0.18, baseY, z, x + 0.08, trunkTop, z);

    // 5 branching limbs reaching into crown
    const branches = 5;
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2 + this.rng() * 0.6;
      const bx = x + Math.cos(a) * canopyRadius * 0.72;
      const bz = z + Math.sin(a) * canopyRadius * 0.72;
      const by = baseY + height * (0.66 + this.rng() * 0.2);
      this.addSegment(x, trunkTop * 0.84 + baseY * 0.16, z, bx, by, bz);
    }

    // Three crossed calligraphic sketch loops + horizontal foliage crown contour
    const cy = baseY + height * 0.71;
    const ry = height * 0.31;
    const segs = 10;
    for (let plane = 0; plane < 3; plane++) {
      const phi = (plane / 3) * Math.PI + this.rng() * 0.45;
      const cPhi = Math.cos(phi);
      const sPhi = Math.sin(phi);
      let prevX = 0;
      let prevY = 0;
      let prevZ = 0;
      for (let i = 0; i <= segs; i++) {
        const t = (i / segs) * Math.PI * 2;
        const wobble = 0.84 + 0.3 * this.rng();
        const lx = Math.cos(t) * canopyRadius * wobble;
        const ly = Math.sin(t) * ry * (0.9 + 0.18 * Math.cos(t * 3));
        const wx = x + lx * cPhi;
        const wy = cy + ly;
        const wz = z + lx * sPhi;
        if (i > 0) {
          this.addSegment(prevX, prevY, prevZ, wx, wy, wz);
        }
        prevX = wx;
        prevY = wy;
        prevZ = wz;
      }
    }
    this.addHorizontalCircle(x, cy - ry * 0.15, z, canopyRadius * 0.94, 10);
  }

  /** Export flat Float32Array for THREE.BufferAttribute(array, 3). */
  toFloat32Array(): Float32Array {
    return new Float32Array(this.coords);
  }
}

/** Validate that a Float32Array contains no NaN or Infinity values. */
export function isFiniteBuffer(arr: Float32Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return false;
  }
  return true;
}
