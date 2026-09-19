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
// Brands are grouped by which brand they are, not by how the name was typed: a
// note captured as "lululemon" belongs with Lululemon rather than starting a
// second list beside it. The first spelling seen is the one shown.
const brandKey=record=>(record.brand||'').trim().toLowerCase();
export function groupSizes(records){
  const seen=new Map();
  for(const record of records)if(!seen.has(brandKey(record)))seen.set(brandKey(record),record.brand.trim()||GENERAL_BRAND);
  // General first — it is the answer that holds wherever the owner is standing —
  // then the brands in alphabetical order.
  const order=[...seen].sort((a,b)=>a[0]?b[0]?a[1].localeCompare(b[1],undefined,{sensitivity:'base'}):1:-1);
  return order.map(([key,brand])=>({
    brand,
    records:records.filter(record=>brandKey(record)===key)
      .sort((a,b)=>a.item.localeCompare(b.item,undefined,{sensitivity:'base',numeric:true}))
  })).filter(group=>group.records.length);
}
export const sizeBrands=records=>groupSizes(records.filter(record=>record.brand.trim())).map(group=>group.brand);
// One line for one size, used wherever a record has to read as a sentence: the
// row's own title, and the line quick add reads back after saving.
export const describeSize=record=>[`${record.item} · ${record.size}`,record.brand.trim()].filter(Boolean).join(' · ');
