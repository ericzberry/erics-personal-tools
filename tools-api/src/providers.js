import {chooseTaskModel,taskPolicy} from './model-policy.js';
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
// An image part carries the picture inline as a data URL. Only still raster
// formats every supported provider accepts are allowed through, and the
// encoded size is capped here so one oversized frame cannot be forwarded to a
// provider on the strength of having passed the request body limit.
export const IMAGE_MEDIA=['image/jpeg','image/png','image/webp','image/gif'];
export const MAX_IMAGE_CHARS=900000;
export const MAX_IMAGES=4;
export function imagePart(value){
  if(typeof value!=='string')fail(400,'An image must be a data URL.');
  const match=/^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(value.trim());
  if(!match)fail(400,'An image must be a base64 data URL.');
  const [,media,data]=match;
  if(!IMAGE_MEDIA.includes(media))fail(400,`Use ${IMAGE_MEDIA.map(type=>type.replace('image/','')).join(', ')} images.`);
  if(data.length>MAX_IMAGE_CHARS)fail(400,'That image is too large once encoded. Downscale it before sending.');
  return {type:'image',media,data};
}
// Content is either a plain string or an ordered list of text and image parts.
// Both shapes normalize to the same internal form so every downstream branch —
// validation, cost, and each provider's request body — sees one thing.
function contentParts(content){
  if(typeof content==='string')return content.trim()?[{type:'text',text:content}]:fail(400,'Messages must contain a supported role and nonempty text.');
  if(!Array.isArray(content)||!content.length||content.length>MAX_IMAGES+2)fail(400,'Message content must be text or a short list of text and image parts.');
  const parts=content.map(part=>{
    if(!part||typeof part!=='object')fail(400,'Each content part needs a type.');
    if(part.type==='text'){
      if(typeof part.text!=='string'||!part.text.trim())fail(400,'A text part cannot be empty.');
      return {type:'text',text:part.text};
    }
    if(part.type==='image')return imagePart(part.dataUrl??part.url);
    return fail(400,'Content parts must be text or image.');
  });
  if(parts.filter(part=>part.type==='image').length>MAX_IMAGES)fail(400,`Send at most ${MAX_IMAGES} images.`);
  return parts;
}
export const partsLength=parts=>parts.reduce((total,part)=>total+(part.type==='text'?part.text.length:0),0);
export const partsImages=parts=>parts.filter(part=>part.type==='image').length;
export const messageImages=messages=>messages.reduce((total,message)=>total+partsImages(contentParts(message.content)),0);

