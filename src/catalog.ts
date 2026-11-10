export type Family = 'engine' | 'weapon' | 'sensor' | 'cargo';
export type PartKey = Family | 'hull' | `assembly:${string}`;
export const PART_COLORS: Record<Family | 'hull', string> = { hull: '#ffbb32', engine: '#26caff', weapon: '#ff527e', sensor: '#a577ff', cargo: '#37e8a1' };
export interface Part {
  id: string;
  name: string;
  english: string;
  family: Family;
  description: string;
  dimensions: [number, number, number];
  tag: string;
}

export const PARTS: Part[] = [
  { id: 'engine-small', name: 'Động cơ gọn', english: 'Compact drive', family: 'engine', tag: 'COMPACT', dimensions: [.9, .9, 1.55], description: 'Động cơ gọn, lắp ở đuôi tàu.' },
  { id: 'engine-medium', name: 'Động cơ tiêu chuẩn', english: 'Standard drive', family: 'engine', tag: 'STANDARD', dimensions: [1.4, 1.4, 2.15], description: 'Động cơ tiêu chuẩn cho khớp đuôi tàu.' },
  { id: 'engine-large', name: 'Động cơ hạng nặng', english: 'Heavy ion drive', family: 'engine', tag: 'HEAVY', dimensions: [2, 2, 2.95], description: 'Động cơ ion lớn ở đuôi tàu.' },
  { id: 'turret-single', name: 'Tháp pháo đơn', english: 'Single turret', family: 'weapon', tag: 'SINGLE', dimensions: [1.24, .865, 2.33], description: 'Pháo một nòng, lắp trên boong.' },
  { id: 'turret-twin', name: 'Tháp pháo đôi', english: 'Twin turret', family: 'weapon', tag: 'TWIN', dimensions: [1.24, .865, 2.33], description: 'Pháo hai nòng, lắp trên boong.' },
  { id: 'turret-spinal', name: 'Pháo nòng dài', english: 'Spinal turret', family: 'weapon', tag: 'SPINAL', dimensions: [1.24, .865, 4.15], description: 'Pháo nòng dài cho bệ vũ khí.' },
  { id: 'missile-pod', name: 'Giàn tên lửa', english: 'Missile pod', family: 'weapon', tag: 'POD', dimensions: [1.4, .865, 1.24], description: 'Giàn tên lửa thay cho tháp pháo.' },
  { id: 'radar', name: 'Chảo radar', english: 'Radar dish', family: 'sensor', tag: 'RADAR', dimensions: [1.5, 1.75, 1.45], description: 'Chảo radar trên đỉnh thân tàu.' },
  { id: 'sensor', name: 'Cột cảm biến', english: 'Sensor mast', family: 'sensor', tag: 'SENSOR', dimensions: [.7, 1.78, .6], description: 'Cột cảm biến thay cho radar.' },
  { id: 'communications', name: 'Anten liên lạc', english: 'Communications array', family: 'sensor', tag: 'COMMS', dimensions: [1.2, 1.7, .6], description: 'Anten lắp tại khớp cảm biến.' },
  { id: 'cargo', name: 'Khoang hàng', english: 'Cargo pod', family: 'cargo', tag: 'CARGO', dimensions: [1.5, 1.315, 2.4], description: 'Khoang hàng gắn bên mạn phải.' },
  { id: 'fuel', name: 'Bình nhiên liệu', english: 'Fuel tank', family: 'cargo', tag: 'FUEL', dimensions: [1.34, 1.34, 2.5], description: 'Bình nhiên liệu thay cho khoang hàng.' },
  { id: 'drone-rack', name: 'Giá drone', english: 'Drone rack', family: 'cargo', tag: 'DRONE', dimensions: [2.3, .52, 1], description: 'Giá mang drone bên mạn phải.' },
];

export const FAMILIES: Family[] = ['engine', 'weapon', 'sensor', 'cargo'];
export const SLOTS: Record<Family, { name: string; short: string; index: string; position: [number, number, number]; explode: [number, number, number] }> = {
  engine: { name: 'Cụm động cơ', short: 'Động cơ', index: '02', position: [-.14218, .5, -11.99571], explode: [-1, 1.6, -5] },
  weapon: { name: 'Bệ vũ khí', short: 'Vũ khí', index: '03', position: [-.14218, 2.58, 6.19429], explode: [0, 5.6, 1] },
  sensor: { name: 'Khớp cảm biến', short: 'Cảm biến', index: '04', position: [-.14218, 3.46, -2.89571], explode: [0, 5.8, -1.5] },
  cargo: { name: 'Khoang phụ', short: 'Khoang phụ', index: '05', position: [3.69282, .9, -.02071], explode: [5, 1, .8] },
};

export type Configuration = Record<Family, string | null>;
export const DEFAULT_CONFIG: Configuration = { engine: 'engine-large', weapon: 'turret-twin', sensor: 'radar', cargo: 'cargo' };
export const STORAGE_KEY = 'orbital-workshop:configuration:v1';
export const getPart = (id: string | null | undefined) => PARTS.find(part => part.id === id);
export const compatibleParts = (slot: Family) => PARTS.filter(part => part.family === slot);

export function setPart(config: Configuration, slot: Family, id: string | null): Configuration {
  if (id !== null && getPart(id)?.family !== slot) throw new Error('Linh kiện không tương thích với vị trí lắp.');
  return { ...config, [slot]: id };
}

export function parseConfiguration(input: unknown): Configuration {
  if (!input || typeof input !== 'object') throw new Error('File cấu hình không hợp lệ.');
  const data = input as Record<string, unknown>;
  if (data.version !== 1 || data.model !== 'cruiser-01') throw new Error('Cấu hình phải thuộc tàu Cruiser 01, phiên bản 1.');
  if (!data.parts || typeof data.parts !== 'object') throw new Error('Thiếu danh sách linh kiện.');
  const parts = data.parts as Record<string, unknown>;
  let config = { ...DEFAULT_CONFIG };
  for (const slot of FAMILIES) {
    const id = parts[slot];
    if (id !== null && typeof id !== 'string') throw new Error(`Thiếu hoặc sai vị trí ${SLOTS[slot].short}.`);
    config = setPart(config, slot, id);
  }
  return config;
}

export function serializeConfiguration(config: Configuration) {
  return { version: 1, model: 'cruiser-01', parts: config };
}

export function loadConfiguration(): Configuration {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? parseConfiguration(JSON.parse(raw)) : { ...DEFAULT_CONFIG }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

// Anchor correction preserves the physical contact point for differently sized parts.
export function attachmentPosition(slot: Family, id: string): [number, number, number] {
  const p = [...SLOTS[slot].position] as [number, number, number];
  const part = getPart(id)!;
  if (slot === 'engine') {
    p[1] += (2 - part.dimensions[1]) / 2;
    p[2] += (2.95 - part.dimensions[2]) / 2;
  }
  if (slot === 'cargo') p[0] += (part.dimensions[0] - 1.5) / 2;
  return p;
}
