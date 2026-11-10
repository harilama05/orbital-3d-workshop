import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Box, Check, ChevronDown, ChevronRight, CircleHelp, Expand, Eye, EyeOff, Focus, Hand, Layers3, Maximize2, MousePointer2, Move, Orbit, Package, Pause, Play, Plus, Radio, RotateCcw, ScanLine, Settings2, Shield, Sparkles, Unplug, Upload, Video, VideoOff, X, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import { compatibleParts, DEFAULT_CONFIG, FAMILIES, getPart, loadConfiguration, parseConfiguration, PARTS, serializeConfiguration, setPart, SLOTS, STORAGE_KEY, type Family, type PartKey } from './catalog';
import { WorkshopScene, type SceneState, type RenderQuality } from './scene';
import { HandController, type HandPerformance } from './hands';
import { defaultModuleConfig, getModel, loadModuleConfigs, MODELS, modelParts, MODULE_STORAGE_KEY, parseModuleConfig, setModulePart, SHIP_ID, type ModuleConfigs } from './models';
import { ModularCatalog } from './ModularCatalog';

const SLOT_ICONS: Record<Family | 'hull', LucideIcon> = { hull: Box, engine: Sparkles, weapon: Shield, sensor: Radio, cargo: Package };
type Mode = 'explore' | 'explode' | 'configure';
type Preview = { slot: Family; id: string } | null;
type DiagnosticReport = HandPerformance & {
  render: ReturnType<WorkshopScene['getPerformanceStats']> | null;
  model: string; origin: string; build: string; browser: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
};

function DiagnosticsPanel({ report, onCopy }: { report: DiagnosticReport | null; onCopy: () => void }) {
  const ms = (value: number | null | undefined) => value == null ? '--' : `${value.toFixed(1)} ms`;
  return <aside className="diagnostics-panel" aria-label="Performance diagnostics">
    <div><strong>Performance diagnostics</strong><button disabled={!report} onClick={onCopy}>Copy report</button></div>
    {!report ? <p>Enable the webcam and move your hands for a few seconds.</p> : <>
      <dl>
        <div><dt>Tracking</dt><dd data-metric="tracking-fps">{report.trackingFPS} fps / {report.hands} hands</dd></div>
        <div><dt>Inference</dt><dd data-metric="inference-ms">{ms(report.inferenceMs)}</dd></div>
        <div><dt>Frame capture</dt><dd>{ms(report.captureMs)}</dd></div>
        <div><dt>Capture to landmarks</dt><dd>{ms(report.pipelineMs)}</dd></div>
        <div><dt>Current frame pending</dt><dd data-metric="pending-ms">{report.pendingMs === null ? 'none' : ms(report.pendingMs)}</dd></div>
        <div><dt>Pipeline peak</dt><dd>{ms(report.maxPipelineMs)}</dd></div>
        <div><dt>UI frame interval</dt><dd>{ms(report.pageFrameMs)}</dd></div>
        <div><dt>UI frame peak</dt><dd>{ms(report.maxUIFrameMs)}</dd></div>
        <div><dt>3D rendering</dt><dd>{report.render?.fps ?? '--'} fps{report.render?.idle ? ' (idle)' : ''}</dd></div>
        <div><dt>Camera</dt><dd>{report.camera.width} x {report.camera.height} / {report.camera.fps ?? '--'} fps</dd></div>
        <div><dt>Drawing buffer</dt><dd>{report.render?.width} x {report.render?.height}</dd></div>
        <div><dt>Mode</dt><dd>{report.backend} / {report.path} / {report.quality}</dd></div>
      </dl>
      <p className="diagnostics-gpu">{report.render?.renderer}</p>
    </>}
    <small>Rolling measurements, updated about once a second. Pipeline timing excludes camera exposure, gesture smoothing and screen presentation. No images or landmarks are included in the report.</small>
  </aside>;
}

function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
}

