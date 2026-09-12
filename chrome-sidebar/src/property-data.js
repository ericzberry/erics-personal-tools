// Properties being considered: where it is, what it costs, what it is, and
// where the search stands with it.
//
// The facts that decide a search — price, size, what it costs to hold — are
// read off the listing, so having them costs the owner nothing. What only the
// owner knows goes in notes, in their own words. There is deliberately no
// score, no mortgage and no estimate here: a number this app made up would sit
// beside numbers the listing states and look exactly as authoritative.
//
// Validation is shared with the Worker, so every rule here applies to a record
// however it arrives.
import {safePublicURL} from './public-url.js';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
// Looking until it has been seen; Passed keeps its own quiet view, like a gift
// already bought, so the list is only ever what is still in play.
export const PROPERTY_STATUSES=['Looking','Seen','Offer','Passed'];
export const PROPERTY_NOTES_MAX=2000;
export const MAX_PRICE=1e10;
export const MAX_PRICE_HISTORY=60;
export const isDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
// A figure the listing does not state is null, never zero: a house with no HOA
// and a house whose HOA nobody has read yet are not the same house.
const figure=(value,{label,max,step=1})=>{
  if(value===null||value===undefined||value==='')return null;
  const number=typeof value==='string'?Number(value.replace(/[$,\s]/g,'')):value;
  if(typeof number!=='number'||!Number.isFinite(number)||number<0||number>max)fail(`Enter ${label} as a number, or leave it empty.`);
  return Math.round(number/step)*step;
};
function history(value){
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value))fail('The price history has to be a list.');
  return value.map(entry=>{
    if(!isDay(entry?.on))fail('Every price in the history needs the day it was asked.');
    const price=figure(entry.price,{label:'a price',max:MAX_PRICE});
    if(price===null)fail('Every price in the history needs an amount.');
    return {price,on:entry.on};
  }).sort((a,b)=>a.on.localeCompare(b.on)).slice(-MAX_PRICE_HISTORY);
}
export function normalizeProperty(input,previous={}){
  const get=key=>input[key]??previous[key];
  const status=text(get('status')??PROPERTY_STATUSES[0],20,'a status',true);
  if(!PROPERTY_STATUSES.includes(status))fail('Choose where the search stands with this property.');
  // A link is kept only when it is one this app would be willing to open.
  const link=text(get('link')??'',1000,'a link');
  const url=link?safePublicURL(link):'';
  if(link&&!url)fail('Enter a link as a public https:// address, or leave it empty.');
  const since=text(get('since')??'',10,'the day it was saved');
  if(since&&!isDay(since))fail('The day a property was saved has to be a date.');
  const price=figure(get('price'),{label:'the price',max:MAX_PRICE});
  let prices=history(get('prices'));
  // The first price is the one the history starts from, however the record
  // arrived — typed, read off a page, or captured from a line — so a later cut
  // always has something to be measured against.
  if(!prices.length&&price!==null&&since)prices=[{price,on:since}];
  return {
    address:text(get('address'),200,'the address',true),
    link:url,status,price,
    beds:figure(get('beds'),{label:'the bedrooms',max:100}),
    baths:figure(get('baths'),{label:'the bathrooms',max:100,step:0.5}),
    sqft:figure(get('sqft'),{label:'the size',max:1e7}),
    taxes:figure(get('taxes'),{label:'the annual taxes',max:MAX_PRICE}),
    hoa:figure(get('hoa'),{label:'the monthly HOA',max:1e7}),
    notes:text(get('notes')??'',PROPERTY_NOTES_MAX,'notes'),
    since,prices
  };
}
// A new asking price joins the history only when it differs from the last one
// recorded, so reading the same listing every day adds nothing.
export function withPrice(record,price,on){
  if(price===null||price===undefined)return record;
  const prices=[...(record.prices||[])];
  if(!prices.length&&record.price!==null&&record.price!==undefined&&record.price!==price)prices.push({price:record.price,on:record.since||on});
  if(prices.at(-1)?.price!==price)prices.push({price,on});
  return {...record,price,prices:prices.slice(-MAX_PRICE_HISTORY)};
}
// How far the asking price has moved since the first one recorded: negative is
// a cut. Nothing moved when there is only one price to compare.
export function priceChange(record){
  const first=record.prices?.[0]?.price;
  return first===undefined||record.price===null||record.price===undefined?0:record.price-first;
}
const whole=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
export const money=value=>value===null||value===undefined?'':`$${whole.format(value)}`;
// The line that describes a property wherever one appears: price first, since
// it is what a search sorts by, then what it is, then what it costs to hold.
export function describeProperty(record){
  const change=priceChange(record);
  const price=record.price===null?'':[money(record.price),change?`${change<0?'↓':'↑'} ${money(Math.abs(change))}`:''].filter(Boolean).join(' ');
  const size=[record.beds!==null?`${record.beds} bd`:'',record.baths!==null?`${record.baths} ba`:'',record.sqft!==null?`${whole.format(record.sqft)} sq ft`:''].filter(Boolean).join(' · ');
  const carry=[record.taxes!==null?`${money(record.taxes)}/yr tax`:'',record.hoa!==null?`${money(record.hoa)}/mo HOA`:''].filter(Boolean).join(' · ');
  return [price,size,carry].filter(Boolean).join(' · ');
}
const byPrice=(a,b)=>(a.price??Infinity)-(b.price??Infinity)||a.address.localeCompare(b.address,undefined,{sensitivity:'base',numeric:true});
// Grouped by where the search stands, in the order a search moves, cheapest
// first inside each: the list reads as a comparison without being a table.
export function groupProperties(records){
  return PROPERTY_STATUSES.map(status=>({status,records:records.filter(record=>record.status===status).sort(byPrice)})).filter(group=>group.records.length);
}
export const isPassed=record=>record.status==='Passed';
// The next step in a search, which is the one action a row offers besides
// passing on it. An offer has no next step here; what follows it is paperwork.
export const nextStatus=status=>({Looking:'Seen',Seen:'Offer'})[status]||null;
