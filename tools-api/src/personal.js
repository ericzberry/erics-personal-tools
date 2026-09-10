import {travel} from './travel.js';
import {normalizePersonal} from '../../chrome-sidebar/src/personal-data.js';
// Personal records reuse the generic encrypted record store, but every value
// arrives already sealed by the device vault. The shared validator refuses an
// unsealed value, so this route cannot be talked into storing readable text —
// the Worker holds an envelope it has no key for.
export const personal=(request,env,readValue,json)=>travel(request,env,readValue,json,{
  resource:'personal',table:'personal_records',normalize:normalizePersonal,
  metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
});
