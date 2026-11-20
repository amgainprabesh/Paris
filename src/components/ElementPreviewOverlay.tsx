import { useEffect, useMemo, useRef, useState } from 'react';
import { PenTool, RotateCcw, RotateCw, X } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildElementSpecimen } from '../scene/buildElementSpecimen';
import {
  computeRevealOriginOffset,
  type InspectableElement,
  type InspectedSelection,
} from '../scene/elementCatalog';
import { createSketchMaterialSet } from '../scene/sketchMaterials';
import type { SketchStyleMode } from '../scene/sketchMath';

interface ElementPreviewOverlayProps {
  selection: InspectedSelection | null;
  initialSketchMode: SketchStyleMode;
  onClose: () => void;
}

const PREVIEW_STYLES: Array<{ id: SketchStyleMode; label: string }> = [
  { id: 'ink-sketch', label: 'Ink Sketch' },
  { id: 'pure-stick', label: 'Pure Stick' },
  { id: 'engraving', label: 'Engraving' },
];

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

interface SpecimenCanvasProps {
  element: InspectableElement;
  sketchMode: SketchStyleMode;
  autoRotate: boolean;
  resetNonce: number;
}

function SpecimenCanvas({
  element,
  sketchMode,
  autoRotate,
  resetNonce,
}: SpecimenCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sketchModeRef = useRef<SketchStyleMode>(sketchMode);
  const autoRotateRef = useRef<boolean>(autoRotate);
  sketchModeRef.current = sketchMode;
  autoRotateRef.current = autoRotate;

  const apiRef = useRef<{
    applyStyle: (mode: SketchStyleMode) => void;
    setAutoRotate: (enabled: boolean) => void;
    resetView: () => void;
  } | null>(null);

  useEffect(() => {
    apiRef.current?.applyStyle(sketchMode);
  }, [sketchMode]);

  useEffect(() => {
    apiRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  useEffect(() => {
    if (resetNonce > 0) {
      apiRef.current?.resetView();
    }
  }, [resetNonce]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
        preserveDrawingBuffer: isSoftwareGl,
      });
    } catch {
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xffffff, 1);

    const initialW = container.clientWidth || 860;
    const initialH = container.clientHeight || 520;
    renderer.setSize(initialW, initialH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Studio environment reflection
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    // Balanced warm/cool architectural studio lighting on pure white ground
    const hemi = new THREE.HemisphereLight(0xf6f8ff, 0xffffff, 1.55);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfffdf7, 1.45);
    key.position.set(160, 260, 180);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xeef3ff, 0.7);
    rim.position.set(-180, 140, -160);
    scene.add(rim);

    const mats = createSketchMaterialSet(renderer);

    // Build centered high-detail 3D architectural ink-sketch specimen
    const specimen = buildElementSpecimen(element, {
      inkLinePrimary: mats.inkLinePrimary,
      inkLineFine: mats.inkLineFine,
      inkLineFaint: mats.inkLineFaint,
      stickBlackMat: mats.stickBlackMat,
      whiteOcclusionMat: mats.whiteOcclusionMat,
      whiteHatchMat: mats.whiteHatchMat,
    });
    scene.add(specimen.group);

    // Soft radial contact shadow grounding specimen onto pure white drafting sheet
    const shadowGeo = new THREE.CircleGeometry(specimen.frame.plinthRadius * 0.92, 48);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: mats.contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.58,
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.position.y = 0.02;
    scene.add(shadowDisc);

    // Camera + OrbitControls tailored precisely to the specimen bounds
    const { position, target, minDistance, maxDistance } = specimen.frame;
    const camera = new THREE.PerspectiveCamera(
      38,
      initialW / initialH,
      Math.max(0.1, minDistance * 0.04),
      Math.max(1200, maxDistance * 6)
    );
    camera.position.set(position[0], position[1], position[2]);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(target[0], target[1], target[2]);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minPolarAngle = 0.05;
    controls.autoRotate = !isSoftwareGl && autoRotateRef.current;
    controls.autoRotateSpeed = 1.15;
    controls.update();

    // Smooth camera reset state
    const defaultPos = new THREE.Vector3(position[0], position[1], position[2]);
    const defaultTarget = new THREE.Vector3(target[0], target[1], target[2]);
    let isResetting = false;

    const onControlsStart = () => {
      isResetting = false;
    };
    controls.addEventListener('start', onControlsStart);

    // Software-WebGL on-demand fenced rendering vs 60fps GPU loop
    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const renderStep = (dt: number) => {
      if (isResetting) {
        const alpha = isSoftwareGl ? 0.65 : 1 - Math.exp(-6.5 * Math.min(dt, 0.08));
        camera.position.lerp(defaultPos, alpha);
        controls.target.lerp(defaultTarget, alpha);
        if (
          camera.position.distanceTo(defaultPos) < 0.15 &&
          controls.target.distanceTo(defaultTarget) < 0.15
        ) {
          camera.position.copy(defaultPos);
          controls.target.copy(defaultTarget);
          isResetting = false;
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };

    function requestRender() {
      if (disposed || !isSoftwareGl) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        renderStep(dt);
        afterDraw(() => {
          renderBusy = false;
          if (renderDirty || isResetting) {
            requestRender();
          }
        });
      });
    }

    const gpuLoop = (now: number) => {
      if (disposed) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      renderStep(dt);
      frameId = requestAnimationFrame(gpuLoop);
    };

    const applyStyle = (mode: SketchStyleMode) => {
      if (mode === 'pure-stick') {
        for (const m of specimen.solidMeshes) m.visible = false;
        shadowDisc.visible = false;
        mats.inkLinePrimary.color.setHex(0x050505);
        mats.inkLineFine.color.setHex(0x0a0a0a);
        mats.inkLineFine.opacity = 0.94;
        mats.inkLineFaint.opacity = 0.62;
      } else if (mode === 'engraving') {
        for (const m of specimen.solidMeshes) m.visible = true;
        shadowDisc.visible = true;
        mats.whiteHatchMat.map = mats.engravingHatchTex;
        mats.whiteHatchMat.needsUpdate = true;
        mats.inkLinePrimary.color.setHex(0x050505);
        mats.inkLineFine.color.setHex(0x111111);
        mats.inkLineFine.opacity = 0.95;
        mats.inkLineFaint.opacity = 0.7;
      } else {
        for (const m of specimen.solidMeshes) m.visible = true;
        shadowDisc.visible = true;
        mats.whiteHatchMat.map = mats.subtleHatchTex;
        mats.whiteHatchMat.needsUpdate = true;
        mats.inkLinePrimary.color.setHex(0x060606);
        mats.inkLineFine.color.setHex(0x161616);
        mats.inkLineFine.opacity = 0.9;
        mats.inkLineFaint.opacity = 0.56;
      }
      requestRender();
    };

    const setAutoRotate = (enabled: boolean) => {
      controls.autoRotate = !isSoftwareGl && enabled;
      requestRender();
    };

    const resetView = () => {
      isResetting = true;
      requestRender();
    };

    apiRef.current = { applyStyle, setAutoRotate, resetView };
    applyStyle(sketchModeRef.current);

    const onControlsChange = () => {
      if (isSoftwareGl) requestRender();
    };
    controls.addEventListener('change', onControlsChange);

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 10 || h < 10) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    if (isSoftwareGl) {
      requestRender();
    } else {
      renderer.compile(scene, camera);
      frameId = requestAnimationFrame(gpuLoop);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      apiRef.current = null;
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      controls.dispose();
      envTarget.dispose();
      mats.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [element]);

  return (
    <div
      ref={mountRef}
      data-testid="specimen-canvas-mount"
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
    />
  );
}

