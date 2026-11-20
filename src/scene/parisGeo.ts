/**
 * Accurate Parisian geographic coordinate system centered on the Eiffel Tower.
 *
 * Coordinate convention (1 Three.js world unit = 1 meter):
 *   Origin (0, 0, 0) = Center of Eiffel Tower (48.85837° N, 2.29448° E)
 *   +X = East, -X = West
 *   +Z = South, -Z = North
 *   +Y = Elevation above Champ de Mars datum (0m)
 *
 * 3 km² circular area => Area = π r² = 3,000,000 m² => r ≈ 977.205 m.
 */

export const EIFFEL_ORIGIN = {
  lat: 48.85837,
  lng: 2.29448,
} as const;

export const AREA_KM2 = 3.0;
export const RADIUS_3KM2 = Math.sqrt((AREA_KM2 * 1_000_000) / Math.PI); // ~977.205 m

/**
 * Axis angle of the Champ de Mars -> Eiffel Tower -> Trocadéro monumental spine.
 * From Eiffel Tower toward École Militaire (SE): azimuth ≈ +135.5° clockwise from North,
 * which in (X=East, Z=South) is angle ≈ +44.5° (direction (+cos, +sin) ≈ (+0.713, +0.701)).
 */
export const MONUMENT_AXIS_RAD = (44.5 * Math.PI) / 180;

const METERS_PER_DEG_LAT = 111_195;
const METERS_PER_DEG_LNG = METERS_PER_DEG_LAT * Math.cos((EIFFEL_ORIGIN.lat * Math.PI) / 180);

export interface LocalPoint2D {
  x: number;
  z: number;
}

export function latLngToLocal(lat: number, lng: number): LocalPoint2D {
  const x = (lng - EIFFEL_ORIGIN.lng) * METERS_PER_DEG_LNG;
  const z = -(lat - EIFFEL_ORIGIN.lat) * METERS_PER_DEG_LAT;
  return { x: x === 0 ? 0 : x, z: z === 0 ? 0 : z };
}

export function localToLatLng(x: number, z: number): { lat: number; lng: number } {
  return {
    lat: EIFFEL_ORIGIN.lat - z / METERS_PER_DEG_LAT,
    lng: EIFFEL_ORIGIN.lng + x / METERS_PER_DEG_LNG,
  };
}

export function distanceFromOrigin(x: number, z: number): number {
  return Math.hypot(x, z);
}

/**
 * Eiffel Tower structural silhouette math (true scale in meters).
 * Total height = 330m (300.65m iron summit + 29.35m broadcast mast).
 * Base width = 125m (half-width = 62.5m), narrowing along Gustave Eiffel's
 * wind-moment exponential/parabolic curve.
 */
export const EIFFEL_SPECS = {
  baseHalfWidth: 62.5,
  firstFloorY: 57.63,
  firstFloorHalfWidth: 35.35,
  secondFloorY: 115.73,
  secondFloorHalfWidth: 20.45,
  thirdFloorY: 276.13,
  thirdFloorHalfWidth: 9.3,
  ironSummitY: 300.65,
  antennaTipY: 330.0,
  pillarFootSize: 25.0,
} as const;

/**
 * Outer edge half-span of the Eiffel Tower silhouette at height y (0..300.65m).
 * Piece-wise smooth curve matching the real surveyed profile of the tower.
 */
