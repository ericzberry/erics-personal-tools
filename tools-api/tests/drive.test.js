import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';

const token='synthetic-token-at-least-32-characters';
const ROOT='16kSurMc_G_wTBH-hUnoNFYPBUwkKROZN';

function environment({configured=true}={}){
  const sql=new DatabaseSync(':memory:');
  for(const schema of ['schema.sql','drive-schema.sql'])sql.exec(readFileSync(new URL(`../${schema}`,import.meta.url),'utf8'));
  return {sql,env:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),
    ...(configured?{GOOGLE_CLIENT_ID:'synthetic-client-id',GOOGLE_CLIENT_SECRET:'synthetic-client-secret'}:{}),
    DB:{prepare(query){
      const statement=sql.prepare(query);let args=[];
      return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
        async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};
    }}}};
}

// A stand-in Google: enough of Drive to answer the calls this module makes, and
// a record of what it was asked, so the test can check the request as well as
// the reply.
function fakeGoogle({refreshToken='synthetic-refresh-token',email='owner@example.com'}={}){
  const files=new Map();let nextId=1;
  const calls=[];
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const idToken=`x.${Buffer.from(JSON.stringify({email})).toString('base64url')}.y`;
  const google=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    calls.push({url:url.toString(),method:init.method||'GET',body:init.body});
    if(url.origin==='https://oauth2.googleapis.com'){
      const form=new URLSearchParams(String(init.body));
      if(form.get('grant_type')==='authorization_code'){
        if(form.get('code')!=='synthetic-code')return reply({error:'invalid_grant'},400);
        return reply({access_token:'synthetic-access',expires_in:3600,refresh_token:refreshToken,id_token:idToken});
      }
      if(form.get('refresh_token')!==refreshToken)return reply({error:'invalid_grant'},400);
      return reply({access_token:'synthetic-access',expires_in:3600});
    }
    if(init.headers?.Authorization!=='Bearer synthetic-access')return reply({error:{message:'bad token'}},401);
    // List.
    if(url.pathname==='/drive/v3/files'&&(init.method||'GET')==='GET'){
      const q=url.searchParams.get('q')||'';
      const parent=(q.match(/^'([^']+)' in parents/)||[])[1];
      const name=(q.match(/name = '([^']*)'/)||[])[1];
      const wantsFolder=q.includes(`mimeType = 'application/vnd.google-apps.folder'`);
      return reply({files:[...files.values()].filter(file=>file.parent===parent
        &&(name===undefined||file.name===name)
        &&(!wantsFolder||file.folder))});
    }
    // Create a folder.
    if(url.pathname==='/drive/v3/files'&&init.method==='POST'){
      const input=JSON.parse(String(init.body));
      const file={id:`folder-${nextId++}`,name:input.name,parent:input.parents[0],folder:true};
      files.set(file.id,file);
      return reply({id:file.id,name:file.name});
    }
    // Upload, new or replacing.
    if(url.pathname.startsWith('/upload/drive/v3/files')){
      const text=await new Response(init.body).text();
      const metadata=JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]);
      const existingId=url.pathname.split('/').pop();
      const id=init.method==='PATCH'?decodeURIComponent(existingId):`file-${nextId++}`;
      const previous=files.get(id);
      const file={id,name:metadata.name,parent:metadata.parents?.[0]??previous?.parent,folder:false,
        bytes:text.length,modifiedTime:'2026-09-11T00:00:00.000Z'};
      files.set(id,file);
      return reply({id:file.id,name:file.name,webViewLink:`https://drive.google.com/file/d/${file.id}/view`,
        modifiedTime:file.modifiedTime,size:String(file.bytes)});
    }
    return reply({error:{message:'unexpected request'}},404);
  };
  return {google,files,calls};
}

const call=(env,url,method='GET',value,auth=token)=>worker.fetch(new Request(`https://example.com${url}`,{
  method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},
  body:value===undefined?undefined:JSON.stringify(value)}),env);
