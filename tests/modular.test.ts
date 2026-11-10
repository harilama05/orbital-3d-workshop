import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import generated from '../src/modular.generated.json';
import { MODELS,defaultModuleConfig,setModulePart,parseModuleConfig,modelParts } from '../src/models.ts';
import { DEFAULT_CONFIG } from '../src/catalog.ts';
import { MODULAR_SOURCES } from '../scripts/modular-sources.ts';
import evidence from '../scripts/modular-evidence.json';

test('library has exactly five configurable models and no obsolete exploratory models',async()=>{
  assert.deepEqual(MODELS.map(m=>m.id),['cruiser-01','city-car','line-mech','carbine','service-pistol']);
  for(const model of generated){assert.ok(model.parts.filter(p=>p.replaceable&&p.options.length>1).length>=3);assert.equal(model.license,'CC0-1.0');}
  for(const name of ['superbike','quadcopter','excavator','gear-train'])await assert.rejects(fs.access(`public/models/${name}.webp`));
});
test('compatible parts are scoped by model and slot; removal survives export/import',()=>{
  for(const model of MODELS.slice(1)){
    let config=defaultModuleConfig(model.id);
    for(const slot of model.parts.filter(p=>p.replaceable)){
      const variant=slot.options!.at(-1)!;config=setModulePart(model.id,config,slot.key,variant.id);
      assert.equal(modelParts(model.id,DEFAULT_CONFIG,config).find(p=>p.key===slot.key)!.assetId,variant.id);
      assert.throws(()=>setModulePart(model.id,config,slot.key,'engine-large'));
      const foreign=model.parts.find(p=>p.key!==slot.key)!.options![0].id;
      assert.throws(()=>setModulePart(model.id,config,slot.key,foreign));
      config=setModulePart(model.id,config,slot.key,null);
    }
    const restored=parseModuleConfig(JSON.parse(JSON.stringify({version:1,model:model.id,parts:config})));
    assert.deepEqual(restored.parts,config);
    assert.ok(modelParts(model.id,DEFAULT_CONFIG,restored.parts).filter(p=>p.replaceable).every(p=>p.assetId===null));
    assert.throws(()=>setModulePart(model.id,config,model.parts[0].key,null));
  }
});
test('every variant has valid geometry and prepared sparse particles/edges',async()=>{
  for(const model of generated){let activePoints=0;
    for(const slot of model.parts){
      const socket=slot.socket.map((v,i)=>v*model.scale); // World origin is shared by every alternative.
      const translation=slot.position.map((v,i)=>v-socket[i]);
      assert.ok(translation.every(Number.isFinite));
      for(const option of slot.options){
        const data=await fs.readFile(`public/models/${option.id}.glb`);
        const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer,'');
        const bounds=new THREE.Box3().setFromObject(gltf.scene);let triangles=0;
        gltf.scene.traverse(n=>{if(n instanceof THREE.Mesh)triangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;});
        assert.equal(triangles,option.triangles);
        bounds.min.toArray().forEach((v,i)=>assert.ok(Math.abs(v-option.bounds.min[i])<.0001));
        bounds.max.toArray().forEach((v,i)=>assert.ok(Math.abs(v-option.bounds.max[i])<.0001));
        const cloud=await fs.readFile(`public/particles/${option.id}.bin`),edges=await fs.readFile(`public/particles/${option.id}.edges.bin`);
        assert.equal(cloud.length%12,0);assert.equal(edges.length%24,0);assert.ok(cloud.length>0&&edges.length>0);
        if(option.id===slot.assetId)activePoints+=cloud.length/12;
      }
    }
    assert.ok(activePoints<=100000);
  }
});
test('declared mounts match independently recorded author ports and mechanical weight classes',()=>{
  const records=evidence as Record<string,any>;
  const hostNames:Record<string,string>={'left-arm':'shoulder-left','right-arm':'shoulder-right',legs:'hip',head:'head',back:'back',side:'side-rail'};
  for(const source of MODULAR_SOURCES){
    const host=records[String(source.host)];assert.ok(host);
    for(const slot of source.slots){
      if(slot.interface==='fixed')continue;
      if(source.id==='city-car'){
        const point=host.nodes[slot.id];point.forEach((v:number,i:number)=>assert.ok(Math.abs(v-slot.socket[i])<1e-6));continue;
      }
      const port=host.ports[hostNames[slot.id]??slot.id];assert.ok(port,`${source.id}/${slot.id}: source socket exists`);
      port.point.forEach((v:number,i:number)=>assert.ok(Math.abs(v-slot.socket[i])<.0001));
      for(const option of slot.options){
        if(option.node||option.rest)continue;
        const record=records[String(option.asset)],mount=record.ports[slot.id==='legs'?'hip':slot.id==='head'?'neck':'mount'];
        assert.ok(mount,`${option.asset}: source mount exists`);assert.equal(mount.type,port.type);
        mount.point.forEach((v:number,i:number)=>assert.ok(Math.abs(v-option.mount![i])<.0001,`${option.asset}: matching source mating face`));
        if(host.weightClass&&record.weightClass){assert.equal(record.weightClass,host.weightClass);assert.equal(record.pad,host.pad);}
      }
    }
  }
});
test('all eleven source clips remain and pistol optics inherit the slide motion',async()=>{
  const expected:Record<string,string[]>={'city-car':['wheel-roll'],'line-mech':[],carbine:['stock-open','stock-close','magazine-open','magazine-close','charge-open','charge-close'],'service-pistol':['slide-open','slide-close','magazine-open','magazine-close','cock']};
  for(const model of generated){const entries=JSON.parse(await fs.readFile(`public/animations/${model.id}.json`,'utf8'));
    assert.deepEqual(entries.map((e:any)=>e.name),expected[model.id]);
    for(const raw of entries){const clip=THREE.AnimationClip.parse(raw);assert.ok(clip.duration>0);
      for(const track of clip.tracks){assert.ok(track.validate());assert.ok(track.values.every(Number.isFinite));}
      if(model.id==='service-pistol'&&raw.name.startsWith('slide-'))assert.ok(model.animations.find(a=>a.name===raw.name)!.movingKeys.includes('assembly:optic'));
    }
  }
});