export default function App() {
  const [diagnosticsEnabled] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1');
  const [performanceReport, setPerformanceReport] = useState<DiagnosticReport | null>(null);
  const [modelId, setModelId] = useState(SHIP_ID);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [animation, setAnimation] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [config, setConfig] = useState(loadConfiguration);
  const [moduleConfigs, setModuleConfigs] = useState<ModuleConfigs>(loadModuleConfigs);
  const [modulePreview, setModulePreview] = useState<{key:PartKey;id:string}|null>(null);
  const [selected, setSelected] = useState<PartKey>('engine');
  const [preview, setPreview] = useState<Preview>(null);
  const [mode, setMode] = useState<Mode>('explore');
  const [explosion, setExplosion] = useState(0);
  const [isolate, setIsolate] = useState(false);
  const [labels, setLabels] = useState(true);
  const [particleMode, setParticleMode] = useState(true);
  const [particleBrightness, setParticleBrightness] = useState(1.35);
  const [cameraLight, setCameraLight] = useState(.48);
  const [quality, setQuality] = useState<RenderQuality>('auto');
  const [particleCount, setParticleCount] = useState(0);
  const [handBackend, setHandBackend] = useState<'CPU' | 'GPU'>('CPU');
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 700);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState([0, PARTS.length + 1]);
  const [sceneError, setSceneError] = useState('');
  const [hovered, setHovered] = useState<PartKey | null>(null);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(true);
  const [camera, setCamera] = useState<'off' | 'loading' | 'on'>('off');
  const [cameraError, setCameraError] = useState('');
  const [handStatus, setHandStatus] = useState('');
  const [fallback, setFallback] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef(new Map<PartKey, HTMLElement>());
  const sceneRef = useRef<WorkshopScene | null>(null);
  const catalogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skeletonRef = useRef<HTMLCanvasElement>(null);
  const cursorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const handRef = useRef<HandController | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const effectiveConfig = preview ? setPart(config, preview.slot, preview.id) : config;
  const model = getModel(modelId);
  const isShip = modelId === SHIP_ID;
  const moduleConfig = moduleConfigs[modelId] ?? defaultModuleConfig(modelId);
  const effectiveModuleConfig = modulePreview ? setModulePart(modelId,moduleConfig,modulePreview.key,modulePreview.id) : moduleConfig;
  const displayParts = modelParts(modelId, effectiveConfig, effectiveModuleConfig);
  const selectedMeta = displayParts.find(part => part.key === selected) ?? displayParts[0];
  const slot: Family = FAMILIES.includes(selected as Family) ? selected as Family : 'engine';
  const selectedPart = isShip && selected !== 'hull' ? getPart(effectiveConfig[slot]) : undefined;
  const parts = compatibleParts(slot);
  const count = displayParts.filter(part => part.assetId).length;
  const changedCount = isShip ? FAMILIES.filter(key => config[key] !== DEFAULT_CONFIG[key]).length : model.parts.filter(p=>moduleConfig[p.key]!==p.assetId).length;
  const currentOption = selectedMeta.options?.find(p=>p.id===selectedMeta.assetId);
  const currentName = isShip ? selected === 'hull' ? 'Thân tàu Cruiser' : selectedPart?.name ?? 'Vị trí đang trống' : currentOption?.name ?? 'Vị trí đang trống';
  const currentDescription = isShip && !selectedMeta.assetId ? 'Chọn linh kiện bên dưới để lắp.' : selectedMeta.description;

  const selectPart = useCallback((key: PartKey) => { setSelected(key); setPreview(null); setModulePreview(null); setIsolate(false); setInspectorOpen(true); setCatalogOpen(isShip ? key !== 'hull' : !!getModel(modelId).parts.find(p=>p.key===key)?.replaceable); }, [isShip,modelId]);
  const stateRef = useRef<SceneState>({ modelId, moduleConfig:effectiveModuleConfig, animation, playing, loop, config: effectiveConfig, selected, explosion, isolate, particles: particleMode, labels, brightness: particleBrightness, quality, tracking: camera === 'on' });
  stateRef.current = { modelId, moduleConfig:effectiveModuleConfig, animation, playing, loop, config: effectiveConfig, selected, explosion, isolate, particles: particleMode, labels, brightness: particleBrightness, quality, tracking: camera === 'on' };

  useEffect(() => {
    if (!stageRef.current) return;
    let scene: WorkshopScene | undefined;
    try {
      scene = new WorkshopScene(stageRef.current, stateRef.current, {
        onSelect: selectPart, onHover: setHovered, onReady: () => setReady(true), onStats: setParticleCount,
        onError: setSceneError, onProgress: (loaded, total) => setProgress([loaded, total]),
        onPlaybackEnd: () => setPlaying(false),
      });
      scene.setMarkers(markerRefs.current); sceneRef.current = scene;
    } catch { setSceneError('Không khởi động được WebGL. Hãy thử Chrome/Edge và bật tăng tốc đồ họa trong cài đặt trình duyệt.'); }
    return () => { scene?.dispose(); sceneRef.current = null; };
  }, [selectPart, modelId]);

  useEffect(() => { sceneRef.current?.update(stateRef.current); }, [config, preview, moduleConfigs, modulePreview, selected, explosion, isolate, particleMode, labels, particleBrightness, quality, camera, animation, playing, loop]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeConfiguration(config))); setSaved(true); }
    catch { setSaved(false); }
  }, [config]);
  useEffect(()=>{try{localStorage.setItem(MODULE_STORAGE_KEY,JSON.stringify(moduleConfigs));setSaved(true);}catch{setSaved(false);}},[moduleConfigs]);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => () => handRef.current?.stop(), []);
  useEffect(() => { handRef.current?.setQuality(quality); }, [quality]);
  useEffect(() => {
    if (!modelsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const library = document.querySelector<HTMLElement>('.model-picker');
    library?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelsOpen(false);
      if (event.key === 'Tab') {
        const items = library?.querySelectorAll<HTMLButtonElement>('button');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [modelsOpen]);

  useEffect(() => {
    if (!help) return;
    const previous = document.activeElement as HTMLElement | null;
    modalRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelp(false);
      if (event.key === 'Tab') {
        const items = modalRef.current?.querySelectorAll<HTMLElement>('button, a[href]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [help]);

  function changeMode(next: Mode) {
    setMode(next); setIsolate(false);
    if (next !== 'configure') {setPreview(null);setModulePreview(null);}
    setCatalogOpen(next === 'configure'); setInspectorOpen(next === 'configure');
    if (next === 'configure' && !selectedMeta.replaceable) setSelected(isShip ? 'engine' : model.parts.find(p=>p.replaceable)!.key);
    if (next === 'explode') setExplosion(1);
    else setExplosion(0);
  }

  function changeModel(id: string) {
    setModelsOpen(false);
    if (id === modelId) return;
    setReady(false); setProgress([0, 1]); setSceneError(''); setHovered(null);
    setAnimation(null); setPlaying(false);
    setSelected(id === SHIP_ID ? 'engine' : getModel(id).parts[0].key);
    setPreview(null); setIsolate(false); setExplosion(0); setMode('explore');
    setModulePreview(null);
    setCatalogOpen(false); setInspectorOpen(false); setModelId(id);
  }

  function applyPreview() {
    if (!preview) return;
    setConfig(previous => setPart(previous, preview.slot, preview.id));
    setToast(`Đã lắp ${getPart(preview.id)?.name.toLowerCase()}.`);
    setPreview(null);
  }

  function removePart() {
    if (!selectedMeta.replaceable) return;
    if(isShip)setConfig(previous => setPart(previous, slot, null));
    else setModuleConfigs(previous=>({...previous,[modelId]:setModulePart(modelId,previous[modelId]??defaultModuleConfig(modelId),selected,null)}));
    setPreview(null);setModulePreview(null); setIsolate(false); setToast(`Đã tháo linh kiện tại ${selectedMeta.name.toLowerCase()}.`);
  }

  function applyModulePreview(){
    if(!modulePreview)return;
    setModuleConfigs(previous=>({...previous,[modelId]:setModulePart(modelId,previous[modelId]??defaultModuleConfig(modelId),modulePreview.key,modulePreview.id)}));
    setModulePreview(null);setToast(`Đã lắp ${currentName.toLowerCase()}.`);
  }
  function resetConfiguration(){
    if(isShip)setConfig({...DEFAULT_CONFIG});else setModuleConfigs(previous=>({...previous,[modelId]:defaultModuleConfig(modelId)}));
    setPreview(null);setModulePreview(null);setIsolate(false);setToast('Đã khôi phục cấu hình gốc.');
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(isShip ? serializeConfiguration(config) : {version:1,model:modelId,parts:moduleConfig}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `orbital-${modelId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('Đã xuất cấu hình hiện đang lắp.');
  }

  async function importConfig(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('File cấu hình quá lớn. Vui lòng chọn file JSON được xuất từ ứng dụng.');
      const data=JSON.parse(await file.text());
      if(isShip)setConfig(parseConfiguration(data));
      else {const parsed=parseModuleConfig(data);if(parsed.model!==modelId)throw new Error('Hãy chọn đúng mô hình trước khi nhập.');setModuleConfigs(previous=>({...previous,[modelId]:parsed.parts}));}
      setPreview(null);setModulePreview(null); setIsolate(false); setToast('Đã khôi phục cấu hình từ file.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Không đọc được file cấu hình.'); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function toggleCamera() {
    if (camera !== 'off') {
      handRef.current?.stop(); handRef.current = null; setCamera('off'); setCameraError(''); setPerformanceReport(null); return;
    }
    if (!videoRef.current || !skeletonRef.current) return;
    setPerformanceReport(null);
    setCameraError(''); setCamera('loading'); setHandStatus('Đang mở webcam…');
    const controller = new HandController(videoRef.current, skeletonRef.current, cursorRefs.current.filter((x): x is HTMLDivElement => !!x), () => sceneRef.current, {
      onStatus: setHandStatus,
      onInference: (duration, backend) => sceneRef.current?.setTrackingLoad(duration, backend),
      onPerformance: diagnosticsEnabled ? report => setPerformanceReport({
        ...report, render: sceneRef.current?.getPerformanceStats() ?? null,
        model: stateRef.current.modelId, origin: window.location.origin,
        build: document.querySelector<HTMLScriptElement>('script[type="module"][src]:not([src*="/@vite/"])')?.src ?? '',
        browser: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      }) : undefined,
      onReady: (isFallback, backend) => { setFallback(isFallback); setHandBackend(backend); setCamera('on'); if (diagnosticsEnabled) sceneRef.current?.getPerformanceStats(); },
      onError: error => { setCameraError(error); setCamera('off'); setPerformanceReport(null); },
      onRange: (name, value) => { if (name === 'explosion') { setExplosion(value); setMode(value > 0 ? 'explode' : 'explore'); setIsolate(false); } else if (name === 'camera-light') setCameraLight(value); else if (name === 'particle-brightness') setParticleBrightness(value); },
      onAssembly: value => { if (!stateRef.current.isolate) { setExplosion(value); setMode(value > 0 ? 'explode' : 'explore'); } },
    });
    handRef.current = controller; controller.setQuality(quality); await controller.start();
  }

  const hoverMeta = displayParts.find(part => part.key === hovered);
  const hoverPart = isShip && hovered && hovered !== 'hull' ? getPart(effectiveConfig[hovered as Family]) : undefined;
  const hoverName = isShip ? hovered === 'hull' ? 'Thân tàu Cruiser' : hoverPart?.name ?? `${hoverMeta?.name} · trống` : hoverMeta?.name;

  return <div className={`app-shell ar-workspace ${camera === 'on' ? 'webcam-on' : ''} ${catalogOpen ? 'catalog-open' : ''}`} style={{ '--camera-light': cameraLight } as React.CSSProperties}>
    <video ref={videoRef} className="camera-feed" autoPlay playsInline muted aria-label="Hình ảnh webcam trực tiếp" />
    <div className="camera-shade" />
    <canvas ref={skeletonRef} className="hand-skeleton" aria-hidden="true" />

    {diagnosticsEnabled && <DiagnosticsPanel report={performanceReport} onCopy={() => {
      if (performanceReport) void navigator.clipboard.writeText(JSON.stringify(performanceReport, null, 2))
        .then(() => setToast('Performance report copied.'))
        .catch(() => setToast('Could not copy the report.'));
    }} />}
    <header className="app-header">
      <a className="brand" href="/" aria-label="ORBITAL — trang chính"><span className="brand-symbol"><Orbit size={23} strokeWidth={1.7} /></span><span>Orbital<span className="brand-sub">INTERACTIVE 3D</span></span></a>
      <div className="top-toolbar glass">
        <button className={`camera-toggle ${camera !== 'off' ? 'active' : ''}`} onClick={toggleCamera} disabled={!ready} aria-label={camera === 'off' ? 'Bật theo dõi tay' : 'Tắt theo dõi tay'} title={camera === 'off' ? 'Bật webcam và theo dõi tay' : 'Tắt webcam và theo dõi tay'}>{camera === 'off' ? <Video size={19} /> : <Hand size={19} />}<span>{camera === 'off' ? 'Bật webcam' : camera === 'loading' ? 'Đang mở…' : 'Đang theo dõi'}</span>{camera === 'on' && <span className="live-dot" />}</button>
        <span className="toolbar-divider" />
        <nav className="mode-tabs" aria-label="Chế độ xem">
          <button className={mode === 'explore' ? 'active' : ''} onClick={() => changeMode('explore')} aria-label="Khám phá" title="Gộp mô hình"><Box size={18} /></button>
          <button className={mode === 'explode' ? 'active' : ''} onClick={() => changeMode('explode')} aria-label="Tháo lắp" title="Bung mô hình"><Layers3 size={18} /></button>
          <button className={mode === 'configure' ? 'active' : ''} onClick={() => changeMode('configure')} aria-label="Tùy biến" title="Mở linh kiện thay thế"><Settings2 size={18} /></button>
        </nav>
        {catalogOpen && <IconButton label="Chọn mô hình" onClick={() => setModelsOpen(v => !v)} aria-expanded={modelsOpen}><Box size={18} /></IconButton>}
        <span className="toolbar-divider" />
        <IconButton label={particleMode ? 'Hiện bề mặt đặc' : 'Hiện mô hình hạt'} onClick={() => setParticleMode(v => !v)}><Sparkles size={18} /></IconButton>
        <IconButton label={labels ? 'Ẩn nhãn bộ phận' : 'Hiện nhãn bộ phận'} onClick={() => setLabels(v => !v)}>{labels ? <Eye size={18} /> : <EyeOff size={18} />}</IconButton>
        <IconButton label="Đặt lại góc nhìn" onClick={() => sceneRef.current?.resetCamera()}><RotateCcw size={18} /></IconButton>
        <IconButton label="Toàn màn hình" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => setToast('Trình duyệt chưa hỗ trợ toàn màn hình tại đây.')); }}><Expand size={18} /></IconButton>
        <IconButton label="Hướng dẫn điều khiển" onClick={() => setHelp(true)}><CircleHelp size={18} /></IconButton>
      </div>
    </header>

    <main className="workbench">
      <section className="viewport" aria-label="Không gian 3D">
        <div className={`viewport-heading ${inspectorOpen ? 'concealed' : ''}`}><span className="eyebrow">{model.category}</span><h1>{isolate ? currentName : model.name}</h1><p>{isolate ? 'Xoay · Zoom' : `${displayParts.length} cụm · ${displayParts.filter(p=>p.replaceable).length} vị trí lắp`}</p></div>
        <div className="scene-host" ref={stageRef} data-scene="true">
          {displayParts.map(part => <button key={part.key} data-part-key={part.key} ref={element => { if (element) markerRefs.current.set(part.key, element); else markerRefs.current.delete(part.key); }} className={`part-marker ${selected === part.key ? 'selected' : ''} ${!part.assetId ? 'unmounted' : ''}`} style={{ display: 'none', '--part-color': part.color } as React.CSSProperties} onPointerEnter={() => sceneRef.current?.hoverPart(part.key)} onPointerLeave={() => sceneRef.current?.clearHover()} onClick={() => selectPart(part.key)} aria-label={`Chọn ${part.name.toLowerCase()}`}><span className="marker-dot" /><span className="marker-label"><b>{part.index}</b>{part.name}{!part.assetId ? <Plus size={12} /> : <ArrowUpRight size={12} />}</span></button>)}
        </div>
        {!ready && !sceneError && <div className="loading-overlay"><div className="loading-orbit"><Orbit size={34} /></div><span>Đang chuẩn bị mô hình</span><div className="progress-track"><i style={{ width: `${progress[0] / progress[1] * 100}%` }} /></div><small>{progress[0]} / {progress[1]} cụm 3D</small></div>}
        {sceneError && <div className="error-overlay glass" role="alert"><Box size={30} /><strong>Chưa mở được khung 3D</strong><p>{sceneError}</p><button className="primary-button" onClick={() => location.reload()}>Tải lại trang</button></div>}
        {hovered && !isolate && <div className="hover-info glass"><span className="status-dot" /><div><strong>{hoverName}</strong><p>{hoverPart ? `${hoverPart.english} · ${hoverPart.dimensions.join(' × ')} m` : hoverMeta?.description}</p></div><small>Trỏ giữ để chọn</small></div>}
        {isolate && <button className="back-to-model glass secondary-button" aria-label="Về toàn bộ mô hình" onClick={() => setIsolate(false)}><ArrowLeft size={14} />Toàn mô hình</button>}
        <div className="view-badge sr-only">{isolate ? 'ISOLATED' : explosion > 0 ? 'EXPLODED' : 'ASSEMBLED'}</div>
      </section>

      {!panelOpen && <button className="open-controls glass" onClick={() => setPanelOpen(true)}><Settings2 size={17} /><span>Bảng điều khiển</span></button>}
      <aside className={`assembly-panel glass ${panelOpen ? '' : 'collapsed'}`} aria-label="Bảng điều khiển">
        <div className="panel-top"><div><h2>{model.name}</h2><p>{displayParts.length} cụm · {displayParts.filter(p=>p.replaceable).length} vị trí lắp</p></div><IconButton label="Thu gọn bảng điều khiển" onClick={() => setPanelOpen(false)}><ChevronDown size={17} /></IconButton></div>
        <div className="scene-status"><div><span>Cảnh</span><strong><span className="status-dot" />{isolate ? 'Xem riêng' : explosion > 0 ? 'Đã bung' : 'Đã gộp'}</strong></div><div><span>Theo dõi tay</span><strong className={camera === 'on' ? '' : 'muted-text'}><Hand size={13} />{camera === 'on' ? 'Đang bật' : camera === 'loading' ? 'Đang nạp…' : 'Chưa bật'}</strong></div></div>
        <div className="explosion-control"><div className="section-label"><span>Bung / gộp</span><strong>{Math.round(explosion * 100)}%</strong></div><input name="explosion" type="range" min="0" max="1" step="0.01" value={explosion} aria-label="Mức độ tháo rời" style={{ '--range': `${explosion * 100}%` } as React.CSSProperties} onChange={event => { const v = Number(event.target.value); setExplosion(v); setMode(v > 0 ? 'explode' : 'explore'); setIsolate(false); }} disabled={!ready} /><div className="range-labels"><span>Gộp</span><span>Bung</span></div></div>
        <div className="quick-actions"><button onClick={() => { setExplosion(0); setIsolate(false); setMode('explore'); }} disabled={!ready}><Box size={17} /><span>Gộp</span></button><button className="assemble-button" aria-label="Bung mô hình" onClick={() => { setExplosion(1); setIsolate(false); setMode('explode'); }} disabled={!ready}><Layers3 size={17} /><span>Bung</span></button><button onClick={() => changeMode('configure')} disabled={!ready}><Settings2 size={17} /><span>Tùy biến</span></button><button onClick={() => sceneRef.current?.resetCamera()}><Focus size={17} /><span>Căn giữa</span></button></div>
        <div className="material-toggle"><button className={particleMode ? 'active' : ''} onClick={() => setParticleMode(true)}><Sparkles size={13} />Đám hạt</button><button className={!particleMode ? 'active' : ''} onClick={() => setParticleMode(false)}><Box size={13} />Bề mặt</button></div>
        {model.animations.length > 0 && <div className="motion-controls">
          <label htmlFor="model-motion">Chuyển động</label>
          <select id="model-motion" aria-label="Chọn chuyển động" value={animation ?? ''} disabled={!ready} onChange={e => { setAnimation(e.target.value || null); setPlaying(!!e.target.value); }}><option value="">Tư thế gốc</option>{model.animations.map(clip => <option key={clip.name} value={clip.name}>{clip.label}</option>)}</select>
          <div className="motion-actions"><button className="secondary-button" aria-label={playing ? 'Tạm dừng chuyển động' : 'Chạy chuyển động'} disabled={!ready} onClick={() => { if (!animation) setAnimation(model.animations[0].name); setPlaying(v => !v); }}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Dừng' : 'Chạy'}</button><button className="motion-loop" aria-label="Lặp chuyển động" aria-pressed={loop} title="Chuyển động mở/đóng lặp qua lại" onClick={() => setLoop(v => !v)}>Lặp{loop && <Check size={12} />}</button><IconButton label="Về tư thế gốc" disabled={!ready} onClick={() => { setPlaying(false); setAnimation(null); }}><RotateCcw size={14} /></IconButton></div>
          {model.animations.length > 1 && <div className="motion-shortcuts" aria-label="Các chuyển động">{model.animations.map(clip => <button key={clip.name} aria-pressed={animation === clip.name} onClick={() => { setAnimation(clip.name); setPlaying(true); }} disabled={!ready}>{clip.label}</button>)}</div>}
        </div>}
        <details className="appearance-controls" open>
          <summary>HIỂN THỊ<ChevronDown size={12} /></summary>
          <div className="appearance-range"><label htmlFor="camera-light">Độ sáng camera<span>{Math.round(cameraLight * 100)}%</span></label><input id="camera-light" name="camera-light" type="range" min="0.2" max="1" step="0.01" value={cameraLight} onChange={e => setCameraLight(Number(e.target.value))} style={{ '--range': `${(cameraLight - .2) / .8 * 100}%` } as React.CSSProperties} /></div>
          <div className="appearance-range"><label htmlFor="particle-brightness">Độ sáng hạt<span>{Math.round(particleBrightness * 100)}%</span></label><input id="particle-brightness" name="particle-brightness" type="range" min="0.4" max="2.2" step="0.01" value={particleBrightness} onChange={e => setParticleBrightness(Number(e.target.value))} style={{ '--range': `${(particleBrightness - .4) / 1.8 * 100}%` } as React.CSSProperties} /></div>
          <div className="quality-presets" role="group" aria-label="Chất lượng hiển thị">{([['light', 'Nhẹ'], ['auto', 'Tự động'], ['detail', 'Nét']] as const).map(([value, label]) => <button key={value} aria-pressed={quality === value} className={quality === value ? 'active' : ''} title={value === 'light' ? 'Chạy nhẹ' : value === 'detail' ? 'Nhiều hạt' : 'Cân bằng'} onClick={() => setQuality(value)}>{label}</button>)}</div>
        </details>
        <details className="structure-details"><summary>BỘ PHẬN<span>{count} cụm<ChevronDown size={12} /></span></summary><div className="assembly-tree" role="group" aria-label={isShip ? 'Các bộ phận của tàu' : 'Các bộ phận của mô hình'}>{displayParts.map(part => { const Icon = SLOT_ICONS[part.key as Family | 'hull'] ?? Box; return <button key={part.key} className={`tree-item ${selected === part.key ? 'selected' : ''}`} onClick={() => selectPart(part.key)} aria-pressed={selected === part.key}><Icon size={15} strokeWidth={1.5} /><span className="tree-text"><strong>{part.name}</strong><small>{part.english}</small></span><span className={`part-dot ${!part.assetId ? 'empty' : ''}`} style={{ backgroundColor: part.color }} /></button>; })}</div></details>
        {!isShip && <p className="model-structure-note">{model.note}</p>}
        <details className="gesture-guide" open><summary>CỬ CHỈ<ChevronDown size={12} /></summary><div>
          <p><Layers3 size={15} /><span><b>Xòe / nắm</b> — bung / gộp</span></p>
          <p><RotateCcw size={15} /><span><b>Cổ tay</b> — xoay</span></p>
          <p><Move size={15} /><span><b>Hai tay</b> — kéo / zoom</span></p>
          <p><MousePointer2 size={15} /><span><b>Trỏ giữ 0,6 giây</b> — chọn</span></p>
          <p><Hand size={15} /><span><b>Chụm kéo</b> — lướt linh kiện</span></p>
        </div></details>
        <div className="assembly-bottom"><div className="configuration-note"><span className="status-dot" />{changedCount ? `${changedCount} vị trí đã tùy biến` : 'Cấu hình nguyên bản'}<span title={saved ? 'Đã tự lưu trên máy' : 'Chưa tự lưu được'}>{saved ? <Check size={12} /> : <CircleHelp size={12} />}</span></div><div className="config-actions"><button onClick={exportConfig}><ArrowDownToLine size={13} />Xuất</button><button onClick={() => fileRef.current?.click()} aria-label="Nhập cấu hình"><Upload size={13} />Nhập</button><IconButton label="Khôi phục cấu hình gốc" onClick={resetConfiguration}><RotateCcw size={13} /></IconButton></div></div>
      </aside>

      {inspectorOpen && <aside className="inspector-panel glass">
        <div className="panel-top"><span className="eyebrow">{selectedMeta.name.toUpperCase()} / {selectedMeta.index}</span><IconButton label="Đóng thông tin bộ phận" onClick={() => setInspectorOpen(false)}><X size={16} /></IconButton></div>
        <div className="part-hero"><img src={isShip ? `/models/${selectedMeta.assetId ?? 'engine-large'}.webp` : currentOption?.thumbnail ?? model.thumbnail} alt={currentName} className={!selectedMeta.assetId ? 'empty-preview' : ''} />{(preview || modulePreview) && <span className="preview-badge">ĐANG XEM THỬ</span>}</div>
        <div className="inspector-content"><h2>{currentName}</h2><p className="part-description">{currentDescription}</p>
          <dl className="part-properties"><div><dt>Trạng thái</dt><dd className={preview || modulePreview ? 'preview-text' : 'lime-text'}>{preview || modulePreview ? 'Xem thử · chưa lắp' : !selectedMeta.replaceable ? 'Cố định' : selectedMeta.assetId ? 'Đã lắp' : 'Đang trống'}</dd></div><div><dt>Kích thước</dt><dd>{selectedMeta.assetId ? `${selectedMeta.dimensions.map(v => v.toFixed(2)).join(' × ')} m` : '—'}</dd></div></dl>
          <div className="inspector-actions"><button className="secondary-button" aria-label={isolate ? 'Về toàn bộ tàu' : 'Xem riêng bộ phận'} disabled={!ready || !selectedMeta.assetId} onClick={() => setIsolate(v => !v)}><Maximize2 size={14} />{isolate ? 'Toàn mô hình' : 'Xem riêng'}</button>{selectedMeta.replaceable && <button className="text-button remove-part" aria-label="Tháo linh kiện" disabled={!ready || !selectedMeta.assetId} onClick={removePart}><Unplug size={13} />Tháo</button>}</div>
        </div>
      </aside>}

      {isShip && catalogOpen && <section className="catalog-panel glass" aria-label="Linh kiện thay thế"><div className="catalog-heading"><div><span className="eyebrow">VỊ TRÍ LẮP / {SLOTS[slot].index}</span><h2>{selected === 'hull' ? 'Chọn vị trí lắp' : `Linh kiện ${SLOTS[slot].short.toLowerCase()}`}<span className="count-chip">{parts.length} tương thích</span></h2></div><div className="catalog-navigation"><span><Hand size={13} />Chụm kéo để lướt</span><IconButton label="Lướt linh kiện trước" onClick={() => catalogRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ArrowLeft size={15} /></IconButton><IconButton label="Lướt linh kiện tiếp" onClick={() => catalogRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ArrowRight size={15} /></IconButton><IconButton label="Đóng danh sách linh kiện" onClick={() => { setCatalogOpen(false); setPreview(null); }}><X size={17} /></IconButton></div></div><div className="catalog-scroll" ref={catalogRef} data-catalog="true">{parts.map(part => { const installed = config[slot] === part.id; const chosen = preview?.id === part.id || (!preview && installed); return <button key={part.id} className={`part-card ${chosen ? 'chosen' : ''}`} disabled={!ready} onClick={() => { setSelected(slot); setInspectorOpen(true); setPreview(installed ? null : { slot, id: part.id }); }} aria-pressed={chosen} aria-label={`Xem thử ${part.name.toLowerCase()}`}><div className="part-card-image"><img src={`/models/${part.id}.webp`} alt="" draggable={false} /><span>{part.tag}</span>{installed && <i><Check size={10} />ĐÃ LẮP</i>}{preview?.id === part.id && <i className="preview-text"><Eye size={10} />XEM THỬ</i>}</div><div className="part-card-caption"><span>{part.name}</span><ArrowUpRight size={13} /></div></button>; })}</div><div className="catalog-footer"><span>{preview ? <><span className="preview-indicator" />Đang xem thử <strong>{getPart(preview.id)?.name}</strong></> : <><span className="status-dot" />Trỏ giữ để xem thử</>}</span><div>{preview ? <><button className="text-button" aria-label="Hủy xem thử" onClick={() => setPreview(null)}>Hủy</button><button className="primary-button compact" aria-label="Lắp linh kiện" onClick={applyPreview}><Plus size={14} />Lắp</button></> : <span className="catalog-footnote">Cấu hình tự lưu trên máy</span>}</div></div></section>}

      {!isShip && catalogOpen && selectedMeta.replaceable && <ModularCatalog slot={selectedMeta} installed={moduleConfig[selected] ?? null} preview={modulePreview?.id ?? null} ready={ready} scrollRef={catalogRef} onPreview={id=>{setModulePreview(moduleConfig[selected]===id ? null : {key:selected,id});setInspectorOpen(true);}} onApply={applyModulePreview} onCancel={()=>setModulePreview(null)} onClose={()=>{setCatalogOpen(false);setModulePreview(null);}} />}

      {!catalogOpen && <div className="viewport-bottom"><div className="view-switch glass" aria-label="Góc nhìn"><button aria-label="Góc nhìn phối cảnh" title="Phối cảnh" onClick={() => sceneRef.current?.setView('perspective')}><Box size={16} /></button><button aria-label="Góc nhìn ngang" title="Nhìn ngang" onClick={() => sceneRef.current?.setView('side')}>SIDE</button><button aria-label="Góc nhìn từ trên" title="Nhìn từ trên" onClick={() => sceneRef.current?.setView('top')}>TOP</button></div><button className="model-pill glass" aria-label="Chọn mô hình" aria-expanded={modelsOpen} onClick={() => setModelsOpen(v => !v)}><span className="status-dot" />{model.name}<span>{String(count).padStart(2,'0')} cụm</span><ChevronDown size={13} /></button><div className="scene-tools glass"><IconButton label="Thu nhỏ" onClick={() => sceneRef.current?.zoom(.85)}><ZoomOut size={17} /></IconButton><IconButton label="Phóng to" onClick={() => sceneRef.current?.zoom(1.17)}><ZoomIn size={17} /></IconButton></div></div>}
    </main>

    {modelsOpen && <div className="model-picker-backdrop" onClick={() => setModelsOpen(false)}><section className="model-picker glass" aria-label="Thư viện mô hình" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setModelsOpen(false); }}><div className="model-picker-heading"><strong>Chọn mô hình</strong><IconButton label="Đóng thư viện" onClick={() => setModelsOpen(false)}><X size={17} /></IconButton></div><div className="model-picker-grid">{MODELS.map(item => <button key={item.id} className={`model-choice ${modelId === item.id ? 'active' : ''}`} aria-label={`Mở ${item.name}`} aria-pressed={modelId === item.id} onClick={() => changeModel(item.id)}><img src={item.thumbnail} alt="" /><strong>{item.name}</strong><small>{item.id === SHIP_ID ? '5 cụm · Tùy biến' : `${item.parts.filter(p=>p.replaceable).length} vị trí · Tùy biến`}</small></button>)}</div></section></div>}

    {camera === 'off' && !cameraError && !catalogOpen && <div className="camera-invite glass"><div className="invite-icon"><Video size={21} /></div><div><strong>Điều khiển bằng tay</strong><p>Xòe để bung · Nắm để gộp.</p></div><button className="primary-button" disabled={!ready} onClick={toggleCamera}>Bật webcam<ArrowUpRight size={14} /></button></div>}
    {camera !== 'off' && <div className="camera-meta"><span className="webcam-caption"><span className="live-dot" />{camera === 'loading' ? 'Đang khởi động…' : fallback ? 'CPU · chế độ tương thích' : `${handBackend} · xử lý trên máy`}</span><button onClick={toggleCamera} aria-label="Tắt webcam"><VideoOff size={13} /></button></div>}
    {camera !== 'off' && <div className="hand-status glass" role="status"><Hand size={15} /><span>{handStatus}</span></div>}
    <footer className="status-bar"><div><span className={`status-dot ${ready ? '' : 'muted'}`} /><span>{ready ? isShip ? 'Xưởng tàu sẵn sàng' : 'Mô hình sẵn sàng' : 'Đang tải tài nguyên'}</span>{ready && particleMode && <span className="particle-count">{Math.round(particleCount / 1000)}k hạt màu</span>}</div><span className="mouse-hints">Kéo: xoay · Chuột phải: di chuyển · Cuộn: zoom</span><a href={model.source} target="_blank" rel="noreferrer">{modelId === 'city-car' ? 'Kenney · CC0' : '3DAssets.dev · CC0'}<ArrowUpRight size={10} /></a></footer>
    <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="File cấu hình JSON" onChange={event => void importConfig(event.target.files?.[0])} />
    {cameraError && <div className="camera-error glass" role="alert"><VideoOff size={20} /><div><strong>Chưa bật được theo dõi tay</strong><p>{cameraError}</p></div><button onClick={() => setCameraError('')} aria-label="Đóng thông báo camera"><X size={16} /></button></div>}
    {toast && <div className="toast glass" role="status"><Check size={16} />{toast}<button onClick={() => setToast('')} aria-label="Đóng thông báo"><X size={13} /></button></div>}
    {[0, 1].map(i => <div className="hand-cursor" key={i} ref={el => { cursorRefs.current[i] = el; }} aria-hidden="true"><span /><b>{i === 0 ? 'L' : 'R'}</b></div>)}

    {help && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setHelp(false); }}><div className="help-modal glass" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="modal-heading"><h2 id="help-title">Cách điều khiển</h2><IconButton label="Đóng hướng dẫn" onClick={() => setHelp(false)}><X size={19} /></IconButton></div>
      <div className="help-columns">
        <div><h3><Hand size={17} />Bàn tay</h3><dl>
          <div><dt>Bung / gộp</dt><dd>Xòe / nắm một tay.</dd></div>
          <div><dt>Xoay</dt><dd>Xoay cổ tay.</dd></div>
          <div><dt>Kéo / zoom</dt><dd>Mở hai tay, cùng kéo / tách khép.</dd></div>
          <div><dt>Chọn</dt><dd>Trỏ giữ 0,6 giây. Chờ vòng tròn đầy.</dd></div>
          <div><dt>Lướt linh kiện</dt><dd>Chụm rồi kéo ngang.</dd></div>
        </dl></div>
        <div><h3><MousePointer2 size={17} />Chuột</h3><dl>
          <div><dt>Xoay</dt><dd>Kéo chuột trái.</dd></div>
          <div><dt>Di chuyển</dt><dd>Kéo chuột phải.</dd></div>
          <div><dt>Zoom</dt><dd>Cuộn chuột.</dd></div>
          <div><dt>Chọn</dt><dd>Bấm mô hình hoặc nhãn.</dd></div>
          <div><dt>Bung / gộp</dt><dd>Nút Bung / Gộp.</dd></div>
        </dl></div>
      </div>
      <p className="privacy-note">Camera xử lý trên máy.</p>
      <button className="primary-button help-done" onClick={() => setHelp(false)}>Đã hiểu<Check size={16} /></button>
    </div></div>}

  </div>;
}
