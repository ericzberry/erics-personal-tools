import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {GMAIL_SCOPE} from '../src/drive.js';

const token='synthetic-token-at-least-32-characters';
const CONNECTION='a5bb73f0-738b-4cf6-9862-41c6468cf40a';

function environment(){
  const sql=new DatabaseSync(':memory:');
  for(const schema of ['schema.sql','drive-schema.sql','voice-schema.sql'])sql.exec(readFileSync(new URL(`../${schema}`,import.meta.url),'utf8'));
  return {sql,env:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),
    GOOGLE_CLIENT_ID:'synthetic-client-id',GOOGLE_CLIENT_SECRET:'synthetic-client-secret',
    DB:{prepare(query){
      const statement=sql.prepare(query);let args=[];
      return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
        async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};
    }}}};
}
const call=(env,url,method='GET',value)=>worker.fetch(new Request(`https://example.com${url}`,{
  method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:value===undefined?undefined:JSON.stringify(value)}),env);

const encode=text=>Buffer.from(text,'utf8').toString('base64url');
// A sent message as Gmail returns it: what Eric typed, then the thread he was
// answering, which is the part that must never reach the reading.
const message=(index)=>({
  id:`m${index}`,internalDate:String(Date.UTC(2026,3,2)),
  payload:{mimeType:'multipart/alternative',
    headers:[{name:'To',value:`person${index}@example.test`},{name:'Subject',value:`Thread ${index}`}],
    parts:[{mimeType:'text/plain',body:{data:encode(
      `Hey — yes, happy to do that, and I will send the numbers on Friday. Message ${index}.\n`+
      // Long enough that a page of them fills a reading batch, which is the
      // path a real mailbox takes and a short synthetic one never would.
      `Here is the detail you asked for, laid out the way I usually lay it out. `.repeat(12)+
      `\nEric\n\nOn Thu, Sep 11, 2025 at 9:02 AM Someone <them@example.test> wrote:\n\n> SECRET QUOTED THREAD ${index}`)}}]}
});

// Google and OpenAI, both answering only what these routes actually ask for,
// and both recording what they were asked.
function fakeCloud({total=60,scopes=[GMAIL_SCOPE,'https://www.googleapis.com/auth/drive'],profile}={}){
  const calls=[],prompts=[];
  const idToken=`x.${Buffer.from(JSON.stringify({email:'owner@example.com'})).toString('base64url')}.y`;
  const fetcher=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    calls.push(`${init.method||'GET'} ${url.origin}${url.pathname}`);
    if(url.origin==='https://oauth2.googleapis.com')
      return Response.json({access_token:'synthetic-access',expires_in:3600,refresh_token:'synthetic-refresh-token',id_token:idToken,scope:scopes.join(' ')});
    if(url.origin==='https://gmail.googleapis.com'){
      if(init.headers?.Authorization!=='Bearer synthetic-access')return Response.json({error:{message:'bad token'}},{status:401});
      if(url.pathname.endsWith('/messages')){
        const from=Number(url.searchParams.get('pageToken')||'0');
        const size=Number(url.searchParams.get('maxResults'));
        const ids=Array.from({length:Math.max(0,Math.min(size,total-from))},(_,index)=>({id:`m${from+index}`}));
        const next=from+ids.length;
        return Response.json({messages:ids,...(next<total?{nextPageToken:String(next)}:{})});
      }
      return Response.json(message(Number(url.pathname.split('/').pop().slice(1))));
    }
    if(url.pathname.endsWith('/models'))return Response.json({data:[{id:'gpt-5.6-terra'},{id:'gpt-4.1-mini'},{id:'gpt-5-mini'}]});
    const body=JSON.parse(String(init.body));
    prompts.push(body);
    const text=body.instructions.includes('Return ONLY JSON')
      ?JSON.stringify(profile??{voices:[{name:'Warm professional',audience:'investors',markers:['opens with "Hey"']}],prompt:'Open with "Hey". Keep it under three sentences.'})
      :'He opens with "Hey" and signs off "Eric". Short sentences, no exclamation marks.';
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]});
  };
  return {fetcher,calls,prompts};
}
async function withCloud(fake,run){
  const real=globalThis.fetch;globalThis.fetch=fake.fetcher;
  try{return await run();}finally{globalThis.fetch=real;}
}
// Connects the Google account the way the app does, through consent.
async function connect(env){
  const started=await (await call(env,'/v1/drive/connect','POST',{})).json();
  const state=new URL(started.url).searchParams.get('state');
  await worker.fetch(new Request(`https://example.com/v1/drive/callback?code=synthetic-code&state=${state}`),env);
  return started;
}
async function saveConnection(env){
  await call(env,`/v1/ai-connections/${CONNECTION}`,'PUT',{name:'OpenAI',provider:'openai',apiKey:'synthetic-key'});
}
// The study as the panel runs it: keep asking for the next page until done.
async function study(env,{limit=40,restart=true}={}){
  const results=[];
  for(let turn=0;turn<limit;turn++){
    const response=await call(env,'/v1/voice/scan','POST',{connectionId:CONNECTION,restart:restart&&turn===0});
    const result=await response.json();
    results.push({status:response.status,...result});
    if(response.status!==200||result.done)break;
  }
  return results;
}

