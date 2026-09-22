import {travel} from './travel.js';
import {normalizeHealth} from '../../chrome-sidebar/src/health-data.js';
// Health objects reuse the generic encrypted record store. Every one arrives
// already sealed by the device vault — the note, its type, which relative it
// concerns, its history — and the shared validator refuses anything else, so
// this route holds envelopes it cannot open and cannot tell a relative from a
// medication from a prior revision. It validates the shape of a write, the
// id, the size and the revision; it cannot validate what it cannot read.
export const health=(request,env,readValue,json)=>travel(request,env,readValue,json,{
  resource:'health',table:'health_records',normalize:normalizeHealth,
  metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
});
