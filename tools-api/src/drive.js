// Google Drive, reached with the owner's own account.
//
// The Worker holds the refresh token and no page ever sees a Drive credential:
// the app asks this module where a document would land and then hands it the
// bytes. Two things follow from that and are deliberate. A filing is resolved
// before it is uploaded, so the destination the owner approved is the one the
// file reaches; and the resolution is held as an opaque ticket, so a fund or
// firm name never travels in a URL that request logs would keep.
import {encryptSettings,decryptSettings} from './ai-settings.js';
import {TAX_ROOT_FOLDER_ID,MAX_DOCUMENT_BYTES,normalizeTaxFiling,availableName} from '../../chrome-sidebar/src/tax-data.js';

const fail=(status,message)=>{throw {status,message};};
const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const API='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3';
const FOLDER_TYPE='application/vnd.google-apps.folder';
// The tax folder already exists and was made by hand, so per-file access
// cannot reach it. Nothing here deletes: the only writes are creating a year
// folder, adding a file, and replacing one the owner asked to replace.
export const DRIVE_SCOPES=['https://www.googleapis.com/auth/drive','openid','email'];
const ACCOUNT_ID='google-drive';
const TICKET_MINUTES=15;
const now=()=>new Date().toISOString();

function config(env,request){
  const clientId=env.GOOGLE_CLIENT_ID,clientSecret=env.GOOGLE_CLIENT_SECRET;
  if(!clientId||!clientSecret)fail(503,'Google Drive is not configured on the Worker yet.');
  return {clientId,clientSecret,redirectUri:`${new URL(request.url).origin}/v1/drive/callback`};
}

// --- Short-lived tickets: the OAuth state, and a resolved upload destination.
async function keepTicket(env,kind,value){
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO drive_tickets (id, kind, value, created_at) VALUES (?, ?, ?, ?)')
    .bind(id,kind,await encryptSettings(value,id,env),now()).run();
  await env.DB.prepare('DELETE FROM drive_tickets WHERE created_at < ?')
    .bind(new Date(Date.now()-TICKET_MINUTES*60000).toISOString()).run();
  return id;
}
async function takeTicket(env,kind,id){
  if(!/^[a-f0-9-]{36}$/.test(String(id??''))) fail(400,'That request has expired. Start again.');
  const row=await env.DB.prepare('SELECT value, created_at FROM drive_tickets WHERE id = ? AND kind = ?').bind(id,kind).first();
  if(!row)fail(400,'That request has expired. Start again.');
  await env.DB.prepare('DELETE FROM drive_tickets WHERE id = ?').bind(id).run();
  if(Date.parse(row.created_at)<Date.now()-TICKET_MINUTES*60000)fail(400,'That request has expired. Start again.');
  return decryptSettings(row.value,id,env);
}

// --- The stored account. One row, because one person files into one folder.
async function storedAccount(env){
  const row=await env.DB.prepare('SELECT value FROM drive_accounts WHERE id = ?').bind(ACCOUNT_ID).first();
  return row?decryptSettings(row.value,ACCOUNT_ID,env):null;
}
async function storeAccount(env,value){
  await env.DB.prepare('INSERT INTO drive_accounts (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(ACCOUNT_ID,await encryptSettings(value,ACCOUNT_ID,env),now()).run();
}

// Access tokens last an hour and this isolate may serve many filings in that
// time, so one is kept in memory. It is never written down: a restarted
// isolate simply asks for another.
let cached=null;
async function accessToken(env,request,fetcher){
  const account=await storedAccount(env);
  // Keyed on the refresh token, so a disconnect or a reconnect as someone else
  // can never be served by the token the previous connection minted.
  if(!account?.refreshToken){cached=null;fail(409,'Connect Google Drive first.');}
  if(cached?.account===account.refreshToken&&cached.expires>Date.now()+60000)return cached.token;
  const {clientId,clientSecret}=config(env,request);
  const response=await fetcher(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:account.refreshToken,grant_type:'refresh_token'})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    cached=null;
    if(result.error==='invalid_grant'){
      await env.DB.prepare('DELETE FROM drive_accounts WHERE id = ?').bind(ACCOUNT_ID).run();
      fail(409,'Google revoked this connection. Connect Google Drive again.');
    }
    fail(502,'Google would not renew the Drive connection.');
  }
  cached={token:result.access_token,expires:Date.now()+(Number(result.expires_in)||3600)*1000,account:account.refreshToken};
  return cached.token;
}