export function eiffelOuterHalfWidthAt(y: number): number {
  const clamped = Math.max(0, Math.min(EIFFEL_SPECS.ironSummitY, y));
  if (clamped <= EIFFEL_SPECS.firstFloorY) {
    const t = clamped / EIFFEL_SPECS.firstFloorY;
    // Concave sweep from 62.5m to 35.35m
    return 62.5 - (62.5 - 35.35) * Math.pow(t, 0.86);
  }
  if (clamped <= EIFFEL_SPECS.secondFloorY) {
    const t =
      (clamped - EIFFEL_SPECS.firstFloorY) /
      (EIFFEL_SPECS.secondFloorY - EIFFEL_SPECS.firstFloorY);
    return 35.35 - (35.35 - 20.45) * Math.pow(t, 0.88);
  }
  if (clamped <= EIFFEL_SPECS.thirdFloorY) {
    const t =
      (clamped - EIFFEL_SPECS.secondFloorY) /
      (EIFFEL_SPECS.thirdFloorY - EIFFEL_SPECS.secondFloorY);
    // Long graceful concave shaft tapering from 20.45m to 9.3m
    return 9.3 + (20.45 - 9.3) * Math.pow(1 - t, 1.95);
  }
  // Lantern / cupola crown above 3rd floor
  const t =
    (clamped - EIFFEL_SPECS.thirdFloorY) /
    (EIFFEL_SPECS.ironSummitY - EIFFEL_SPECS.thirdFloorY);
  return 9.3 * (1 - 0.55 * t);
}

/**
 * Inner edge half-span of each of the 4 splayed legs below the 2nd floor,
 * converging into the unified central shaft just above the 2nd floor (~138m).
 */
export function eiffelInnerHalfWidthAt(y: number): number {
  const clamped = Math.max(0, y);
  if (clamped <= EIFFEL_SPECS.firstFloorY) {
    const t = clamped / EIFFEL_SPECS.firstFloorY;
    // Base pier inner edge at 37.5m (pier thickness 25m), narrowing to 18.5m at 1st floor
    return 37.5 - (37.5 - 18.5) * Math.pow(t, 0.92);
  }
  if (clamped <= EIFFEL_SPECS.secondFloorY) {
    const t =
      (clamped - EIFFEL_SPECS.firstFloorY) /
      (EIFFEL_SPECS.secondFloorY - EIFFEL_SPECS.firstFloorY);
    return 18.5 - (18.5 - 7.4) * Math.pow(t, 0.95);
  }
  if (clamped <= 155) {
    const t = (clamped - EIFFEL_SPECS.secondFloorY) / (155 - EIFFEL_SPECS.secondFloorY);
    return 7.4 * (1 - t);
  }
  return 0;
}

/**
 * Seine River centerline waypoints across the 3 km² zone (ordered NE -> SW).
 * Derived from real GPS coordinates along Pont de l'Alma -> Passerelle Debilly ->
 * Pont d'Iéna -> Pont de Bir-Hakeim -> Île aux Cygnes -> Pont de Grenelle.
 */
export const SEINE_CENTERLINE_LATLNG: ReadonlyArray<[number, number]> = [
  [48.8644, 2.3075], // East of Pont de l'Alma
  [48.8639, 2.3017], // Pont de l'Alma
  [48.8629, 2.2971], // Passerelle Debilly
  [48.8615, 2.2943], // Quai Branly bend
  [48.8602, 2.2923], // Pont d'Iéna
  [48.8581, 2.2899], // Port de Suffren
  [48.8556, 2.2876], // Pont de Bir-Hakeim
  [48.8531, 2.2846], // Île aux Cygnes mid
  [48.8508, 2.2815], // Pont Rouelle / Grenelle approach
  [48.8489, 2.2791], // Past Pont de Grenelle
];

export const SEINE_CENTERLINE: LocalPoint2D[] = SEINE_CENTERLINE_LATLNG.map(([lat, lng]) =>
  latLngToLocal(lat, lng)
);

/**
 * Signed distance from the Seine River centerline (positive = Left Bank / SE, negative = Right Bank / NW)
 * and closest river half-width at that point.
 */
