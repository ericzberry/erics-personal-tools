// Reviewed 2026-09-09. USD per million uncached tokens; see MODEL_ROUTING.md.
// Capability levels are application judgments, not provider guarantees.
// `vision` marks a model this application will send an image to. It is set
// only where image input is known to be supported, never assumed: a model
// left unmarked is simply never chosen for a task that carries a picture,
// which fails as a clear "no model available" rather than a provider error.
export const MODEL_CATALOG = [
  {id:'gpt-5.6-terra',provider:'openai',level:3,input:2,output:12,context:1050000,reasoning:false,reasoningEffort:'none',web:true},
  {id:'gpt-5-nano',provider:'openai',level:1,input:0.05,output:0.4,context:400000,reasoning:true,web:false},
  {id:'gpt-4o-mini',provider:'openai',level:1,input:0.15,output:0.6,context:128000,web:false,vision:true},
  {id:'gpt-4.1-mini',provider:'openai',level:2,input:0.4,output:1.6,context:1047576,web:true,searchTokens:8000,vision:true},
  {id:'gpt-5-mini',provider:'openai',level:3,input:0.25,output:2,context:400000,reasoning:true,web:true,vision:true}
];
// What one downscaled page costs in input tokens. Deliberately generous: an
// underestimate here would let a request past the task's cost ceiling.
export const IMAGE_TOKENS = 1700;
export const TASK_POLICIES = {
  'cards.category':{label:'Purchase reading',level:1,outputTokens:600,web:false,maxCost:0.01},
  'cards.research':{label:'Card issuer research',level:3,outputTokens:4000,web:true,maxCost:0.10},
  'finance.intake':{label:'Finance reading',level:2,outputTokens:2500,web:false,maxCost:0.03},
  'email.summary':{label:'Email summary',model:'gpt-5.6-terra',level:3,outputTokens:700,web:false,maxCost:0.04},
  'restaurant.availability':{label:'Reservation page interpretation',level:2,outputTokens:2000,web:false,maxCost:0.05},
  'restaurant.research':{label:'Restaurant research',level:2,outputTokens:7000,web:true,maxCost:0.15}
};
// Counts the text a request carries, whether a message is a plain string or a
// list of parts, and how many images ride along with it.
const contentOf=message=>Array.isArray(message?.content)?message.content:[{type:'text',text:typeof message?.content==='string'?message.content:''}];
export function measureInput(input={}) {
  const parts=(input.messages||[]).flatMap(contentOf);
  return {
    characters:parts.reduce((total,part)=>total+(part?.type==='text'&&typeof part.text==='string'?part.text.length:0),0),
    images:parts.filter(part=>part?.type==='image').length
  };
}
export function taskPolicy(task,input={}) {
  if(!Object.hasOwn(TASK_POLICIES,task))throw {status:400,message:'Unknown AI task. Register its capability and cost policy first.'};
  const policy={...TASK_POLICIES[task]};
  const {characters,images}=measureInput(input);
  // Email summaries use Eric’s explicitly selected Terra model.
  if(task==='restaurant.research'&&input.search?.mode==='category'&&input.search?.limit>12)policy.level=3;
  return {...policy,task,images,vision:images>0,
    inputTokens:(Math.ceil(characters/3)||(policy.web?6000:1000))+images*IMAGE_TOKENS};
}
export function chooseTaskModel({provider,available,task,input={},catalog=MODEL_CATALOG}) {
  const policy=taskPolicy(task,input),ids=new Set(available.map(m=>typeof m==='string'?m:m.id));
  const candidates=catalog.filter(m=>m.provider===provider&&(!policy.model||m.id===policy.model)&&ids.has(m.id)&&m.level>=policy.level&&(!policy.web||m.web)&&(!policy.vision||m.vision))
    .map(model=>{
      const reasoningTokens=model.reasoning?(policy.web?2048:512):0;
      const maxTokens=policy.outputTokens+reasoningTokens;
      const estimatedCost=((policy.inputTokens+(policy.web?(model.searchTokens||6000):0))*model.input+maxTokens*model.output)/1e6+(policy.web?0.01:0);
      return {model,policy,maxTokens,estimatedCost};
    }).filter(c=>c.policy.inputTokens+c.maxTokens<=c.model.context&&c.estimatedCost<=policy.maxCost)
    .sort((a,b)=>a.estimatedCost-b.estimatedCost||a.model.id.localeCompare(b.model.id));
  if(!candidates.length)throw {status:400,message:policy.vision
    ?`No available model can read an image for ${policy.label} within its cost policy. Give this connection access to a vision-capable model, or paste the figures as text.`
    :`No available, supported model meets the ${policy.label} capability and cost policy. Check model access or update the model catalog.`};
  return candidates[0];
}
