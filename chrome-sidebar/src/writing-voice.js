// The writing-voice panel: study, correct, forget.
//
// The study is a loop rather than one request, because a thousand messages do
// not fit in one of anything. The Worker holds the place it has reached, so
// this controller only has to keep asking for the next page and showing how
// far it has got — and closing the panel mid-study loses nothing but the
// asking.
import {VoiceLines} from './components/views.js';
import {Button,setStatus} from './components/ui.js';
import {VOICE_SAMPLE_TARGET} from './voice-data.js';

const CONSENT_POLL_MS=3000,CONSENT_POLL_LIMIT=40;
const count=value=>Number(value||0).toLocaleString('en-US');
const learned=profile=>{
  const when=new Date(profile.updatedAt);
  const date=Number.isNaN(when.getTime())?'':when.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  return `${count(profile.sampled)} sent messages${date?` · ${date}`:''}`;
};

export function mountWritingVoice({nodes,request,openExternal=()=>false,pollMs=CONSENT_POLL_MS,pollLimit=CONSENT_POLL_LIMIT}={}){
  const {status,actions,list,editor,prompt}=nodes;
  let state={profile:null,scan:null,google:{connected:false,sentMail:false}};
  let busy=false,scanning=false,stopping=false,loaded=false,polling=0,dirty=false,connectionId='';
  // What just happened, which outlives a re-render; where there is nothing to
  // report, the line falls back to what the voice currently is.
  let message='',tone='';

  // A study in flight describes itself, so the fallback line carries the
  // progress tone and its spinner for as long as the reading runs.
  const show=()=>setStatus(status,message||describe(),message?tone:scanning?'progress':'');
  const say=(text,next='')=>{message=text||'';tone=next;show();};
  // The section is where the voice is kept, not the screen's main act: its
  // actions stay quiet so the one dark button on an email screen is the one
  // that writes the reply. Saving an edit is the exception, and forgetting is
  // marked as what it is.
  const action=(label,handler,variant='secondary')=>{
    const button=Button(label,{variant,size:'compact',disabled:busy});
    button.addEventListener('click',handler);
    return button;
  };
  function describe(){
    if(scanning)return `${count(state.scan?.sampled)} of ${count(VOICE_SAMPLE_TARGET)} read…`;
    if(!state.google.connected||!state.google.sentMail)return '';
    if(state.scan)return `Stopped at ${count(state.scan.sampled)}`;
    return state.profile?learned(state.profile):'';
  }
  // Only the actions that apply, and never more than two: connecting Google or
  // letting it read mail, or studying; then saving an edit, or forgetting the
  // voice. A connection that exists but cannot read mail needs the second half
  // of the consent, not a first connection, and says so.
  function render(){
    const rows=[];
    if(!state.google.connected)rows.push(action('Connect Google',connect));
    else if(!state.google.sentMail)rows.push(action('Approve reading mail',connect));
    else if(scanning)rows.push(action('Stop',()=>{stopping=true;say('Stopping…','progress');}));
    else rows.push(action(state.scan?'Resume':state.profile?'Study again':'Study my sent mail',()=>study(!state.scan)));
    if(state.profile&&!scanning)rows.push(dirty?action('Save',save,'primary'):action('Forget',forget,'danger'));
    actions.replaceChildren(...rows);
    list.replaceChildren(...VoiceLines(state.profile?.voices||[]));
    editor.hidden=!state.profile;
    if(state.profile&&!dirty)prompt.value=state.profile.prompt;
    show();
  }
  function adopt(result){
    state={profile:result.profile||null,scan:result.scan||null,google:result.google||state.google};
    dirty=false;
  }
  async function run(operation){
    if(busy)return false;
    busy=true;message='';tone='';render();
    try{return await operation();}
    catch(error){message=error.message;tone='error';return false;}
    finally{busy=false;render();}
  }

  // Read once, when the section is first opened: a panel that is only
  // summarizing an email has no use for the voice. `force` is for a caller
  // that knows it changed — the synthetic harness, switching states.
  async function load({force=false}={}){
    if(loaded&&!force)return;
    loaded=true;
    await run(async()=>{adopt(await request('voice'));});
  }

  async function connect(){
    await run(async()=>{
      const {url}=await request('google-connect');
      const opened=openExternal(url);
      message=opened?'Approve reading your sent mail, then come back.':'Waiting for Google…';tone=opened?'alert':'progress';
      awaitConsent();
    });
  }
  // Consent happens in another tab, so the panel waits rather than asking for a
  // refresh — bounded, so an abandoned consent stops costing requests.
  function awaitConsent(){
    const current=++polling;let tries=0;
    const tick=async()=>{
      if(current!==polling)return;
      if(++tries>pollLimit){say('Google did not answer. Connect again.','error');return;}
      try{
        const result=await request('voice');
        if(current!==polling)return;
        adopt(result);
        if(state.google.sentMail){render();return;}
      }catch{/* A consent still in progress is not an error to report. */}
      setTimeout(tick,pollMs);
    };
    setTimeout(tick,pollMs);
  }

  // The connection the reading runs on is chosen here rather than asked for:
  // the saved OpenAI key, the same one the summary and the reply already use.
  async function readingConnection(){
    if(connectionId)return connectionId;
    const {connections}=await request('list');
    const connection=connections?.find(item=>item.provider==='openai'&&item.hasApiKey);
    if(!connection)throw Error('Save an OpenAI API key in Settings → AI connections first.');
    connectionId=connection.id;
    return connectionId;
  }
  async function study(restart){
    if(scanning)return;
    const id=await run(readingConnection);
    if(!id)return;
    scanning=true;stopping=false;message='';tone='';render();
    let failed='';
    // Chrome retires the message bridge while a page of Gmail is being read, so
    // this keeps the service worker's activity bounded to the pending study.
    const heartbeat=setInterval(()=>{request('status').catch(()=>{});},15000);
    try{
      let first=!!restart;
      while(!stopping){
        const result=await request('voice-scan',{connectionId:id,restart:first});
        first=false;
        adopt(result);
        render();
        if(result.done)break;
      }
    }catch(error){failed=error.message;}
    // Whatever the study said while it ran — how far it had got, that it was
    // stopping — is spent. What is left is the reason it ended, or the voice.
    finally{clearInterval(heartbeat);scanning=false;stopping=false;message=failed;tone=failed?'error':'';render();}
    // A refusal can be the connection losing its permission to read mail, and
    // then resuming is not the thing to offer. Ask what the state is now, so
    // the action in front of the reason is the one that clears it.
    if(failed){try{adopt(await request('voice'));}catch{/* The reason above is the news; a second failure is not. */}render();}
  }

  async function save(){
    await run(async()=>{adopt(await request('voice-save',{prompt:prompt.value}));});
  }
  async function forget(){
    await run(async()=>{adopt(await request('voice-forget'));prompt.value='';});
  }

  prompt.addEventListener('input',()=>{
    const changed=!!state.profile&&prompt.value!==state.profile.prompt;
    if(changed===dirty)return;
    dirty=changed;render();
  });
  render();
  return {load,study};
}
