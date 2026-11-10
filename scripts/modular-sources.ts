export type V3 = [number,number,number];
export interface OptionSource { id: string; name: string; asset: number | string; node?: string; rest?: boolean; mount?: V3 }
export interface SlotSource { id: string; name: string; socket: V3; normal?: V3; explode: V3; options: OptionSource[]; driver?: string; interface: string }
export interface ModularSource { id: string; name: string; category: string; source: string; pack: string; host: number|string; slots: SlotSource[]; exclude?: string[]; procedural?: boolean }
const option=(asset:number,name:string,mount:V3=[0,0,0]):OptionSource=>({id:String(asset),asset,name,mount});
const native=(host:number,node:string,name:string):OptionSource=>({id:`native-${node}`,asset:host,node,name});
const body=(host:number|string,node?:string):OptionSource=>({id:'body',asset:host,name:'Thân chính',node,rest:!node});

export const MODULAR_SOURCES: ModularSource[] = [
  {id:'city-car',name:'Ô tô City',category:'XE TÙY BIẾN',source:'https://kenney.nl/assets/car-kit',pack:'kenney-car-kit',host:'car-sedan',procedural:true,slots:[
    {id:'body',name:'Thân xe',socket:[0,0,0],explode:[0,1,0],interface:'fixed',options:[body('car-sedan','body')]},
    ...(['front-left','front-right','back-left','back-right'] as const).map((side,i):SlotSource=>({id:`wheel-${side}`,name:['Bánh trước trái','Bánh trước phải','Bánh sau trái','Bánh sau phải'][i],socket:[side.endsWith('left')?.3:-.3,.3,side.startsWith('front')?.66:-.66],explode:[[-1.5,-2.5,4.5],[-5,3,3],[5,-2.5,-3],[2.5,3,-5]][i] as V3,interface:'car-wheel-axle',options:[
      {id:'native',asset:'car-sedan',node:`wheel-${side}`,name:'Bánh nguyên bản'},
      ...(['default','racing'] as const).map((kind,j):OptionSource=>({id:kind,asset:`car-wheel-${kind}`,name:['Bánh tiêu chuẩn','Bánh thể thao'][j],mount:[side.endsWith('left')?-.15:.15,0,0]})),
    ]})),
  ]},
  {id:'line-mech',name:'Mech Line',category:'ROBOT TÙY BIẾN',source:'https://3dassets.dev/packs/mech-hangar-and-battle-frames',pack:'mech-hangar-and-battle-frames',host:26791,slots:[
    {id:'body',name:'Thân Mech',socket:[0,0,0],explode:[0,0,0],interface:'fixed',options:[body(26791)]},
    {id:'legs',name:'Chân / khung gầm',socket:[0,0,0],normal:[0,-1,0],explode:[0,-5,0],interface:'socket-legs:medium',options:[option(26808,'Chân tiêu chuẩn',[0,1.9,0]),option(26807,'Chân đế rộng',[0,1.9,0]),option(26829,'Khung bánh xích',[0,.9,0])]},
    ...([-1,1] as const).map((sign,i):SlotSource=>({id:i?'right-arm':'left-arm',name:i?'Tay phải':'Tay trái',socket:[sign*1.2,1.2,0],normal:[0,-1,0],explode:[sign*5,1,0],interface:'socket-arm:medium',options:[option(26833,'Tay thao tác',[0,1.7,0]),option(26851,'Tay pháo',[0,1.6,0]),option(26855,'Tay kiếm',[0,1.6,0]),option(26862,'Tay khiên',[0,1.6,0])]})),
    {id:'head',name:'Đầu cảm biến',socket:[0,1.6,0],normal:[0,1,0],explode:[0,5,1],interface:'socket-head:medium',options:[option(26876,'Đầu một mắt'),option(26877,'Đầu hai mắt'),option(26888,'Đầu kính tiềm vọng')]},
    {id:'back',name:'Module lưng',socket:[0,.9,-.55],normal:[0,0,-1],explode:[0,1,-5],interface:'socket-back:medium',options:[option(26889,'Động cơ đẩy',[0,.6,.23]),option(26891,'Động cơ nhảy',[0,.6,.23]),option(26898,'Cột radar',[0,.35,.2]),option(26901,'Bộ làm mát',[0,.5,.17])]},
  ]},
  {id:'carbine',name:'Carbine',category:'VŨ KHÍ TÙY BIẾN',source:'https://3dassets.dev/packs/mega-weapon-pack',pack:'mega-weapon-pack',host:33316,exclude:['stock','magazine','charge'],slots:[
    {id:'body',name:'Thân súng',socket:[0,0,0],explode:[0,0,0],interface:'fixed',options:[body(33316)]},
    {id:'stock',name:'Báng súng',socket:[0,.166,-.16],normal:[0,0,-1],explode:[-2,1,-5],driver:'stock',interface:'stock',options:[native(33316,'stock','Báng nguyên bản'),option(33386,'Báng cố định',[0,.0586,.1212]),option(33387,'Báng thu gọn',[0,.052,.111]),option(33388,'Báng gập',[0,.052,.125])]},
    {id:'magazine',name:'Hộp tiếp đạn',socket:[0,.118,-.012],normal:[0,-1,0],explode:[0,-5,-1],driver:'magazine',interface:'magazine:rifle',options:[native(33316,'magazine','Hộp nguyên bản'),option(33391,'Hộp tiêu chuẩn',[0,.162,-.0136]),option(33393,'Hộp dài',[0,.2379,-.024]),option(33392,'Hộp trống',[0,.1537,0])]},
    {id:'charge',name:'Cần kéo',socket:[0,.18,-.138],explode:[-4,3,-2],driver:'charge',interface:'fixed',options:[native(33316,'charge','Cần kéo')]},
    {id:'optic',name:'Ống ngắm',socket:[0,.2019,-.044],normal:[0,1,0],explode:[0,5,-1],interface:'optic-rail',options:[option(33365,'Ngắm Reflex',[0,.007,0]),option(33366,'Ngắm Holo',[0,.007,.01]),option(33368,'Ống ngắm 4x',[-.0057,.0241,0])]},
    {id:'muzzle',name:'Đầu nòng',socket:[0,.1635,.34],normal:[0,0,1],explode:[2,1,5],interface:'muzzle:rifle',options:[option(33375,'Ống giảm thanh',[0,.0234,-.112]),option(33377,'Đầu bù giật',[0,.0163,-.047]),option(33379,'Đầu che chớp',[0,.0153,-.042])]},
    {id:'underbarrel',name:'Ray dưới',socket:[0,.1313,.1545],normal:[0,-1,0],explode:[3,-4,3],interface:'underbarrel',options:[option(33380,'Tay cầm đứng',[0,.124,0]),option(33383,'Tay cầm nghiêng',[0,.09,-.0137]),option(33381,'Đèn chiếu',[0,.072,.0295])]},
    {id:'side',name:'Ray bên',socket:[-.0322,.1635,.164],normal:[-1,0,0],explode:[-4,1,3],interface:'side-rail',options:[option(33384,'Module laser',[0,.0599,-.0047])]},
  ]},
  {id:'service-pistol',name:'Pistol',category:'VŨ KHÍ TÙY BIẾN',source:'https://3dassets.dev/packs/mega-weapon-pack',pack:'mega-weapon-pack',host:33296,exclude:['slide','hammer','magazine'],slots:[
    {id:'body',name:'Thân súng',socket:[0,0,0],explode:[0,0,0],interface:'fixed',options:[body(33296)]},
    {id:'slide',name:'Nắp trượt',socket:[0,.1197,0],explode:[0,4,0],driver:'slide',interface:'fixed',options:[native(33296,'slide','Nắp trượt')]},
    {id:'hammer',name:'Búa cò',socket:[0,.0855,-.072],explode:[-3,2,-4],driver:'hammer',interface:'fixed',options:[native(33296,'hammer','Búa cò')]},
    {id:'magazine',name:'Hộp tiếp đạn',socket:[0,.0865,-.0376],normal:[0,-1,0],explode:[0,-5,-1],driver:'magazine',interface:'magazine:pistol',options:[native(33296,'magazine','Hộp nguyên bản'),option(33390,'Hộp tiêu chuẩn',[0,.1035,.0004]),option(33389,'Hộp dài',[0,.1555,.0004])]},
    {id:'optic',name:'Ống ngắm',socket:[0,.1453,-.068],normal:[0,1,0],explode:[0,7,-2],driver:'slide',interface:'optic-rail',options:[option(33365,'Ngắm Reflex',[0,.007,0]),option(33366,'Ngắm Holo',[0,.007,.01])]},
    {id:'muzzle',name:'Đầu nòng',socket:[0,.1209,.098],normal:[0,0,1],explode:[2,2,5],interface:'muzzle:pistol',options:[option(33373,'Ống giảm thanh',[0,.0194,-.077]),option(33377,'Đầu bù giật',[0,.0163,-.047])]},
    {id:'underbarrel',name:'Ray dưới',socket:[0,.0878,.059],normal:[0,-1,0],explode:[3,-3,4],interface:'underbarrel',options:[option(33381,'Đèn chiếu',[0,.072,.0295]),option(33385,'Đèn và laser',[.0003,.065,-.0015])]},
  ]},
];
