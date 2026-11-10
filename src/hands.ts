import { DwellSelection, dualAnchor, dualDelta, handPose, updateDrag, wristDelta, type DualAnchor, type HandPose, type PalmOrientation, type PinchSession, type TrackedHand } from './gestures';
import type { WorkshopScene } from './scene';

interface HandCallbacks {
  onStatus: (status: string) => void;
  onError: (message: string) => void;
  onReady: (fallback: boolean, delegate: 'CPU' | 'GPU') => void;
  onRange: (name: string, value: number) => void;
  onAssembly?: (value: number) => void;
}

export class HandController {
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private busy = false;
  private raf = 0;
  private lastFrame = 0;
  private lastVideo = -1;
  private lastDetection = 0;
  private previous = new Map<string, HandPose>();
  private positions = new Map<string, { x: number; y: number; palmX: number; palmY: number }>();
  private session: PinchSession | null = null;
  private dual: DualAnchor | null = null;
  private releaseRequired = false;
  private status = '';
  private hovered: HTMLElement | null = null;
  private fallback: import('@mediapipe/tasks-vision').HandLandmarker | null = null;
  private ready = false;
  private initTimer: ReturnType<typeof setTimeout> | undefined;
  private wrist: { id: string; orientation: PalmOrientation } | null = null;
  private openFrames = 0;
  private quality: 'auto' | 'light' | 'detail' = 'auto';
  private inferenceMs = 35;
  private delegate: 'CPU' | 'GPU' = 'CPU';
  private inputCanvas: HTMLCanvasElement | null = null;
  private dwell = new DwellSelection();
  private controlIds = new WeakMap<HTMLElement, string>();
  private controlSequence = 0;
  private assemblyHand: string | null = null;
  private lastAssembly: number | null = null;
  private cursorMotion: ({ id: string; x: number; y: number; targetX: number; targetY: number } | null)[] = [null, null];
  private skeletonTarget: TrackedHand[] = [];
  private skeletonVisible: TrackedHand[] = [];
  private visualTime = 0;
  private lastHandsSeen = 0;

  setQuality(quality: 'auto' | 'light' | 'detail') { this.quality = quality; }

  constructor(private video: HTMLVideoElement, private overlay: HTMLCanvasElement, private cursors: HTMLElement[], private getScene: () => WorkshopScene | null, private callbacks: HandCallbacks) {}

