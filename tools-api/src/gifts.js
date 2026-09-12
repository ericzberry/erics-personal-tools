import {travel} from './travel.js';
import {normalizeGift} from '../../chrome-sidebar/src/gift-data.js';
// Gift ideas reuse the generic encrypted record store. Nothing here ranks,
// totals or reads them; the device decides what to show whom.
export const gifts=(request,env,readValue,json)=>travel(request,env,readValue,json,{
  resource:'gifts',table:'gift_records',normalize:normalizeGift,
  metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
});
