import { useCallback, useEffect, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { ElementPreviewOverlay } from './components/ElementPreviewOverlay';
import { ParisSketchViewport, type CameraTargetRequest } from './components/ParisSketchViewport';
import { PlacesDrawer } from './components/PlacesDrawer';
import type { InspectedSelection } from './scene/elementCatalog';
import {
  CAMERA_PRESETS,
  PARIS_LANDMARKS,
  type ParisLandmark,
} from './scene/parisGeo';
import type { SketchStyleMode } from './scene/sketchMath';

export default function App() {
  const [activePresetId, setActivePresetId] = useState<string>(CAMERA_PRESETS[0].id);
  const [sketchMode, setSketchMode] = useState<SketchStyleMode>('ink-sketch');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showBoundaryRing, setShowBoundaryRing] = useState<boolean>(true);
  const [placesOpen, setPlacesOpen] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [selectedLandmark, setSelectedLandmark] = useState<ParisLandmark | null>(
    PARIS_LANDMARKS[0]
  );
  const [inspectedSelection, setInspectedSelection] = useState<InspectedSelection | null>(null);
  const [buildingCount, setBuildingCount] = useState<number>(0);

  const [cameraRequest, setCameraRequest] = useState<CameraTargetRequest>({
    position: CAMERA_PRESETS[0].position,
    target: CAMERA_PRESETS[0].target,
    nonce: 0,
  });

  const handleSelectPreset = useCallback((presetId: string) => {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setCameraRequest((prev) => ({
      position: preset.position,
      target: preset.target,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleSelectLandmark = useCallback((landmark: ParisLandmark) => {
    setSelectedLandmark(landmark);
    setActivePresetId('');
    setPlacesOpen(true);
    setCameraRequest((prev) => ({
      position: landmark.cameraPos,
      target: landmark.cameraTarget,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleInspectElement = useCallback((selection: InspectedSelection) => {
    setInspectedSelection(selection);
  }, []);

  const handleClosePreview = useCallback(() => {
    setInspectedSelection(null);
  }, []);

  // Keyboard shortcuts: H toggles Zen mode, 1-6 switch camera viewpoints
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (inspectedSelection) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      } else if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1;
        if (CAMERA_PRESETS[idx]) {
          handleSelectPreset(CAMERA_PRESETS[idx].id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSelectPreset, inspectedSelection]);

  return (
    <main
      className="relative w-screen h-screen bg-white text-neutral-950 overflow-hidden select-none"
      data-sketch-mode={sketchMode}
      data-active-preset={activePresetId}
      data-building-count={buildingCount}
      data-inspecting-element={inspectedSelection?.element.kind ?? ''}
    >
      {/* Full-bleed 3D WebGL Black-Ink-on-White Viewport */}
      <ParisSketchViewport
        cameraRequest={cameraRequest}
        sketchMode={sketchMode}
        showLabels={showLabels}
        showBoundaryRing={showBoundaryRing}
        selectedLandmarkId={selectedLandmark?.id ?? null}
        paused={Boolean(inspectedSelection)}
        onSelectLandmark={handleSelectLandmark}
        onInspectElement={handleInspectElement}
        onSceneReady={({ buildingCount: count }) => setBuildingCount(count)}
      />

      {/* Minimal Top-Left Architectural Plate Title (Zero-Pill Clean Typography) */}
      <header className="fixed top-4 left-5 z-20 pointer-events-none max-w-[min(400px,calc(100vw-2.5rem))]">
        <div className="bg-white/92 px-3.5 py-2.5 border border-neutral-950/15">
          <h1 className="font-editorial text-2xl sm:text-[26px] font-semibold tracking-tight text-neutral-950 leading-none">
            Tour Eiffel · 3 km²
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-tech text-neutral-600">
            <span>48.8584° N, 2.2945° E</span>
            <span aria-hidden="true">·</span>
            <span>r = 977 m</span>
            <span aria-hidden="true">·</span>
            <span>330 m</span>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500 hidden sm:block">
            Drag to orbit · Scroll to zoom · Click any tower, building, ship, or tree to inspect in 3D
          </p>
        </div>
      </header>

      {/* Places & Google Maps Grounding Architectural Gazetteer Drawer */}
      <PlacesDrawer
        open={placesOpen}
        onClose={() => setPlacesOpen(false)}
        selectedLandmark={selectedLandmark}
        onSelectLandmark={handleSelectLandmark}
        onInspectElement={handleInspectElement}
      />

      {/* Collapsible Unified Bottom Control Dock */}
      <ControlDock
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        sketchMode={sketchMode}
        onChangeSketchMode={setSketchMode}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        showBoundaryRing={showBoundaryRing}
        onToggleBoundaryRing={() => setShowBoundaryRing((v) => !v)}
        placesOpen={placesOpen}
        onTogglePlaces={() => setPlacesOpen((v) => !v)}
        collapsed={dockCollapsed}
        onToggleCollapsed={() => setDockCollapsed((v) => !v)}
      />

      {/* Smooth Origin-Anchored 3D Element Preview & Specimen Explorer */}
      <ElementPreviewOverlay
        selection={inspectedSelection}
        initialSketchMode={sketchMode}
        onClose={handleClosePreview}
      />
    </main>
  );
}