test('the voice routes need the access token and report an unconnected Google',async()=>{
  const {env}=environment();
  assert.equal((await worker.fetch(new Request('https://example.com/v1/voice'),env)).status,401);
  const state=await (await call(env,'/v1/voice')).json();
  assert.deepEqual([state.profile,state.scan,state.google.connected,state.google.sentMail],[null,null,false,false]);
});

test('consent asks for read-only Gmail as well as Drive, and studying without it is refused',async()=>{
  const {env}=environment();
  const fake=fakeCloud({scopes:['https://www.googleapis.com/auth/drive']});
  await withCloud(fake,async()=>{
    const started=await connect(env);
    const scope=new URL(started.url).searchParams.get('scope');
    assert.match(scope,/auth\/gmail\.readonly/);
    assert.match(scope,/auth\/drive/);
    await saveConnection(env);
    // Google granted Drive only, so the study says what is missing instead of
    // failing somewhere inside Gmail.
    const refused=await call(env,'/v1/voice/scan','POST',{connectionId:CONNECTION});
    assert.equal(refused.status,409);
    assert.match((await refused.json()).error,/approve reading mail/i);
    assert.equal((await (await call(env,'/v1/voice')).json()).google.sentMail,false);
    assert.equal(fake.calls.some(entry=>entry.includes('gmail.googleapis.com')),false);
  });
});

test('a study reads sent mail page by page and ends with a profile built from every batch',async()=>{
  const {sql,env}=environment();
  const fake=fakeCloud({total:60});
  await withCloud(fake,async()=>{
    await connect(env);await saveConnection(env);
    const turns=await study(env);
    assert.equal(turns.at(-1).done,true);
    assert.ok(turns.length>1,'a thousand messages cannot arrive in one request');
    // Progress is reported while it runs, and the samples behind it never are.
    for(const turn of turns.slice(0,-1)){
      assert.ok(turn.scan.sampled>0);
      assert.equal(JSON.stringify(turn).includes('SECRET QUOTED THREAD'),false);
    }
    const profile=turns.at(-1).profile;
    assert.equal(profile.sampled,60);
    assert.equal(profile.voices[0].name,'Warm professional');
    assert.match(profile.prompt,/Open with "Hey"/);
    assert.equal(profile.model,'gpt-5.6-terra');
    // Gmail was asked for pages of ids and then for each message, and only
    // Eric's own writing was sent to the model.
    assert.equal(fake.calls.filter(entry=>entry.endsWith('/gmail/v1/users/me/messages')).length,turns.length);
    assert.equal(fake.calls.filter(entry=>/\/messages\/m\d+$/.test(entry)).length,60);
    const batches=fake.prompts.filter(body=>!body.instructions.includes('Return ONLY JSON'));
    assert.ok(batches.length>=2,`a mailbox this size is read in batches, not one prompt (${batches.length})`);
    // Every batch reaches the profile that combines them.
    const [combined]=fake.prompts.filter(body=>body.instructions.includes('Return ONLY JSON'));
    assert.match(JSON.stringify(combined.input),new RegExp(`Reading ${batches.length} of ${batches.length}`));
    for(const body of batches){
      const sent=JSON.stringify(body.input);
      assert.equal(sent.includes('SECRET QUOTED THREAD'),false,'a quoted thread is not Eric writing');
      assert.match(sent,/happy to do that/);
    }
    // Nothing is left behind: the finished row holds the profile, and no
    // message text, and it is unreadable in the row itself.
    const row=sql.prepare('SELECT value FROM voice_profiles').get().value;
    assert.equal(row.includes('happy to do that'),false);
    const state=await (await call(env,'/v1/voice')).json();
    assert.equal(state.scan,null);
    assert.equal(state.profile.sampled,60);
  });
});

