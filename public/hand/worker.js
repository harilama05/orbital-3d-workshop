/* Local classic worker. Runtime is copied by scripts/prepare-hand-assets.mjs. */
let tracker;
let delegate = 'CPU';
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      self.exports = {};
      importScripts('/hand/vision_bundle.js');
      const { FilesetResolver, HandLandmarker } = self.exports;
      try {
        const canvas = new OffscreenCanvas(1, 1), gl = canvas.getContext('webgl2');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
        if (gl && !/swiftshader|llvmpipe|software/i.test(renderer)) delegate = 'GPU';
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch { delegate = 'CPU'; }
      const vision = await FilesetResolver.forVisionTasks('/hand/wasm');
      const options = {
        baseOptions: { modelAssetPath: '/hand/hand_landmarker.task', delegate },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .55,
      };
      try { tracker = await HandLandmarker.createFromOptions(vision, options); }
      catch (error) {
        if (delegate !== 'GPU') throw error;
        delegate = 'CPU'; options.baseOptions.delegate = 'CPU';
        tracker = await HandLandmarker.createFromOptions(vision, options);
      }
      self.postMessage({ type: 'ready', delegate, wasm: vision.wasmBinaryPath });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  } else if (data.type === 'frame' && tracker) {
    try {
      const start = performance.now();
      const result = tracker.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'hands', duration: performance.now() - start, hands: result.landmarks.map((points, i) => ({ points, worldPoints: result.worldLandmarks[i], handedness: result.handedness[i]?.[0]?.categoryName ?? String(i) })) });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    finally { data.bitmap.close(); }
  }
};
