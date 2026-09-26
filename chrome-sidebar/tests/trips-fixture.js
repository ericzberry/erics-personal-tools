import {normalizeTrip,tripKey} from '../src/trip-data.js';
const at=new Date().toISOString();
const check={id:'bed',status:'match',detail:'King in each separate bedroom.',source:'https://example.com/rooms',checkedAt:at};
export const fixture=()=>{
  const t=normalizeTrip({title:'Synthetic city stay',kind:'hotel',request:'Two separate king bedrooms in a high-end hotel.',start:'2026-10-16',end:'2026-10-17',party:{adults:4,childrenAges:[],rooms:1},criteria:[{id:'bed',label:'Two separate king bedrooms',required:true}],channels:[{id:'direct',label:'Direct',status:'checked',note:'Exact room checked.',checkedAt:at}],candidates:[{id:'one',name:'Example Grand Hotel',description:'Synthetic room for testing.',url:'https://example.com/rooms',checks:[check],offers:[]}]});
  t.researchKey=tripKey(t);
  t.candidates[0].offers=[{id:'direct-1',channel:'Direct',product:'Two-bedroom suite, king + king',contextKey:tripKey(t),availability:'available',observedAt:at,source:'https://example.com/rate',evidence:'Exact dates, four adults, selected suite and total observed.',total:900,currency:'USD',allIn:true,terms:'Refundable until Oct 14, 6 pm hotel local time. Pay at hotel.',benefits:'Upgrade subject to availability.',checks:[check]}];
  return normalizeTrip(t);
};
