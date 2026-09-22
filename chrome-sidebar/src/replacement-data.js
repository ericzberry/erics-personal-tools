// The replacement drawer: things liked enough to buy again, kept precisely
// enough to buy the same one — the paint colour and its code and finish, the
// pillow's model and fill, the cable's length and wattage, the cartridge's part
// number, the shoe's model, width and colourway — and where it came from.
//
// Four fields. `item` is what the owner would look for ("Bedroom paint"),
// `variant` is the answer: the exact thing, in as many words as it takes, which
// is the whole reason the record exists. `where` is a shop's name or the page
// it was bought from — one field, because an address already names its shop and
// a shop without a page is still an answer. `note` holds what the next purchase
// needs to know ("two gallons does the room").
//
// Validation is shared with the Worker, so every rule here applies to a record
// however it arrives.
import {safePublicURL} from './public-url.js';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const REPLACEMENT_ITEM_MAX=120;
export const REPLACEMENT_VARIANT_MAX=300;
export const REPLACEMENT_WHERE_MAX=500;
export const REPLACEMENT_NOTE_MAX=300;
const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
// Anything that starts like an address is held to the same rule as every other
// saved link, so what is stored is something this app would open.
const looksLikeLink=value=>/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
export function normalizeReplacement(input,previous={}){
  const get=key=>input[key]??previous[key];
  const where=text(get('where')??'',REPLACEMENT_WHERE_MAX,'where it was bought');
  const link=looksLikeLink(where)?safePublicURL(where):null;
  if(looksLikeLink(where)&&!link)fail('Enter where it was bought as a shop’s name or a public https:// address.');
  return {
    item:text(get('item'),REPLACEMENT_ITEM_MAX,'what it is',true),
    variant:text(get('variant'),REPLACEMENT_VARIANT_MAX,'the exact variant',true),
    where:link||where,
    note:text(get('note')??'',REPLACEMENT_NOTE_MAX,'a note')
  };
}
// Where it came from, as a row reads it: a link is named by its shop — the
// hostname without its `www.` — and opened from the row's own glyph.
export function replacementSource(record){
  const where=record.where||'';
  if(!looksLikeLink(where))return {label:where,link:''};
  const link=safePublicURL(where);
  if(!link)return {label:'',link:''};
  return {label:new URL(link).hostname.replace(/^www\./,''),link};
}
// One list, by what the thing is. The drawer is opened to find one thing, so
// it is searched rather than browsed, and the order only has to be predictable.
export const sortReplacements=records=>[...records].sort((a,b)=>
  a.item.localeCompare(b.item,undefined,{sensitivity:'base',numeric:true})
  ||a.variant.localeCompare(b.variant,undefined,{sensitivity:'base',numeric:true}));
export const replacementMatches=(record,query)=>!query
  ||[record.item,record.variant,record.where,replacementSource(record).label,record.note].join(' ').toLowerCase().includes(query.toLowerCase());
export const describeReplacement=record=>[record.item,record.variant,replacementSource(record).label].filter(Boolean).join(' · ');
