/**
 * Pure domain types, metadata builders, and camera-framing math for clickable
 * 3D Parisian elements within the 3 km² Eiffel Tower ink-sketch scene.
 */

export type InspectableElementKind =
  | 'eiffel-tower'
  | 'haussmann-building'
  | 'river-ship'
  | 'river-barge'
  | 'paris-tree'
  | 'bridge'
  | 'metro-train'
  | 'monument'
  | 'streetlamp';

export interface InspectableElement {
  id: string;
  kind: InspectableElementKind;
  title: string;
  subtitle: string;
  locationLabel: string;
  description: string;
  specs: Array<{ label: string; value: string }>;
  /** Optional physical dimensions / style params taken from the exact clicked instance */
  params?: {
    width?: number;
    height?: number;
    depth?: number;
    floors?: number;
    mansardHeight?: number;
    cornerRotunda?: boolean;
    length?: number;
    beam?: number;
    canopyRadius?: number;
    bridgeId?: 'pont-iena' | 'pont-bir-hakeim' | 'passerelle-debilly' | 'pont-alma';
    monumentId?:
      | 'palais-chaillot'
      | 'ecole-militaire'
      | 'musee-quai-branly'
      | 'palais-tokyo'
      | 'holy-trinity'
      | 'front-de-seine'
      | 'statue-liberty';
    seed?: number;
  };
}

export interface InspectedSelection {
  element: InspectableElement;
  /** Viewport CSS coordinates of the user's click so the preview expands smoothly from that spot */
  originX: number;
  originY: number;
}

export interface SpecimenCameraFrame {
  position: [number, number, number];
  target: [number, number, number];
  minDistance: number;
  maxDistance: number;
  plinthRadius: number;
}

/**
 * Computes ideal 3/4 architectural drafting camera framing for any 3D bounding box
 * centered horizontally at (0, *, 0) with its base at y = 0.
 */
export function computeSpecimenCameraFrame(
  width: number,
  height: number,
  depth: number,
  fovDeg = 38
): SpecimenCameraFrame {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const safeD = Math.max(1, depth);

  const horizSpan = Math.hypot(safeW, safeD) * 0.5;
  const radius = Math.max(horizSpan, safeH * 0.52);
  const halfFovRad = ((fovDeg * Math.PI) / 180) * 0.5;
  const fitDist = (radius / Math.tan(halfFovRad)) * 1.28;

  const targetY = safeH * 0.46;
  const azimuth = Math.PI * 0.24;
  const elevation = safeH > Math.max(safeW, safeD) * 1.4 ? 0.24 : 0.36;

  const horizontalDist = fitDist * Math.cos(elevation);
  const camX = Math.cos(azimuth) * horizontalDist;
  const camY = targetY + fitDist * Math.sin(elevation);
  const camZ = Math.sin(azimuth) * horizontalDist;

  return {
    position: [camX, camY, camZ],
    target: [0, targetY, 0],
    minDistance: Math.max(2.5, radius * 0.55),
    maxDistance: Math.max(24, fitDist * 3.1),
    plinthRadius: Math.max(horizSpan * 1.24, Math.min(radius * 0.9, horizSpan * 1.55)),
  };
}

/**
 * Computes the starting transform offset for the smooth origin-anchored modal reveal
 * so the 3D preview expands directly from where the user clicked.
 */
export function computeRevealOriginOffset(
  originX: number,
  originY: number,
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const cx = viewportW * 0.5;
  const cy = viewportH * 0.5;
  const maxOffsetX = viewportW * 0.34;
  const maxOffsetY = viewportH * 0.34;
  const dx = Math.max(-maxOffsetX, Math.min(maxOffsetX, (originX - cx) * 0.62));
  const dy = Math.max(-maxOffsetY, Math.min(maxOffsetY, (originY - cy) * 0.62));
  return { x: dx, y: dy };
}

