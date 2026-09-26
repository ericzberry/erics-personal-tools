import {travel} from './travel.js';
import {normalizePerson} from '../../chrome-sidebar/src/people-data.js';
export const people=(request,env,readValue,json)=>travel(request,env,readValue,json,{resource:'people',table:'people_records',normalize:normalizePerson,metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})});
