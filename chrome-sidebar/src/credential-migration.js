// Legacy keys are read only by the trusted background worker, never returned to UI.
const key='personalToolCredentials';
const providers={'OpenAI':'openai','Anthropic':'anthropic','Google Gemini':'google'};
export async function migrateCredentials(storage,token,request){
  const records=(await storage.get(key))[key]||[];
  let moved=0;
  for(const record of records){
    const provider=providers[record.name];
    if(!provider || !/^[a-f0-9-]{36}$/.test(record.id))continue;
    // Creation only: never overwrite a connection edited on another computer.
    const result=await request(token,`/v1/ai-connections/${record.id}`,{method:'PUT',value:{name:record.name,provider,apiKey:record.secret,revision:null}});
    if(result.connection?.id!==record.id || !result.connection.hasApiKey)throw Error('Cloud save was not confirmed. Local key retained.');
    const current=(await storage.get(key))[key]||[];
    await storage.set({[key]:current.filter(item=>item.id!==record.id || item.secret!==record.secret)});
    moved++;
  }
  return {moved,remaining:((await storage.get(key))[key]||[]).length};
}