  async start() {
    this.running = true;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Webcam cần HTTPS hoặc localhost.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      if (!this.running) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      await this.video.play();
      if (!this.running) return;
      this.stream.getVideoTracks()[0].addEventListener('ended', () => { if (this.running) this.fail('Webcam đã ngắt kết nối. Hãy tắt rồi bật lại theo dõi tay.'); });
      this.setStatus('Đang nạp mô hình theo dõi tay…');
      await this.initWorker();
      if (!this.running) return;
      this.ready = true; this.callbacks.onReady(!!this.fallback, this.delegate);
      this.lastDetection = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    } catch (error) {
      if (!this.running) return;
      let message = error instanceof Error ? error.message : String(error);
      if (error instanceof DOMException && error.name === 'NotAllowedError') message = 'Chưa được cấp quyền camera. Cho phép camera trong trình duyệt rồi bật lại.';
      if (error instanceof DOMException && error.name === 'NotFoundError') message = 'Không tìm thấy webcam. Bạn vẫn có thể dùng chuột để thao tác.';
      if (error instanceof DOMException && error.name === 'NotReadableError') message = 'Không mở được webcam. Kiểm tra camera có đang được ứng dụng khác sử dụng không.';
      this.fail(message);
    }
  }

  private async initWorker() {
    try {
      await new Promise<void>((resolve, reject) => {
        const worker = new Worker('/hand/worker.js?v=particles-2'); this.worker = worker;
        this.initTimer = setTimeout(() => reject(new Error('Khởi động theo dõi tay quá lâu.')), 30000);
        worker.onmessage = ({ data }) => {
          if (!this.running) return;
          if (data.type === 'ready') { this.delegate = data.delegate ?? 'CPU'; clearTimeout(this.initTimer); resolve(); }
          else if (data.type === 'hands') { this.busy = false; this.inferenceMs = this.inferenceMs * .8 + (data.duration ?? 35) * .2; this.process(data.hands); }
          else if (data.type === 'error') {
            clearTimeout(this.initTimer);
            if (!this.ready) reject(new Error(data.message));
            else this.fail('Bộ theo dõi tay gặp lỗi. Tắt rồi bật lại webcam để thử lại.');
          }
        };
        worker.onerror = event => { event.preventDefault(); clearTimeout(this.initTimer); if (!this.ready) reject(new Error(event.message)); else this.fail('Không thể tiếp tục theo dõi tay. Hãy bật lại webcam.'); };
        worker.postMessage({ type: 'init' });
      });
    } catch {
      this.worker?.terminate(); this.worker = null;
      if (!this.running) return;
      // Compatibility fallback for browsers without worker OffscreenCanvas support.
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      if (!this.running) return;
      const tracker = await HandLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/hand/wasm'), {
        baseOptions: { modelAssetPath: '/hand/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
      });
      if (!this.running) { tracker.close(); return; }
      this.fallback = tracker;
    }
  }

  private loop = async (time: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    this.animateVisuals(time);
    if (time - this.lastDetection > 800 && this.previous.size) this.cancelGestures();
    if (document.hidden) { if (this.previous.size) this.cancelGestures(); return; }
    const interval = Math.max(this.fallback ? 90 : this.quality === 'light' ? 66 : this.quality === 'detail' ? 33 : 40, this.inferenceMs * 1.1);
    if (this.busy || time - this.lastFrame < interval || this.video.readyState < 2 || this.video.currentTime === this.lastVideo) return;
    this.lastFrame = time; this.lastVideo = this.video.currentTime; this.busy = true;
    try {
      if (this.worker) {
        const width = this.quality === 'light' ? 360 : this.quality === 'detail' ? 640 : 480;
        const bitmap = await createImageBitmap(this.video, { resizeWidth: width, resizeHeight: Math.round(width * this.video.videoHeight / this.video.videoWidth), resizeQuality: 'low' });
        if (!this.running) { bitmap.close(); return; }
        this.worker.postMessage({ type: 'frame', bitmap, timestamp: time }, [bitmap]);
      } else if (this.fallback) {
        this.inputCanvas ??= document.createElement('canvas');
        const height = Math.round(360 * this.video.videoHeight / this.video.videoWidth);
        if (this.inputCanvas.width !== 360 || this.inputCanvas.height !== height) { this.inputCanvas.width = 360; this.inputCanvas.height = height; }
        this.inputCanvas.getContext('2d')!.drawImage(this.video, 0, 0, this.inputCanvas.width, this.inputCanvas.height);
        const started = performance.now();
        const result = this.fallback.detectForVideo(this.inputCanvas, time);
        this.inferenceMs = this.inferenceMs * .8 + (performance.now() - started) * .2;
        this.busy = false;
        this.process(result.landmarks.map((points, i) => ({ points, worldPoints: result.worldLandmarks[i], handedness: result.handedness[i]?.[0]?.categoryName ?? String(i) })));
      }
    } catch { this.busy = false; if (this.running) this.fail('Không xử lý được hình ảnh webcam. Hãy bật lại camera để thử lại.'); }
  };

  private process(hands: TrackedHand[]) {
    if (!this.running) return;
    this.lastDetection = performance.now();
    if (!hands.length) { if (this.previous.size) this.cancelGestures(false); this.setStatus('Đưa tay vào khung hình'); return; }
    this.lastHandsSeen = performance.now();
    const sorted = [...hands].sort((a, b) => a.handedness.localeCompare(b.handedness));
    const poses = sorted.map(hand => {
      const pose = handPose(hand, this.previous.get(hand.handedness)?.pinching);
      const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
      const scale = Math.max(window.innerWidth / vw, window.innerHeight / vh);
      const mapX = (x: number) => (x * vw * scale + (window.innerWidth - vw * scale) / 2) / window.innerWidth;
      const mapY = (y: number) => (y * vh * scale + (window.innerHeight - vh * scale) / 2) / window.innerHeight;
      pose.x = mapX(pose.x); pose.y = mapY(pose.y); pose.palmX = mapX(pose.palmX); pose.palmY = mapY(pose.palmY);
      const last = this.positions.get(hand.handedness);
      if (last) { pose.x = last.x + (pose.x - last.x) * .62; pose.y = last.y + (pose.y - last.y) * .62; pose.palmX = last.palmX + (pose.palmX - last.palmX) * .55; pose.palmY = last.palmY + (pose.palmY - last.palmY) * .55; }
      this.positions.set(hand.handedness, { x: pose.x, y: pose.y, palmX: pose.palmX, palmY: pose.palmY }); return pose;
    });
    const ids = new Set(poses.map(p => p.handedness));
    for (const id of this.positions.keys()) if (!ids.has(id)) this.positions.delete(id);
    if (this.session?.handedness && !ids.has(this.session.handedness)) this.session = null;
    this.skeletonTarget = sorted;
    this.cursors.forEach((cursor, index) => {
      const p = poses[index]; const visible = !!p && (!!p.orientation || p.pointing || p.pinching);
      cursor.style.display = visible ? 'block' : 'none';
      if (visible && p) {
        const targetX = (p.open ? p.palmX : p.x) * window.innerWidth, targetY = (p.open ? p.palmY : p.y) * window.innerHeight;
        const motion = this.cursorMotion[index];
        if (motion && motion.id === p.handedness) { motion.targetX = targetX; motion.targetY = targetY; }
        else this.cursorMotion[index] = { id: p.handedness, x: targetX, y: targetY, targetX, targetY };
        cursor.classList.toggle('pinching', p.pinching); cursor.classList.toggle('palm', p.open);
        const label = cursor.querySelector('b'); if (label) label.textContent = p.open ? 'XOAY' : p.pointing ? 'GIỮ ĐỂ CHỌN' : p.pinching ? 'KÉO' : 'GỘP';
      }
    });
    const scene = this.getScene();
    const twoOpen = poses.length === 2 && poses.every(p => p.open);
    const twoPinched = poses.length === 2 && poses.every(p => p.pinching);
    if ((twoOpen || twoPinched) && !this.releaseRequired) {
      if (this.session && this.session.target !== 'scene') {
        this.session = null; this.releaseRequired = true; this.dual = null;
        this.setStatus('Thả tay để tiếp tục');
      } else {
        const positions = poses.map(p => twoOpen ? { x: p.palmX, y: p.palmY } : p);
        const anchor = dualAnchor(positions[0], positions[1]);
        if (this.dual) { const d = dualDelta(this.dual, anchor); scene?.pan(d.dx, d.dy); if (Math.abs(d.zoom - 1) > .003) scene?.zoom(d.zoom); }
        this.dual = anchor; this.session = null;
        this.setStatus('Hai tay: kéo / zoom');
        this.cursors.forEach(cursor => { const label = cursor.querySelector('b'); if (label) label.textContent = 'KÉO / ZOOM'; });
      }
      this.wrist = null; this.openFrames = 0; this.clearHighlight(); scene?.clearHover();
      this.resetDwell(); this.assemblyHand = null;
    } else if (this.releaseRequired) {
      this.dual = null; this.wrist = null; this.session = null;
      if (poses.every(p => !p.pinching)) this.releaseRequired = false;
      this.setStatus('Thả chụm để tiếp tục');
    } else {
      if (this.dual) { this.wrist = null; this.openFrames = 0; }
      this.dual = null;
      const pose = poses.find(p => p.handedness === this.session?.handedness) ?? poses.find(p => p.handedness === 'Right') ?? poses[0];
      const palmMode = !pose.pointing && !pose.pinching && !!pose.orientation && (pose.open || pose.openness < .32 || this.wrist?.id === pose.handedness);
      if (palmMode && pose.orientation && !this.session) {
        this.openFrames++;
        this.resetDwell();
        if (this.assemblyHand !== pose.handedness) { this.assemblyHand = pose.handedness; this.lastAssembly = null; }
        if (this.openFrames >= 2) {
          const amount = pose.openness < .12 ? 0 : pose.openness > .88 ? 1 : Math.round(pose.openness * 20) / 20;
          if (amount !== this.lastAssembly) { this.lastAssembly = amount; this.callbacks.onAssembly?.(amount); }
        }
        if (this.openFrames >= 2 && this.wrist?.id === pose.handedness) {
          const d = wristDelta(this.wrist.orientation, pose.orientation);
          if (d.yaw || d.pitch || d.roll) { scene?.rotateWrist(d.yaw, d.pitch, d.roll); this.wrist = { id: pose.handedness, orientation: pose.orientation }; }
        } else {
          this.wrist = { id: pose.handedness, orientation: pose.orientation };
        }
        this.clearHighlight(); scene?.clearHover();
        this.setStatus(pose.openness < .32 ? 'Nắm: gộp · Cổ tay: xoay' : 'Xòe: bung · Cổ tay: xoay');
      } else {
        this.assemblyHand = null;
        this.wrist = null; this.openFrames = 0;
        const wasPinching = this.previous.get(pose.handedness)?.pinching ?? false;
        const x = pose.x * window.innerWidth, y = pose.y * window.innerHeight;
        if (!pose.pointing && !pose.pinching && !this.session && !wasPinching) {
          this.clearHighlight(); this.resetDwell(); scene?.clearHover(); this.setStatus('Trỏ giữ để chọn');
        } else {
          const element = document.elementFromPoint(x, y) as HTMLElement | null;
          const interactive = this.nearestControl(element, x, y);
          if (interactive !== this.hovered) { this.clearHighlight(); this.hovered = interactive; interactive?.classList.add('hand-hover'); }
          let partKey: import('./catalog').PartKey | null = null;
          if (interactive?.dataset.partKey) { partKey = interactive.dataset.partKey as import('./catalog').PartKey; scene?.hoverPart(partKey); }
          else if (interactive || pose.pinching) scene?.clearHover();
          else partKey = scene?.hover(x, y) ?? null;
          if (pose.pointing && !pose.pinching && !this.session) {
            let key = partKey ? `part:${partKey}` : null;
            if (!key && interactive && !(interactive instanceof HTMLInputElement) && interactive.tagName !== 'A') {
              key = this.controlIds.get(interactive) ?? `control:${++this.controlSequence}`;
              this.controlIds.set(interactive, key);
            }
            const dwell = this.dwell.update(key, x, y, performance.now());
            this.cursors.forEach((cursor, i) => cursor.style.setProperty('--dwell', i === poses.indexOf(pose) ? `${dwell.progress * 360}deg` : '0deg'));
            if (dwell.select) { if (partKey) scene?.selectPart(partKey); else interactive?.click(); }
          } else this.resetDwell();
          if (pose.pinching && !wasPinching) {
            const catalog = element?.closest('[data-catalog]') || interactive?.closest('[data-catalog]');
            this.session = { x, y, lastX: x, lastY: y, moved: false, target: catalog ? 'catalog' : interactive ? 'ui' : element?.closest('[data-scene]') ? 'scene' : 'ui', element: interactive, handedness: pose.handedness, scrollElement: element?.closest<HTMLElement>('.assembly-panel, .inspector-panel, .help-modal') };
          }
          if (pose.pinching && this.session) {
            const delta = updateDrag(this.session, x, y, this.session.target === 'ui' ? 30 : 18);
            if (this.session.element instanceof HTMLInputElement && this.session.element.type === 'range') {
              const range = this.session.element, rect = range.getBoundingClientRect();
              const fraction = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
              this.callbacks.onRange(range.name, Number(range.min) + fraction * (Number(range.max) - Number(range.min)));
              this.session.moved = true;
            } else if (this.session.moved && this.session.target === 'catalog') {
              const catalog = document.querySelector<HTMLElement>('[data-catalog]'); if (catalog) catalog.scrollLeft -= delta.dx * 1.5;
            } else if (this.session.moved && this.session.target === 'scene') {
              const clamp = (v: number) => Math.max(-.06, Math.min(.06, v));
              scene?.pan(clamp(delta.dx / window.innerWidth), clamp(delta.dy / window.innerHeight));
            } else if (this.session.moved && this.session.scrollElement) {
              this.session.scrollElement.scrollTop -= delta.dy * 1.4;
            }
            this.setStatus(this.session.target === 'catalog' ? 'Kéo ngang để lướt' : this.session.target === 'scene' ? 'Kéo để di chuyển' : 'Thả để chọn');
          } else if (!pose.pinching && wasPinching && this.session) {
            if (!this.session.moved) {
              const button = this.session.element;
              // Lock the button at pinch onset: minor release jitter cannot miss it.
              if (button && button.isConnected && !button.hasAttribute('disabled')) button.click();
              else if (this.session.target === 'scene') scene?.selectAt(this.session.x, this.session.y);
              this.dwell.lock(x, y);
            }
            this.session = null;
          } else this.setStatus('Trỏ giữ 0,6 giây để chọn');
        }
      }
    }
    this.previous = new Map(poses.map(p => [p.handedness, p]));
  }

  private nearestControl(element: HTMLElement | null, x: number, y: number): HTMLElement | null {
    const direct = element?.closest<HTMLElement>('button, input[type="range"], summary, a');
    if (direct && !direct.hasAttribute('disabled')) return direct;
    let closest: HTMLElement | null = null, distance = 32;
    for (const candidate of document.querySelectorAll<HTMLElement>('button:not(:disabled), input[type="range"], summary')) {
      const rect = candidate.getBoundingClientRect(); if (!rect.width || !rect.height) continue;
      const d = Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
      if (d >= distance) continue;
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (top && candidate.contains(top)) { closest = candidate; distance = d; }
    }
    return closest;
  }

  private drawSkeleton(hands: TrackedHand[]) {
    const canvas = this.overlay; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const width = 480, height = Math.round(480 * (this.video.videoHeight || 480) / (this.video.videoWidth || 640));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const chains = [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
    for (const { points } of hands) {
      ctx.strokeStyle = '#f4f3ff'; ctx.lineWidth = .8;
      for (const chain of chains) { ctx.beginPath(); chain.forEach((id, i) => { const p = points[id]; if (i === 0) ctx.moveTo(p.x * width, p.y * height); else ctx.lineTo(p.x * width, p.y * height); }); ctx.stroke(); }
      ctx.fillStyle = '#f7ffe9';
      points.forEach(p => { ctx.beginPath(); ctx.arc(p.x * width, p.y * height, 1.4, 0, Math.PI * 2); ctx.fill(); });
    }
  }

  private animateVisuals(time: number) {
    const dt = Math.min(.06, Math.max(.001, (time - this.visualTime) / 1000)); this.visualTime = time;
    if (time - this.lastHandsSeen > 180) {
      if (this.skeletonVisible.length || this.cursorMotion.some(Boolean)) this.clearVisuals();
      return;
    }
    const alpha = 1 - Math.exp(-dt * 32);
    this.cursors.forEach((cursor, index) => {
      const motion = this.cursorMotion[index]; if (!motion || cursor.style.display === 'none') return;
      motion.x += (motion.targetX - motion.x) * alpha; motion.y += (motion.targetY - motion.y) * alpha;
      cursor.style.transform = `translate(${motion.x}px, ${motion.y}px)`;
    });
    const previous = this.skeletonVisible;
    this.skeletonVisible = this.skeletonTarget.map(hand => {
      const old = previous.find(value => value.handedness === hand.handedness);
      return { handedness: hand.handedness, points: hand.points.map((p, i) => {
        const last = old?.points[i];
        return last ? { x: last.x + (p.x - last.x) * alpha, y: last.y + (p.y - last.y) * alpha, z: p.z } : { ...p };
      }) };
    });
    this.drawSkeleton(this.skeletonVisible);
  }

  private resetDwell() {
    this.dwell.reset(); this.cursors.forEach(cursor => cursor.style.setProperty('--dwell', '0deg'));
  }
  private clearVisuals() {
    this.skeletonTarget = []; this.skeletonVisible = []; this.cursorMotion = [null, null];
    this.cursors.forEach(c => c.style.display = 'none');
    this.overlay.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private setStatus(status: string) { if (this.status !== status) { this.status = status; this.callbacks.onStatus(status); } }
  private clearHighlight() { this.hovered?.classList.remove('hand-hover'); this.hovered = null; }
  private cancelGestures(clearVisuals = true) {
    this.session = null; this.dual = null; this.releaseRequired = false; this.wrist = null; this.openFrames = 0;
    this.previous.clear(); this.positions.clear(); this.clearHighlight(); this.getScene()?.clearHover();
    this.resetDwell(); this.assemblyHand = null; this.lastAssembly = null;
    if (clearVisuals) this.clearVisuals();
  }
  private fail(message: string) { this.stop(); this.callbacks.onError(message); }

  stop() {
    this.running = false; this.ready = false; cancelAnimationFrame(this.raf); clearTimeout(this.initTimer);
    this.worker?.terminate(); this.worker = null; this.fallback?.close(); this.fallback = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null; this.cancelGestures();
  }
}
