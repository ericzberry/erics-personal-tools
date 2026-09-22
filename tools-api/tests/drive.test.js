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
    // One file: what it is and where it sits, or with alt=media its bytes.
    const single=/^\/drive\/v3\/files\/([^/]+)(\/export)?$/.exec(url.pathname);
    if(single&&(init.method||'GET')==='GET'){
      const id=decodeURIComponent(single[1]);
      const file=files.get(id)||(id===ROOT?{id,name:'Taxes',parent:'my-drive',folder:true}:null);
      if(!file)return reply({error:{message:'File not found'}},404);
      if(single[2]||url.searchParams.get('alt')==='media')return new Response(file.content??'',{headers:{'Content-Type':file.mimeType||'application/pdf'}});
      return reply({id:file.id,name:file.name,parents:[file.parent],trashed:false,
        mimeType:file.folder?'application/vnd.google-apps.folder':file.mimeType||'application/pdf',size:String(file.content?.length??file.bytes??0)});
    }
    // List.
    if(url.pathname==='/drive/v3/files'&&(init.method||'GET')==='GET'){
      const q=url.searchParams.get('q')||'';
      // Drive takes any number of parents in one query, and the listing says
      // which one each file came from.
      const parents=[...q.matchAll(/'([^']+)' in parents/g)].map(match=>match[1]);
      const name=(q.match(/name = '([^']*)'/)||[])[1];
      const wantsFolder=q.includes(`mimeType = 'application/vnd.google-apps.folder'`);
      // Drive answers with the mimeType when it is asked for, which is how a
      // folder is told from a document in a listing that holds both.
      return reply({files:[...files.values()].filter(file=>parents.includes(file.parent)
        &&(name===undefined||file.name===name)
        &&(!wantsFolder||file.folder))
        .map(file=>({...file,parents:[file.parent],...(file.folder?{mimeType:'application/vnd.google-apps.folder'}:{})}))});
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

// From 2026 the year is divided by taxpayer and then by what a document is for.
// What is already in Drive is used rather than duplicated, and 2025 and earlier
// stay flat.
test('a 2026 filing lands in the taxpayer folder, making it only when it is missing',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  const folders=()=>[...fake.files.values()].filter(file=>file.folder);
  await withGoogle(fake,async()=>{
    await connect(env);
    const filing={type:'return',taxpayer:'ea-2024',jurisdiction:'federal',year:'2026',fileName:'return.pdf'};
    const plan=await (await call(env,'/v1/drive/plan','POST',filing)).json();
    assert.equal(plan.name,'Return - Federal - Berry EA 2024 Family Trust.pdf');
    assert.deepEqual(plan.path,['2026','Berry EA 2024 Family Trust','Filings']);
    const filed=await (await send(env,`/v1/drive/upload?ticket=${plan.ticket}&mode=new`,new Uint8Array([37,80,68,70]))).json();
    assert.deepEqual(filed.filed.path,['2026','Berry EA 2024 Family Trust','Filings']);
    const year=folders().find(file=>file.name==='2026');
    const trust=folders().find(file=>file.name==='Berry EA 2024 Family Trust');
    const filings=folders().find(file=>file.name==='Filings');
    assert.deepEqual([year.parent,trust.parent,filings.parent],[ROOT,year.id,trust.id]);
    assert.equal([...fake.files.values()].find(file=>!file.folder).parent,filings.id);

    // The same taxpayer's instalment reuses the year and the taxpayer, and gets
    // its own Payments beside Filings rather than landing in it.
    await (await call(env,'/v1/drive/plan','POST',{...filing,type:'estimated-payment',quarter:'q3'})).json();
    assert.deepEqual(folders().map(file=>file.name).sort(),
      ['2026','Berry EA 2024 Family Trust','Filings','Payments']);
    assert.equal(folders().find(file=>file.name==='Payments').parent,trust.id);
    // Another taxpayer divides their own year, not this one's.
    await (await call(env,'/v1/drive/plan','POST',{...filing,taxpayer:'berry'})).json();
    const berry=folders().find(file=>file.name==='Eric & Ariana Berry');
    assert.equal(berry.parent,year.id);
    assert.equal(folders().filter(file=>file.name==='Filings').length,2);
    // A K-1 is nobody's filing and nobody's payment.
    const support=await (await call(env,'/v1/drive/plan','POST',{type:'k1',issuer:'Averin',taxpayer:'berry',year:'2026',fileName:'k1.pdf'})).json();
    assert.deepEqual(support.path,['2026','Eric & Ariana Berry','Supporting Documents']);
    // The owner's own answer outranks the one the type proposes.
    const moved=await (await call(env,'/v1/drive/plan','POST',{...filing,category:'supporting'})).json();
    assert.deepEqual(moved.path,['2026','Berry EA 2024 Family Trust','Supporting Documents']);
    // The same document filed for 2025 stays in the year folder itself.
    const older=await (await call(env,'/v1/drive/plan','POST',{...filing,year:'2025'})).json();
    assert.deepEqual(older.path,['2025']);
  });
});