/** Build the curated InspectableElement descriptor for the Eiffel Tower. */
export function createEiffelTowerElement(): InspectableElement {
  return {
    id: 'eiffel-tower',
    kind: 'eiffel-tower',
    title: 'Tour Eiffel',
    subtitle: 'Wrought-Iron Lattice Tower · 1889',
    locationLabel: 'Champ de Mars · 7th Arrondissement',
    description:
      'Gustave Eiffel’s 330-meter parabolic puddled-iron tower engineered by Maurice Koechlin and Émile Nouguier, assembled from 18,038 riveted iron lattice members across four masonry piers and three observation levels.',
    specs: [
      { label: 'Height', value: '330 m' },
      { label: 'Base Span', value: '125 × 125 m' },
      { label: 'Iron Parts', value: '18,038' },
      { label: 'Completed', value: '1889' },
    ],
  };
}

/** Build a descriptor for any clicked Haussmannian apartment wing with its real dimensions. */
export function createHaussmannBuildingElement(spec: {
  index: number;
  width: number;
  height: number;
  depth: number;
  floors: number;
  mansardHeight: number;
  cornerRotunda: boolean;
  arrondissement: string;
}): InspectableElement {
  const totalH = spec.height + spec.mansardHeight;
  return {
    id: `haussmann-${spec.index}`,
    kind: 'haussmann-building',
    title: spec.cornerRotunda
      ? 'Haussmannian Corner Rotunda Block'
      : 'Haussmannian Apartment Facade',
    subtitle: 'Cut-Limestone & Zinc Mansard · 19th Century',
    locationLabel: spec.arrondissement,
    description:
      'Classic Parisian perimeter block wing governed by Baron Haussmann’s uniform cornice proportions: rusticated arched ground-floor shopfronts, tall French windows (portes-fenêtres), projecting 2nd- and 5th-floor wrought-iron balconies, sloped zinc mansard roof, lucarne dormers, and terracotta chimney pots.',
    specs: [
      { label: 'Ridge Height', value: `${totalH.toFixed(1)} m` },
      { label: 'Footprint', value: `${spec.width.toFixed(0)} × ${spec.depth.toFixed(0)} m` },
      { label: 'Storeys', value: `${spec.floors} + Mansard` },
      { label: 'Roof', value: spec.cornerRotunda ? 'Zinc & Rotunda' : 'Zinc Mansard' },
    ],
    params: {
      width: spec.width,
      height: spec.height,
      depth: spec.depth,
      floors: spec.floors,
      mansardHeight: spec.mansardHeight,
      cornerRotunda: spec.cornerRotunda,
      seed: 4200 + spec.index,
    },
  };
}

/** Build a descriptor for a cruising Seine river sightseeing ship (Bateau Mouche). */
export function createRiverShipElement(index: number): InspectableElement {
  const names = [
    'Bateau Mouche · Le Jean-Sébastien',
    'Bateau Parisien · La Bohème',
    'Vedette de Paris · L’Étoile',
  ];
  return {
    id: `river-ship-${index}`,
    kind: 'river-ship',
    title: names[index % names.length],
    subtitle: 'Seine River Sightseeing Vessel',
    locationLabel: 'River Seine · Bief de Paris',
    description:
      'Low-draft Parisian sightseeing riverboat engineered to clear the historic stone arches of Pont d’Iéna and Pont de l’Alma, featuring a pointed raked bow, panoramic glazed lower saloon, elevated open-air observation deck, and aft helm bridge.',
    specs: [
      { label: 'Length', value: '28.0 m' },
      { label: 'Beam', value: '7.2 m' },
      { label: 'Air Draft', value: '5.8 m' },
      { label: 'Decks', value: '2 (Saloon + Open)' },
    ],
    params: {
      length: 28,
      beam: 7.2,
      seed: 700 + index,
    },
  };
}

/** Build a descriptor for a moored Parisian Seine river barge (péniche). */
export function createRiverBargeElement(spec: {
  index: number;
  length: number;
  beam: number;
  portName: string;
}): InspectableElement {
  return {
    id: `river-barge-${spec.index}`,
    kind: 'river-barge',
    title: 'Parisian River Barge (Péniche)',
    subtitle: 'Freycinet-Gauge Steel Hull · Moored',
    locationLabel: `${spec.portName} · River Seine`,
    description:
      'Traditional flat-bottomed Parisian péniche moored along the cobblestone lower berges of the Seine, built with a blunt raked steel bow, long low-profile windowed cabin deckhouse, raised stern wheelhouse, and iron mooring bollards.',
    specs: [
      { label: 'Length', value: `${spec.length.toFixed(1)} m` },
      { label: 'Beam', value: `${spec.beam.toFixed(1)} m` },
      { label: 'Mooring', value: spec.portName },
      { label: 'Gauge', value: 'Freycinet Class' },
    ],
    params: {
      length: spec.length,
      beam: spec.beam,
      seed: 900 + spec.index,
    },
  };
}

