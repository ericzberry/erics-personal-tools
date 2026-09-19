import {travel} from './travel.js';
import {normalizeSize} from '../../chrome-sidebar/src/size-data.js';
// Clothing sizes reuse the generic encrypted record store. Nothing here reads,
// compares or converts them; the device decides what to show.
export const sizes=(request,env,readValue,json)=>travel(request,env,readValue,json,{
  resource:'sizes',table:'size_records',normalize:normalizeSize,
  metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
});
