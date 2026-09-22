import {travel} from './travel.js';
import {validateWalletRecord,WALLET_SCHEMA,WALLET_RECORD_KINDS} from '../../chrome-sidebar/src/wallet-data.js';
// `/v1/wallet`: the wallet's own small records — bindings, resolutions,
// valuations, goals — through the generic encrypted record store, one row
// each in `wallet_records`. Every field is in the clear inside the envelope
// and nothing outside it but the id, the revision and the time.
export const wallet=(request,env,readValue,json)=>{
  const path=new URL(request.url).pathname;
  // What this Worker speaks, for a client deciding what it may send. No
  // secrets, nothing about the owner.
  if(path==='/v1/wallet/capabilities'){
    if(request.method!=='GET')return json({error:'Method not allowed.'},405);
    return json({schemaVersion:WALLET_SCHEMA,kinds:WALLET_RECORD_KINDS,intake:['page','upload','manual','research']});
  }
  return travel(request,env,readValue,json,{resource:'wallet',table:'wallet_records',normalize:validateWalletRecord,
    metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})});
};