export function ElementPreviewOverlay({
  selection,
  initialSketchMode,
  onClose,
}: ElementPreviewOverlayProps) {
  const [renderedSelection, setRenderedSelection] = useState<InspectedSelection | null>(selection);
  const [entered, setEntered] = useState<boolean>(false);
  const [previewStyle, setPreviewStyle] = useState<SketchStyleMode>(initialSketchMode);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [resetNonce, setResetNonce] = useState<number>(0);

  // Smooth enter & exit lifecycle preserving exit animation before unmounting WebGL canvas
  useEffect(() => {
    if (selection) {
      setRenderedSelection(selection);
      setPreviewStyle(initialSketchMode);
      setResetNonce(0);
      setEntered(false);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setEntered(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    setEntered(false);
    const timer = window.setTimeout(() => {
      setRenderedSelection(null);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [selection, initialSketchMode]);

  // Escape key closes the preview cleanly
  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, onClose]);

  const revealOffset = useMemo(() => {
    if (!renderedSelection || typeof window === 'undefined') return { x: 0, y: 0 };
    return computeRevealOriginOffset(
      renderedSelection.originX,
      renderedSelection.originY,
      window.innerWidth,
      window.innerHeight
    );
  }, [renderedSelection]);

  if (!renderedSelection) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`3D Model Preview: ${renderedSelection.element.title}`}
      data-testid="element-preview-dialog"
    >
      {/* Light architectural paper veil (no backdrop-filter over WebGL) */}
      <div
        onClick={onClose}
        style={{
          opacity: entered ? 1 : 0,
          transition: 'opacity 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="absolute inset-0 bg-white/75"
      />

      {/* Origin-anchored smoothly expanding 3D architectural inspection sheet */}
      <section
        key={renderedSelection.element.id}
        style={{
          transform: entered
            ? 'translate3d(0px, 0px, 0px) scale(1)'
            : `translate3d(${Math.round(revealOffset.x)}px, ${Math.round(revealOffset.y)}px, 0px) scale(0.22)`,
          opacity: entered ? 1 : 0,
          transition:
            'transform 360ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative z-10 w-[min(980px,92vw)] h-[min(700px,86vh)] bg-white border border-neutral-950 shadow-[0_24px_72px_rgba(0,0,0,0.16)] flex flex-col overflow-hidden"
      >
        {/* Header plate */}
        <header className="px-5 py-3.5 border-b border-neutral-950/15 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0">
            <h2 className="font-editorial text-2xl sm:text-[28px] font-semibold text-neutral-950 leading-none truncate">
              {renderedSelection.element.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-600">
              <span>{renderedSelection.element.subtitle}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tech text-[11px] text-neutral-500">
                {renderedSelection.element.locationLabel}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close 3D preview"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-900 border border-neutral-950 hover:bg-neutral-950 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Close</span>
          </button>
        </header>

        {/* Full Interactive 3D Specimen Viewport */}
        <div className="relative flex-1 min-h-0 bg-white">
          <SpecimenCanvas
            element={renderedSelection.element}
            sketchMode={previewStyle}
            autoRotate={autoRotate}
            resetNonce={resetNonce}
          />

          {/* Subtle bottom-left architectural caption */}
          <div className="absolute bottom-3 left-4 right-4 sm:right-auto sm:max-w-md pointer-events-none">
            <p className="bg-white/92 border border-neutral-950/12 px-3 py-2 text-[11px] leading-relaxed text-neutral-600">
              {renderedSelection.element.description}
            </p>
          </div>

          {/* Subtle top-right interaction hint */}
          <div className="absolute top-3 right-4 pointer-events-none hidden sm:block">
            <span className="bg-white/92 px-2.5 py-1 text-[11px] font-mono-tech text-neutral-500 border border-neutral-950/10">
              Drag to orbit · Scroll to zoom · Esc to close
            </span>
          </div>
        </div>

        {/* Footer: Unboxed Architectural Specs + Exploration Controls */}
        <footer className="px-5 py-2.5 border-t border-neutral-950/15 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Unboxed tabular specifications */}
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {renderedSelection.element.specs.map((spec) => (
              <div key={spec.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
                <dt className="text-[11px] text-neutral-500">{spec.label}</dt>
                <dd className="font-mono-tech text-[11px] font-medium text-neutral-950 tabular-nums">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Specimen viewing controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="Preview sketch style"
            >
              <PenTool className="w-3.5 h-3.5 text-neutral-400 mr-0.5 hidden md:block" aria-hidden="true" />
              {PREVIEW_STYLES.map((opt) => {
                const active = previewStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPreviewStyle(opt.id)}
                    aria-pressed={active}
                    className={`px-2 py-1 text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

            <div className="h-4 w-px bg-neutral-200 mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              aria-pressed={autoRotate}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoRotate
                  ? 'border-neutral-950 bg-neutral-100 text-neutral-950'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-950'
              }`}
            >
              <RotateCw className="w-3 h-3" aria-hidden="true" />
              <span>Turntable</span>
            </button>

            <button
              type="button"
              onClick={() => setResetNonce((n) => n + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Reset View</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
