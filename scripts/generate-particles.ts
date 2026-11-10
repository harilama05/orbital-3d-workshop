import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { extractFeatureEdges, sampleParticleSurface } from './particle-sampling.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['cruiser', 'engine-small', 'engine-medium', 'engine-large', 'turret-single', 'turret-twin', 'turret-spinal', 'missile-pod', 'radar', 'sensor', 'communications', 'cargo', 'fuel', 'drone-rack'];
await fs.mkdir(path.join(root, 'public/particles'), { recursive: true });
const manifest: Record<string, { count: number; bytes: number; edgeSegments: number }> = {};
for (const [index, id] of ids.entries()) {
  const data = await fs.readFile(path.join(root, `public/models/${id}.glb`));
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  const points = sampleParticleSurface(gltf.scene, id === 'cruiser' ? 52000 : 12000, index + 19);
  const edges = extractFeatureEdges(gltf.scene);
  await fs.writeFile(path.join(root, `public/particles/${id}.bin`), new Uint8Array(points.buffer));
  await fs.writeFile(path.join(root, `public/particles/${id}.edges.bin`), new Uint8Array(edges.buffer));
  manifest[id] = { count: points.length / 3, bytes: points.byteLength, edgeSegments: edges.length / 6 };
  console.log(`${id}: ${points.length / 3} surface particles, ${edges.length / 6} feature-edge segments`);
}
await fs.writeFile(path.join(root, 'public/particles/manifest.json'), JSON.stringify(manifest, null, 2));
