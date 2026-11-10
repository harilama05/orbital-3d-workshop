import test from 'node:test';
import assert from 'node:assert/strict';
import { DwellSelection, dualAnchor, dualDelta, handPose, palmOrientation, wristDelta, updateDrag, type Landmark, type PinchSession } from '../src/gestures.ts';

function hand(ratio: number, scale = 1) {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
  points[0] = { x: .5, y: .7, z: 0 };
  points[9] = { x: .5, y: .7 - .2 * scale, z: 0 };
  points[8] = { x: .3, y: .3, z: 0 };
  points[4] = { x: .3 + .2 * scale * ratio, y: .3, z: 0 };
  return { points, handedness: 'Right' };
}

test('pinch is normalized to palm size, mirrors pointer, and uses release hysteresis', () => {
  for (const size of [.5, 1, 1.5]) {
    assert.equal(handPose(hand(.25, size)).pinching, true);
    assert.equal(handPose(hand(.4, size)).pinching, false);
    assert.equal(handPose(hand(.4, size), true).pinching, true);
    assert.equal(handPose(hand(.55, size), true).pinching, false);
  }
  assert.equal(handPose(hand(.2)).x, .7);
});

test('two-hand translation and zoom are independent and tracking jumps are clamped', () => {
  const pose = (x: number, y: number) => ({ x, y, pinching: true, handedness: '' });
  const a = dualAnchor(pose(.3, .4), pose(.7, .4));
  const translated = dualAnchor(pose(.32, .43), pose(.72, .43));
  const d = dualDelta(a, translated);
  assert.ok(Math.abs(d.dx - .02) < 1e-9);
  assert.ok(Math.abs(d.dy - .03) < 1e-9);
  assert.ok(Math.abs(d.zoom - 1) < 1e-9);
  const zoom = dualDelta(a, dualAnchor(pose(.28, .4), pose(.72, .4)));
  assert.ok(Math.abs(zoom.zoom - 1.1) < 1e-9);
  const jump = dualDelta(a, { x: 5, y: -5, distance: 10, angle: 0 });
  assert.equal(jump.dx, .06); assert.equal(jump.dy, -.06); assert.equal(jump.zoom, 1.12);
});

test('a catalog drag stays a drag after returning to its starting point', () => {
  const session: PinchSession = { x: 100, y: 100, lastX: 100, lastY: 100, moved: false, target: 'catalog', element: null };
  updateDrag(session, 109, 104); assert.equal(session.moved, false);
  assert.equal(updateDrag(session, 140, 100).dx, 31);
  assert.equal(session.moved, true);
  updateDrag(session, 100, 100); assert.equal(session.moved, true);
  assert.equal(session.target, 'catalog');
});

const openPoints: Landmark[] = [[.5,.8],[.42,.73],[.34,.65],[.29,.56],[.25,.47],[.4,.61],[.39,.45],[.38,.35],[.37,.25],[.5,.58],[.5,.4],[.5,.28],[.5,.16],[.59,.6],[.61,.44],[.62,.34],[.63,.23],[.67,.64],[.71,.52],[.73,.44],[.75,.36]].map(([x,y]) => ({x,y,z:0}));

test('open palm and fist have distinct openness and fist is not a pinch', () => {
  const open = handPose({ points: openPoints, handedness: 'Right' });
  assert.equal(open.open, true); assert.equal(open.pinching, false);
  const closed = openPoints.map(p => ({ ...p }));
  for (const [tip, mcp] of [[8,5],[12,9],[16,13],[20,17]]) closed[tip] = { ...closed[mcp], y: closed[mcp].y + .02 };
  assert.equal(handPose({ points: closed, handedness: 'Right' }).open, false);
  closed[4] = { ...closed[8] };
  const fist = handPose({ points: closed, handedness: 'Right' });
  assert.equal(fist.pinching, false, 'closed fist is not a click even when thumb touches index');
  assert.equal(fist.openness, 0);
  assert.ok(open.openness > .9);
});

