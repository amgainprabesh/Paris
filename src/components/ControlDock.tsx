import { ChevronDown, ChevronUp, Compass, Eye, MapPin, PenTool } from 'lucide-react';
import { CAMERA_PRESETS } from '../scene/parisGeo';
import type { SketchStyleMode } from '../scene/sketchMath';

interface ControlDockProps {
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  sketchMode: SketchStyleMode;
  onChangeSketchMode: (mode: SketchStyleMode) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showBoundaryRing: boolean;
  onToggleBoundaryRing: () => void;
  placesOpen: boolean;
  onTogglePlaces: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const STYLE_OPTIONS: Array<{ id: SketchStyleMode; label: string }> = [
  { id: 'ink-sketch', label: 'Ink Sketch' },
  { id: 'pure-stick', label: 'Pure Stick' },
  { id: 'engraving', label: 'Engraving' },
];

export function ControlDock({
  activePresetId,
  onSelectPreset,
  sketchMode,
  onChangeSketchMode,
  showLabels,
  onToggleLabels,
  showBoundaryRing,
  onToggleBoundaryRing,
  placesOpen,
  onTogglePlaces,
  collapsed,
  onToggleCollapsed,
}: ControlDockProps) {
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none max-w-[96vw]"
      aria-label="Viewport controls"
    >
      {/* Collapse / Expand toggle tab */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show Controls' : 'Hide Controls'}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium tracking-wide text-neutral-700 bg-white/95 border border-neutral-300 hover:border-neutral-900 hover:text-neutral-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      {/* Main unified bottom dock (single-row on desktop, solid white surface, no backdrop-filter) */}
      <div
        className={`pointer-events-auto max-w-[96vw] transition-transform duration-200 ease-out ${
          collapsed ? 'translate-y-[140%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="bg-white/96 border border-neutral-900 shadow-[0_6px_24px_rgba(0,0,0,0.08)] px-2.5 py-1.5 flex items-center gap-2 overflow-x-auto">
          {/* Camera Views */}
          <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Camera viewpoints">
            {CAMERA_PRESETS.map((preset) => {
              const active = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset.id)}
                  aria-pressed={active}
                  className={`px-2 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-neutral-950 text-white'
                      : 'text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-neutral-200 shrink-0" aria-hidden="true" />

          {/* Sketch Ink Style Selector */}
          <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Sketch rendering style">
            <PenTool className="w-3.5 h-3.5 text-neutral-500 mr-0.5 hidden lg:block shrink-0" aria-hidden="true" />
            {STYLE_OPTIONS.map((opt) => {
              const active = sketchMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeSketchMode(opt.id)}
                  aria-pressed={active}
                  className={`px-2 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'border-neutral-950 bg-neutral-950 text-white'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-950'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-neutral-200 shrink-0" aria-hidden="true" />

          {/* Overlays & Maps Explorer */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleLabels}
              aria-pressed={showLabels}
              className={`inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showLabels
                  ? 'border-neutral-950 bg-neutral-100 text-neutral-950'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-950'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Labels</span>
            </button>

            <button
              type="button"
              onClick={onToggleBoundaryRing}
              aria-pressed={showBoundaryRing}
              className={`inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showBoundaryRing
                  ? 'border-neutral-950 bg-neutral-100 text-neutral-950'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-950'
              }`}
            >
              <Compass className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>3 km² Ring</span>
            </button>

            <button
              type="button"
              onClick={onTogglePlaces}
              aria-pressed={placesOpen}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                placesOpen
                  ? 'border-neutral-950 bg-neutral-950 text-white'
                  : 'border-neutral-950 bg-white text-neutral-950 hover:bg-neutral-950 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Places &amp; Maps</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
