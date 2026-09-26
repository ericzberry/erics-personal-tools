#!/usr/bin/env node
// Agent-operated research intake. Browser observations enter the same record
// shape and revision boundary the apps use; credentials never enter a trip.
import {readFile} from 'node:fs/promises';
import {token} from '../../finance-intake/api.mjs';
import {CLOUD_URL} from '../../chrome-sidebar/src/cloud-storage.js';
import {normalizeTrip,tripKey} from '../../chrome-sidebar/src/trip-data.js';
const [command,arg,...flags]=process.argv.slice(2);
async function call(path,method='GET',value){
  const response=await fetch(`${CLOUD_URL}/v1/trips${path}`,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});
  if(!response.ok)throw Error(`Travel research request failed (${response.status}). ${await response.text()}`);
  return response.json();
}
try{
  if(command==='list'){
    const {records}=await call('');console.log(JSON.stringify(records.map(({id,title,revision})=>({id,title,revision})),null,2));
  }else if(command==='show'&&/^[a-f0-9-]{36}$/.test(arg||''))console.log(JSON.stringify(await call(`/${arg}`),null,2));
  else if(command==='save'&&arg){
    if(flags.some(x=>x!=='--confirm'))throw Error('Unknown option.');
    const raw=await readFile(arg,'utf8');if(Buffer.byteLength(raw)>64000)throw Error('Trip file exceeds 64 KB.');
    const input=JSON.parse(raw),id=input.id||crypto.randomUUID();
    if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Trip id must be a UUID.');
    // An operator must supply the revision from show for an update. A missing
    // revision creates only; it can never overwrite an existing trip.
    const value=normalizeTrip(input);
    if(value.researchKey&&value.researchKey!==tripKey(value))console.error('Saved research is for an earlier request; the apps will label it accordingly.');
    console.log(JSON.stringify({id,title:value.title,candidates:value.candidates.length,channels:value.channels.map(c=>({channel:c.label,status:c.status})),writing:flags.includes('--confirm')},null,2));
    if(flags.includes('--confirm')){
      const {record}=await call(`/${id}`,'PUT',{...value,revision:input.revision??null,operation:crypto.randomUUID()});
      console.log(JSON.stringify({saved:record.id,revision:record.revision}));
    }
  }else throw Error('Usage: node tools-api/scripts/trips.mjs list | show UUID | save FILE [--confirm]');
}catch(error){console.error(error.message||'Could not update travel research.');process.exitCode=1;}
