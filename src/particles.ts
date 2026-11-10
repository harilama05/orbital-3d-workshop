import * as THREE from 'three';

export function createParticleGeometry(data: ArrayBuffer) {
  if (!data.byteLength || data.byteLength % 12) throw new Error('File hạt 3D không hợp lệ.');
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(data);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  const shades = new Uint8Array(position.length / 3);
  for (let i = 0; i < shades.length; i++) shades[i] = (Math.imul(i + 17, 2654435761) >>> 16) & 255;
  geometry.setAttribute('aShade', new THREE.BufferAttribute(shades, 1, true));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createEdgeGeometry(data: ArrayBuffer) {
  if (data.byteLength % 24) throw new Error('File cạnh 3D không hợp lệ.');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data), 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** A single lightweight draw per part. Surface particles, not mesh vertices or
 * triangle wireframe. The circular sprite supplies its own halo: no bloom pass.
 */
export function createParticleMaterial(color: string, brightness: number, pixelRatio: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uBrightness: { value: brightness }, uSize: { value: 2.1 }, uPixelRatio: { value: pixelRatio }, uHighlight: { value: 1 } },
    vertexShader: `
      attribute float aShade;
      varying float vShade;
      uniform float uSize;
      uniform float uPixelRatio;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(uSize * 42.0 / max(5.0, -viewPosition.z), 1.0, 4.0) * uPixelRatio;
        vShade = mix(0.7, 1.0, aShade);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uBrightness;
      uniform float uHighlight;
      varying float vShade;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        if (radius > 0.5) discard;
        float alpha = pow(1.0 - radius * 2.0, 1.1) * 0.88;
        gl_FragColor = vec4(uColor * vShade * uBrightness * uHighlight, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.NormalBlending, toneMapped: false,
  });
}
