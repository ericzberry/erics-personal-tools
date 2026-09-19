// Clothing sizes: what the label says, brand by brand, and the measurements
// that answer the question when no label is to hand.
//
// One record shape covers both, because they are the same fact at different
// removes: "Lululemon · Joggers · M" and "Waist · 33 in" differ only in whether
// a brand decided the number. Splitting them would mean two lists to search and
// two forms to remember, when what the owner wants is one answer to "what size
// am I here".
//
// Validation is shared with the Worker, so every rule here applies to a record
// however it arrives.
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const SIZE_ITEM_MAX=80;
export const SIZE_VALUE_MAX=60;
export const SIZE_FIT_MAX=200;
// What a record with no brand is filed under. A measurement belongs to the
// owner rather than to a label, and so does a size that every brand agrees on.
export const GENERAL_BRAND='General';
const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
export function normalizeSize(input,previous={}){
  const get=key=>input[key]??previous[key];
  return {
    // Empty is meaningful: it is the general size or the body measurement.
    brand:text(get('brand')??'',80,'a brand'),
    item:text(get('item'),SIZE_ITEM_MAX,'what the size is for',true),
    size:text(get('size'),SIZE_VALUE_MAX,'the size',true),
    // How it runs, or when it was measured — the thing that makes a bare number
    // usable a year later.
    fit:text(get('fit')??'',SIZE_FIT_MAX,'a note about the fit')
  };
}
// A size is asked garment first. Standing in a shop the question is "what am I
// in a shirt here", and the answer runs from the general to the particular: the
// size that holds anywhere, the measurements that describe it, then what each
// brand calls the same body. So the garment heads the run and the brand is a
// line inside it, rather than each brand keeping a list of its own.
//
// The garment is read off what the record is for rather than stored beside it:
// a measurement names the thing it measures — a neck is a shirt, an inseam is a
// pair of trousers — and every record already saved says as much without being
// edited. A part is looked for inside the garment it belongs to, so "pants
// length" is an inseam while a sleeve stays with shirts.
const GARMENTS=[
  {label:'Shirts',words:['shirt','shirts','tee','tees','polo','polos','blouse','top','tops','sweater','sweaters','jumper','hoodie','sweatshirt','knit','fleece','pullover','cardigan','flannel','henley'],
    parts:[{name:'Neck',words:['neck','collar']},{name:'Sleeve',words:['sleeve','sleeves','arm','arms']},{name:'Chest',words:['chest','bust']},{name:'Shoulder',words:['shoulder','shoulders']}]},
  {label:'Pants',words:['pant','pants','trouser','trousers','jean','jeans','chino','chinos','jogger','joggers','short','shorts','legging','leggings','slacks','trunk','trunks','swimsuit','boardshorts'],
    parts:[{name:'Waist',words:['waist']},{name:'Inseam',words:['inseam','inleg','leg','length']},{name:'Hip',words:['hip','hips','seat']},{name:'Thigh',words:['thigh','thighs']}]},
  {label:'Shoes',words:['shoe','shoes','sneaker','sneakers','trainer','trainers','boot','boots','runner','runners','loafer','loafers','sandal','sandals','cleat','cleats','foot','feet'],
    parts:[{name:'Length',words:['length']},{name:'Width',words:['width']}]},
  {label:'Outerwear',words:['jacket','jackets','coat','coats','blazer','blazers','parka','vest','overcoat','shell','anorak'],
    parts:[{name:'Chest',words:['chest']},{name:'Sleeve',words:['sleeve','sleeves','arm']}]},
  {label:'Suits',words:['suit','suits','tuxedo','tux'],
    parts:[{name:'Chest',words:['chest']},{name:'Sleeve',words:['sleeve','arm']},{name:'Waist',words:['waist']},{name:'Inseam',words:['inseam','leg']}]},
  {label:'Hats',words:['hat','hats','cap','caps','beanie','helmet'],parts:[{name:'Head',words:['head','circumference']}]},
  {label:'Gloves',words:['glove','gloves','mitten','mittens'],parts:[]},
  {label:'Belts',words:['belt','belts'],parts:[]},
  {label:'Socks',words:['sock','socks','hosiery'],parts:[]},
  {label:'Rings',words:['ring','rings','finger'],parts:[]}
];
// Anything the registry does not recognise keeps its own name and waits at the
// end, so a size is never lost to a word this list has not learned yet.
export const OTHER_GARMENT='Other';
export const sizeGarments=()=>GARMENTS.map(garment=>garment.label);
// Brands are matched by which brand they are, not by how the name was typed: a
// note captured as "lululemon" is the same shop as Lululemon, and the spelling
// first seen is the one every row of that brand reads with.
const brandKey=record=>(record.brand||'').trim().toLowerCase();
export const brandNames=records=>{
  const seen=new Map();
  for(const record of records)if(!seen.has(brandKey(record)))seen.set(brandKey(record),record.brand.trim());
  return seen;
};
const wordsIn=text=>new Set(String(text||'').toLowerCase().match(/[a-z]+/g)||[]);
const hit=(list,tokens)=>list.some(word=>tokens.has(word));
export function classifySize(record){
  const tokens=wordsIn(record.item);
  const garment=GARMENTS.find(entry=>hit(entry.words,tokens))
    ||GARMENTS.find(entry=>entry.parts.some(part=>hit(part.words,tokens)));
  if(!garment)return {garment:OTHER_GARMENT,part:'',order:GARMENTS.length,partOrder:0};
  const part=garment.parts.find(entry=>hit(entry.words,tokens));
  return {garment:garment.label,part:part?part.name:'',
    order:GARMENTS.indexOf(garment),partOrder:part?garment.parts.indexOf(part)+1:0};
}
// The garment and its parts are already said by the heading and by the row's
// own name, so what is left of the item is whatever distinguishes this record
// from the others under the same heading: "Dress shirt" keeps Dress, plain
// "Shirt" keeps nothing and reads as the general size.
const distinguishing=(record,found)=>{
  const garment=GARMENTS.find(entry=>entry.label===found.garment);
  if(!garment)return record.item.trim();
  const known=new Set([...garment.words,...garment.parts.flatMap(part=>part.words)]);
  return [...wordsIn(record.item)].every(word=>known.has(word))?'':record.item.trim();
};
// One row inside a garment: who says so — a brand, or the measurement's own
// name, or the general size the brands are read against — and then the size.
export function sizeLine(record,names){
  const found=classifySize(record);
  const brand=names?.get(brandKey(record))||record.brand.trim();
  const detail=distinguishing(record,found)||found.part;
  return [...(brand?[brand,detail]:[detail||GENERAL_BRAND]),record.size].filter(Boolean).join(' · ');
}
// Inside a garment the general size leads, then the measurements in the order
// the body is usually taken, then the brands alphabetically: the answer that
// holds anywhere before the answer that holds in one shop.
const withinGarment=(names)=>(a,b)=>{
  const [first,second]=[classifySize(a),classifySize(b)];
  const [brandA,brandB]=[brandKey(a),brandKey(b)];
  if(!brandA!==!brandB)return brandA?1:-1;
  if(brandA!==brandB)return names.get(brandA).localeCompare(names.get(brandB),undefined,{sensitivity:'base'});
  if(first.partOrder!==second.partOrder)return first.partOrder-second.partOrder;
  return a.item.localeCompare(b.item,undefined,{sensitivity:'base',numeric:true});
};
export function groupSizes(records){
  const names=brandNames(records);
  const found=new Map();
  for(const record of records){
    const {garment,order}=classifySize(record);
    if(!found.has(garment))found.set(garment,{garment,order,records:[]});
    found.get(garment).records.push(record);
  }
  return [...found.values()].sort((a,b)=>a.order-b.order)
    .map(group=>({garment:group.garment,records:[...group.records].sort(withinGarment(names))}));
}
export const sizeBrands=records=>[...brandNames(records.filter(record=>record.brand.trim())).values()]
  .sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
export const describeSize=record=>[`${record.item} · ${record.size}`,record.brand.trim()].filter(Boolean).join(' · ');
