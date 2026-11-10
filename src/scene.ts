import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SLOTS, type Configuration, type Family, type PartKey } from './catalog';
import { createEdgeGeometry, createParticleGeometry, createParticleMaterial } from './particles';
import { getModel, modelParts, SHIP_ID, type ModelPart, type ModuleConfig } from './models';

export type RenderQuality = 'auto' | 'light' | 'detail';
export interface SceneState {
  modelId: string;
  moduleConfig?: ModuleConfig;
  animation: string | null; playing: boolean; loop: boolean;
  config: Configuration; selected: PartKey; explosion: number; isolate: boolean;
  particles: boolean; labels: boolean; brightness: number; quality: RenderQuality;
}
interface SceneCallbacks {
  onSelect: (key: PartKey) => void; onHover: (key: PartKey | null) => void;
  onReady: () => void; onError: (error: string) => void; onProgress: (loaded: number, total: number) => void;
  onStats?: (points: number) => void;
  onPlaybackEnd?: () => void;
}
type Asset = { source: THREE.Group; particles: THREE.BufferGeometry; edges: THREE.BufferGeometry; center: THREE.Vector3 };
type Model = { id: string; group: THREE.Group; visual: THREE.Group; motion: THREE.Group; content: THREE.Object3D; cloud: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; outline: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>; center: THREE.Vector3; target: THREE.Vector3 };

export class WorkshopScene {
  renderer: THREE.WebGLRenderer;
  camera = new THREE.PerspectiveCamera(38, 1, .05, 500);
  scene = new THREE.Scene();
  controls: OrbitControls;
  private pivot = new THREE.Group();
  private ship = new THREE.Group();
  private mixer = new THREE.AnimationMixer(this.ship);
  private clips = new Map<string, THREE.AnimationClip>();
  private animationBounds = new Map<string, Record<string, { min: number[]; max: number[] }>>();
  private action: THREE.AnimationAction | null = null;
  private activeAnimation: string | null = null;
  private wasPlaying = false;
  private rotationTarget = new THREE.Quaternion();
  private partRotationTarget = new THREE.Quaternion();
  private assets = new Map<string, Asset>();
  private loading = new Map<string, Promise<Asset>>();
  private mounted = new Map<PartKey, Model>();
  private sockets = new Map<PartKey, THREE.Mesh>();
  private holders = new Map<PartKey, { group: THREE.Group; motion: THREE.Group }>();
  private connectors = new Map<PartKey, THREE.Line>();
  private markers = new Map<PartKey, HTMLElement>();
  private markerPositions = new Map<PartKey, { x: number; y: number; visible: boolean }>();
  private raycaster = new THREE.Raycaster();
  private state: SceneState;
  private running = true;
  private ready = false;
  private revision = 0;
  private raf = 0;
  private last = 0;
  private idle = true;
  private observer: ResizeObserver;
  private hovered: PartKey | null = null;
  private lastPick = { x: -999, y: -999, time: 0 };
  private pointerStart: { x: number; y: number } | null = null;
  private isolated = false;
  private restoreCamera: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private isolateKey = '';
  private sized = false;
  private renderUntil = performance.now() + 300;
  private scratch = new THREE.Vector3();
  private cameraInverse = new THREE.Quaternion();
  private rotationDelta = new THREE.Quaternion();
  private renderRatio = 1;
  private pendingPan = new THREE.Vector3();
  private targetDistance: number | null = null;
  private invalidate = () => {
    this.renderUntil = performance.now() + 220;
    if (this.running && !this.raf) {
      if (this.idle) { this.last = performance.now() - 1000 / 60; this.idle = false; }
      this.raf = requestAnimationFrame(this.animate);
    }
  };
  private lost = (event: Event) => { event.preventDefault(); this.callbacks.onError('Kết nối đồ họa bị gián đoạn. Hãy tải lại trang.'); };
  private visibility = () => { if (!document.hidden) this.invalidate(); };

