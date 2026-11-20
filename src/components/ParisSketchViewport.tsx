import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildEiffelTower } from '../scene/buildEiffelTower';
import { buildParisCityFabric } from '../scene/buildParisCityFabric';
import { buildParisLandmarks } from '../scene/buildParisLandmarks';
import {
  CAMERA_PRESETS,
  PARIS_LANDMARKS,
  terrainHeightAt,
  type ParisLandmark,
} from '../scene/parisGeo';
import { createSketchMaterialSet } from '../scene/sketchMaterials';
import type { SketchStyleMode } from '../scene/sketchMath';
import {
  createEiffelTowerElement,
  createHaussmannBuildingElement,
  createParisTreeElement,
  type InspectableElement,
  type InspectedSelection,
} from '../scene/elementCatalog';

export interface CameraTargetRequest {
  position: [number, number, number];
  target: [number, number, number];
  nonce: number;
}

interface ParisSketchViewportProps {
  cameraRequest: CameraTargetRequest;
  sketchMode: SketchStyleMode;
  showLabels: boolean;
  showBoundaryRing: boolean;
  selectedLandmarkId: string | null;
  paused?: boolean;
  onSelectLandmark: (landmark: ParisLandmark) => void;
  onInspectElement: (selection: InspectedSelection) => void;
  onSceneReady?: (info: { buildingCount: number; isSoftwareGl: boolean }) => void;
}

// Pre-allocated scratch objects outside the render loop (zero GC churn)
const _projVec = new THREE.Vector3();
const _boatPos = new THREE.Vector3();
const _boatTan = new THREE.Vector3();
const _boatNorm = new THREE.Vector3();
const _metroPos = new THREE.Vector3();
const _metroTan = new THREE.Vector3();
const _panForward = new THREE.Vector3();
const _panRight = new THREE.Vector3();
const _panMove = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);

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