test('a stopped study resumes where it stopped instead of reading everything again',async()=>{
  const {env}=environment();
  const fake=fakeCloud({total:75});
  await withCloud(fake,async()=>{
    await connect(env);await saveConnection(env);
    const first=await (await call(env,'/v1/voice/scan','POST',{connectionId:CONNECTION,restart:true})).json();
    assert.equal(first.done,false);
    const read=fake.calls.filter(entry=>/\/messages\/m\d+$/.test(entry)).length;
    // The panel was closed here. Asking again carries on from the same page.
    const rest=await study(env,{restart:false});
    assert.equal(rest.at(-1).done,true);
    assert.equal(rest.at(-1).profile.sampled,75);
    const total=fake.calls.filter(entry=>/\/messages\/m\d+$/.test(entry)).length;
    assert.equal(total,75,`read ${total} messages after ${read} before the pause`);
  });
});

test('the owner can correct the voice and forget it, and neither invents a profile',async()=>{
  const {env}=environment();
  const fake=fakeCloud({total:25});
  await withCloud(fake,async()=>{
    await connect(env);await saveConnection(env);
    assert.equal((await call(env,'/v1/voice','PUT',{prompt:'Mine'})).status,409);
    await study(env);
    const edited=await (await call(env,'/v1/voice','PUT',{prompt:'Open with "Hi". Never use exclamation marks.'})).json();
    assert.match(edited.profile.prompt,/Open with "Hi"/);
    assert.equal(edited.profile.voices[0].name,'Warm professional','an edit changes the instructions, not what was read');
    assert.equal(edited.profile.sampled,25);
    assert.equal((await call(env,'/v1/voice','PUT',{prompt:'   '})).status,400);
    assert.equal((await call(env,'/v1/voice','PUT',{prompt:'x'.repeat(6001)})).status,400);
    const forgotten=await (await call(env,'/v1/voice','DELETE')).json();
    assert.equal(forgotten.profile,null);
    assert.equal((await (await call(env,'/v1/voice')).json()).profile,null);
  });
});

test('sent mail with nothing of Eric’s in it is said so rather than made into a voice',async()=>{
  const {env}=environment();
  const fake=fakeCloud({total:0});
  await withCloud(fake,async()=>{
    await connect(env);await saveConnection(env);
    const refused=await call(env,'/v1/voice/scan','POST',{connectionId:CONNECTION,restart:true});
    assert.equal(refused.status,422);
    assert.match((await refused.json()).error,/No sent mail/);
    assert.equal((await (await call(env,'/v1/voice')).json()).profile,null);
  });
});

test('a study without a chosen AI connection is refused before Gmail is touched',async()=>{
  const {env}=environment();
  const fake=fakeCloud();
  await withCloud(fake,async()=>{
    await connect(env);
    assert.equal((await call(env,'/v1/voice/scan','POST',{connectionId:'nope'})).status,400);
    assert.equal((await call(env,'/v1/voice/scan','POST',{connectionId:CONNECTION})).status,404);
    assert.equal(fake.calls.some(entry=>entry.includes('gmail.googleapis.com')),false);
    assert.equal((await call(env,'/v1/voice/unknown','POST',{})).status,404);
  });
});
