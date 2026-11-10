import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// The installed runtime exposes this API; its matching DefinitelyTyped release
// omits the random-generator setter.
declare module 'three/addons/math/MeshSurfaceSampler.js' {
  interface MeshSurfaceSampler { setRandomGenerator(generator: () => number): this }
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** Flatten glTF quantization and node transforms into one local-space mesh. */
function flattenedGeometry(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const values: number[] = [];
  const point = new THREE.Vector3();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const total = index?.count ?? position.count;
    for (let i = 0; i < total; i++) {
      point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(node.matrixWorld);
      values.push(point.x, point.y, point.z);
    }
  });
  if (!values.length || values.length % 9) throw new Error('Model must contain triangle meshes.');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

/** Only crease and boundary edges: coplanar triangle diagonals are omitted. */
export function extractFeatureEdges(root: THREE.Object3D) {
  const geometry = flattenedGeometry(root);
  const edges = new THREE.EdgesGeometry(geometry, 28);
  const positions = new Float32Array(edges.getAttribute('position').array);
  geometry.dispose(); edges.dispose();
  return positions;
}

/** Work offline: sample the actual faces by area, not their vertices/edges. */
export function sampleParticleSurface(root: THREE.Object3D, count: number, seed = 1) {
  const geometry = flattenedGeometry(root);
  const random = seededRandom(seed);
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geometry)).setRandomGenerator(random).build();
  const point = new THREE.Vector3();
  const output = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    sampler.sample(point);
    point.toArray(output, i * 3);
  }
  geometry.dispose();
  return output;
}
