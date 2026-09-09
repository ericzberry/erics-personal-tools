import {providerFor} from '../../chrome-sidebar/src/ai-providers.js';
const fail=(status,message)=>{throw {status,message};};
export function providerConfig(connection) {
  const provider=providerFor(connection.provider);
  if (!provider) fail(400,'Unknown AI provider.');
  let url;
  try {url=new URL(connection.baseUrl||provider.baseUrl);} catch {fail(400,'Enter an API base URL for this connection.');}
  if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash) fail(400,'Use an HTTPS API base URL without credentials or query parameters.');
  const host=url.hostname.toLowerCase();
  if (!host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)) fail(400,'The API must use a public HTTPS domain.');
  if (provider.id!=='custom' && url.origin!==new URL(provider.baseUrl).origin) fail(400,'For a different API host, choose Other compatible API and enter its key.');
  const format=provider.id==='custom'?(connection.apiFormat||'chat'):provider.format;
  if (!['chat','responses','anthropic'].includes(format)) fail(400,'Choose a supported API format.');
  return {...provider,baseUrl:url.href.replace(/\/+$/,''),format};
}
export function generationInput(input,connection) {
  const model=input.model||connection.model;
  if (typeof model!=='string' || !model.trim() || model.length>240) fail(400,'Choose a model or enter its model ID.');
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length>40) fail(400,'Provide between 1 and 40 text messages.');
  let length=0;
  const messages=input.messages.map(message=>{
    if (!message || !['system','user','assistant'].includes(message.role) || typeof message.content!=='string' || !message.content.trim()) fail(400,'Messages must contain a supported role and nonempty text.');
    length+=message.content.length;
    return {role:message.role,content:message.content};
  });
  if (length>32000) fail(400,'The prompt is too long (32,000 characters maximum).');
  if (!messages.some(message=>message.role==='user')) fail(400,'A user message is required.');
  const maxTokens=input.maxTokens??2048;
  if (!Number.isInteger(maxTokens)||maxTokens<128||maxTokens>8192) fail(400,'Output limit must be between 128 and 8,192 tokens.');
  return {model:model.trim(),messages,maxTokens};
}
export function generationRequest(config,input) {
  const {model,messages,maxTokens}=input;
  if (config.format==='responses') return {path:'/responses',body:{model,input:messages.filter(m=>m.role!=='system'),
    ...(messages.some(m=>m.role==='system')?{instructions:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n')}:{ }),max_output_tokens:maxTokens,store:false}};
  if (config.format==='anthropic') return {path:'/messages',body:{model,messages:messages.filter(m=>m.role!=='system'),max_tokens:maxTokens,
    ...(messages.some(m=>m.role==='system')?{system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n')}:{ })}};
  return {path:'/chat/completions',body:{model,messages,max_tokens:maxTokens,stream:false}};
}
async function boundedJSON(response) {
  const reader=response.body?.getReader();if (!reader) fail(502,'The provider returned an empty response.');
  let size=0,text='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>2*1024*1024){await reader.cancel();fail(502,'The provider response exceeded 2 MB.');}
    text+=decoder.decode(value,{stream:true});
  }
  try{return JSON.parse(text+decoder.decode());}catch{fail(502,'The provider returned an unreadable response. Check the API URL.');}
}
async function upstream(connection,config,path,body,fetcher) {
  if (!connection.apiKey) fail(400,'Save an API key for this connection first.');
  const headers={'Content-Type':'application/json',...(config.format==='anthropic'?{'x-api-key':connection.apiKey,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${connection.apiKey}`})};
  try {
    const response=await fetcher(config.baseUrl+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,
      redirect:'error',credentials:'omit',signal:AbortSignal.timeout(25000)});
    if(!response.ok){await response.body?.cancel();
      const reason=response.status===401||response.status===403?'rejected the API key or model access':response.status===429?'reported a rate limit or exhausted quota':response.status===402?'requires available credit':response.status===404?'could not find this endpoint or model':response.status>=500?'is temporarily unavailable':'rejected the request; check the model and API URL';
      fail(response.status===429?429:502,`${config.name} ${reason} (HTTP ${response.status}).`);
    }
    return await boundedJSON(response);
  }catch(error){
    if(error.status)throw error;
    fail(error.name==='TimeoutError'||error.name==='AbortError'?504:502,error.name==='TimeoutError'||error.name==='AbortError'?'The provider took longer than 25 seconds. The request was not retried; it may still be billed.':'Could not reach the provider. Check its API URL. Redirects are not followed.');
  }
}
const redact=(text,key)=>typeof text==='string'?(key?text.split(key).join('[redacted]'):text):'';
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
export async function listModels(connection,fetcher=fetch) {
  const config=providerConfig(connection);
  if(config.manualModels)return {models:[],manual:true,message:'Enter a model ID from your provider account. Use Test connection to verify access.'};
  const data=await upstream(connection,config,'/models',undefined,fetcher);
  const list=Array.isArray(data)?data:data?.data;
  if(!Array.isArray(list))fail(502,'The provider did not return a compatible model list. Enter a model ID manually.');
  const models=list.filter(item=>typeof item.id==='string').slice(0,2000).map(item=>({id:redact(item.id,connection.apiKey).slice(0,240),name:redact(item.display_name||item.name||item.id,connection.apiKey).slice(0,240)})).sort((a,b)=>a.id.localeCompare(b.id));
  return {models,partial:!!data.has_more||list.length>2000,message:'Model availability can depend on your account. Choose a text-generation model.'};
}
export async function generate(connection,input,fetcher=fetch) {
  const config=providerConfig(connection),normalized=generationInput(input,connection);
  const {path,body}=generationRequest(config,normalized),started=Date.now();
  const data=await upstream(connection,config,path,body,fetcher);
  if(!data||typeof data!=='object'||data.error)fail(502,'The provider returned an error or invalid response. Check the selected model and API URL.');
  if(config.format==='responses'&&!Array.isArray(data.output)||config.format==='anthropic'&&!Array.isArray(data.content)||config.format==='chat'&&!data.choices?.[0]?.message)fail(502,'The provider returned an incompatible response. Check the API format and model.');
  let text='',stopReason,usage=data.usage||{};
  if(config.format==='responses'){
    text=(data.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text'||item.type==='refusal').map(item=>item.text||item.refusal||'').join('\n');
    stopReason=data.incomplete_details?.reason||data.status;
  }else if(config.format==='anthropic'){
    text=(data.content||[]).filter(item=>item.type==='text').map(item=>item.text).join('\n');stopReason=data.stop_reason;
  }else{
    const message=data.choices?.[0]?.message;
    text=typeof message?.content==='string'?message.content:Array.isArray(message?.content)?message.content.filter(item=>item.type==='text').map(item=>item.text).join('\n'):message?.refusal||'';
    stopReason=data.choices?.[0]?.finish_reason;
  }
  return {text:redact(text,connection.apiKey),model:normalized.model,provider:config.id,durationMs:Date.now()-started,
    stopReason:redact(stopReason,connection.apiKey),usage:{inputTokens:numeric(usage.input_tokens??usage.prompt_tokens),outputTokens:numeric(usage.output_tokens??usage.completion_tokens)},
    warning:!text?'The provider returned no text. Try a higher output limit or another text model.':['length','max_tokens','max_output_tokens'].includes(stopReason)?'The output limit was reached; this response may be incomplete.':null};
}