export function sampleSeineProximity(x: number, z: number): {
  dist: number;
  signedDist: number;
  halfWidth: number;
  t: number;
} {
  let bestDistSq = Infinity;
  let bestSigned = 0;
  let bestT = 0;
  const n = SEINE_CENTERLINE.length - 1;

  for (let i = 0; i < n; i++) {
    const a = SEINE_CENTERLINE[i];
    const b = SEINE_CENTERLINE[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq));
    const px = a.x + dx * u;
    const pz = a.z + dz * u;
    const rx = x - px;
    const rz = z - pz;
    const dSq = rx * rx + rz * rz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      // River flows roughly SW (-X, +Z). Cross product determines Left Bank (SE) vs Right Bank (NW)
      const cross = dx * rz - dz * rx;
      bestSigned = (cross >= 0 ? -1 : 1) * Math.sqrt(dSq);
      bestT = (i + u) / n;
    }
  }

  // Seine widens slightly around Île aux Cygnes (t > 0.65)
  const halfWidth = bestT > 0.62 ? 84 : 68;
  return {
    dist: Math.sqrt(bestDistSq),
    signedDist: bestSigned,
    halfWidth,
    t: bestT,
  };
}

/**
 * Real-inspired Paris topography around the Eiffel Tower (in meters above Champ de Mars datum).
 * - Champ de Mars & Left Bank: flat ~0m
 * - Seine water level: -5.5m below quay walls
 * - Right Bank (Chaillot Hill / Trocadéro): rises gracefully up to +24m at Palais de Chaillot
 */
export function terrainHeightAt(x: number, z: number): number {
  const seine = sampleSeineProximity(x, z);
  if (seine.dist < seine.halfWidth) {
    return -5.5;
  }
  // Right Bank (NW of the Seine, signedDist < 0) rises smoothly toward Chaillot hill
  if (seine.signedDist < -seine.halfWidth) {
    const bankDist = Math.abs(seine.signedDist) - seine.halfWidth;
    const rise = Math.min(1, Math.max(0, (bankDist - 25) / 280));
    // Smoothstep elevation up to 22m at Palais de Chaillot & Place du Trocadéro
    const smooth = rise * rise * (3 - 2 * rise);
    return smooth * 22.0;
  }
  return 0;
}

export type LandmarkCategory = 'monument' | 'bridge' | 'museum' | 'park' | 'district';

export interface ParisLandmark {
  id: string;
  name: string;
  frenchName: string;
  category: LandmarkCategory;
  lat: number;
  lng: number;
  x: number;
  z: number;
  heightMeters: number;
  yearBuilt: string;
  architect: string;
  summary: string;
  distanceMeters: number;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
}

function makeLandmark(
  spec: Omit<ParisLandmark, 'x' | 'z' | 'distanceMeters' | 'cameraPos' | 'cameraTarget'> & {
    cameraOffset: [number, number, number];
    targetY?: number;
  }
): ParisLandmark {
  const { x, z } = latLngToLocal(spec.lat, spec.lng);
  const y = Math.max(0, terrainHeightAt(x, z));
  const targetY = spec.targetY ?? y + Math.min(spec.heightMeters * 0.45, 35);
  return {
    id: spec.id,
    name: spec.name,
    frenchName: spec.frenchName,
    category: spec.category,
    lat: spec.lat,
    lng: spec.lng,
    x,
    z,
    heightMeters: spec.heightMeters,
    yearBuilt: spec.yearBuilt,
    architect: spec.architect,
    summary: spec.summary,
    distanceMeters: Math.round(distanceFromOrigin(x, z)),
    cameraPos: [x + spec.cameraOffset[0], y + spec.cameraOffset[1], z + spec.cameraOffset[2]],
    cameraTarget: [x, targetY, z],
  };
}

