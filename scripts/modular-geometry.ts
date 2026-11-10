import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Read geometry without loading the Kenney palette image in Node. The public
 * viewer deliberately renders flat per-part colors and particles. */
export async function parseSource(data: Buffer) {
  const size=data.readUInt32LE(12), doc=JSON.parse(data.subarray(20,20+size).toString());
  for(const m of doc.materials ?? []) {
    delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
    if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}
    delete m.extensions;
  }
  const binary=data.subarray(20+size+8);
  const rebuilt=pack(doc,binary);
  return new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength) as ArrayBuffer,'');
}
function pack(doc:unknown,binary:Buffer) {
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header=Buffer.alloc(20),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,bh,binary]);
}
export function writePart(meshes:THREE.Mesh[],origin:THREE.Vector3,scale:number) {
  const chunks:Buffer[]=[],views:object[]=[],accessors:object[]=[],primitives:object[]=[],materials:object[]=[];let offset=0;
  function attribute(values:Float32Array,bounds?:{min:number[];max:number[]}) {
    const bin=Buffer.from(values.buffer,values.byteOffset,values.byteLength),view=views.length;
    views.push({buffer:0,byteOffset:offset,byteLength:bin.length});chunks.push(bin);offset+=bin.length;
    const result=accessors.length;accessors.push({bufferView:view,componentType:5126,count:values.length/3,type:'VEC3',...bounds});return result;
  }
  for(const mesh of meshes) {
    const source=mesh.geometry.getAttribute('position'),index=mesh.geometry.index,values=new Float32Array((index?.count??source.count)*3);
    for(let i=0;i<values.length/3;i++){const j=index?index.getX(i):i;values.set([source.getX(j),source.getY(j),source.getZ(j)],i*3);}
    const g=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(values,3));
    g.applyMatrix4(mesh.matrixWorld);g.translate(-origin.x,-origin.y,-origin.z);g.scale(scale,scale,scale);g.computeVertexNormals();g.computeBoundingBox();
    const material=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material) as THREE.MeshStandardMaterial;
    const color=material.color?.toArray()??[.6,.65,.7],mi=materials.length;
    materials.push({pbrMetallicRoughness:{baseColorFactor:[...color,material.opacity??1],metallicFactor:.15,roughnessFactor:.65},doubleSided:true,...(material.transparent?{alphaMode:'BLEND'}:{})});
    primitives.push({attributes:{POSITION:attribute(new Float32Array(g.getAttribute('position').array),{min:g.boundingBox!.min.toArray(),max:g.boundingBox!.max.toArray()}),NORMAL:attribute(new Float32Array(g.getAttribute('normal').array))},material:mi});g.dispose();
  }
  return pack({asset:{version:'2.0',generator:'Orbital socket-aligned modular assets'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives}],materials,accessors,bufferViews:views,buffers:[{byteLength:offset}]},Buffer.concat(chunks));
}

/** A code-generated wire preview of actual edges, not an illustrative mockup. */
export function wirePreview(parts:{edges:Float32Array;color:string;position:number[]}[]) {
  const paths:{points:number[];color:string}[]=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const part of parts) {
    const points:number[]=[],step=Math.max(1,Math.ceil(part.edges.length/6/1800));
    for(let i=0;i<part.edges.length;i+=6*step)for(let j=0;j<2;j++){
      const x=part.edges[i+j*3]+part.position[0],y=part.edges[i+j*3+1]+part.position[1],z=part.edges[i+j*3+2]+part.position[2];
      const px=.72*x-.69*z,py=.32*x+.35*z-.88*y;points.push(px,py);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    }
    paths.push({points,color:part.color});
  }
  const scale=Math.min(340/Math.max(.001,maxX-minX),210/Math.max(.001,maxY-minY));
  const dx=200-(minX+maxX)/2*scale,dy=125-(minY+maxY)/2*scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="400" height="250" rx="16" fill="#25212d"/>${paths.map(p=>`<path fill="none" stroke="${p.color}" stroke-width=".7" opacity=".85" d="${Array.from({length:p.points.length/4},(_,i)=>`M${(p.points[i*4]*scale+dx).toFixed(1)} ${(p.points[i*4+1]*scale+dy).toFixed(1)}L${(p.points[i*4+2]*scale+dx).toFixed(1)} ${(p.points[i*4+3]*scale+dy).toFixed(1)}`).join('')}"/>`).join('')}</svg>`;
}
