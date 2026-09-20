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
  'rewards.benefits':{label:'Card benefit research',level:3,outputTokens:6000,web:true,maxCost:0.15},
  // One press reads the page for everything it states about the owner's
  // rewards: the balances, the credit trackers a card prints beside them, what
  // the card earns, and the benefits that carry no figure at all. A premium
  // card carries a couple of dozen credits, a dozen benefits and half a dozen
  // rates, so the budget is all four lists rather than a figure or two — and a
  // reading may not be returned in part, because JSON that stops mid-list is
  // thrown away whole. This is as much room as there is: `providers.js` caps a
  // single request at 8,192 output tokens, and a reasoning model spends 512 of
  // them before it writes anything.
  'rewards.balances':{label:'Card and program page reading',level:2,outputTokens:7600,web:false,maxCost:0.03},
  'subscriptions.intake':{label:'Recurring charge reading',level:2,outputTokens:7000,web:false,maxCost:0.05},
  'subscriptions.research':{label:'Subscription alternatives',level:3,outputTokens:4000,web:true,maxCost:0.10},
  // The budget is the list of accounts, not a figure or two. A wealth manager
  // holding a family's joint account and its trusts prints twenty-eight of them
  // on one page, and each one comes back as a named, classified, dated reading:
  // that page needs some 2,800 output tokens and had 2,500, so the JSON stopped
  // mid-account and the whole reading was thrown away as unreadable. A ledger
  // may not be read in part, so the ceiling is set where a page of that size
  // fits whole.
  //
  // Level 2, and back to a model that does not think first. This was raised to
  // 3 because a level‑2 model read E*TRADE's page by filing every figure under
  // the institution's name and calling a column of gains the holdings. Both of
  // those are what a snapshot looks like when the page reader hands over a run
  // of bare figures with no row around them — and it no longer does. The
  // accounts arrive as table rows naming the account, the column and the
  // figure together, a figure the row already stated is not repeated loose, and
  // a change printed above its own percentage never reaches the model at all.
  // The two mistakes that bought level 3 are the two the snapshot stopped
  // inviting.
  //
  // What level 3 costs is the wait. It selects a reasoning model, which thinks
  // before it writes and then still has twenty-eight accounts to write, and the
  // press sat for the better part of two minutes. Reading figures off a page
  // that has already been narrowed to figures is not work that needs a model to
  // reason its way in. If a reading does come back wrong, Settings pins this
  // one task to whichever model the owner wants, which is the whole point of
  // that screen.
  'finance.intake':{label:'Finance reading',level:2,outputTokens:7000,web:false,maxCost:0.03},
  'capture.note':{label:'Quick note reading',level:1,outputTokens:500,web:false,maxCost:0.01},
  'email.summary':{label:'Email summary',model:'gpt-5.6-terra',level:3,outputTokens:700,web:false,maxCost:0.04},
  // A reply goes out over Eric's name in Eric's voice, so it uses the model he
  // chose for his mail rather than the cheapest one that would answer.
  'email.reply':{label:'Email reply',model:'gpt-5.6-terra',level:3,outputTokens:1500,web:false,maxCost:0.09},
  // Reading one batch of sent mail happens twenty-odd times per study, so it
  // is deliberately mid-tier; the profile that combines those readings happens
  // once and is the thing every reply is then written from.
  'voice.samples':{label:'Sent mail reading',level:2,outputTokens:600,web:false,maxCost:0.03},
  'voice.profile':{label:'Writing voice profile',model:'gpt-5.6-terra',level:3,outputTokens:2500,web:false,maxCost:0.12},
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
// How long the answer itself may take. A task's time budget follows the size of
// the answer it asked for, because producing that answer is what the time is
// spent on: 600 tokens of purchase reading come back in seconds, and the
// twenty-eight accounts a wealth manager prints on one page do not. One flat
// 25 seconds for both meant the reading that needed the room most was the one
// that ran out of it — the page was read, the figures were found, and the
// request was abandoned mid-answer with the provider still billing for it.
//
// The ceiling is the one the research calls already run at, and the floor is
// what every task had before, so no task gets less time than it used to.
export const TIMEOUT_FLOOR=25000, TIMEOUT_CEILING=120000, MS_PER_TOKEN=15;
// Whole seconds, because the refusal says the budget out loud and "longer than
// 112.68 seconds" is a number nobody chose.
export const taskTimeout=maxTokens=>
  Math.min(TIMEOUT_CEILING,Math.max(TIMEOUT_FLOOR,Math.round(maxTokens*MS_PER_TOKEN/1000)*1000));

