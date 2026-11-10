import modular from './modular.generated.json';
import { attachmentPosition, FAMILIES, getPart, PART_COLORS, SLOTS, type Configuration, type PartKey } from './catalog';

export type Vec3=[number,number,number];
export type ModuleConfig=Record<string,string|null>;
export type ModuleConfigs=Record<string,ModuleConfig>;
export interface PartOption { id:string; assetId:string; name:string; english:string; description:string; tag:string; dimensions:Vec3; thumbnail:string; bounds:{min:Vec3;max:Vec3} }
export interface ModelPart {
  key:PartKey; assetId:string|null; name:string; english:string; description:string; color:string; index:string; position:Vec3; explode:Vec3; dimensions:Vec3;
  replaceable?:boolean; normal?:Vec3; bounds?:{min:Vec3;max:Vec3}; allBounds?:{min:Vec3;max:Vec3}; options?:PartOption[];
}
export interface WorkshopModel { id:string; name:string; category:string; source:string; thumbnail:string; note:string; dimensions:Vec3; parts:ModelPart[]; animations:{name:string;label:string;duration:number;loop:string;movingKeys:string[];origin?:string}[] }
export const SHIP_ID='cruiser-01';
// JSON tuple shapes and source interfaces are validated by tests/modular.test.ts.
export const MODELS:WorkshopModel[]=[{id:SHIP_ID,name:'Cruiser 01',category:'TÀU KHÔNG GIAN',source:'https://3dassets.dev/packs/interstellar-fleet-modular-starships',thumbnail:'/models/cruiser.webp',note:'Thân chính và bốn vị trí thay linh kiện.',dimensions:[5.99,3.52,21.24],parts:[],animations:[]},...modular as unknown as WorkshopModel[]];
export const getModel=(id:string)=>MODELS.find(m=>m.id===id)??MODELS[0];
export function defaultModuleConfig(id:string):ModuleConfig {return Object.fromEntries(getModel(id).parts.map(p=>[p.key,p.assetId]));}
export function setModulePart(id:string,config:ModuleConfig,key:PartKey,option:string|null):ModuleConfig {
  const slot=getModel(id).parts.find(p=>p.key===key);
  if(!slot?.replaceable)throw new Error('Vị trí này không thay linh kiện.');
  if(option!==null&&!slot.options?.some(p=>p.id===option))throw new Error('Linh kiện không tương thích với vị trí lắp.');
  return {...config,[key]:option};
}
export function parseModuleConfig(input:unknown):{model:string;parts:ModuleConfig}{
  if(!input||typeof input!=='object')throw new Error('File cấu hình không hợp lệ.');
  const value=input as {version?:number;model?:string;parts?:Record<string,unknown>};
  const model=MODELS.find(m=>m.id===value.model&&m.id!==SHIP_ID);
  if(value.version!==1||!model||!value.parts||typeof value.parts!=='object')throw new Error('Mô hình hoặc cấu hình không hợp lệ.');
  const config=defaultModuleConfig(model.id);
  if(Object.keys(value.parts).some(key=>!model.parts.some(p=>p.key===key)))throw new Error('Cấu hình có vị trí không thuộc mô hình.');
  for(const slot of model.parts){const id=value.parts[slot.key];
    if(!slot.replaceable){if(id!==slot.assetId)throw new Error('Không được thay cụm cố định.');continue;}
    if(id!==null&&typeof id!=='string')throw new Error('Thiếu vị trí lắp trong cấu hình.');
    Object.assign(config,setModulePart(model.id,config,slot.key,id));
  }
  return {model:model.id,parts:config};
}
export const MODULE_STORAGE_KEY='orbital-workshop:modular-configurations:v1';
export function loadModuleConfigs():ModuleConfigs{
  try{const data=JSON.parse(localStorage.getItem(MODULE_STORAGE_KEY)??'{}'),valid:ModuleConfigs={};
    for(const model of MODELS.filter(m=>m.id!==SHIP_ID))if(data[model.id]){try{valid[model.id]=parseModuleConfig({version:1,model:model.id,parts:data[model.id]}).parts;}catch{/* Restore only the invalid model. */}}
    return valid;
  }catch{return {};}
}
export function modelParts(modelId:string,config:Configuration,moduleConfig?:ModuleConfig):ModelPart[]{
  if(modelId!==SHIP_ID)return getModel(modelId).parts.map(slot=>{
    const id=moduleConfig&&Object.hasOwn(moduleConfig,slot.key)?moduleConfig[slot.key]:slot.assetId;
    const option=slot.options?.find(p=>p.id===id);
    return {...slot,assetId:option?.id??null,english:option?.english??'Vị trí trống',description:option?.description??'Chọn part để lắp.',dimensions:option?.dimensions??slot.dimensions,bounds:option?.bounds??slot.bounds};
  });
  return [{key:'hull',assetId:'cruiser',name:'Thân tàu',english:'Cruiser hull core',description:'Thân chính với 4 vị trí lắp.',color:PART_COLORS.hull,index:'01',position:[0,0,0],explode:[0,0,0],dimensions:[5.99,3.52,21.24]},...FAMILIES.map(key=>{
    const part=getPart(config[key]);return {key,assetId:config[key],name:SLOTS[key].short,english:part?.english??'Vị trí trống',description:part?.description??'Chọn linh kiện để lắp.',color:PART_COLORS[key],index:SLOTS[key].index,position:part?attachmentPosition(key,part.id):SLOTS[key].position,explode:SLOTS[key].explode,dimensions:part?.dimensions??[0,0,0],replaceable:true} as ModelPart;
  })];
}