  constructor(private host: HTMLElement, initial: SceneState, private callbacks: SceneCallbacks) {
    this.state = initial;
    this.mixer.addEventListener('finished', () => this.callbacks.onPlaybackEnd?.());
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', 'Mô hình hạt 3D: kéo chuột để xoay, cuộn để thu phóng');
    this.renderer.domElement.dataset.scene = 'true';
    this.renderer.domElement.addEventListener('webglcontextlost', this.lost);
    host.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .16;
    this.controls.minDistance = 2; this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI * .9; this.controls.zoomSpeed = .8;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', this.invalidate);
    this.resetCamera();
    this.scene.add(new THREE.HemisphereLight(0xe4eaff, 0x384452, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(5, 15, 12); this.scene.add(light);
    this.ship.position.y = this.isShip ? -1.7 : 0; this.pivot.add(this.ship); this.scene.add(this.pivot);
    for (const part of this.parts.filter(p => p.replaceable)) {
      const socket = new THREE.Mesh(new THREE.TorusGeometry(.35, .025, 5, 24), new THREE.MeshBasicMaterial({ color: part.color, transparent: true, opacity: .7, depthTest: false }));
      socket.position.fromArray(this.isShip ? SLOTS[part.key as Family].position : part.position);
      if (part.normal) socket.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3().fromArray(part.normal).normalize());
      else if (part.key === 'sensor' || part.key === 'weapon') socket.rotation.x = -Math.PI / 2;
      else if (part.key === 'cargo') socket.rotation.y = Math.PI / 2;
      socket.userData.partKey = part.key;
      this.ship.add(socket); this.sockets.set(part.key, socket);
    }
    for (const part of this.parts) {
      const group = new THREE.Group(), motion = new THREE.Group(); motion.name = `motion-${part.key.replace('assembly:', '')}`;
      group.add(motion); this.ship.add(group); this.holders.set(part.key, { group, motion });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: part.color, transparent: true, opacity: .4, dashSize: .14, gapSize: .16 }));
      line.frustumCulled = false; this.ship.add(line); this.connectors.set(part.key, line);
    }
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown); canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove); canvas.addEventListener('pointerleave', this.onPointerLeave);
    document.addEventListener('visibilitychange', this.visibility);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(host); this.resize();
    void this.initialize();
  }

  setMarkers(markers: Map<PartKey, HTMLElement>) { this.markers = markers; this.invalidate(); }
  private get isShip() { return this.state.modelId === SHIP_ID; }
  private get parts() { return modelParts(this.state.modelId, this.state.config, this.state.moduleConfig); }
  private part(key: PartKey): ModelPart { return this.parts.find(part => part.key === key)!; }

  private loadAsset(id: string): Promise<Asset> {
    const cached = this.assets.get(id); if (cached) return Promise.resolve(cached);
    const pending = this.loading.get(id); if (pending) return pending;
    const promise = (async () => {
      const [gltf, response, edgeResponse] = await Promise.all([new GLTFLoader().loadAsync(`/models/${id}.glb`), fetch(`/particles/${id}.bin?v=edges-1`), fetch(`/particles/${id}.edges.bin?v=edges-1`)]);
      if (!response.ok || !edgeResponse.ok) throw new Error(`Không tải được dữ liệu hạt/cạnh ${id}.`);
      const particles = createParticleGeometry(await response.arrayBuffer());
      const edges = createEdgeGeometry(await edgeResponse.arrayBuffer());
      const center = new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3());
      const asset = { source: gltf.scene, particles, edges, center };
      if (this.running) this.assets.set(id, asset);
      else { particles.dispose(); edges.dispose(); this.disposeObject(gltf.scene, true); }
      return asset;
    })();
    this.loading.set(id, promise);
    void promise.catch(() => this.loading.delete(id));
    return promise;
  }

  private neededIds() { return [...new Set(this.parts.map(part => part.assetId).filter((id): id is string => !!id))]; }

  private async initialize() {
    try {
      const ids = this.neededIds(); let count = 0;
      await Promise.all([
        ...ids.map(async id => { await this.loadAsset(id); if (this.running) this.callbacks.onProgress(++count, ids.length); }),
        this.loadAnimations(),
      ]);
      if (!this.running) return;
      this.ready = true; this.sync(); if (!this.isShip) this.resetCamera(); this.callbacks.onReady();
    } catch (error) { if (this.running) this.callbacks.onError(`Không tải được mô hình. ${String(error)}`); }
  }

  private async loadAnimations() {
    if (!getModel(this.state.modelId).animations.length) return;
    const response = await fetch(`/animations/${this.state.modelId}.json`);
    if (!response.ok) throw new Error('Không tải được chuyển động.');
    const data = await response.json();
    if (!this.running) return;
    for (const clip of data) { this.clips.set(clip.name, THREE.AnimationClip.parse(clip)); this.animationBounds.set(clip.name, clip.bounds); }
  }

  update(state: SceneState) {
    const qualityChanged = this.state.quality !== state.quality;
    this.state = state;
    if (qualityChanged) this.resize();
    if (!this.ready) return;
    const revision = ++this.revision;
    const missing = this.neededIds().filter(id => !this.assets.has(id));
    if (!missing.length) this.sync();
    else void Promise.all(missing.map(id => this.loadAsset(id))).then(() => { if (this.running && revision === this.revision) this.sync(); }).catch(error => { if (this.running) this.callbacks.onError(String(error)); });
  }

  private instantiate(key: PartKey, id: string): Model {
    const asset = this.assets.get(id)!;
    const content = asset.source.clone(true);
    content.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.userData.partKey = key;
      const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(m => {
        const material = m.clone();
        if (material instanceof THREE.MeshStandardMaterial) { material.metalness = Math.min(material.metalness, .25); material.roughness = Math.max(material.roughness, .5); }
        return material;
      });
      node.material = Array.isArray(node.material) ? materials : materials[0];
    });
    const cloud = new THREE.Points(asset.particles, createParticleMaterial(this.part(key).color, this.state.brightness, this.renderRatio));
    cloud.raycast = () => {}; // Picking uses original mesh geometry only, never thousands of points.
    const outline = new THREE.LineSegments(asset.edges, new THREE.LineBasicMaterial({ color: this.part(key).color, transparent: true, opacity: .88, depthTest: false, depthWrite: false, toneMapped: false }));
    outline.raycast = () => {}; outline.renderOrder = 1;
    const { group, motion } = this.holders.get(key)!, visual = new THREE.Group();
    const center = asset.center.clone();
    visual.position.copy(center); content.position.sub(center); cloud.position.sub(center); outline.position.sub(center);
    visual.add(content, cloud, outline); motion.add(visual);
    const target = new THREE.Vector3().fromArray(this.part(key).position);
    group.position.copy(target);
    return { id, group, visual, motion, content, cloud, outline, center, target };
  }

  private sync() {
    const needed = this.parts.map(part => [part.key, part.assetId] as const);
    for (const [key, id] of needed) {
      const current = this.mounted.get(key);
      if (current?.id !== id) {
        if (current) { current.visual.removeFromParent(); current.group.visible = false; this.disposeObject(current.content, false); current.cloud.material.dispose(); current.outline.material.dispose(); this.mounted.delete(key); }
        if (id) this.mounted.set(key, this.instantiate(key, id));
      }
    }
    const fraction = this.state.quality === 'detail' ? .44 : this.state.quality === 'light' ? .14 : .22;
    let pointCount = 0;
    for (const [key, model] of this.mounted) {
      model.group.visible = !this.state.isolate || key === this.state.selected;
      model.cloud.visible = this.state.particles;
      model.outline.visible = this.state.particles;
      model.outline.material.color.set(this.part(key).color).multiplyScalar(Math.min(1.6, .85 + this.state.brightness * .25));
      const count = Math.floor(model.cloud.geometry.getAttribute('position').count * fraction);
      model.cloud.geometry.setDrawRange(0, count);
      model.cloud.material.uniforms.uBrightness.value = this.state.brightness;
      model.cloud.material.uniforms.uSize.value = this.state.quality === 'light' ? 2.1 : 1.8;
      if (model.group.visible && this.state.particles) pointCount += count;
      model.content.traverse(node => { if (node instanceof THREE.Mesh) for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material.visible = !this.state.particles; });
      const part = this.part(key);
      model.target.fromArray(part.position);
      if (!this.state.isolate) model.target.addScaledVector(this.scratch.fromArray(part.explode), this.state.explosion);
      this.connectors.get(key)!.visible = !this.state.isolate && this.state.explosion > .02 && part.explode.some(v => v !== 0);
      if (!this.state.isolate) model.visual.quaternion.identity();
    }
    for (const part of this.parts.filter(p=>p.replaceable)) {
      this.sockets.get(part.key)!.visible = !this.state.isolate && (!part.assetId || this.state.selected === part.key || this.state.explosion > .1);
      if (!part.assetId) this.connectors.get(part.key)!.visible = false;
    }
    const motionChanged = this.syncAnimation();
    const inspectId = `${this.state.selected}:${this.part(this.state.selected)?.assetId}`;
    if (this.state.isolate && (!this.isolated || this.isolateKey !== inspectId)) {
      if (!this.isolated) this.restoreCamera = { position: this.camera.position.clone(), target: this.controls.target.clone() };
      this.isolated = true; this.isolateKey = inspectId; this.partRotationTarget.identity();
      const model = this.mounted.get(this.state.selected); if (model) model.group.position.copy(model.target);
      this.frameSelected();
    } else if (!this.state.isolate && this.isolated) {
      this.isolated = false; this.isolateKey = '';
      if (this.restoreCamera) { this.camera.position.copy(this.restoreCamera.position); this.controls.target.copy(this.restoreCamera.target); }
      this.controls.minDistance = 5; this.controls.update();
    }
    if (motionChanged && this.state.isolate) this.frameSelected();
    this.updateHighlight(); this.callbacks.onStats?.(pointCount); this.invalidate();
  }

  private syncAnimation() {
    const changed = this.activeAnimation !== this.state.animation;
    if (changed) {
      this.mixer.stopAllAction(); this.action = null; this.activeAnimation = this.state.animation;
      for (const model of this.holders.values()) { model.motion.position.set(0,0,0); model.motion.quaternion.identity(); model.motion.scale.set(1,1,1); }
      const clip = this.state.animation ? this.clips.get(this.state.animation) : undefined;
      if (clip) this.action = this.mixer.clipAction(clip).reset().play();
    }
    if (this.action) {
      const definition = getModel(this.state.modelId).animations.find(a => a.name === this.state.animation);
      this.action.setLoop(this.state.loop ? definition?.loop === 'repeat' ? THREE.LoopRepeat : THREE.LoopPingPong : THREE.LoopOnce, this.state.loop ? Infinity : 1);
      this.action.clampWhenFinished = true;
      if (this.state.playing && !this.wasPlaying && this.action.time >= this.action.getClip().duration) this.action.reset().play();
      this.action.paused = !this.state.playing;
      this.mixer.update(0);
    }
    this.wasPlaying = this.state.playing;
    return changed;
  }

  private updateHighlight() {
    for (const [key, model] of this.mounted) {
      model.cloud.material.uniforms.uHighlight.value = key === this.hovered ? 1.25 : key === this.state.selected ? 1.08 : 1;
      model.outline.material.opacity = key === this.hovered ? 1 : .88;
    }
  }

  private frameSelected() {
    this.pendingPan.set(0,0,0); this.targetDistance = null;
    const model = this.mounted.get(this.state.selected); if (!model) return;
    this.pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.group);
    const bounds = this.state.animation ? this.animationBounds.get(this.state.animation)?.[this.state.selected] : undefined;
    if (bounds) box.union(new THREE.Box3(new THREE.Vector3().fromArray(bounds.min),new THREE.Vector3().fromArray(bounds.max)).applyMatrix4(model.group.matrixWorld));
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const diameter = Math.max(size.x, size.y, size.z);
    const fit = Math.max(diameter / this.camera.aspect, diameter) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.35;
    this.controls.target.copy(center); this.camera.position.copy(center).add(new THREE.Vector3(1, .7, 1).normalize().multiplyScalar(fit));
    this.controls.minDistance = Math.max(.5, diameter * .25); this.controls.update();
  }

  resetCamera = () => {
    this.pendingPan.set(0, 0, 0); this.targetDistance = null;
    this.rotationTarget.identity(); this.pivot.quaternion.identity(); this.partRotationTarget.identity();
    for (const model of this.mounted.values()) model.visual.quaternion.identity();
    if (this.state?.isolate && this.ready) { this.frameSelected(); this.invalidate(); return; }
    if (this.isShip) {
      this.camera.position.set(26, 18, 20).multiplyScalar(Math.max(1, .95 / this.camera.aspect));
      if (this.controls) { this.controls.target.set(0, .6, -.7); this.controls.minDistance = 5; this.controls.update(); }
    } else this.frameAssembly();
    this.invalidate();
  };

  private frameAssembly() {
    const definition = getModel(this.state.modelId), scale = 18 / Math.max(...definition.dimensions);
    const bounds = new THREE.Box3();
    for (const part of this.parts) {
      const half = new THREE.Vector3().fromArray(part.dimensions).multiplyScalar(scale / 2);
      const partBounds = part.allBounds ?? part.bounds;
      const local = partBounds ? new THREE.Box3(new THREE.Vector3().fromArray(partBounds.min),new THREE.Vector3().fromArray(partBounds.max)) : new THREE.Box3(half.clone().negate(), half);
      for (const poses of this.animationBounds.values()) {
        const pose = poses[part.key];
        if (pose) local.union(new THREE.Box3(new THREE.Vector3().fromArray(pose.min),new THREE.Vector3().fromArray(pose.max)));
      }
      const assembled = local.clone().translate(new THREE.Vector3().fromArray(part.position));
      bounds.union(assembled); bounds.union(assembled.clone().translate(new THREE.Vector3().fromArray(part.explode)));
    }
    const center = bounds.getCenter(new THREE.Vector3()).add(this.ship.position);
    bounds.translate(this.ship.position);
    const direction = new THREE.Vector3(26,18,20).normalize(), right = new THREE.Vector3(direction.z,0,-direction.x).normalize(), up = direction.clone().cross(right).normalize();
    const width = Math.max(1,this.host.clientWidth), height = Math.max(1,this.host.clientHeight);
    const vertical = Math.max(.45,(height - 230)/height), horizontal = Math.max(.25,(width - (width > 900 ? 350 : width > 700 ? 270 : 40))/height);
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    let distance = 20;
    for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
      const point = new THREE.Vector3(x,y,z).sub(center), depth = point.dot(direction);
      distance = Math.max(distance, depth + Math.abs(point.dot(up))/(tangent*vertical), depth + Math.abs(point.dot(right))/(tangent*horizontal));
    }
    this.camera.position.copy(center).addScaledVector(direction,distance * 1.05);
    if (this.controls) { this.controls.target.copy(center); this.controls.minDistance = 5; this.controls.maxDistance = Math.max(100,distance*2); this.controls.update(); }
  }

  setView(view: 'side' | 'top' | 'perspective') {
    this.pendingPan.set(0, 0, 0); this.targetDistance = null;
    if (view === 'perspective') { this.resetCamera(); return; }
    const target = this.controls.target, radius = this.camera.position.distanceTo(target);
    this.camera.position.copy(target).add(view === 'top' ? new THREE.Vector3(.001, radius, 0) : new THREE.Vector3(radius, radius * .08, 0)); this.controls.update(); this.invalidate();
  }

  rotate(dx: number, dy: number) {
    const offset = this.scratch.copy(this.camera.position).sub(this.controls.target);
    const sphere = new THREE.Spherical().setFromVector3(offset);
    sphere.theta -= dx * Math.PI * 1.6; sphere.phi = THREE.MathUtils.clamp(sphere.phi - dy * Math.PI * 1.5, .12, Math.PI * .9);
    this.camera.position.copy(this.controls.target).add(offset.setFromSpherical(sphere)); this.controls.update(); this.invalidate();
  }

  rotateWrist(yaw: number, pitch: number, roll: number) {
    this.rotationDelta.setFromEuler(new THREE.Euler(pitch, yaw, -roll, 'YXZ'));
    this.cameraInverse.copy(this.camera.quaternion).invert();
    this.rotationDelta.premultiply(this.camera.quaternion).multiply(this.cameraInverse);
    if (this.state.isolate) {
      const parent = this.mounted.get(this.state.selected)?.motion;
      if (parent) {
        const parentRotation = parent.getWorldQuaternion(new THREE.Quaternion());
        this.rotationDelta.premultiply(parentRotation.clone().invert()).multiply(parentRotation);
      }
    }
    const target = this.state.isolate ? this.partRotationTarget : this.rotationTarget;
    target.premultiply(this.rotationDelta).normalize(); this.invalidate();
  }

  pan(dx: number, dy: number) {
    const scale = this.camera.position.distanceTo(this.controls.target) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 2;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.scratch.copy(right).multiplyScalar(-dx * scale * this.camera.aspect).addScaledVector(up, dy * scale);
    this.pendingPan.add(this.scratch); this.invalidate();
  }

  zoom(ratio: number) {
    const offset = this.scratch.copy(this.camera.position).sub(this.controls.target);
    this.targetDistance = THREE.MathUtils.clamp((this.targetDistance ?? offset.length()) / ratio, this.controls.minDistance, this.controls.maxDistance);
    this.invalidate();
  }

  pick(x: number, y: number): PartKey | null {
    if (!this.ready) return null;
    const rect = this.host.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    this.pivot.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), this.camera);
    const objects: THREE.Object3D[] = [...this.mounted.values()].filter(m => m.group.visible).map(m => m.content);
    if (!this.state.isolate) objects.push(...[...this.sockets.values()].filter(s => s.visible));
    return (this.raycaster.intersectObjects(objects, true).find(hit => hit.object.userData.partKey)?.object.userData.partKey as PartKey) ?? null;
  }

  hover(x: number, y: number) {
    const now = performance.now();
    if (now - this.lastPick.time < 100 || (!this.state.playing && Math.hypot(x - this.lastPick.x, y - this.lastPick.y) < 3)) return this.hovered;
    this.lastPick = { x, y, time: now };
    const key = this.pick(x, y);
    if (key !== this.hovered) { this.hovered = key; this.callbacks.onHover(key); this.updateHighlight(); this.invalidate(); }
    this.renderer.domElement.style.cursor = key ? 'pointer' : 'grab'; return key;
  }
  selectAt(x: number, y: number) { const key = this.pick(x, y); if (key) this.callbacks.onSelect(key); }
  selectPart(key: PartKey) { if (this.state.isolate && this.state.selected === key) return; if (this.parts.some(part => part.key === key)) this.callbacks.onSelect(key); }
  clearHover() { this.lastPick.x = -999; this.lastPick.time = 0; if (this.hovered) { this.hovered = null; this.callbacks.onHover(null); this.updateHighlight(); this.invalidate(); } }
  hoverPart(key: PartKey) { if (key !== this.hovered) { this.hovered = key; this.callbacks.onHover(key); this.updateHighlight(); this.invalidate(); } }
  private onPointerDown = (e: PointerEvent) => { this.pendingPan.set(0,0,0); this.targetDistance = null; this.pointerStart = { x: e.clientX, y: e.clientY }; };
  private onPointerUp = (e: PointerEvent) => { if (!e.button && this.pointerStart && Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) < 6) this.selectAt(e.clientX, e.clientY); this.pointerStart = null; };
  private onPointerMove = (e: PointerEvent) => { if (!e.buttons) this.hover(e.clientX, e.clientY); };
  private onPointerLeave = () => { this.pointerStart = null; this.clearHover(); };

  private resize = () => {
    const width = this.host.clientWidth, height = this.host.clientHeight; if (!width || !height) return;
    const old = this.camera.aspect; this.camera.aspect = width / height;
    this.camera.setViewOffset(width, height, width > 900 ? -100 : 0, 0, width, height);
    const budget = this.state.quality === 'detail' ? 1800000 : this.state.quality === 'light' ? 600000 : 900000;
    this.renderRatio = Math.min(window.devicePixelRatio, this.state.quality === 'detail' ? 1.35 : 1, Math.sqrt(budget / (width * height)));
    this.renderer.setPixelRatio(this.renderRatio); this.renderer.setSize(width, height);
    for (const model of this.mounted.values()) model.cloud.material.uniforms.uPixelRatio.value = this.renderRatio;
    if (!this.sized || Math.abs(Math.log(this.camera.aspect / old)) > .2) this.resetCamera();
    this.sized = true; this.invalidate();
  };

  private animate = (time: number) => {
    this.raf = 0;
    if (!this.running || document.hidden) { this.idle = true; return; }
    if (time - this.last < 1000 / 60 - 1) { this.raf = requestAnimationFrame(this.animate); return; }
    const elapsed = time - this.last;
    const dt = Math.min(.1, Math.max(.001, elapsed / 1000)); this.last = time;
    let moving = false;
    if (this.state.playing && this.action?.isRunning()) { this.mixer.update(dt); moving = true; }
    const alpha = 1 - Math.exp(-dt * 18);
    if (this.pendingPan.lengthSq() > .0000001) {
      this.scratch.copy(this.pendingPan).multiplyScalar(alpha);
      this.camera.position.add(this.scratch); this.controls.target.add(this.scratch); this.pendingPan.sub(this.scratch); moving = true;
    } else this.pendingPan.set(0,0,0);
    if (this.targetDistance !== null) {
      this.scratch.copy(this.camera.position).sub(this.controls.target);
      const distance = this.scratch.length(), gap = this.targetDistance - distance;
      this.camera.position.copy(this.controls.target).add(this.scratch.setLength(distance + gap * alpha));
      if (Math.abs(gap) < .001) this.targetDistance = null; else moving = true;
    }
    if (this.pivot.quaternion.angleTo(this.rotationTarget) > .001) { this.pivot.quaternion.slerp(this.rotationTarget, alpha); moving = true; }
    for (const [key, model] of this.mounted) {
      if (model.group.position.distanceToSquared(model.target) > .000001) { model.group.position.lerp(model.target, alpha); moving = true; }
      if (this.state.isolate && key === this.state.selected && model.visual.quaternion.angleTo(this.partRotationTarget) > .001) { model.visual.quaternion.slerp(this.partRotationTarget, alpha); moving = true; }
      if (this.connectors.get(key)!.visible && (moving || time < this.renderUntil)) {
        const line = this.connectors.get(key)!;
        const a = this.part(key).position, b = model.group.position;
        const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const motion = model.motion.position;
        attribute.setXYZ(0, a[0], a[1], a[2]); attribute.setXYZ(1, b.x + motion.x, b.y + motion.y, b.z + motion.z); attribute.needsUpdate = true; line.computeLineDistances();
      }
    }
    const cameraMoving = this.controls.update();
    this.pivot.updateMatrixWorld(true);
    const width = this.host.clientWidth, height = this.host.clientHeight;
    for (const [key, element] of this.markers) {
      if (!this.ready) { element.style.display = 'none'; continue; }
      const model = this.mounted.get(key);
      if (model) this.scratch.copy(model.center).applyMatrix4(model.motion.matrix).applyMatrix4(model.group.matrixWorld);
      else if (this.part(key)) this.scratch.fromArray(this.part(key).position).applyMatrix4(this.ship.matrixWorld);
      else continue;
      this.scratch.project(this.camera);
      const visible = !this.state.isolate && this.state.labels && this.scratch.z < 1 && Math.abs(this.scratch.x) < .94 && Math.abs(this.scratch.y) < .92;
      const x = (this.scratch.x * .5 + .5) * width, y = (-this.scratch.y * .5 + .5) * height;
      const previous = this.markerPositions.get(key);
      if (!previous || previous.visible !== visible) element.style.display = visible ? '' : 'none';
      if (visible && (!previous || Math.abs(previous.x - x) > .5 || Math.abs(previous.y - y) > .5)) { element.style.left = `${x}px`; element.style.top = `${y}px`; }
      this.markerPositions.set(key, { x, y, visible });
    }
    this.renderer.render(this.scene, this.camera);
    if ((moving || cameraMoving || time < this.renderUntil) && !this.raf) this.raf = requestAnimationFrame(this.animate);
    this.idle = !this.raf;
  };

  private disposeObject(object: THREE.Object3D, geometry: boolean) {
    object.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.Line) { if (geometry) node.geometry.dispose(); for (const m of (Array.isArray(node.material) ? node.material : [node.material])) m.dispose(); } });
  }
  dispose() {
    this.running = false; cancelAnimationFrame(this.raf); this.observer.disconnect(); this.controls.dispose();
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.ship); this.clips.clear(); this.animationBounds.clear();
    document.removeEventListener('visibilitychange', this.visibility);
    const c = this.renderer.domElement;
    c.removeEventListener('webglcontextlost', this.lost); c.removeEventListener('pointerdown', this.onPointerDown); c.removeEventListener('pointerup', this.onPointerUp); c.removeEventListener('pointermove', this.onPointerMove); c.removeEventListener('pointerleave', this.onPointerLeave);
    for (const model of this.mounted.values()) { this.disposeObject(model.content, false); model.cloud.material.dispose(); model.outline.material.dispose(); }
    for (const asset of this.assets.values()) { this.disposeObject(asset.source, true); asset.particles.dispose(); asset.edges.dispose(); }
    for (const socket of this.sockets.values()) { socket.geometry.dispose(); (socket.material as THREE.Material).dispose(); }
    for (const line of this.connectors.values()) { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }
    this.renderer.dispose(); c.remove();
  }
}
