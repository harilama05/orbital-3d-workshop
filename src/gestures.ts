export interface Landmark { x: number; y: number; z: number }
export interface TrackedHand { points: Landmark[]; worldPoints?: Landmark[]; handedness: string }
export interface PalmOrientation { yaw: number; pitch: number; roll: number }
export interface HandPose { x: number; y: number; palmX: number; palmY: number; pinching: boolean; open: boolean; pointing: boolean; openness: number; orientation: PalmOrientation | null; handedness: string }
export interface DualAnchor { x: number; y: number; distance: number; angle: number }

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

export function palmOrientation(hand: TrackedHand): PalmOrientation | null {
  const p = hand.worldPoints ?? hand.points;
  const wrist = p[0], middle = p[9], index = p[5], pinky = p[17];
  const fx = -(middle.x - wrist.x), fy = -(middle.y - wrist.y), fz = -(middle.z - wrist.z);
  const sx = -(index.x - pinky.x), sy = -(index.y - pinky.y), sz = -(index.z - pinky.z);
  const nx = sy * fz - sz * fy, ny = sz * fx - sx * fz, nz = sx * fy - sy * fx;
  const length = Math.hypot(nx, ny, nz);
  if (length < .000001 || Math.hypot(fx, fy) < .00001) return null;
  return { yaw: Math.atan2(nx / length, Math.abs(nz / length) + .15), pitch: Math.atan2(ny / length, Math.abs(nz / length) + .15), roll: Math.atan2(fx, fy) };
}

export function angleDelta(a: number, b: number) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
export function wristDelta(previous: PalmOrientation, next: PalmOrientation) {
  const filter = (a: number, b: number) => { const d = angleDelta(a, b); return Math.abs(d) < .008 ? 0 : Math.max(-.16, Math.min(.16, d)); };
  return { yaw: filter(previous.yaw, next.yaw) * 1.5, pitch: filter(previous.pitch, next.pitch) * 1.5, roll: filter(previous.roll, next.roll) * 1.25 };
}

export function handPose(hand: TrackedHand, wasPinching = false): HandPose {
  const p = hand.points;
  const shape = hand.worldPoints?.length === 21 ? hand.worldPoints : p;
  const shapeDistance = (a: Landmark, b: Landmark) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
  const palm = Math.max(shapeDistance(shape[0], shape[9]), .025);
  // Hysteresis prevents a pinch from flapping at the boundary. Normalize by palm size.
  const ratio = shapeDistance(shape[4], shape[8]) / palm;
  let pinching = ratio < (wasPinching ? .5 : .35);
  const extended = [[8,6],[12,10],[16,14],[20,18]].map(([tip, pip]) => shapeDistance(shape[tip], shape[0]) > shapeDistance(shape[pip], shape[0]) * 1.16);
  const extension = [[8,6],[12,10],[16,14],[20,18]].reduce((sum, [tip,pip]) => sum + shapeDistance(shape[tip], shape[0]) / Math.max(.01, shapeDistance(shape[pip], shape[0])), 0) / 4;
  const openness = Math.max(0, Math.min(1, (extension - .92) / .64));
  // A closed fist may place thumb/index tips together, but is a form gesture.
  if (extension < .88 && extended.every(value => !value)) pinching = false;
  const open = !pinching && extended.filter(Boolean).length >= 3;
  return { x: 1 - p[8].x, y: p[8].y, palmX: 1 - (p[0].x + p[5].x + p[9].x + p[17].x) / 4, palmY: (p[0].y + p[5].y + p[9].y + p[17].y) / 4, pinching, open, pointing: extended[0] && extended.slice(1).filter(Boolean).length <= 1, openness, orientation: palmOrientation(hand), handedness: hand.handedness };
}

/** A stable point selects once; move away or relax the hand to select again. */
export class DwellSelection {
  private key: string | null = null;
  private start = 0;
  private anchor = { x: 0, y: 0 };
  private latched: { x: number; y: number } | null = null;
  constructor(private duration = 550) {}
  update(key: string | null, x: number, y: number, now: number) {
    if (this.latched) {
      if (Math.hypot(x - this.latched.x, y - this.latched.y) < 60) return { progress: 0, select: false };
      this.latched = null; this.key = null;
    }
    if (!key) { this.key = null; return { progress: 0, select: false }; }
    if (key !== this.key || Math.hypot(x - this.anchor.x, y - this.anchor.y) > 36) {
      this.key = key; this.start = now; this.anchor = { x, y };
    }
    const progress = Math.min(1, Math.max(0, (now - this.start) / this.duration));
    if (progress === 1) { this.latched = { x, y }; this.key = null; }
    return { progress, select: progress === 1 };
  }
  reset() { this.key = null; this.latched = null; this.start = 0; }
  lock(x: number, y: number) { this.key = null; this.latched = { x, y }; }
}

export function dualAnchor(a: Pick<HandPose, 'x' | 'y'>, b: Pick<HandPose, 'x' | 'y'>): DualAnchor {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(.035, Math.hypot(a.x - b.x, a.y - b.y)), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function dualDelta(previous: DualAnchor, next: DualAnchor) {
  // Limit single-frame jumps after occlusion or a tracking discontinuity.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { dx: clamp(next.x - previous.x, -.06, .06), dy: clamp(next.y - previous.y, -.06, .06), zoom: clamp(next.distance / previous.distance, .88, 1.12) };
}

export type DragTarget = 'scene' | 'catalog' | 'ui';
export interface PinchSession {
  x: number; y: number; lastX: number; lastY: number;
  moved: boolean; target: DragTarget; element: HTMLElement | null;
  handedness?: string;
  scrollElement?: HTMLElement | null;
}

export function updateDrag(session: PinchSession, x: number, y: number, threshold = 18) {
  if (Math.hypot(x - session.x, y - session.y) > threshold) session.moved = true;
  const delta = { dx: x - session.lastX, dy: y - session.lastY };
  session.lastX = x; session.lastY = y;
  return delta;
}
