import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MODULAR_SOURCES, type OptionSource } from './modular-sources.ts';
import { parseSource, writePart, wirePreview } from './modular-geometry.ts';
import { extractFeatureEdges, sampleParticleSurface } from './particle-sampling.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=path.join(root,'.tools/modular-audit');
const colors=['#ffbb32','#26caff','#ff527e','#a577ff','#37e8a1','#ff9856','#77aaff','#e9a7ff'];
const labels:Record<string,string>={'stock-open':'Mở báng','stock-close':'Gập báng','magazine-open':'Tháo hộp','magazine-close':'Lắp hộp','charge-open':'Kéo cần','charge-close':'Trả cần','slide-open':'Mở nắp trượt','slide-close':'Đóng nắp trượt',cock:'Chuyển búa'};
for(const folder of ['public/models','public/particles','public/animations'])await fs.mkdir(path.join(root,folder),{recursive:true});
const parsed=new Map<string,Awaited<ReturnType<typeof parseSource>>>();
async function asset(id:number|string){const key=String(id);if(!parsed.has(key)){const gltf=await parseSource(await fs.readFile(path.join(cache,`${id}.glb`)));gltf.scene.updateMatrixWorld(true);parsed.set(key,gltf);}return parsed.get(key)!;}
function meshes(scene:THREE.Object3D,option:OptionSource,exclude:string[]=[]){
  const result:THREE.Mesh[]=[];
  scene.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const names:string[]=[];let ancestor:THREE.Object3D|null=node;while(ancestor){names.push(ancestor.name);ancestor=ancestor.parent;}
    if(option.node?!names.includes(option.node):option.rest&&names.some(n=>exclude.includes(n)))return;
    result.push(node);
  });if(!result.length)throw new Error(`Empty source part ${option.id}`);return result;
}
const output=[];
for(const source of MODULAR_SOURCES){
  const host=await asset(source.host),defaultBounds=new THREE.Box3();
  for(const slot of source.slots){const first=slot.options[0],gltf=await asset(first.asset),origin=first.node||first.rest?new THREE.Vector3().fromArray(slot.socket):new THREE.Vector3().fromArray(first.mount??[0,0,0]);
    for(const mesh of meshes(gltf.scene,first,source.exclude))defaultBounds.union(new THREE.Box3().setFromObject(mesh).translate(origin.clone().negate()).translate(new THREE.Vector3().fromArray(slot.socket)));
  }
  const dimensions=defaultBounds.getSize(new THREE.Vector3()),scale=18/Math.max(dimensions.x,dimensions.y,dimensions.z),center=defaultBounds.getCenter(new THREE.Vector3()).multiplyScalar(scale);
  const parts=[],allDefaultEdges=[];
  for(const [index,slot]of source.slots.entries()){
    const options=[],optionBounds=new THREE.Box3();
    for(const original of slot.options){
      const gltf=await asset(original.asset),list=meshes(gltf.scene,original,source.exclude),origin=new THREE.Vector3().fromArray(original.node||original.rest?slot.socket:original.mount??[0,0,0]);
      const assetId=`mod-${source.id}-${slot.id}-${original.id}`,binary=writePart(list,origin,scale);
      const ready=await parseSource(binary),bounds=new THREE.Box3().setFromObject(ready.scene),physical=bounds.getSize(new THREE.Vector3()).divideScalar(scale);
      const cloud=sampleParticleSurface(ready.scene,Math.floor(100000/source.slots.length),index*177+Number(original.asset||1)||19),edges=extractFeatureEdges(ready.scene);
      await fs.writeFile(path.join(root,`public/models/${assetId}.glb`),binary);
      await fs.writeFile(path.join(root,`public/particles/${assetId}.bin`),new Uint8Array(cloud.buffer));
      await fs.writeFile(path.join(root,`public/particles/${assetId}.edges.bin`),new Uint8Array(edges.buffer));
      const preview=wirePreview([{edges,color:colors[index],position:[0,0,0]}]);await fs.writeFile(path.join(root,`public/models/${assetId}.svg`),preview);
      let triangles=0;ready.scene.traverse(n=>{if(n instanceof THREE.Mesh)triangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;});
      optionBounds.union(bounds);
      options.push({id:assetId,assetId,name:original.name,english:original.name,description:`${slot.name}: ${original.name.toLowerCase()}.`,tag:original.id.startsWith('native')?'ORIGINAL':'MODULAR',dimensions:physical.toArray(),thumbnail:`/models/${assetId}.svg`,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},sourceAsset:original.asset,sourceNode:original.node??null,mount:origin.toArray(),triangles});
      if(original===slot.options[0])allDefaultEdges.push({edges,color:colors[index],position:new THREE.Vector3().fromArray(slot.socket).multiplyScalar(scale).sub(center).toArray()});
    }
    parts.push({key:`assembly:${slot.id}`,assetId:options[0].id,name:slot.name,english:slot.name,description:options[0].description,color:colors[index],index:String(index+1).padStart(2,'0'),position:new THREE.Vector3().fromArray(slot.socket).multiplyScalar(scale).sub(center).toArray(),explode:slot.explode,dimensions:options[0].dimensions,bounds:options[0].bounds,options,replaceable:slot.interface!=='fixed',interface:slot.interface,socket:slot.socket,normal:slot.normal??[0,0,1],driver:slot.driver??null,allBounds:{min:optionBounds.min.toArray(),max:optionBounds.max.toArray()}});
    console.log(`${source.id}/${slot.id}: ${options.length} reviewed options`);
  }
  const clips=[],animations=[];
  const originals:{node:THREE.Object3D;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]=[];host.scene.traverse(node=>originals.push({node,p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()}));
  const inverses=new Map<string,THREE.Matrix4>();for(const slot of source.slots)if(slot.driver){const node=host.scene.getObjectByName(slot.driver);if(!node)throw new Error(`Missing driver ${slot.driver}`);inverses.set(slot.id,node.matrixWorld.clone().invert());}
  const sourceClips=source.procedural?[new THREE.AnimationClip('wheel-roll',2,[])]:host.animations;
  for(const original of sourceClips){
    const mixer=new THREE.AnimationMixer(host.scene),action=mixer.clipAction(original);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const tracks:THREE.KeyframeTrack[]=[],bounds:Record<string,{min:number[];max:number[]}>= {},movingKeys:string[]=[];
    const frames=Math.max(2,Math.ceil(original.duration*30)+1),times=Array.from({length:frames},(_,i)=>original.duration*i/(frames-1));
    const values=new Map(source.slots.map(s=>[s.id,{p:[]as number[],q:[]as number[],s:[]as number[],bounds:new THREE.Box3(),moving:false}]));
    for(const time of times){
      mixer.setTime(time);host.scene.updateMatrixWorld(true);
      for(const slot of source.slots){
        if(!slot.driver&&!(source.procedural&&slot.id.startsWith('wheel-')))continue;
        let transform:THREE.Matrix4;
        if(source.procedural)transform=new THREE.Matrix4().makeRotationX(-Math.PI*2*time/original.duration);
        else {const c=new THREE.Vector3().fromArray(slot.socket).multiplyScalar(scale),node=host.scene.getObjectByName(slot.driver!)!;
          transform=new THREE.Matrix4().makeTranslation(-c.x,-c.y,-c.z).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(node.matrixWorld).multiply(inverses.get(slot.id)!).multiply(new THREE.Matrix4().makeScale(1/scale,1/scale,1/scale)).multiply(new THREE.Matrix4().makeTranslation(c.x,c.y,c.z));}
        const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();transform.decompose(p,q,s);const v=values.get(slot.id)!;
        v.p.push(...p.toArray());v.q.push(...q.toArray());v.s.push(...s.toArray());v.moving ||=p.length()>1e-6||Math.abs(q.w)<.999999;
        const part=parts.find(p=>p.key===`assembly:${slot.id}`)!;v.bounds.union(new THREE.Box3(new THREE.Vector3().fromArray(part.allBounds.min),new THREE.Vector3().fromArray(part.allBounds.max)).applyMatrix4(transform));
      }
    }
    for(const slot of source.slots){const v=values.get(slot.id)!;if(!v.moving)continue;const name=`motion-${slot.id}`,key=`assembly:${slot.id}`;
      tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`,times,v.p),new THREE.QuaternionKeyframeTrack(`${name}.quaternion`,times,v.q),new THREE.VectorKeyframeTrack(`${name}.scale`,times,v.s));bounds[key]={min:v.bounds.min.toArray(),max:v.bounds.max.toArray()};movingKeys.push(key);
    }
    clips.push({...THREE.AnimationClip.toJSON(new THREE.AnimationClip(original.name,original.duration,tracks)),bounds});animations.push({name:original.name,label:labels[original.name]??'Lăn bánh',duration:original.duration,loop:source.procedural?'repeat':'pingpong',movingKeys,origin:source.procedural?'procedural':'source'});
    mixer.stopAllAction();mixer.uncacheRoot(host.scene);for(const p of originals){p.node.position.copy(p.p);p.node.quaternion.copy(p.q);p.node.scale.copy(p.s);}host.scene.updateMatrixWorld(true);
  }
  await fs.writeFile(path.join(root,`public/animations/${source.id}.json`),JSON.stringify(clips));
  await fs.writeFile(path.join(root,`public/models/${source.id}.svg`),wirePreview(allDefaultEdges));
  output.push({id:source.id,name:source.name,category:source.category,source:source.source,thumbnail:`/models/${source.id}.svg`,note:'Chọn vị trí lắp để thêm, tháo hoặc thay part.',license:'CC0-1.0',dimensions:dimensions.toArray(),scale,parts,animations});
}
await fs.writeFile(path.join(root,'src/modular.generated.json'),JSON.stringify(output,null,2)+'\n');