test('finger shape uses world landmarks when the camera view is foreshortened', () => {
  const foreshortened = openPoints.map(p => ({ x: .5 + (p.x-.5)*.05, y: .5, z: 0 }));
  const pose = handPose({ points: foreshortened, worldPoints: openPoints, handedness: 'Right' });
  assert.equal(pose.open, true); assert.equal(pose.pinching, false); assert.ok(pose.openness > .9);
});

test('dwell selects once after a stable point and tolerates small hand jitter', () => {
  const dwell = new DwellSelection(550);
  assert.equal(dwell.update('part:engine', 200, 200, 0).select, false);
  assert.equal(dwell.update('part:engine', 208, 204, 300).select, false);
  assert.equal(dwell.update('part:engine', 204, 202, 560).select, true);
  assert.equal(dwell.update('part:engine', 200, 200, 1500).select, false);
  assert.equal(dwell.update('new-button-after-panel-opens', 200, 200, 2500).select, false);
  dwell.update('part:cargo', 400, 400, 3000);
  assert.equal(dwell.update('part:cargo', 404, 400, 3600).select, true);
});

test('changing a dwell target or losing the point restarts the hold', () => {
  const dwell = new DwellSelection(550);
  dwell.update('part:engine', 100, 100, 0);
  dwell.update('part:weapon', 100, 100, 400);
  assert.equal(dwell.update('part:weapon', 100, 100, 600).select, false);
  dwell.update(null, 100, 100, 700);
  assert.equal(dwell.update('part:weapon', 100, 100, 1000).progress, 0);
  assert.equal(dwell.update('part:weapon', 100, 100, 1600).select, true);
  dwell.reset(); assert.equal(dwell.update('part:weapon', 100, 100, 2000).progress, 0);
});

test('wrist rotation follows orientation and ignores palm translation and size', () => {
  const initial = palmOrientation({ points: openPoints, handedness: 'Right' })!;
  const translated = openPoints.map(p => ({ x: p.x * 1.5 + .1, y: p.y * 1.5 - .2, z: 0 }));
  assert.deepEqual(wristDelta(initial, palmOrientation({ points: translated, handedness: 'Right' })!), { yaw: 0, pitch: 0, roll: 0 });
  const angle = .1, pivot = openPoints[0];
  const rotated = openPoints.map(p => ({ x: pivot.x + (p.x-pivot.x)*Math.cos(angle) - (p.y-pivot.y)*Math.sin(angle), y: pivot.y + (p.x-pivot.x)*Math.sin(angle) + (p.y-pivot.y)*Math.cos(angle), z: 0 }));
  const delta = wristDelta(initial, palmOrientation({ points: rotated, handedness: 'Right' })!);
  assert.ok(Math.abs(delta.roll) > .08); assert.equal(delta.yaw, 0); assert.equal(delta.pitch, 0);
  const wrap = wristDelta({ yaw: 0, pitch: 0, roll: Math.PI-.01 }, { yaw: 0, pitch: 0, roll: -Math.PI+.01 });
  assert.ok(Math.abs(wrap.roll) < .04);
});

test('world-space wrist tilt controls yaw and pitch separately', () => {
  const initial = palmOrientation({ points: openPoints, worldPoints: openPoints, handedness: 'Right' })!;
  const angle = .12, pivot = openPoints[0];
  const tiltX = openPoints.map(p => ({ x: p.x, y: pivot.y + (p.y-pivot.y)*Math.cos(angle), z: (p.y-pivot.y)*Math.sin(angle) }));
  const tiltY = openPoints.map(p => ({ x: pivot.x + (p.x-pivot.x)*Math.cos(angle), y: p.y, z: -(p.x-pivot.x)*Math.sin(angle) }));
  const x = wristDelta(initial, palmOrientation({ points: openPoints, worldPoints: tiltX, handedness: 'Right' })!);
  const y = wristDelta(initial, palmOrientation({ points: openPoints, worldPoints: tiltY, handedness: 'Right' })!);
  assert.ok(Math.abs(x.pitch) > .1); assert.ok(Math.abs(x.yaw) < .01);
  assert.ok(Math.abs(y.yaw) > .1); assert.ok(Math.abs(y.pitch) < .01);
});