// A 401 on a Drive call normally means the held access token went stale early,
// so it is worth one fresh token and one retry — and no more than one, because
// a second refusal is the connection itself, which renewing cannot fix. The
// renewal is where a revoked connection is actually noticed.
async function driveFetch(env,request,fetcher,path,init={},retried=false){
  const token=await accessToken(env,request,fetcher);
  const response=await fetcher(path.startsWith('http')?path:`${API}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers}});
  if(response.status===401&&!retried){cached=null;return driveFetch(env,request,fetcher,path,init,true);}
  if(response.status===401||response.status===403){
    cached=null;
    const detail=await response.json().catch(()=>({}));
    fail(502,detail?.error?.message?`Google Drive refused the request: ${detail.error.message}`:'Google Drive refused the request. Reconnect and try again.');
  }
  if(response.status===404)fail(404,'That tax folder is not reachable with the connected Google account.');
  if(!response.ok)fail(502,`Google Drive is unavailable (${response.status}).`);
  return response.json();
}

const quote=text=>String(text).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const listing=params=>`/files?${new URLSearchParams({...params,supportsAllDrives:'true',includeItemsFromAllDrives:'true',spaces:'drive'})}`;

// The year's subfolder, made on first use. A year Drive already has two
// folders for is a question for the owner, not something to guess at.
async function yearFolder(env,request,fetcher,year,{create=false}={}){
  const found=await driveFetch(env,request,fetcher,listing({
    q:`'${quote(TAX_ROOT_FOLDER_ID)}' in parents and name = '${quote(year)}' and mimeType = '${FOLDER_TYPE}' and trashed = false`,
    fields:'files(id,name)',pageSize:'10'
  }));
  if(found.files?.length>1)fail(409,`Drive has more than one ${year} folder in your tax folder. Tidy that up, then file this again.`);
  if(found.files?.length)return {...found.files[0],created:false};
  if(!create)return null;
  const folder=await driveFetch(env,request,fetcher,'/files?supportsAllDrives=true&fields=id,name',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:year,mimeType:FOLDER_TYPE,parents:[TAX_ROOT_FOLDER_ID]})
  });
  return {...folder,created:true};
}

const folderContents=(env,request,fetcher,folderId)=>driveFetch(env,request,fetcher,listing({
  q:`'${quote(folderId)}' in parents and trashed = false`,
  fields:'files(id,name,modifiedTime,size,webViewLink)',pageSize:'1000',orderBy:'name'
}));

// Drive's one-request upload: the metadata and the file in one multipart body.
// Exported because this is the part that depends on the runtime rather than on
// Drive — a Blob of mixed text and bytes has to reach Google byte for byte.
export function multipartBody({metadata,bytes,mimeType}){
  const boundary=`tax-${crypto.randomUUID()}`;
  const head=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  return {body:new Blob([head,bytes,`\r\n--${boundary}--`]),contentType:`multipart/related; boundary=${boundary}`};
}
async function multipart(env,request,fetcher,{fileId,metadata,bytes,mimeType}){
  const {body,contentType}=multipartBody({metadata,bytes,mimeType});
  const target=`${UPLOAD}/files${fileId?`/${encodeURIComponent(fileId)}`:''}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,modifiedTime,size`;
  return driveFetch(env,request,fetcher,target,{method:fileId?'PATCH':'POST',headers:{'Content-Type':contentType},body});
}

// --- The routes.
export async function drive(request,env,readValue,json,fetcher=fetch){
  const url=new URL(request.url),path=url.pathname;
  const method=request.method;
  const body=async(limit)=>JSON.parse(await readValue(request,limit));

  if(path==='/v1/drive/status'&&method==='GET'){
    const account=await storedAccount(env);
    return json({connected:!!account?.refreshToken,account:account?.email||'',connectedAt:account?.connectedAt||'',
      configured:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),folderId:TAX_ROOT_FOLDER_ID});
  }

  if(path==='/v1/drive/connect'&&method==='POST'){
    const {clientId,redirectUri}=config(env,request);
    // `consent` is asked for every time on purpose: without it Google returns
    // no refresh token on a repeat authorization, and a connection that cannot
    // renew itself is worse than none.
    const state=await keepTicket(env,'auth',{redirectUri});
    return json({url:`${AUTH_URL}?${new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',
      scope:DRIVE_SCOPES.join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'true',state})}`});
  }

  if(path==='/v1/drive/disconnect'&&method==='POST'){
    cached=null;
    await env.DB.prepare('DELETE FROM drive_accounts WHERE id = ?').bind(ACCOUNT_ID).run();
    return json({connected:false});
  }

  // Resolves one filing: the year folder (made if this is the first document of
  // that year) and whether the name is already taken. Nothing is uploaded here,
  // so a conflict can be reported before any bytes are sent.
  if(path==='/v1/drive/plan'&&method==='POST'){
    const input=await body();
    const filing=normalizeTaxFiling(input);
    const folder=await yearFolder(env,request,fetcher,filing.year,{create:true});
    const contents=await folderContents(env,request,fetcher,folder.id);
    const files=contents.files||[];
    const existing=files.find(file=>file.name.toLowerCase()===filing.name.toLowerCase())||null;
    const ticket=await keepTicket(env,'upload',{folderId:folder.id,name:filing.name,year:filing.year,
      existingId:existing?.id||'',taken:files.map(file=>file.name)});
    return json({ticket,year:filing.year,name:filing.name,folder:{id:folder.id,created:folder.created},
      existing:existing&&{name:existing.name,modifiedTime:existing.modifiedTime,size:Number(existing.size)||0,webViewLink:existing.webViewLink},
      keepBothName:availableName(filing.name,files.map(file=>file.name))});
  }

  // The bytes. Everything about where they go was settled by `plan`, so the
  // only thing this request carries besides the file is which answer the owner
  // gave to a name that was already taken.
  if(path==='/v1/drive/upload'&&method==='POST'){
    const mode=url.searchParams.get('mode')||'new';
    if(!['new','replace','keep-both'].includes(mode))fail(400,'Choose how to handle the existing file.');
    const size=Number(request.headers.get('Content-Length'));
    if(!Number.isInteger(size)||size<=0)fail(411,'Send the document with a Content-Length.');
    if(size>MAX_DOCUMENT_BYTES)fail(413,`That document is ${(size/1000000).toFixed(1)} MB. The limit is ${MAX_DOCUMENT_BYTES/1000000} MB.`);
    const plan=await takeTicket(env,'upload',url.searchParams.get('ticket'));
    if(mode==='replace'&&!plan.existingId)fail(409,'There is no longer a file to replace. File it again.');
    if(mode==='new'&&plan.existingId)fail(409,'A document with that name is already filed there.');
    const name=mode==='keep-both'?availableName(plan.name,plan.taken):plan.name;
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength>MAX_DOCUMENT_BYTES)fail(413,'That document is larger than the limit.');
    const mimeType=(request.headers.get('Content-Type')||'application/octet-stream').split(';')[0].trim();
    const file=await multipart(env,request,fetcher,{
      fileId:mode==='replace'?plan.existingId:'',
      metadata:mode==='replace'?{name}:{name,parents:[plan.folderId]},
      bytes,mimeType
    });
    return json({filed:{name:file.name,year:plan.year,id:file.id,webViewLink:file.webViewLink,
      size:Number(file.size)||bytes.byteLength,modifiedTime:file.modifiedTime},replaced:mode==='replace'});
  }

  // What is already filed for a year, so a document is not filed twice under
  // two spellings of the same name.
  if(path==='/v1/drive/filed'&&method==='GET'){
    const year=url.searchParams.get('year')||'';
    if(!/^\d{4}$/.test(year))fail(400,'Choose a tax year.');
    const folder=await yearFolder(env,request,fetcher,year);
    if(!folder)return json({year,files:[]});
    const contents=await folderContents(env,request,fetcher,folder.id);
    return json({year,folderId:folder.id,files:(contents.files||[]).map(file=>({
      name:file.name,modifiedTime:file.modifiedTime,size:Number(file.size)||0,webViewLink:file.webViewLink
    }))});
  }

  fail(404,'Unknown Drive request.');
}

// Google's redirect lands here with no access token of its own, so it is the
// one route outside the bearer check. The `state` is what stands in for it:
// this Worker issued it, it is good once, and it expires.
export async function driveCallback(request,env,fetcher=fetch){
  const page=(title,detail)=>new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`+
    `<body style="font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;color:#1b1b1b">`+
    `<main style="max-width:24rem;padding:1.5rem"><h1 style="font-size:1.15rem;margin:0 0 .5rem">${title}</h1><p style="margin:0;color:#555">${detail}</p></main>`,
    {status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  const url=new URL(request.url);
  const error=url.searchParams.get('error');
  if(error)return page('Drive was not connected','You can close this tab and try again from Taxes.');
  try{
    const {redirectUri}=await takeTicket(env,'auth',url.searchParams.get('state'));
    const code=url.searchParams.get('code')||'';
    if(!code)fail(400,'No authorization code.');
    const {clientId,clientSecret}=config(env,request);
    const response=await fetcher(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.refresh_token)fail(502,'Google did not return a renewable connection.');
    // The id_token came straight from Google over TLS in this exchange, so its
    // email is read for display and nothing is decided by it.
    let email='';
    try{email=JSON.parse(atob(String(result.id_token).split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).email||'';}catch{}
    cached=result.access_token?{token:result.access_token,expires:Date.now()+(Number(result.expires_in)||3600)*1000,account:result.refresh_token}:null;
    await storeAccount(env,{refreshToken:result.refresh_token,email,connectedAt:now()});
    return page('Google Drive connected',`${email?`${email} can `:'This Worker can now '}file documents into your tax folder. You can close this tab.`);
  }catch{
    return page('Drive was not connected','That link expired or was already used. Start again from Taxes.');
  }
}
