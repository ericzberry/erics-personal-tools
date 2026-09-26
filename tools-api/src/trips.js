import {travel} from './travel.js';
import {normalizeTrip} from '../../chrome-sidebar/src/trip-data.js';
export const trips=(request,env,readValue,json)=>travel(request,env,readValue,json,{
  resource:'trips',table:'trip_records',normalize:normalizeTrip,
  metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
});
