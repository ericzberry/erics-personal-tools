import {encryptSettings,decryptSettings} from './ai-settings.js';
import {validateReward} from '../../chrome-sidebar/src/rewards-data.js';
const ID='owner-rewards';
const conflict=()=>{throw {status:409,message:'Rewards changed in another browser. This wallet reloaded; review and save your changes again.'};};
export async function rewardsSettings(request,env,readValue,json){
  if(!['GET','PUT'].includes(request.method))return json({error:'Method not allowed.'},405);
  const previous=await env.DB.prepare('SELECT value, revision, updated_at FROM rewards_wallet WHERE id = ?').bind(ID).first();
  if(request.method==='GET')return json(previous?{entries:await decryptSettings(previous.value,ID,env),revision:previous.revision,updatedAt:previous.updated_at}:{entries:[],revision:null});
  const input=JSON.parse(await readValue(request));
  if((input.revision??null)!==(previous?.revision??null))conflict();
  if(!Array.isArray(input.entries)||input.entries.length>500)throw {status:400,message:'Save at most 500 rewards entries.'};
  const seen=new Set();
  const entries=input.entries.map(entry=>{
    if(!entry||typeof entry!=='object'||! /^[a-f0-9-]{36}$/.test(entry.id||'')||seen.has(entry.id))throw {status:400,message:'Rewards need unique valid IDs.'};
    seen.add(entry.id);
    for(const key of ['name','source','value','notes','url'])if(typeof entry[key]!=='string'||entry[key].length>(key==='notes'?4000:2048))throw {status:400,message:`Check reward ${key}.`};
    if(!Number.isFinite(Date.parse(entry.updatedAt)))throw {status:400,message:'A valid balance update date is required.'};
    try{return validateReward(entry,entry.updatedAt);}catch(error){throw {status:400,message:error.message};}
  });
  const revision=crypto.randomUUID(),updatedAt=new Date().toISOString(),value=await encryptSettings(entries,ID,env);
  const result=previous
    ?await env.DB.prepare('UPDATE rewards_wallet SET value = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(value,revision,updatedAt,ID,previous.revision).run()
    :await env.DB.prepare('INSERT INTO rewards_wallet (id, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(ID,value,revision,updatedAt).run();
  if(!result.meta.changes)conflict();
  return json({entries,revision,updatedAt});
}