/** Build a descriptor for any clicked Parisian tree. */
export function createParisTreeElement(spec: {
  index: number;
  height: number;
  canopyRadius: number;
  locationLabel: string;
}): InspectableElement {
  return {
    id: `paris-tree-${spec.index}`,
    kind: 'paris-tree',
    title: 'London Plane Tree (Platane)',
    subtitle: 'Platanus × acerifolia · Parisian Street & Park Canopy',
    locationLabel: spec.locationLabel,
    description:
      'The signature tree of Haussmann’s boulevards, the Champ de Mars allées, and the Seine quays—rising from a circular cast-iron sidewalk grate with a tall sculpted trunk, five spreading scaffold limbs, and an airy architectural crown.',
    specs: [
      { label: 'Height', value: `${spec.height.toFixed(1)} m` },
      { label: 'Crown Width', value: `${(spec.canopyRadius * 2).toFixed(1)} m` },
      { label: 'Zone', value: spec.locationLabel },
      { label: 'Form', value: 'Architectural Allée' },
    ],
    params: {
      height: spec.height,
      canopyRadius: spec.canopyRadius,
      seed: 1200 + spec.index,
    },
  };
}

/** Build a descriptor for one of the four Seine bridges inside the 3 km² ring. */
export function createBridgeElement(
  bridgeId: 'pont-iena' | 'pont-bir-hakeim' | 'passerelle-debilly' | 'pont-alma'
): InspectableElement {
  const catalog: Record<typeof bridgeId, Omit<InspectableElement, 'id' | 'kind' | 'params'>> = {
    'pont-iena': {
      title: 'Pont d’Iéna',
      subtitle: 'Five-Arch Stone Bridge · 1814',
      locationLabel: 'Eiffel Tower ↔ Trocadéro Axis',
      description:
        'Napoleonic five-arch masonry bridge linking the Eiffel Tower directly to the Jardins du Trocadéro, detailed with cutwater river piers, voussoir arch rings, stone balustrades, cast-iron bridge lamps, and four corner equestrian warrior statues.',
      specs: [
        { label: 'Span', value: '155 m' },
        { label: 'Width', value: '35 m' },
        { label: 'Arches', value: '5 Segmental' },
        { label: 'Opened', value: '1814' },
      ],
    },
    'pont-bir-hakeim': {
      title: 'Pont de Bir-Hakeim',
      subtitle: 'Double-Deck Iron Viaduct · 1905',
      locationLabel: 'Grenelle ↔ Passy · Île aux Cygnes',
      description:
        'Iconic two-level Parisian steel arch bridge carrying vehicles and pedestrians on the lower deck and Paris Métro Line 6 above on an ornate cast-iron colonnade with riveted X-truss girders and knee braces.',
      specs: [
        { label: 'Span', value: '237 m' },
        { label: 'Levels', value: 'Road + Métro 6' },
        { label: 'Structure', value: 'Steel Arch & Colonnade' },
        { label: 'Opened', value: '1905' },
      ],
    },
    'passerelle-debilly': {
      title: 'Passerelle Debilly',
      subtitle: 'Parabolic Steel Footbridge · 1900',
      locationLabel: 'Quai Branly ↔ Palais de Tokyo',
      description:
        'Graceful single-span parabolic metallic arch footbridge built for the 1900 Exposition Universelle, suspending a timber-and-iron pedestrian walkway from twin riveted steel ribs.',
      specs: [
        { label: 'Span', value: '125 m' },
        { label: 'Width', value: '8.5 m' },
        { label: 'Arch', value: 'Twin Steel Rib' },
        { label: 'Opened', value: '1900' },
      ],
    },
    'pont-alma': {
      title: 'Pont de l’Alma',
      subtitle: 'Three-Span River Crossing · 1856 / 1974',
      locationLabel: 'Place de la Résistance ↔ Place de l’Alma',
      description:
        'Wide Parisian river crossing at the northeastern edge of the 3 km² survey zone, anchored on the Right Bank by the gilded Flamme de la Liberté monument.',
      specs: [
        { label: 'Span', value: '153 m' },
        { label: 'Width', value: '42 m' },
        { label: 'Spans', value: '3 Wide Arches' },
        { label: 'Monument', value: 'Flamme de la Liberté' },
      ],
    },
  };

  return {
    id: `bridge-${bridgeId}`,
    kind: 'bridge',
    ...catalog[bridgeId],
    params: { bridgeId },
  };
}