const send=(env,url,body,type='application/pdf')=>worker.fetch(new Request(`https://example.com${url}`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':type,'Content-Length':String(body.byteLength)},body}),env);

// Connects the way the app does, and hands back the state Google was redirected
// with so a test can complete the round trip.
async function connect(env){
  const started=await (await call(env,'/v1/drive/connect','POST',{})).json();
  const state=new URL(started.url).searchParams.get('state');
  await worker.fetch(new Request(`https://example.com/v1/drive/callback?code=synthetic-code&state=${state}`),env);
  return {started,state};
}

async function withGoogle(fake,run){
  const real=globalThis.fetch;
  globalThis.fetch=fake.google;
  try{return await run();}finally{globalThis.fetch=real;}
}

test('Drive routes need the access token, and the OAuth redirect deliberately does not',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    assert.equal((await call(env,'/v1/drive/status','GET',undefined,'wrong-token')).status,401);
    // Google redirects with no bearer of ours, so the callback answers a page
    // instead of a 401 — and refuses a state it did not issue.
    const refused=await worker.fetch(new Request('https://example.com/v1/drive/callback?code=synthetic-code&state=11111111-1111-4111-8111-111111111111'),env);
    assert.equal(refused.status,200);
    assert.match(await refused.text(),/not connected/);
    assert.equal((await (await call(env,'/v1/drive/status')).json()).connected,false);
  });
});

test('an unconfigured Worker says so instead of offering a connection',async()=>{
  const {env}=environment({configured:false});
  const status=await (await call(env,'/v1/drive/status')).json();
  assert.deepEqual([status.connected,status.configured],[false,false]);
  assert.equal((await call(env,'/v1/drive/connect','POST',{})).status,503);
});

test('consent stores a renewable connection, encrypted, and a state is good once',async()=>{
  const {sql,env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    const {started,state}=await connect(env);
    const consent=new URL(started.url);
    assert.equal(consent.origin+consent.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
    // Without offline access and a fresh consent Google returns no refresh
    // token, and a connection that cannot renew itself is worse than none.
    assert.equal(consent.searchParams.get('access_type'),'offline');
    assert.equal(consent.searchParams.get('prompt'),'consent');
    assert.match(consent.searchParams.get('scope'),/auth\/drive/);
    const status=await (await call(env,'/v1/drive/status')).json();
    assert.deepEqual([status.connected,status.account,status.folderId],[true,'owner@example.com',ROOT]);
    // The refresh token must not be readable from the row itself.
    const row=sql.prepare('SELECT value FROM drive_accounts').get().value;
    assert.equal(row.includes('synthetic-refresh-token'),false);
    // Replaying the same redirect must not connect anything a second time.
    const replay=await worker.fetch(new Request(`https://example.com/v1/drive/callback?code=synthetic-code&state=${state}`),env);
    assert.match(await replay.text(),/not connected/);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM drive_tickets').get().n,0);
  });
});

test('a filing creates the year folder, names the file, and uploads it there',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    const plan=await (await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'download.pdf'})).json();
    assert.equal(plan.name,'Form 1099 - Schwab.pdf');
    assert.deepEqual([plan.year,plan.folder.created,plan.existing],['2025',true,null]);
    // The name is settled before the bytes move; nothing identifying is in the
    // upload URL, only the ticket that stands for the destination.
    const uploadUrl=`/v1/drive/upload?ticket=${plan.ticket}&mode=new`;
    assert.equal(uploadUrl.includes('Schwab'),false);
    const filed=await (await send(env,uploadUrl,new Uint8Array([37,80,68,70]))).json();
    assert.equal(filed.filed.name,'Form 1099 - Schwab.pdf');
    assert.equal(filed.replaced,false);
    const folder=[...fake.files.values()].find(file=>file.folder);
    assert.deepEqual([folder.name,folder.parent],['2025',ROOT]);
    assert.equal([...fake.files.values()].find(file=>!file.folder).parent,folder.id);
    // A ticket is good once: a replayed upload cannot file a second copy.
    assert.equal((await send(env,uploadUrl,new Uint8Array([37,80,68,70]))).status,400);
    const listed=await (await call(env,'/v1/drive/filed?year=2025')).json();
    assert.deepEqual(listed.files.map(file=>file.name),['Form 1099 - Schwab.pdf']);
    // A second year reuses the folder it just made rather than making another.
    await (await call(env,'/v1/drive/plan','POST',{type:'k1',issuer:'Averin',year:'2025',fileName:'k1.pdf'})).json();
    assert.equal([...fake.files.values()].filter(file=>file.folder).length,1);
  });
});

