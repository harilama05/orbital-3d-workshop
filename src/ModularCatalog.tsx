import { ArrowLeft,ArrowRight,ArrowUpRight,Check,Eye,Hand,Plus,X } from 'lucide-react';
import type { ModelPart } from './models';
import type { RefObject } from 'react';

export function ModularCatalog({slot,installed,preview,ready,scrollRef,onPreview,onApply,onCancel,onClose}:{slot:ModelPart;installed:string|null;preview:string|null;ready:boolean;scrollRef:RefObject<HTMLDivElement|null>;onPreview:(id:string)=>void;onApply:()=>void;onCancel:()=>void;onClose:()=>void}){
  const chosen=slot.options?.find(p=>p.id===preview);
  return <section className="catalog-panel glass" aria-label="Linh kiện thay thế"><div className="catalog-heading"><div><span className="eyebrow">VỊ TRÍ LẮP / {slot.index}</span><h2>{slot.name}<span className="count-chip">{slot.options?.length} tương thích</span></h2></div><div className="catalog-navigation"><span><Hand size={13}/>Chụm kéo để lướt</span><button className="icon-button" aria-label="Lướt linh kiện trước" onClick={()=>scrollRef.current?.scrollBy({left:-240,behavior:'smooth'})}><ArrowLeft size={15}/></button><button className="icon-button" aria-label="Lướt linh kiện tiếp" onClick={()=>scrollRef.current?.scrollBy({left:240,behavior:'smooth'})}><ArrowRight size={15}/></button><button className="icon-button" aria-label="Đóng danh sách linh kiện" onClick={onClose}><X size={17}/></button></div></div>
    <div className="catalog-scroll" ref={scrollRef} data-catalog="true">{slot.options?.map(part=>{
      const isInstalled=installed===part.id,isChosen=preview===part.id||(!preview&&isInstalled);
      return <button key={part.id} className={`part-card ${isChosen?'chosen':''}`} disabled={!ready} aria-pressed={isChosen} aria-label={`Xem thử ${part.name.toLowerCase()}`} onClick={()=>onPreview(part.id)}><div className="part-card-image"><img src={part.thumbnail} alt="" draggable={false}/><span>{part.tag}</span>{isInstalled&&<i><Check size={10}/>ĐÃ LẮP</i>}{preview===part.id&&<i className="preview-text"><Eye size={10}/>XEM THỬ</i>}</div><div className="part-card-caption"><span>{part.name}</span><ArrowUpRight size={13}/></div></button>;
    })}</div>
    <div className="catalog-footer"><span>{chosen?<>Đang xem thử <strong>{chosen.name}</strong></>:<><span className="status-dot"/>Trỏ giữ để xem thử</>}</span><div>{chosen?<><button className="text-button" aria-label="Hủy xem thử" onClick={onCancel}>Hủy</button><button className="primary-button compact" aria-label="Lắp linh kiện" onClick={onApply}><Plus size={14}/>Lắp</button></>:<span className="catalog-footnote">Cấu hình tự lưu trên máy</span>}</div></div>
  </section>;
}