export function ParisSketchViewport({
  cameraRequest,
  sketchMode,
  showLabels,
  showBoundaryRing,
  selectedLandmarkId,
  paused = false,
  onSelectLandmark,
  onInspectElement,
  onSceneReady,
}: ParisSketchViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hoverTipRef = useRef<HTMLDivElement | null>(null);
  const hoverTitleRef = useRef<HTMLSpanElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Refs synced from React props so the WebGL lifecycle mounts once and never resets
  const sketchModeRef = useRef<SketchStyleMode>(sketchMode);
  const showLabelsRef = useRef<boolean>(showLabels);
  const showBoundaryRef = useRef<boolean>(showBoundaryRing);
  const pausedRef = useRef<boolean>(paused);
  const onSelectLandmarkRef = useRef(onSelectLandmark);
  const onInspectElementRef = useRef(onInspectElement);
  const onSceneReadyRef = useRef(onSceneReady);
  onSelectLandmarkRef.current = onSelectLandmark;
  onInspectElementRef.current = onInspectElement;
  onSceneReadyRef.current = onSceneReady;

  const sceneApiRef = useRef<{
    applyStyle: (mode: SketchStyleMode) => void;
    setBoundaryVisible: (visible: boolean) => void;
    flyTo: (pos: [number, number, number], target: [number, number, number]) => void;
    requestRender: () => void;
    setPaused: (isPaused: boolean) => void;
  } | null>(null);

  // Sync sketch mode
  useEffect(() => {
    sketchModeRef.current = sketchMode;
    sceneApiRef.current?.applyStyle(sketchMode);
  }, [sketchMode]);

  // Sync boundary ring visibility
  useEffect(() => {
    showBoundaryRef.current = showBoundaryRing;
    sceneApiRef.current?.setBoundaryVisible(showBoundaryRing);
  }, [showBoundaryRing]);

  // Sync label visibility
  useEffect(() => {
    showLabelsRef.current = showLabels;
    sceneApiRef.current?.requestRender();
  }, [showLabels]);

  // Sync paused state when 3D element preview modal is open
  useEffect(() => {
    pausedRef.current = paused;
    sceneApiRef.current?.setPaused(paused);
    if (paused && hoverTipRef.current) {
      hoverTipRef.current.style.opacity = '0';
    }
  }, [paused]);

  // Trigger damped camera flight on preset or landmark change
  useEffect(() => {
    if (cameraRequest.nonce > 0) {
      sceneApiRef.current?.flyTo(cameraRequest.position, cameraRequest.target);
    }
  }, [cameraRequest]);

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
      setWebglError('WebGL is unavailable in this browser context.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xffffff, 1);

    const initialW = container.clientWidth || window.innerWidth;
    const initialH = container.clientHeight || window.innerHeight;
    renderer.setSize(initialW, initialH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    // Pure white architectural drafting sheet environment + horizon fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.Fog(0xffffff, 1180, 2350);

    // Procedural Studio Environment Reflection (RoomEnvironment) on all devices
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Balanced warm/cool studio lighting calibrated to keep white paper luminous pure #FFFFFF
    const hemiLight = new THREE.HemisphereLight(0xf6f8ff, 0xffffff, 1.55);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffdf7, 1.45);
    keyLight.position.set(360, 560, 290);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -460;
    keyLight.shadow.camera.right = 460;
    keyLight.shadow.camera.top = 460;
    keyLight.shadow.camera.bottom = -460;
    keyLight.shadow.camera.near = 50;
    keyLight.shadow.camera.far = 1400;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf0f4ff, 0.65);
    fillLight.position.set(-420, 260, -340);
    scene.add(fillLight);

    // Camera configured for crisp architectural perspective across 3 km²
    const hero = CAMERA_PRESETS[0];
    const camera = new THREE.PerspectiveCamera(42, initialW / initialH, 2, 4200);
    camera.position.set(hero.position[0], hero.position[1], hero.position[2]);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(hero.target[0], hero.target[1], hero.target[2]);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.maxPolarAngle = Math.PI * 0.486;
    controls.minPolarAngle = 0.08;
    controls.minDistance = 48;
    controls.maxDistance = 1680;
    controls.panSpeed = 0.9;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.95;
    controls.update();

    // Build shared materials
    const mats = createSketchMaterialSet(renderer);

    // -------------------------------------------------------------------------
    // PURE WHITE SCULPTED TERRAIN GROUND PLANE (extends smoothly into white fog)
    // -------------------------------------------------------------------------
    const groundGeo = new THREE.PlaneGeometry(3200, 3200, 84, 84);
    groundGeo.rotateX(-Math.PI / 2);
    const gPos = groundGeo.attributes.position;
    for (let i = 0; i < gPos.count; i++) {
      const gx = gPos.getX(i);
      const gz = gPos.getZ(i);
      gPos.setY(i, terrainHeightAt(gx, gz));
    }
    groundGeo.computeVertexNormals();
    const groundMesh = new THREE.Mesh(groundGeo, mats.whiteGroundMat);
    groundMesh.receiveShadow = true;
    groundMesh.name = 'WhitePaperGround';
    scene.add(groundMesh);

    // Soft radial contact shadow disc grounding the Eiffel Tower piers onto the white sheet
    const contactGeo = new THREE.CircleGeometry(108, 48);
    contactGeo.rotateX(-Math.PI / 2);
    const contactMat = new THREE.MeshBasicMaterial({
      map: mats.contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    });
    const contactDisc = new THREE.Mesh(contactGeo, contactMat);
    contactDisc.position.y = 0.06;
    scene.add(contactDisc);

    // -------------------------------------------------------------------------
    // BUILD PROCEDURAL 3D PARIS 3 KM² SKETCH ARCHITECTURE
    // -------------------------------------------------------------------------
    const eiffel = buildEiffelTower({
      inkLinePrimary: mats.inkLinePrimary,
      inkLineFine: mats.inkLineFine,
      stickBlackMat: mats.stickBlackMat,
      whiteOcclusionMat: mats.whiteOcclusionMat,
      whiteHatchMat: mats.whiteHatchMat,
    });
    scene.add(eiffel.group);

    const landmarks = buildParisLandmarks({
      inkLinePrimary: mats.inkLinePrimary,
      inkLineFine: mats.inkLineFine,
      inkLineFaint: mats.inkLineFaint,
      stickBlackMat: mats.stickBlackMat,
      whiteOcclusionMat: mats.whiteOcclusionMat,
      whiteHatchMat: mats.whiteHatchMat,
    });
    scene.add(landmarks.group);

    const cityFabric = buildParisCityFabric({
      inkLinePrimary: mats.inkLinePrimary,
      inkLineFine: mats.inkLineFine,
      inkLineFaint: mats.inkLineFaint,
      whiteHatchMat: mats.whiteHatchMat,
    });
    scene.add(cityFabric.group);

    const allOcclusionMeshes: THREE.Mesh[] = [
      ...eiffel.solidMeshes,
      ...landmarks.solidMeshes,
      ...cityFabric.solidMeshes,
    ];

    // -------------------------------------------------------------------------
    // LAYER-1 INVISIBLE RAYCAST PROXIES (zero GPU render cost, instant picking)
    // -------------------------------------------------------------------------
    const pickProxyMat = new THREE.MeshBasicMaterial({ visible: true });

    // Tapered 4-sided pyramid proxy covering the full 330m Eiffel Tower silhouette
    const eiffelPickGeo = new THREE.CylinderGeometry(7, 64, 332, 4, 1);
    eiffelPickGeo.rotateY(Math.PI / 4);
    const eiffelPickProxy = new THREE.Mesh(eiffelPickGeo, pickProxyMat);
    eiffelPickProxy.position.set(0, 166, 0);
    eiffelPickProxy.layers.set(1);
    eiffelPickProxy.userData.pickElement = createEiffelTowerElement();
    scene.add(eiffelPickProxy);

    // Single InstancedMesh raycast proxy covering every Parisian park/boulevard/courtyard tree
    const allTrees = [...landmarks.treePlacements, ...cityFabric.treePlacements];
    const treePickGeo = new THREE.SphereGeometry(1, 6, 5);
    const treePickMesh = new THREE.InstancedMesh(treePickGeo, pickProxyMat, Math.max(1, allTrees.length));
    treePickMesh.layers.set(1);
    const treeDummy = new THREE.Object3D();
    for (let i = 0; i < allTrees.length; i++) {
      const tr = allTrees[i];
      treeDummy.position.set(tr.x, tr.y + tr.height * 0.54, tr.z);
      treeDummy.scale.set(tr.canopyRadius * 1.18, tr.height * 0.56, tr.canopyRadius * 1.18);
      treeDummy.updateMatrix();
      treePickMesh.setMatrixAt(i, treeDummy.matrix);
    }
    treePickMesh.instanceMatrix.needsUpdate = true;
    treePickMesh.computeBoundingSphere();
    scene.add(treePickMesh);

    const pickables: THREE.Object3D[] = [
      eiffelPickProxy,
      ...landmarks.pickableMeshes,
      cityFabric.bodyInstanced,
      cityFabric.roofInstanced,
      treePickMesh,
    ];

    const raycaster = new THREE.Raycaster();
    raycaster.layers.enableAll();
    const pointerNdc = new THREE.Vector2();

    const resolvePickElement = (hit: THREE.Intersection): InspectableElement | null => {
      if (hit.object === treePickMesh && hit.instanceId !== undefined) {
        const tr = allTrees[hit.instanceId];
        if (!tr) return null;
        return createParisTreeElement({
          index: hit.instanceId,
          height: tr.height,
          canopyRadius: tr.canopyRadius,
          locationLabel: tr.locationLabel,
        });
      }
      if (
        (hit.object === cityFabric.bodyInstanced || hit.object === cityFabric.roofInstanced) &&
        hit.instanceId !== undefined
      ) {
        const w = cityFabric.wingSpecs[hit.instanceId];
        if (!w) return null;
        return createHaussmannBuildingElement({
          index: hit.instanceId,
          width: w.w,
          height: w.h,
          depth: w.d,
          floors: w.floors,
          mansardHeight: w.mansardH,
          cornerRotunda: w.cornerRotunda,
          arrondissement: w.arrondissement,
        });
      }
      const tagged = hit.object.userData?.pickElement as InspectableElement | undefined;
      return tagged ?? null;
    };

    const raycastAtClientPoint = (clientX: number, clientY: number): InspectableElement | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      // In Pure Stick mode occlusion meshes are hidden for rendering, so temporarily reveal during the synchronous raycast
      const restorePureStick = sketchModeRef.current === 'pure-stick';
      if (restorePureStick) {
        for (const m of allOcclusionMeshes) m.visible = true;
      }
      try {
        const hits = raycaster.intersectObjects(pickables, false);
        for (let i = 0; i < hits.length; i++) {
          const el = resolvePickElement(hits[i]);
          if (el) return el;
        }
        return null;
      } finally {
        if (restorePureStick) {
          for (const m of allOcclusionMeshes) m.visible = false;
        }
      }
    };

    // Position animated riverboats & Métro Line 6 train at initial deterministic poses
    const updateDynamicProps = (dt: number) => {
      // Riverboats gliding smoothly along the Seine
      for (const boat of landmarks.boats) {
        if (dt > 0) {
          boat.t += boat.speed * dt * boat.direction;
          if (boat.t > 0.94) boat.t = 0.08;
          if (boat.t < 0.08) boat.t = 0.94;
        }
        landmarks.seineCurve.getPointAt(boat.t, _boatPos);
        landmarks.seineCurve.getTangentAt(boat.t, _boatTan);
        _boatNorm.set(-_boatTan.z, 0, _boatTan.x).normalize();
        if (_boatNorm.x + _boatNorm.z < 0) _boatNorm.negate();

        boat.group.position.set(
          _boatPos.x + _boatNorm.x * boat.laneOffset,
          -5.05,
          _boatPos.z + _boatNorm.z * boat.laneOffset
        );
        const yaw = Math.atan2(-_boatTan.z * boat.direction, _boatTan.x * boat.direction);
        boat.group.rotation.y = yaw;
      }

      // Métro Line 6 train gliding across Pont de Bir-Hakeim viaduct
      const metro = landmarks.metroTrain;
      if (dt > 0) {
        metro.t += metro.speed * dt * metro.direction;
        if (metro.t >= 0.95) {
          metro.t = 0.95;
          metro.direction = -1;
        } else if (metro.t <= 0.06) {
          metro.t = 0.06;
          metro.direction = 1;
        }
      }
      landmarks.metroCurve.getPointAt(metro.t, _metroPos);
      landmarks.metroCurve.getTangentAt(metro.t, _metroTan);
      metro.group.position.set(_metroPos.x, _metroPos.y + 0.35, _metroPos.z);
      metro.group.rotation.y = Math.atan2(-_metroTan.z, _metroTan.x);
    };
    updateDynamicProps(0);

    // Pre-warm shaders on real GPUs
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // -------------------------------------------------------------------------
    // PROJECTED 3D LANDMARK CALLOUT LABELS (direct DOM refs + collision avoidance)
    // -------------------------------------------------------------------------
    const placedRects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

    const updateProjectedLabels = () => {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      const visible = showLabelsRef.current;
      placedRects.length = 0;

      // Reserve the Eiffel Tower's core trunk zone on screen so distant background labels never stamp over the iron lattice
      _projVec.set(0, 140, 0).project(camera);
      const towerCenterX = (_projVec.x * 0.5 + 0.5) * width;
      const towerCenterY = (-_projVec.y * 0.5 + 0.5) * height;
      const towerDist = camera.position.length();
      const reserveTowerCore = towerDist < 850;

      for (let i = 0; i < PARIS_LANDMARKS.length; i++) {
        const el = labelRefs.current[i];
        if (!el) continue;
        if (!visible) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        const lm = PARIS_LANDMARKS[i];
        const baseY = Math.max(0, terrainHeightAt(lm.x, lm.z));
        const anchorY = lm.id === 'eiffel-tower' ? 336 : baseY + lm.heightMeters + 14;
        _projVec.set(lm.x, anchorY, lm.z);
        _projVec.project(camera);

        const inFront = _projVec.z >= -1 && _projVec.z <= 1;
        const sx = (_projVec.x * 0.5 + 0.5) * width;
        const sy = (-_projVec.y * 0.5 + 0.5) * height;
        const inBounds = sx > 68 && sx < width - 68 && sy > 58 && sy < height - 102;

        // Keep top-left title plate clear
        const hitsTitlePlate = sx < 395 && sy < 125;

        // Keep Eiffel Tower's lower/mid lattice clear of background labels behind it
        const hitsTowerCore =
          reserveTowerCore &&
          lm.id !== 'eiffel-tower' &&
          Math.abs(sx - towerCenterX) < 105 &&
          sy > towerCenterY - 120 &&
          sy < height - 90;

        const estW = Math.max(92, lm.name.length * 6.8 + 26);
        const estH = 38;
        const rx0 = sx - estW * 0.5;
        const rx1 = sx + estW * 0.5;
        const ry0 = sy - estH;
        const ry1 = sy + 6;

        let overlaps = false;
        for (let j = 0; j < placedRects.length; j++) {
          const r = placedRects[j];
          if (rx0 < r.x1 && rx1 > r.x0 && ry0 < r.y1 && ry1 > r.y0) {
            overlaps = true;
            break;
          }
        }

        if (inFront && inBounds && !hitsTitlePlate && !hitsTowerCore && !overlaps) {
          placedRects.push({ x0: rx0 - 6, y0: ry0 - 6, x1: rx1 + 6, y1: ry1 + 6 });
          el.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -100%)`;
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
        } else {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        }
      }
    };

    // -------------------------------------------------------------------------
    // CAMERA TRANSITION STATE + KEYBOARD PANNING
    // -------------------------------------------------------------------------
    const desiredCamPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    let isFlying = false;

    const pressedKeys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        pressedKeys.add(e.code);
        isFlying = false;
        requestRender();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onControlsStart = () => {
      isFlying = false;
    };
    controls.addEventListener('start', onControlsStart);

    // Click-to-inspect (discriminates clean clicks from orbit drags) + throttled hover hint
    let pointerDownX = 0;
    let pointerDownY = 0;
    let pointerDownButton = -1;
    let isPointerDragging = false;
    let lastHoverRaycast = 0;

    const hideHoverTip = () => {
      if (hoverTipRef.current) {
        hoverTipRef.current.style.opacity = '0';
      }
      renderer.domElement.style.cursor = 'grab';
    };

    const onCanvasPointerDown = (e: PointerEvent) => {
      if (pausedRef.current) return;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      pointerDownButton = e.button;
      isPointerDragging = true;
      hideHoverTip();
    };

    const onCanvasPointerUp = (e: PointerEvent) => {
      const wasDown = isPointerDragging;
      isPointerDragging = false;
      if (!wasDown || pointerDownButton !== 0 || pausedRef.current) return;
      const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (dist > 6) return;

      const picked = raycastAtClientPoint(e.clientX, e.clientY);
      if (picked) {
        hideHoverTip();
        onInspectElementRef.current({
          element: picked,
          originX: e.clientX,
          originY: e.clientY,
        });
      }
    };

    const onCanvasPointerMove = (e: PointerEvent) => {
      if (isPointerDragging || pausedRef.current) return;
      const now = performance.now();
      if (now - lastHoverRaycast < 110) return;
      lastHoverRaycast = now;

      const hovered = raycastAtClientPoint(e.clientX, e.clientY);
      if (hovered && hoverTipRef.current && hoverTitleRef.current) {
        renderer.domElement.style.cursor = 'pointer';
        hoverTitleRef.current.textContent = hovered.title;
        hoverTipRef.current.style.transform = `translate3d(${Math.round(e.clientX)}px, ${Math.round(
          e.clientY - 14
        )}px, 0) translate(-50%, -100%)`;
        hoverTipRef.current.style.opacity = '1';
      } else {
        hideHoverTip();
      }
    };

    const onCanvasPointerLeave = () => {
      isPointerDragging = false;
      hideHoverTip();
    };

    renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
    renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);
    renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
    renderer.domElement.addEventListener('pointerleave', onCanvasPointerLeave);

    // -------------------------------------------------------------------------
    // RENDER SCHEDULER: 60fps GPU loop vs fenced on-demand Software-WebGL path
    // -------------------------------------------------------------------------
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

    const stepSimulation = (dt: number) => {
      const clampedDt = Math.min(dt, 0.08);

      // Keyboard WASD / Arrow camera pan
      if (pressedKeys.size > 0) {
        const panSpeed = 240 * clampedDt;
        camera.getWorldDirection(_panForward);
        _panForward.y = 0;
        if (_panForward.lengthSq() > 1e-5) _panForward.normalize();
        _panRight.crossVectors(_panForward, _upVec).normalize();
        _panMove.set(0, 0, 0);
        if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) _panMove.add(_panForward);
        if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) _panMove.sub(_panForward);
        if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) _panMove.add(_panRight);
        if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) _panMove.sub(_panRight);
        if (_panMove.lengthSq() > 0) {
          _panMove.normalize().multiplyScalar(panSpeed);
          camera.position.add(_panMove);
          controls.target.add(_panMove);
        }
      }

      // Exponentially damped camera preset transition
      if (isFlying) {
        if (isSoftwareGl) {
          // Software WebGL: settle quickly and deterministically without long frame storms
          camera.position.lerp(desiredCamPos, 0.55);
          controls.target.lerp(desiredTarget, 0.55);
          if (
            camera.position.distanceTo(desiredCamPos) < 2.0 &&
            controls.target.distanceTo(desiredTarget) < 2.0
          ) {
            camera.position.copy(desiredCamPos);
            controls.target.copy(desiredTarget);
            isFlying = false;
          }
        } else {
          const alpha = 1 - Math.exp(-5.2 * clampedDt);
          camera.position.lerp(desiredCamPos, alpha);
          controls.target.lerp(desiredTarget, alpha);
          if (
            camera.position.distanceTo(desiredCamPos) < 0.8 &&
            controls.target.distanceTo(desiredTarget) < 0.8
          ) {
            camera.position.copy(desiredCamPos);
            controls.target.copy(desiredTarget);
            isFlying = false;
          }
        }
      }

      controls.update();

      // Advance boats & metro train smoothly on GPU (keep static crisp pose on software WebGL)
      if (!isSoftwareGl) {
        updateDynamicProps(clampedDt);
      }

      renderer.render(scene, camera);
      updateProjectedLabels();
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
        stepSimulation(dt);
        const done = () => {
          renderBusy = false;
          if (renderDirty || isFlying || pressedKeys.size > 0) {
            requestRender();
          }
        };
        afterDraw(done);
      });
    }

    const gpuLoop = (now: number) => {
      if (disposed) return;
      if (pausedRef.current) {
        lastTime = now;
        frameId = requestAnimationFrame(gpuLoop);
        return;
      }
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      stepSimulation(dt);
      frameId = requestAnimationFrame(gpuLoop);
    };

    // Apply sketch visual style mode
    const applyStyle = (mode: SketchStyleMode) => {
      if (mode === 'pure-stick') {
        // Pure stick wireframe: hide white building occlusion masses so everything is 100% black 3D sticks in white space!
        for (const m of allOcclusionMeshes) m.visible = false;
        contactDisc.visible = false;
        mats.inkLinePrimary.color.setHex(0x050505);
        mats.inkLineFine.color.setHex(0x0a0a0a);
        mats.inkLineFine.opacity = 0.92;
        mats.inkLineFaint.opacity = 0.58;
      } else if (mode === 'engraving') {
        for (const m of allOcclusionMeshes) m.visible = true;
        contactDisc.visible = true;
        mats.whiteHatchMat.map = mats.engravingHatchTex;
        mats.whiteHatchMat.needsUpdate = true;
        mats.inkLinePrimary.color.setHex(0x050505);
        mats.inkLineFine.color.setHex(0x111111);
        mats.inkLineFine.opacity = 0.94;
        mats.inkLineFaint.opacity = 0.68;
      } else {
        // Default: Architectural Ink Sketch (crisp white paper occlusion + subtle pen hatching + black sticks)
        for (const m of allOcclusionMeshes) m.visible = true;
        contactDisc.visible = true;
        mats.whiteHatchMat.map = mats.subtleHatchTex;
        mats.whiteHatchMat.needsUpdate = true;
        mats.inkLinePrimary.color.setHex(0x080808);
        mats.inkLineFine.color.setHex(0x1a1a1a);
        mats.inkLineFine.opacity = 0.86;
        mats.inkLineFaint.opacity = 0.5;
      }
      requestRender();
    };

    const setBoundaryVisible = (visible: boolean) => {
      cityFabric.boundaryRingGroup.visible = visible;
      requestRender();
    };

    const flyTo = (pos: [number, number, number], target: [number, number, number]) => {
      desiredCamPos.set(pos[0], pos[1], pos[2]);
      desiredTarget.set(target[0], target[1], target[2]);
      isFlying = true;
      requestRender();
    };

    const setPaused = (isPaused: boolean) => {
      controls.enabled = !isPaused;
      if (!isPaused) {
        lastTime = performance.now();
        requestRender();
      }
    };

    sceneApiRef.current = {
      applyStyle,
      setBoundaryVisible,
      flyTo,
      requestRender,
      setPaused,
    };

    // Apply initial props
    applyStyle(sketchModeRef.current);
    setBoundaryVisible(showBoundaryRef.current);

    // OrbitControls change listener for software-GL on-demand rendering
    const onControlsChange = () => {
      if (isSoftwareGl) requestRender();
    };
    controls.addEventListener('change', onControlsChange);

    // WebGL context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL rendering context was interrupted. Reloading will restore the scene.');
    };
    const onContextRestored = () => {
      setWebglError(null);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Resize observer
    const onResize = () => {
      if (disposed || !container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    // Start rendering!
    if (isSoftwareGl) {
      requestRender();
    } else {
      frameId = requestAnimationFrame(gpuLoop);
    }

    onSceneReadyRef.current?.({
      buildingCount: cityFabric.buildingCount,
      isSoftwareGl,
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      sceneApiRef.current = null;

      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.removeEventListener('pointerup', onCanvasPointerUp);
      renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onCanvasPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      controls.dispose();
      envTarget.dispose();
      mats.dispose();
      pickProxyMat.dispose();
      groundGeo.dispose();
      contactGeo.dispose();
      contactMat.dispose();

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
  }, []);

  if (webglError) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center p-8">
        <div className="max-w-md border border-neutral-950 p-6 text-center">
          <h2 className="font-editorial text-2xl font-semibold text-neutral-950">
            3D Sketch Viewport Unavailable
          </h2>
          <p className="mt-2 text-sm text-neutral-600">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white overflow-hidden">
      {/* Isolated WebGL canvas mount — sibling to all React overlays */}
      <div
        ref={mountRef}
        data-testid="three-canvas-mount"
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      />

      {/* Projected 3D architectural ink callout labels */}
      <div
        className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
        aria-label="3D landmark callouts"
      >
        {PARIS_LANDMARKS.map((lm, index) => {
          const isSelected = selectedLandmarkId === lm.id;
          return (
            <button
              key={lm.id}
              ref={(el) => {
                labelRefs.current[index] = el;
              }}
              type="button"
              onClick={() => onSelectLandmarkRef.current(lm)}
              style={{ opacity: 0, left: 0, top: 0 }}
              className={`absolute flex flex-col items-center group cursor-pointer transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-neutral-950 ${
                isSelected ? 'z-20' : 'z-10'
              }`}
            >
              <span
                className={`px-2 py-0.5 text-[11px] font-medium tracking-tight border whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-neutral-950 text-white border-neutral-950'
                    : 'bg-white/95 text-neutral-950 border-neutral-900/70 group-hover:bg-neutral-950 group-hover:text-white'
                }`}
              >
                {lm.name}
                {lm.id === 'eiffel-tower' ? ' · 330 m' : ''}
              </span>
              <span
                aria-hidden="true"
                className="w-px h-3.5 bg-neutral-950/75 group-hover:bg-neutral-950"
              />
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 border border-neutral-950 bg-white rotate-45 -mt-0.5"
              />
            </button>
          );
        })}
      </div>
      {/* Zero-rerender architectural ink hover tooltip for clickable 3D elements */}
      <div
        ref={hoverTipRef}
        aria-hidden="true"
        style={{ opacity: 0, left: 0, top: 0 }}
        className="fixed z-20 pointer-events-none transition-opacity duration-100"
      >
        <div className="bg-neutral-950 text-white px-2.5 py-1 text-[11px] whitespace-nowrap shadow-sm flex items-center gap-1.5">
          <span ref={hoverTitleRef} className="font-medium" />
          <span className="text-neutral-400">·</span>
          <span className="font-mono-tech text-[10px] text-neutral-300">Click to inspect 3D</span>
        </div>
      </div>
    </div>
  );
}
