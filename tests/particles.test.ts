import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { extractFeatureEdges, sampleParticleSurface } from '../scripts/particle-sampling.ts';
import { createEdgeGeometry, createParticleGeometry } from '../src/particles.ts';
import { PART_COLORS } from '../src/catalog.ts';

test('surface samples cover transformed faces, not just the source vertices', () => {
  const root = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  plane.position.set(5, 3, 7); plane.scale.set(2, 3, 1); root.add(plane);
  const positions = sampleParticleSurface(root, 2000, 9);
  let interior = 0;
  for (let i = 0; i < positions.length; i += 3) {
    assert.ok(positions[i] >= 3 && positions[i] <= 7);
    assert.ok(positions[i + 1] >= 0 && positions[i + 1] <= 6);
    assert.equal(positions[i + 2], 7);
    if (positions[i] > 3.1 && positions[i] < 6.9 && positions[i + 1] > .1 && positions[i + 1] < 5.9) interior++;
  }
  assert.ok(interior > 1200);
  assert.deepEqual(positions, sampleParticleSurface(root, 2000, 9));
});

test('particle density is weighted by physical face area across meshes', () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(10, 10)));
  const small = new THREE.Mesh(new THREE.PlaneGeometry(1, 1)); small.position.x = 20; root.add(small);
  const points = sampleParticleSurface(root, 8000, 17);
  let onSmall = 0;
  for (let i = 0; i < points.length; i += 3) if (points[i] > 10) onSmall++;
  assert.ok(onSmall > 50 && onSmall < 450, `small face received ${onSmall}/8000 points`);
});

test('part colors stay distinct and corrupt particle files are rejected', () => {
  assert.equal(new Set(Object.values(PART_COLORS)).size, 5);
  assert.throws(() => createParticleGeometry(new ArrayBuffer(8)));
  const geometry = createParticleGeometry(new Float32Array([0, 1, 2, 3, 4, 5]).buffer);
  assert.equal(geometry.getAttribute('position').count, 2);
  geometry.dispose();
});

test('outline follows hard corners and excludes coplanar triangle diagonals', () => {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const planeEdges = extractFeatureEdges(plane);
  assert.equal(planeEdges.length / 6, 4);
  for (let i = 0; i < planeEdges.length; i += 6) {
    assert.ok(planeEdges[i] === planeEdges[i + 3] || planeEdges[i + 1] === planeEdges[i + 4], 'only straight perimeter edges');
  }
  const cubeEdges = extractFeatureEdges(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
  assert.equal(cubeEdges.length / 6, 12);
  const geometry = createEdgeGeometry(cubeEdges.buffer);
  assert.equal(geometry.getAttribute('position').count, 24);
  geometry.dispose();
  assert.throws(() => createEdgeGeometry(new ArrayBuffer(12)));
});