export function generationInput(input,connection) {
  const model=input.model;
  if (typeof model!=='string' || !model.trim() || model.length>240) fail(400,'Choose a model or enter its model ID.');
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length>40) fail(400,'Provide between 1 and 40 text messages.');
  let length=0;
  const messages=input.messages.map(message=>{
    if (!message || !['system','user','assistant'].includes(message.role)) fail(400,'Messages must contain a supported role and nonempty text.');
    const parts=contentParts(message.content);
    if (message.role!=='user' && partsImages(parts)) fail(400,'Only a user message may carry an image.');
    length+=partsLength(parts);
    return {role:message.role,content:parts};
  });
  if (length>32000) fail(400,'The prompt is too long (32,000 characters maximum).');
  if (!messages.some(message=>message.role==='user')) fail(400,'A user message is required.');
  const maxTokens=input.maxTokens??2048;
  if (!Number.isInteger(maxTokens)||maxTokens<128||maxTokens>8192) fail(400,'Output limit must be between 128 and 8,192 tokens.');
  return {model:model.trim(),messages,maxTokens};
}
const joinText=parts=>parts.filter(part=>part.type==='text').map(part=>part.text).join('\n');
// A message with no image renders exactly as it always did — a plain string —
// so adding image support changes nothing about the requests every existing
// task sends. The structured form appears only when a picture is present.
function renderContent(format,parts){
  if(!partsImages(parts))return joinText(parts);
  if(format==='anthropic')return parts.map(part=>part.type==='text'
    ?{type:'text',text:part.text}
    :{type:'image',source:{type:'base64',media_type:part.media,data:part.data}});
  if(format==='responses')return parts.map(part=>part.type==='text'
    ?{type:'input_text',text:part.text}
    :{type:'input_image',image_url:`data:${part.media};base64,${part.data}`});
  return parts.map(part=>part.type==='text'
    ?{type:'text',text:part.text}
    :{type:'image_url',image_url:{url:`data:${part.media};base64,${part.data}`}});
}
export function generationRequest(config,input) {
  const {model,messages,maxTokens}=input;
  const render=list=>list.map(message=>({role:message.role,content:renderContent(config.format,message.content)}));
  const system=messages.filter(message=>message.role==='system');
  const rest=render(messages.filter(message=>message.role!=='system'));
  const instructions=system.map(message=>joinText(message.content)).join('\n\n');
  if (config.format==='responses') return {path:'/responses',body:{model,input:rest,
    ...(system.length?{instructions}:{ }),max_output_tokens:maxTokens,store:false}};
  if (config.format==='anthropic') return {path:'/messages',body:{model,messages:rest,max_tokens:maxTokens,
    ...(system.length?{system:instructions}:{ })}};
  return {path:'/chat/completions',body:{model,messages:render(messages),max_tokens:maxTokens,stream:false}};
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
export async function providerJSON(connection,config,path,body,fetcher,timeoutMs=25000) {
  if (!connection.apiKey) fail(400,'Save an API key for this connection first.');
  const headers={'Content-Type':'application/json',...(config.format==='anthropic'?{'x-api-key':connection.apiKey,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${connection.apiKey}`})};
  try {
    const response=await fetcher(config.baseUrl+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,
      redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});
    if(response.status>=300&&response.status<400){await response.body?.cancel();fail(502,'The provider returned a redirect. Check its API URL; credentials were not forwarded.');}
    if(!response.ok){await response.body?.cancel();
      const reason=response.status===401||response.status===403?'rejected the API key or model access':response.status===429?'reported a rate limit or exhausted quota':response.status===402?'requires available credit':response.status===404?'could not find this endpoint or model':response.status>=500?'is temporarily unavailable':'rejected the request; check the model and API URL';
      fail(response.status===429?429:502,`${config.name} ${reason} (HTTP ${response.status}).`);
    }
    return await boundedJSON(response);
  }catch(error){
    if(error.status)throw error;
    fail(error.name==='TimeoutError'||error.name==='AbortError'?504:502,error.name==='TimeoutError'||error.name==='AbortError'?`The provider took longer than ${timeoutMs/1000} seconds. The request was not retried; it may still be billed.`:'Could not reach the provider. Check its API URL. Redirects are not followed.');
  }
}
const upstream=providerJSON;
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
  let routing;
  if(input.task){
    if(input.model)fail(400,'Task requests choose their own model. Remove the model override.');
    if(taskPolicy(input.task,input).web)fail(400,'Use the research endpoint for tasks that require web search.');
    // Validate before contacting the provider.
    generationInput({...input,model:'task-validation'},connection);
    routing=await routeTask(connection,input.task,input,fetcher);
    input={...input,model:routing.model.id,maxTokens:routing.maxTokens,routingReasoning:!!routing.model.reasoning};
  }
  const config=providerConfig(connection),normalized=generationInput(input,connection);
  const {path,body}=generationRequest(config,normalized),started=Date.now();
  if(config.format==='responses'&&routing?.model.reasoningEffort)body.reasoning={effort:routing.model.reasoningEffort};
  else if(input.routingReasoning&&config.format==='responses')body.reasoning={effort:'minimal'};
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
  return {...(routing?{routing:{task:routing.policy.task,level:routing.policy.level,estimatedCost:routing.estimatedCost}}:{}),text:redact(text,connection.apiKey),model:normalized.model,provider:config.id,durationMs:Date.now()-started,
    stopReason:redact(stopReason,connection.apiKey),usage:{inputTokens:numeric(usage.input_tokens??usage.prompt_tokens),outputTokens:numeric(usage.output_tokens??usage.completion_tokens)},
    warning:!text?'The provider returned no text. Try a higher output limit or another text model.':['length','max_tokens','max_output_tokens'].includes(stopReason)?'The output limit was reached; this response may be incomplete.':null};
}

export async function routeTask(connection,task,input,fetcher=fetch) {
  taskPolicy(task,input);
  const availability=await listModels(connection,fetcher);
  return chooseTaskModel({provider:connection.provider,available:availability.models,task,input});
}
