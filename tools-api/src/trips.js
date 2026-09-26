import {travel} from './travel.js';
import {normalizeTrip,TRIP_RETENTION_MS} from '../../chrome-sidebar/src/trip-data.js';
// Search workspaces expire after 90 days without a write; reads never renew them.
export async function sweepTrips(env,now=Date.now()){
  return env.DB.prepare('DELETE FROM trip_records WHERE updated_at <= ?').bind(new Date(now-TRIP_RETENTION_MS).toISOString()).run();
}
export async function trips(request,env,readValue,json){
  await sweepTrips(env);
  return travel(request,env,readValue,json,{
    resource:'trips',table:'trip_records',normalize:normalizeTrip,
    metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
  });
}