export function taskPolicy(task,input={}) {
  if(!Object.hasOwn(TASK_POLICIES,task))throw {status:400,message:'Unknown AI task. Register its capability and cost policy first.'};
  const policy={...TASK_POLICIES[task]};
  const {characters,images}=measureInput(input);
  // Email summaries use Eric’s explicitly selected Terra model.
  if(task==='restaurant.research'&&input.search?.mode==='category'&&input.search?.limit>12)policy.level=3;
  return {...policy,task,images,vision:images>0,
    inputTokens:(Math.ceil(characters/3)||(policy.web?6000:1000))+images*IMAGE_TOKENS};
}
// Every action the app can ask a model to do, as the settings screen lists
// them: the action's own name, what it needs from a model, and the models that
// could serve it. Nothing else in the app offers a model choice, so this is the
// whole of what there is to choose between.
export function taskCatalog(chosen={},catalog=MODEL_CATALOG) {
  return Object.entries(TASK_POLICIES).map(([task,policy])=>({
    task,label:policy.label,level:policy.level,web:!!policy.web,
    chosen:chosen[task]||'',automatic:policy.model||'',
    options:catalog.filter(model=>!policy.web||model.web)
      .map(model=>({id:model.id,provider:model.provider,level:model.level,input:model.input,output:model.output}))
  }));
}
// `chosen` is what the owner picked for this action in Settings. It is the
// owner's call, so it overrides the automatic choice's capability floor and its
// cost ceiling — but not what the request physically needs: a model with no web
// search cannot do a task that searches, one with no image input cannot read a
// picture, and neither can hold more than its context. Those refuse, in words,
// rather than quietly routing to something else.
export function chooseTaskModel({provider,available,task,input={},catalog=MODEL_CATALOG,chosen=''}) {
  const policy=taskPolicy(task,input),ids=new Set(available.map(m=>typeof m==='string'?m:m.id));
  // A pinned policy model is the automatic answer, not a lock: the owner's own
  // choice in Settings replaces it, which is what makes that screen the truth.
  const picked=chosen?catalog.find(model=>model.id===chosen&&model.provider===provider):null;
  if(chosen&&!picked)throw {status:400,message:`${chosen} is not a reviewed model for this connection. Choose another model for ${policy.label} in Settings.`};
  if(picked){
    if(!ids.has(picked.id))throw {status:400,message:`This connection cannot reach ${picked.id}. Choose another model for ${policy.label} in Settings.`};
    if(policy.web&&!picked.web)throw {status:400,message:`${picked.id} cannot search the web, which ${policy.label} needs. Choose another model in Settings.`};
    if(policy.vision&&!picked.vision)throw {status:400,message:`${picked.id} cannot read an image, which this ${policy.label} needs. Choose another model in Settings, or paste the figures as text.`};
    const reasoningTokens=picked.reasoning?(policy.web?2048:512):0,maxTokens=policy.outputTokens+reasoningTokens;
    if(policy.inputTokens+maxTokens>picked.context)throw {status:400,message:`${picked.id} cannot hold this much text. Choose another model for ${policy.label} in Settings.`};
    const estimatedCost=((policy.inputTokens+(policy.web?(picked.searchTokens||6000):0))*picked.input+maxTokens*picked.output)/1e6+(policy.web?0.01:0);
    return {model:picked,policy,maxTokens,estimatedCost,timeoutMs:taskTimeout(maxTokens)};
  }
  const candidates=catalog.filter(m=>m.provider===provider&&(!policy.model||m.id===policy.model)&&ids.has(m.id)&&m.level>=policy.level&&(!policy.web||m.web)&&(!policy.vision||m.vision))
    .map(model=>{
      const reasoningTokens=model.reasoning?(policy.web?2048:512):0;
      const maxTokens=policy.outputTokens+reasoningTokens;
      const estimatedCost=((policy.inputTokens+(policy.web?(model.searchTokens||6000):0))*model.input+maxTokens*model.output)/1e6+(policy.web?0.01:0);
      return {model,policy,maxTokens,estimatedCost,timeoutMs:taskTimeout(maxTokens)};
    }).filter(c=>c.policy.inputTokens+c.maxTokens<=c.model.context&&c.estimatedCost<=policy.maxCost)
    .sort((a,b)=>a.estimatedCost-b.estimatedCost||a.model.id.localeCompare(b.model.id));
  if(!candidates.length)throw {status:400,message:policy.vision
    ?`No available model can read an image for ${policy.label} within its cost policy. Give this connection access to a vision-capable model, or paste the figures as text.`
    :`No available, supported model meets the ${policy.label} capability and cost policy. Check model access or update the model catalog.`};
  return candidates[0];
}