test('what is already filed for a year covers the taxpayer folders inside it',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    // One document loose in the year, one inside a taxpayer's folder.
    const loose=await (await call(env,'/v1/drive/plan','POST',{type:'1099',issuer:'Schwab',year:'2025',fileName:'a.pdf'})).json();
    await send(env,`/v1/drive/upload?ticket=${loose.ticket}&mode=new`,new Uint8Array([1]));
    const owned=await (await call(env,'/v1/drive/plan','POST',{type:'return',taxpayer:'family-2020',jurisdiction:'ny',year:'2026',fileName:'b.pdf'})).json();
    await send(env,`/v1/drive/upload?ticket=${owned.ticket}&mode=new`,new Uint8Array([1]));

    const flat=await (await call(env,'/v1/drive/filed?year=2025')).json();
    assert.deepEqual([flat.files.map(file=>file.name),flat.groups],[['Form 1099 - Schwab.pdf'],[]]);
    const divided=await (await call(env,'/v1/drive/filed?year=2026')).json();
    // A folder is not a document, so it never appears as one at any level.
    assert.deepEqual([divided.files,divided.groups.map(group=>group.files)],[[],[[]]]);
    assert.deepEqual(divided.groups.map(group=>[group.name,group.groups.map(kind=>[kind.name,kind.files.map(file=>file.name)])]),
      [['Berry 2020 Irrevocable Family Trust',
        [['Filings',['Return - New York - Berry 2020 Irrevocable Family Trust.pdf']]]]]);
    // However much a year holds, reading it is finding the year folder and one
    // request per level below it — never one per folder.
    const before=fake.calls.length;
    await call(env,'/v1/drive/filed?year=2026');
    assert.equal(fake.calls.length-before,4);
  });
});

