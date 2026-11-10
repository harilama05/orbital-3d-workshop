import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentPosition, DEFAULT_CONFIG, getPart, parseConfiguration, serializeConfiguration, setPart, SLOTS } from '../src/catalog.ts';

test('replacing and removing parts round trips without restoring default parts', () => {
  let config = setPart(DEFAULT_CONFIG, 'engine', 'engine-small');
  config = setPart(config, 'weapon', null);
  config = setPart(config, 'cargo', 'fuel');
  const restored = parseConfiguration(JSON.parse(JSON.stringify(serializeConfiguration(config))));
  assert.equal(restored.engine, 'engine-small');
  assert.equal(restored.weapon, null);
  assert.equal(restored.cargo, 'fuel');
  assert.equal(DEFAULT_CONFIG.engine, 'engine-large');
});

test('invalid compatibility and unknown asset IDs cannot enter a configuration', () => {
  assert.throws(() => setPart(DEFAULT_CONFIG, 'engine', 'radar'), /không tương thích/);
  assert.throws(() => parseConfiguration({ version: 1, model: 'cruiser-01', parts: { ...DEFAULT_CONFIG, weapon: 'arbitrary-url' } }));
  assert.throws(() => parseConfiguration({ version: 2, model: 'cruiser-01', parts: DEFAULT_CONFIG }));
  assert.throws(() => parseConfiguration({ version: 1, model: 'other', parts: DEFAULT_CONFIG }));
  assert.throws(() => parseConfiguration({ version: 1, model: 'cruiser-01', parts: {} }));
});

test('all engine sizes meet the same forward mounting plane and centerline', () => {
  const socket = SLOTS.engine.position;
  const front = socket[2] + 2.95 / 2;
  const center = socket[1] + 2 / 2;
  for (const id of ['engine-small', 'engine-medium', 'engine-large']) {
    const p = attachmentPosition('engine', id);
    assert.ok(Math.abs(p[2] + getPart(id)!.dimensions[2] / 2 - front) < 1e-9);
    assert.ok(Math.abs(p[1] + getPart(id)!.dimensions[1] / 2 - center) < 1e-9);
  }
});
