import { useState, type FormEvent } from 'react';
import { Box, ExternalLink, Loader2, MapPin, Search, X } from 'lucide-react';
import { PARIS_LANDMARKS, type ParisLandmark } from '../scene/parisGeo';
import {
  landmarkIdToInspectableElement,
  type InspectedSelection,
} from '../scene/elementCatalog';

interface MapsPlaceLink {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{
    text: string;
    uri?: string;
    author?: string;
  }>;
}

interface MapsExploreResponse {
  text: string;
  places: MapsPlaceLink[];
  coordinates?: { latitude: number; longitude: number };
}

interface PlacesDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedLandmark: ParisLandmark | null;
  onSelectLandmark: (landmark: ParisLandmark) => void;
  onInspectElement: (selection: InspectedSelection) => void;
}

const QUICK_PROMPTS = [
  'Best viewpoints of the Eiffel Tower within 1 km',
  'Historic cafés & bistros near Champ de Mars',
  'Museums & cultural landmarks within 3 km²',
];

export function PlacesDrawer({
  open,
  onClose,
  selectedLandmark,
  onSelectLandmark,
  onInspectElement,
}: PlacesDrawerProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MapsExploreResponse | null>(null);
  const [lastQueriedTopic, setLastQueriedTopic] = useState<string>('');

  if (!open) return null;

  const runMapsQuery = async (promptText: string, landmark?: ParisLandmark | null) => {
    const trimmed = promptText.trim();
    if (!trimmed) {
      setError('Enter a question or place to explore on Google Maps.');
      return;
    }

    setLoading(true);
    setError(null);
    setLastQueriedTopic(trimmed);

    try {
      const res = await fetch('/api/maps-explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          landmarkName: landmark?.name,
          latitude: landmark?.lat ?? 48.85837,
          longitude: landmark?.lng ?? 2.29448,
        }),
      });

      const payload = (await res.json()) as MapsExploreResponse & { error?: string };
      if (!res.ok) {
        setError(payload.error || 'Unable to load Google Maps data.');
        setResult(null);
        return;
      }

      setResult({
        text: payload.text || 'No details returned for this location.',
        places: Array.isArray(payload.places) ? payload.places : [],
        coordinates: payload.coordinates,
      });
    } catch {
      setError('Network error while connecting to Google Maps Grounding.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runMapsQuery(query, selectedLandmark);
  };

  const handleExploreLandmark = (lm: ParisLandmark) => {
    const prompt = `Tell me about ${lm.name} (${lm.frenchName}) in Paris, including visitor hours, architectural highlights, and notable spots nearby.`;
    setQuery(prompt);
    void runMapsQuery(prompt, lm);
  };

  return (
    <aside
      aria-label="3 km² Paris Landmarks and Google Maps Explorer"
      className="fixed top-4 right-4 bottom-24 w-[min(390px,calc(100vw-2rem))] z-30 bg-white border border-neutral-950 shadow-[0_12px_36px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 shrink-0">
        <div>
          <h2 className="font-editorial text-xl font-semibold tracking-tight text-neutral-950 leading-tight">
            Paris 3 km² Gazetteer
          </h2>
          <p className="text-[11px] text-neutral-500 mt-0.5 font-mono-tech">
            12 mapped landmarks · Google Maps Grounding
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Places drawer"
          className="p-1.5 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto ink-scroll px-5 py-4 space-y-5">
        {/* Selected Landmark Architectural Sheet */}
        {selectedLandmark && (
          <section className="pb-4 border-b border-neutral-200" aria-label="Selected landmark details">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-editorial text-2xl font-semibold text-neutral-950 leading-tight">
                {selectedLandmark.name}
              </h3>
              <span className="font-mono-tech text-xs text-neutral-500 whitespace-nowrap shrink-0">
                {selectedLandmark.distanceMeters === 0
                  ? 'Origin (0 m)'
                  : `${selectedLandmark.distanceMeters} m`}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
              <span>{selectedLandmark.frenchName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tech">{selectedLandmark.yearBuilt}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tech">H {selectedLandmark.heightMeters} m</span>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-neutral-700">
              {selectedLandmark.summary}
            </p>

            <div className="mt-2 text-[11px] text-neutral-500 font-mono-tech">
              {selectedLandmark.lat.toFixed(5)}° N, {selectedLandmark.lng.toFixed(5)}° E ·{' '}
              {selectedLandmark.architect}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={(e) =>
                  onInspectElement({
                    element: landmarkIdToInspectableElement(selectedLandmark.id),
                    originX: e.clientX,
                    originY: e.clientY,
                  })
                }
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium border border-neutral-950 bg-white text-neutral-950 hover:bg-neutral-950 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <Box className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Inspect 3D Model</span>
              </button>

              <button
                type="button"
                onClick={() => handleExploreLandmark(selectedLandmark)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-neutral-950 text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                ) : (
                  <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>Google Maps Info</span>
              </button>
            </div>
          </section>
        )}

        {/* Live Google Maps Grounding Search */}
        <section aria-label="Google Maps search">
          <label
            htmlFor="maps-explore-input"
            className="block text-xs font-semibold text-neutral-900 mb-1.5"
          >
            Ask Google Maps about this 3 km² zone
          </label>
          <form onSubmit={handleSubmit} className="flex gap-1.5">
            <input
              id="maps-explore-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Cafés or museums near Pont d'Iéna"
              className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-neutral-300 text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-950"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Search Google Maps"
              className="px-3 py-2 bg-neutral-950 text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1 text-xs font-medium"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>Ask</span>
            </button>
          </form>

          {/* Suggested quick queries */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp}
                type="button"
                onClick={() => {
                  setQuery(qp);
                  void runMapsQuery(qp, selectedLandmark);
                }}
                className="text-[11px] text-neutral-600 underline underline-offset-2 decoration-neutral-300 hover:text-neutral-950 hover:decoration-neutral-950 transition-colors text-left cursor-pointer"
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Error state */}
          {error && (
            <div
              role="alert"
              className="mt-3 p-3 border border-neutral-900 bg-neutral-50 text-xs text-neutral-900"
            >
              <p className="font-medium">Maps Grounding unavailable</p>
              <p className="mt-1 text-neutral-600">{error}</p>
            </div>
          )}

          {/* Grounded Results & Mandatory Google Maps Links */}
          {result && !loading && (
            <div className="mt-3 pt-3 border-t border-neutral-200 space-y-3">
              {lastQueriedTopic && (
                <p className="text-[11px] font-mono-tech text-neutral-500 truncate">
                  Query: {lastQueriedTopic}
                </p>
              )}
              <div className="text-xs leading-relaxed text-neutral-800 whitespace-pre-line">
                {result.text}
              </div>

              {result.places.length > 0 && (
                <div className="pt-2 border-t border-neutral-200 space-y-2">
                  <p className="text-[11px] font-semibold text-neutral-900">
                    Google Maps Sources ({result.places.length})
                  </p>
                  <ul className="space-y-2">
                    {result.places.map((place, idx) => (
                      <li
                        key={`${place.uri}-${idx}`}
                        className="border border-neutral-200 p-2.5 bg-white"
                      >
                        <a
                          href={place.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-950 hover:underline"
                        >
                          <span>{place.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                        </a>
                        {place.reviewSnippets.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {place.reviewSnippets.map((rev, rIdx) => (
                              <div key={rIdx} className="text-[11px] text-neutral-600">
                                {rev.text && <p className="italic">“{rev.text}”</p>}
                                {rev.uri && (
                                  <a
                                    href={rev.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-neutral-800 underline mt-0.5"
                                  >
                                    <span>
                                      {rev.author ? `Review by ${rev.author}` : 'Read review on Maps'}
                                    </span>
                                    <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Mapped Landmarks Directory within 3 km² */}
        <section className="pt-2 border-t border-neutral-200" aria-label="Landmarks within 3 square kilometers">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2">
            Landmarks in the 3 km² Radius (r = 977 m)
          </h3>
          <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
            {PARIS_LANDMARKS.map((lm) => {
              const isSelected = selectedLandmark?.id === lm.id;
              return (
                <li key={lm.id}>
                  <button
                    type="button"
                    onClick={() => onSelectLandmark(lm)}
                    className={`w-full text-left py-2.5 px-2 flex items-baseline justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-950 text-white'
                        : 'hover:bg-neutral-50 text-neutral-900'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-medium truncate">{lm.name}</span>
                      <span
                        className={`block text-[11px] truncate ${
                          isSelected ? 'text-neutral-300' : 'text-neutral-500'
                        }`}
                      >
                        {lm.category} · {lm.yearBuilt}
                      </span>
                    </div>
                    <span
                      className={`font-mono-tech text-[11px] shrink-0 ${
                        isSelected ? 'text-neutral-200' : 'text-neutral-500'
                      }`}
                    >
                      {lm.distanceMeters} m
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </aside>
  );
}