/** Build a descriptor for the Paris Métro Line 6 train. */
export function createMetroTrainElement(): InspectableElement {
  return {
    id: 'metro-line-6',
    kind: 'metro-train',
    title: 'Paris Métro Line 6 · MP 73',
    subtitle: 'Rubber-Tyred Elevated Viaduct Train',
    locationLabel: 'Pont de Bir-Hakeim ↔ Boulevard de Grenelle',
    description:
      'Five-car Parisian Métro train gliding along the elevated iron viaduct of Line 6 between Passy, Bir-Hakeim, and Dupleix with panoramic side windows looking directly toward the Eiffel Tower.',
    specs: [
      { label: 'Trainset', value: '5 Articulated Cars' },
      { label: 'Length', value: '72.0 m' },
      { label: 'Viaduct Height', value: '10.6 m' },
      { label: 'Line', value: 'Métro 6 (Étoile–Nation)' },
    ],
  };
}

/** Build a descriptor for a Parisian monumental landmark. */
export function createMonumentElement(
  monumentId:
    | 'palais-chaillot'
    | 'ecole-militaire'
    | 'musee-quai-branly'
    | 'palais-tokyo'
    | 'holy-trinity'
    | 'front-de-seine'
    | 'statue-liberty'
): InspectableElement {
  const catalog: Record<typeof monumentId, Omit<InspectableElement, 'id' | 'kind' | 'params'>> = {
    'palais-chaillot': {
      title: 'Palais de Chaillot',
      subtitle: '1937 Neoclassical Twin Pavilions & Crescent Wings',
      locationLabel: 'Colline de Chaillot · 16th Arrondissement',
      description:
        'Monumental Art Deco-neoclassical palace built for the 1937 International Exposition, framing the Parvis des Droits de l’Homme and descending via stepped terraces to the Warsaw Fountains.',
      specs: [
        { label: 'Pavilion Height', value: '24 m' },
        { label: 'Arc Span', value: '390 m' },
        { label: 'Style', value: 'Stripped Classicism' },
        { label: 'Completed', value: '1937' },
      ],
    },
    'ecole-militaire': {
      title: 'École Militaire',
      subtitle: '18th-Century Royal Military Academy · Ange-Jacques Gabriel',
      locationLabel: 'South End of Champ de Mars · 7th Arrondissement',
      description:
        'Masterpiece of French classical architecture terminating the Champ de Mars axis, crowned by a quadrangular mansard dome, crowning lantern cupola, and an eight-column Corinthian portico.',
      specs: [
        { label: 'Dome Height', value: '49.5 m' },
        { label: 'Main Facade', value: '124 m' },
        { label: 'Portico', value: '8 Corinthian Columns' },
        { label: 'Completed', value: '1773' },
      ],
    },
    'musee-quai-branly': {
      title: 'Musée du Quai Branly',
      subtitle: 'Jean Nouvel Pilotis Bridge Gallery · 2006',
      locationLabel: 'Quai Jacques Chirac · 7th Arrondissement',
      description:
        'Elevated gallery pavilion suspended on angled steel pilotis above a lush garden, punctuated by colorful cantilevered exhibition boxes and shielded from the avenue by a continuous glass curtain wall.',
      specs: [
        { label: 'Gallery Length', value: '178 m' },
        { label: 'Elevation', value: '19 m' },
        { label: 'Architect', value: 'Jean Nouvel' },
        { label: 'Opened', value: '2006' },
      ],
    },
    'palais-tokyo': {
      title: 'Palais de Tokyo',
      subtitle: '1937 Colonnaded Modern Art Palace',
      locationLabel: 'Avenue du Président Wilson · 16th Arrondissement',
      description:
        'Symmetrical twin-wing modernist stone palace connected by a tall open peristyle colonnade overlooking a terraced reflecting basin toward the Seine.',
      specs: [
        { label: 'Complex Span', value: '178 m' },
        { label: 'Height', value: '19.5 m' },
        { label: 'Colonnade', value: '17 Peristyle Piers' },
        { label: 'Completed', value: '1937' },
      ],
    },
    'holy-trinity': {
      title: 'Holy Trinity Cathedral',
      subtitle: 'Five Ribbed Orthodox Onion Domes · 2016',
      locationLabel: 'Quai Branly · 7th Arrondissement',
      description:
        'Contemporary limestone Orthodox sanctuary designed by Jean-Michel Wilmotte, topped by five sculptural ribbed onion domes crowned with triple-bar Orthodox crosses.',
      specs: [
        { label: 'Central Dome', value: '35.5 m' },
        { label: 'Footprint', value: '28 × 28 m' },
        { label: 'Domes', value: '5 Ribbed Cupolas' },
        { label: 'Completed', value: '2016' },
      ],
    },
    'front-de-seine': {
      title: 'Tour Totem · Front de Seine',
      subtitle: 'Stacked Cantilevered High-Rise · 1979',
      locationLabel: 'Quai de Grenelle · 15th Arrondissement',
      description:
        'Sculptural modernist riverfront tower rising nearly 100 meters in cantilevered concrete blocks hung from a central structural spine along the southwestern Seine bend.',
      specs: [
        { label: 'Height', value: '98 m' },
        { label: 'Storeys', value: '31 Floors' },
        { label: 'District', value: 'Front de Seine' },
        { label: 'Completed', value: '1979' },
      ],
    },
    'statue-liberty': {
      title: 'Statue of Liberty (Île aux Cygnes)',
      subtitle: 'Quarter-Scale Bronze Replica · 1889',
      locationLabel: 'Southwestern Tip of Île aux Cygnes',
      description:
        'Bartholdi’s quarter-scale Parisian Statue of Liberty standing at the prow of the artificial Île aux Cygnes, facing southwest toward New York Harbor.',
      specs: [
        { label: 'Statue Height', value: '11.5 m' },
        { label: 'With Pedestal', value: '18.8 m' },
        { label: 'Sculptor', value: 'Frédéric Auguste Bartholdi' },
        { label: 'Inaugurated', value: '1889' },
      ],
    },
  };

  return {
    id: `monument-${monumentId}`,
    kind: 'monument',
    ...catalog[monumentId],
    params: { monumentId },
  };
}

