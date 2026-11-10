import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules/@mediapipe/tasks-vision');
const output = path.join(root, 'public/hand');
await mkdir(path.join(output, 'wasm'), { recursive: true });
for (const name of await readdir(path.join(source, 'wasm'))) {
  if (name.endsWith('.js') || name.endsWith('.wasm')) await copyFile(path.join(source, 'wasm', name), path.join(output, 'wasm', name));
}
// Classic worker + CJS exports avoids importScripts incompatibility in module workers.
await copyFile(path.join(source, 'vision_bundle.cjs'), path.join(output, 'vision_bundle.js'));
console.log('Prepared local MediaPipe runtime. No external runtime CDN required.');