export const PARIS_LANDMARKS: ParisLandmark[] = [
  makeLandmark({
    id: 'eiffel-tower',
    name: 'Eiffel Tower',
    frenchName: 'Tour Eiffel',
    category: 'monument',
    lat: 48.85837,
    lng: 2.29448,
    heightMeters: 330,
    yearBuilt: '1889',
    architect: 'Gustave Eiffel, Maurice Koechlin & Émile Nouguier',
    summary:
      'Wrought-iron puddle-iron lattice tower built for the 1889 Exposition Universelle. Four arched parabolic legs span 125 m at the base and rise 330 m including the broadcast antenna.',
    cameraOffset: [-265, 195, 290],
    targetY: 130,
  }),
  makeLandmark({
    id: 'trocadero',
    name: 'Palais de Chaillot & Trocadéro',
    frenchName: 'Palais de Chaillot',
    category: 'monument',
    lat: 48.86205,
    lng: 2.28825,
    heightMeters: 26,
    yearBuilt: '1937',
    architect: 'Léon Azéma, Jacques Carlu & Louis-Hippolyte Boileau',
    summary:
      'Twin curved neoclassical wings framing the Parvis des Droits de l’Homme on Chaillot Hill, stepping down via the Warsaw Fountains toward Pont d’Iéna.',
    cameraOffset: [-150, 120, -180],
    targetY: 28,
  }),
  makeLandmark({
    id: 'champ-de-mars',
    name: 'Champ de Mars',
    frenchName: 'Parc du Champ-de-Mars',
    category: 'park',
    lat: 48.8556,
    lng: 2.2983,
    heightMeters: 12,
    yearBuilt: '1765',
    architect: 'Jean-Camille Formigé (1908 redesign)',
    summary:
      'Grand 24.5-hectare formal lawn stretching 780 m between the Eiffel Tower and École Militaire, flanked by tree-lined promenades and Haussmannian residences.',
    cameraOffset: [-180, 135, 190],
    targetY: 10,
  }),
  makeLandmark({
    id: 'ecole-militaire',
    name: 'École Militaire',
    frenchName: 'École Militaire',
    category: 'monument',
    lat: 48.8526,
    lng: 2.3035,
    heightMeters: 34,
    yearBuilt: '1751–1773',
    architect: 'Ange-Jacques Gabriel',
    summary:
      'Monumental 18th-century military academy complex terminating the southeast Champ de Mars vista with a Corinthian portico and quadrangular mansard dome.',
    cameraOffset: [-190, 115, 180],
    targetY: 16,
  }),
  makeLandmark({
    id: 'pont-iena',
    name: "Pont d'Iéna",
    frenchName: "Pont d'Iéna",
    category: 'bridge',
    lat: 48.86015,
    lng: 2.2922,
    heightMeters: 12,
    yearBuilt: '1808–1814',
    architect: 'Corneille Lamandé',
    summary:
      'Five-arch masonry stone bridge spanning 155 m across the Seine directly linking the Eiffel Tower esplanade with the Trocadéro gardens.',
    cameraOffset: [165, 75, -130],
    targetY: 4,
  }),
  makeLandmark({
    id: 'pont-bir-hakeim',
    name: 'Pont de Bir-Hakeim',
    frenchName: 'Viaduc de Passy',
    category: 'bridge',
    lat: 48.8556,
    lng: 2.2876,
    heightMeters: 18,
    yearBuilt: '1905',
    architect: 'Louis Biette & Jean-Camille Formigé',
    summary:
      'Iconic double-deck riveted steel arch bridge carrying Paris Métro Line 6 overhead and roadways below across the Seine and the tip of Île aux Cygnes.',
    cameraOffset: [-190, 88, 175],
    targetY: 8,
  }),
  makeLandmark({
    id: 'quai-branly',
    name: 'Musée du Quai Branly',
    frenchName: 'Musée du Quai Branly – Jacques Chirac',
    category: 'museum',
    lat: 48.8609,
    lng: 2.2979,
    heightMeters: 20,
    yearBuilt: '2006',
    architect: 'Jean Nouvel',
    summary:
      'Elevated modernist bridge-gallery featuring cantilevered architectural boxes nestled behind a dense riverside garden along Quai Branly.',
    cameraOffset: [155, 88, -145],
    targetY: 12,
  }),
  makeLandmark({
    id: 'palais-de-tokyo',
    name: 'Palais de Tokyo',
    frenchName: 'Palais de Tokyo & MAM',
    category: 'museum',
    lat: 48.8641,
    lng: 2.2966,
    heightMeters: 22,
    yearBuilt: '1937',
    architect: 'André Aubert, Marcel Dastugue, Paul Viard & Jean-Claude Dondel',
    summary:
      'Stripped-classical 1937 twin museum wings overlooking the Seine and Passerelle Debilly with monumental colonnades and stepped terraces.',
    cameraOffset: [160, 95, -140],
    targetY: 16,
  }),
  makeLandmark({
    id: 'cathedrale-trinite',
    name: 'Holy Trinity Cathedral',
    frenchName: 'Cathédrale de la Sainte-Trinité',
    category: 'monument',
    lat: 48.8617,
    lng: 2.3011,
    heightMeters: 37,
    yearBuilt: '2016',
    architect: 'Jean-Michel Wilmotte',
    summary:
      'Contemporary limestone cathedral near Pont de l’Alma crowned by five sculpted bulbous domes rising above the Left Bank roofline.',
    cameraOffset: [130, 85, -135],
    targetY: 18,
  }),
  makeLandmark({
    id: 'passerelle-debilly',
    name: 'Passerelle Debilly',
    frenchName: 'Passerelle Debilly',
    category: 'bridge',
    lat: 48.8629,
    lng: 2.2971,
    heightMeters: 15,
    yearBuilt: '1900',
    architect: 'Jean Résal & Amédée Alby',
    summary:
      'Graceful single-span steel arch pedestrian footbridge built for the 1900 World’s Fair linking Quai Branly to Avenue de New York.',
    cameraOffset: [145, 72, -125],
    targetY: 6,
  }),
  makeLandmark({
    id: 'pont-alma',
    name: "Pont de l'Alma",
    frenchName: "Pont de l'Alma",
    category: 'bridge',
    lat: 48.86395,
    lng: 2.30175,
    heightMeters: 14,
    yearBuilt: '1856 / 1974',
    architect: 'Paul-Martin Gallocher de Lagalisserie',
    summary:
      'Steel girder bridge spanning the Seine at the northeastern boundary of the 3 km² zone, famous for the Zouave flood-gauge statue.',
    cameraOffset: [165, 88, -145],
    targetY: 6,
  }),
  makeLandmark({
    id: 'ile-aux-cygnes',
    name: 'Île aux Cygnes',
    frenchName: 'Île aux Cygnes',
    category: 'park',
    lat: 48.8531,
    lng: 2.2846,
    heightMeters: 12,
    yearBuilt: '1827',
    architect: 'Artificial dike promenade',
    summary:
      'Narrow 890 m tree-lined artificial island splitting the Seine southwest of Bir-Hakeim, terminating at the quarter-scale Statue of Liberty.',
    cameraOffset: [-185, 92, 165],
    targetY: 6,
  }),
];

export interface CameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'hero',
    label: 'Hero',
    position: [-435, 225, 475],
    target: [0, 148, 0],
  },
  {
    id: 'aerial',
    label: 'Aerial 3 km²',
    position: [-740, 1280, 980],
    target: [15, 0, 30],
  },
  {
    id: 'trocadero',
    label: 'Trocadéro',
    position: [-540, 128, -515],
    target: [0, 138, 0],
  },
  {
    id: 'champ-de-mars',
    label: 'Champ de Mars',
    position: [510, 92, 495],
    target: [0, 142, 0],
  },
  {
    id: 'seine',
    label: 'Seine',
    position: [-455, 92, 215],
    target: [-25, 118, -55],
  },
  {
    id: 'summit',
    label: 'Summit',
    position: [98, 305, 102],
    target: [0, 250, 0],
  },
];