test('a name already filed stops the upload and offers both answers',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    const first=await (await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'a.pdf'})).json();
    await send(env,`/v1/drive/upload?ticket=${first.ticket}&mode=new`,new Uint8Array([1,2,3]));

    const second=await (await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'b.pdf'})).json();
    assert.equal(second.existing.name,'Form 1099 - Schwab.pdf');
    assert.equal(second.keepBothName,'Form 1099 - Schwab (2).pdf');
    // Filing as new over a name that exists is refused rather than silently
    // overwriting: the owner has to say which they meant.
    assert.equal((await send(env,`/v1/drive/upload?ticket=${second.ticket}&mode=new`,new Uint8Array([1]))).status,409);

    const third=await (await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'c.pdf'})).json();
    const kept=await (await send(env,`/v1/drive/upload?ticket=${third.ticket}&mode=keep-both`,new Uint8Array([1]))).json();
    assert.equal(kept.filed.name,'Form 1099 - Schwab (2).pdf');
    assert.equal([...fake.files.values()].filter(file=>!file.folder).length,2);

    const fourth=await (await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'d.pdf'})).json();
    const replaced=await (await send(env,`/v1/drive/upload?ticket=${fourth.ticket}&mode=replace`,new Uint8Array([9,9]))).json();
    assert.equal(replaced.replaced,true);
    // Replacing writes over the one file rather than adding a third.
    assert.equal([...fake.files.values()].filter(file=>!file.folder).length,2);
    assert.equal(fake.calls.at(-1).method,'PATCH');
  });
});

test('a filing is refused before it reaches Google when it cannot be named or placed',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    const before=fake.calls.length;
    for(const value of [{type:'',issuer:'Schwab',year:'2025'},{type:'1099',issuer:'',year:'2025'},
      {type:'1099',issuer:'Schwab',year:'2019'},{type:'not-a-form',issuer:'Schwab',year:'2025'}]){
      const response=await call(env,'/v1/drive/plan','POST',{...value,fileName:'a.pdf'});
      assert.equal(response.status,400,JSON.stringify(value));
      // The refusal has to read as the owner's mistake, not as a storage fault.
      assert.notEqual((await response.json()).error,'Storage unavailable. Check the D1 binding and schema.');
    }
    assert.equal(fake.calls.length,before,'a refused filing must not reach Drive');
    // A document past the size limit is refused on its declared length, before
    // it is read into memory.
    const plan=await (await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'a.pdf'})).json();
    const huge=await worker.fetch(new Request(`https://example.com/v1/drive/upload?ticket=${plan.ticket}&mode=new`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/pdf','Content-Length':'99000000'},
      body:new Uint8Array([1])}),env);
    assert.equal(huge.status,413);
  });
});

test('disconnecting leaves nothing that can reach Drive again',async()=>{
  const {sql,env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    assert.equal((await call(env,'/v1/drive/disconnect','POST',{})).status,200);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM drive_accounts').get().n,0);
    assert.equal((await (await call(env,'/v1/drive/status')).json()).connected,false);
    // The access token this isolate was holding must not outlive the account.
    assert.equal((await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'a.pdf'})).status,409);
  });
});

test('a revoked connection is cleared rather than retried forever',async()=>{
  const {sql,env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'a.pdf'});
    // Google now refuses the connection: Drive rejects the held access token
    // and the refresh token it issued is no longer good either.
    const revoked=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url);
      return url.origin==='https://oauth2.googleapis.com'
        ?new Response(JSON.stringify({error:'invalid_grant'}),{status:400,headers:{'Content-Type':'application/json'}})
        :new Response(JSON.stringify({error:{message:'Invalid Credentials'}}),{status:401,headers:{'Content-Type':'application/json'}});
    };
    globalThis.fetch=revoked;
    // One stale-token retry is allowed, and it is the renewal inside that retry
    // that notices the revocation, so the owner is told in this same request.
    const response=await call(env,'/v1/drive/filed?year=2025');
    assert.equal(response.status,409);
    assert.match((await response.json()).error,/Connect Google Drive again/);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM drive_accounts').get().n,0);
  });
});