/** Map a curated PARIS_LANDMARKS id into an InspectableElement so PlacesDrawer can also launch the 3D Preview. */
export function landmarkIdToInspectableElement(landmarkId: string): InspectableElement {
  switch (landmarkId) {
    case 'eiffel-tower':
      return createEiffelTowerElement();
    case 'trocadero':
      return createMonumentElement('palais-chaillot');
    case 'champ-de-mars':
      return createParisTreeElement({
        index: 0,
        height: 14,
        canopyRadius: 5.2,
        locationLabel: 'Champ de Mars Allée',
      });
    case 'ecole-militaire':
      return createMonumentElement('ecole-militaire');
    case 'pont-iena':
      return createBridgeElement('pont-iena');
    case 'pont-bir-hakeim':
      return createBridgeElement('pont-bir-hakeim');
    case 'musee-quai-branly':
      return createMonumentElement('musee-quai-branly');
    case 'palais-tokyo':
      return createMonumentElement('palais-tokyo');
    case 'holy-trinity':
      return createMonumentElement('holy-trinity');
    case 'passerelle-debilly':
      return createBridgeElement('passerelle-debilly');
    case 'pont-alma':
      return createBridgeElement('pont-alma');
    case 'ile-aux-cygnes':
      return createMonumentElement('statue-liberty');
    default:
      return createEiffelTowerElement();
  }
}
