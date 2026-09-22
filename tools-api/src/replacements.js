import {travel} from './travel.js';
import {normalizeReplacement} from '../../chrome-sidebar/src/replacement-data.js';
// The replacement drawer reuses the generic encrypted record store. Nothing
// here reads, compares or searches it; the device decides what to show.
export const replacements=(request,env,readValue,json)=>travel(request,env,readValue,json,{
  resource:'replacements',table:'replacement_records',normalize:normalizeReplacement,
  metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
});