// A filed document goes back out as itself, so the side panel can hand it to
// the page beside it — and only what the tax folder holds can go.
test('a filed document is read back as itself, and only from inside the tax folder',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    fake.files.set('year-folder-2025',{id:'year-folder-2025',name:'2025',parent:ROOT,folder:true});
    fake.files.set('k1-document-vista',{id:'k1-document-vista',name:'K-1 - Vista.pdf',parent:'year-folder-2025',folder:false,content:'%PDF-1.7 synthetic'});
    fake.files.set('sheet-document-1',{id:'sheet-document-1',name:'Estimates',parent:'year-folder-2025',folder:false,
      mimeType:'application/vnd.google-apps.spreadsheet',content:'%PDF exported'});
    fake.files.set('outside-document',{id:'outside-document',name:'Other.pdf',parent:'someone-elses-folder',folder:false,content:'private'});

    const read=await call(env,'/v1/drive/file?id=k1-document-vista');
    assert.equal(read.status,200);
    assert.equal(await read.text(),'%PDF-1.7 synthetic');
    assert.equal(read.headers.get('Content-Type'),'application/pdf');
    assert.match(read.headers.get('Content-Disposition'),/K-1%20-%20Vista\.pdf/);
    assert.equal(read.headers.get('Cache-Control'),'no-store');
    // A Google Sheet has no bytes of its own, so it travels as a PDF.
    const sheet=await call(env,'/v1/drive/file?id=sheet-document-1');
    assert.equal(sheet.status,200);
    assert.match(sheet.headers.get('Content-Disposition'),/Estimates\.pdf/);
    assert.ok(fake.calls.some(one=>one.url.includes('/files/sheet-document-1/export?mimeType=application%2Fpdf')));

    // Outside the tax folder, a folder, or no id worth asking about: not there.
    const outside=await call(env,'/v1/drive/file?id=outside-document');
    assert.equal(outside.status,404);
    assert.equal(fake.calls.some(one=>one.url.includes('outside-document')&&one.url.includes('alt=media')),false);
    assert.equal((await call(env,'/v1/drive/file?id=year-folder-2025')).status,404);
    assert.equal((await call(env,'/v1/drive/file?id=../x')).status,400);
    assert.equal((await call(env,'/v1/drive/file?id=k1-document-vista','GET',undefined,'wrong-token')).status,401);

    // The listing gives each document the id it is read back by.
    const filed=await (await call(env,'/v1/drive/filed?year=2025')).json();
    assert.deepEqual(filed.files.map(file=>file.id).sort(),['k1-document-vista','sheet-document-1']);
  });
});

// Searching the names reads every year at once, so it has to cost the same
// few requests whether the folder holds three years or thirty.
test('every year is read in one pass of four listings, newest first',async()=>{
  const {env}=environment();
  const fake=fakeGoogle();
  await withGoogle(fake,async()=>{
    await connect(env);
    const loose=await (await call(env,'/v1/drive/plan','POST',{type:'k1',issuer:'Vista',year:'2025',fileName:'a.pdf'})).json();
    await send(env,`/v1/drive/upload?ticket=${loose.ticket}&mode=new`,new Uint8Array([1]));
    const owned=await (await call(env,'/v1/drive/plan','POST',{type:'return',taxpayer:'family-2020',jurisdiction:'ny',year:'2026',fileName:'b.pdf'})).json();
    await send(env,`/v1/drive/upload?ticket=${owned.ticket}&mode=new`,new Uint8Array([1]));
    // An older year made by hand, and a folder beside the years that is not one.
    fake.files.set('year-2023',{id:'year-2023',name:'2023',parent:ROOT,folder:true});
    fake.files.set('old-1099',{id:'old-1099',name:'1099-DIV - Schwab.pdf',parent:'year-2023',folder:false});
    fake.files.set('archive-folder',{id:'archive-folder',name:'Scans to sort',parent:ROOT,folder:true});

    const before=fake.calls.length;
    const every=await (await call(env,'/v1/drive/filed?year=all')).json();
    const listings=fake.calls.slice(before).filter(one=>new URL(one.url).pathname==='/drive/v3/files');
    assert.equal(listings.length,4,'years, then taxpayers, then what each is for, then the documents under those');
    assert.deepEqual(every.years.map(year=>year.year),['2026','2025','2023']);
    const [y2026,y2025,y2023]=every.years;
    assert.deepEqual(y2025.files.map(file=>file.name),['K-1 - Vista.pdf']);
    assert.ok(y2025.files[0].id);
    assert.deepEqual(y2023.files.map(file=>file.name),['1099-DIV - Schwab.pdf']);
    assert.equal(y2026.groups[0].name,'Berry 2020 Irrevocable Family Trust');
    assert.equal(y2026.groups[0].groups[0].name,'Filings');
    assert.match(y2026.groups[0].groups[0].files[0].name,/^Return - New York - /);
    // One year still reads as it did.
    const one=await (await call(env,'/v1/drive/filed?year=2025')).json();
    assert.deepEqual(one.files.map(file=>file.name),['K-1 - Vista.pdf']);
  });
});
