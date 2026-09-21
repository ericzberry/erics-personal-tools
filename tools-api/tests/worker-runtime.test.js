import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('provider request options work in Cloudflare runtime and redirects never forward keys',async()=>{
 const {outputFiles}=await build({stdin:{contents:`
 import {generate} from './src/providers.js';
 export default {async fetch(request){
   let calls=0;
   try {
     const result=await generate({provider:'openai',apiKey:'synthetic',model:'gpt-4.1-mini'}, {model:'gpt-4.1-mini',messages:[{role:'user',content:'Summarize'}]}, async(url,options)=>{
       calls++; new Request(url,options);
       if(request.url.endsWith('/redirect'))return new Response(null,{status:302,headers:{Location:'https://example.com'}});
       return Response.json({output:[{type:'message',content:[{type:'output_text',text:'Summary'}]}]});
     });return Response.json({result,calls});
   }catch(error){return Response.json({error:error.message,calls});}
 }};`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,format:'esm',write:false,platform:'browser'});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text}));
 try{
   const ok=await (await mf.dispatchFetch('http://localhost/summary')).json();assert.equal(ok.result?.text,'Summary',ok.error);assert.equal(ok.calls,1);
   const redirect=await (await mf.dispatchFetch('http://localhost/redirect')).json();assert.match(redirect.error,/redirect/);assert.equal(redirect.calls,1);
 }finally{await mf.dispose();}
});

// The tax upload is the one request in this Worker whose body is neither JSON
// nor a plain string: metadata and the document's bytes in one multipart Blob.
// Node accepts shapes workerd does not, so this composes the real body in the
// Cloudflare runtime and reads back what Google would have received.
test('a tax document survives the multipart upload body in Cloudflare runtime',async()=>{
  const {outputFiles}=await build({stdin:{contents:`
  import {multipartBody} from './src/drive.js';
  export default {async fetch(){
    // A byte pattern that is not valid UTF-8, so any re-encoding shows up.
    const bytes=new Uint8Array([37,80,68,70,0,255,254,10,65]);
    const {body,contentType}=multipartBody({metadata:{name:'K-1 - Synthetic Fund, LP.pdf',parents:['folder']},bytes,mimeType:'application/pdf'});
    let seen=null;
    await (async(url,options)=>{seen={type:options.headers['Content-Type'],buffer:await new Response(options.body).arrayBuffer()};})
      ('https://example.com',{method:'POST',headers:{'Content-Type':contentType},body});
    const boundary=seen.type.split('boundary=')[1];
    const whole=new Uint8Array(seen.buffer);
    const text=new TextDecoder('latin1').decode(whole);
    const metadata=JSON.parse(text.split('\\r\\n\\r\\n')[1].split('\\r\\n--')[0]);
    const start=text.indexOf('application/pdf')+'application/pdf\\r\\n\\r\\n'.length;
    return Response.json({boundary:!!boundary,name:metadata.name,parents:metadata.parents,
      payload:[...whole.slice(start,start+bytes.length)],
      closed:text.endsWith('--'+boundary+'--')});
  }};`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,format:'esm',write:false,platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text}));
  try{
    const result=await (await mf.dispatchFetch('http://localhost/upload')).json();
    assert.equal(result.boundary,true);
    // A comma, a space and a hyphen in a fund's name must reach Drive as typed.
    assert.equal(result.name,'K-1 - Synthetic Fund, LP.pdf');
    assert.deepEqual(result.parents,['folder']);
    // The document's bytes must arrive unchanged, including the ones that are
    // not text at all.
    assert.deepEqual(result.payload,[37,80,68,70,0,255,254,10,65]);
    assert.equal(result.closed,true);
  }finally{await mf.dispose();}
});

// The storage read is this Worker's only outbound request to Cloudflare's own
// API, and its options have to be ones workerd will actually accept.
// `redirect: 'error'` is valid in a browser and rejected outright at the edge —
// found by the live cron an hour after deployment, which is an hour too late.
// Constructing a real Request in the real runtime is what settles it, so the
// options are checked here rather than against Node's more forgiving fetch.
test('the Cloudflare storage read uses request options workerd accepts',async()=>{
  const {outputFiles}=await build({stdin:{contents:`
  import {measureUsage} from './src/quota.js';
  export default {async fetch(){
    const seen=[];
    try{
      const usage=await measureUsage({CLOUDFLARE_ACCOUNT_ID:'acct',CLOUDFLARE_API_TOKEN:'synthetic-read-token'},{fetcher:async(url,options)=>{
        // Throws in workerd if any option is one the edge does not implement.
        const request=new Request(url,options);
        seen.push({url:String(url),redirect:request.redirect,auth:request.headers.get('Authorization')});
        // The listing, then the per-database call the reader always makes.
        return Response.json(String(url).includes('/d1/database?')
          ? {success:true,result:[{uuid:'u',name:'erics-personal-tools',file_size:310000,num_tables:0}]}
          : {success:true,result:{uuid:'u',name:'erics-personal-tools',file_size:310000,num_tables:24}});
      }});
      return Response.json({usage,seen});
    }catch(error){return Response.json({error:error?.message||String(error),seen});}
  }};`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,format:'esm',write:false,platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text}));
  try{
    const result=await (await mf.dispatchFetch('http://localhost/storage')).json();
    assert.equal(result.error,undefined);
    assert.equal(result.usage.totalBytes,310000);
    assert.equal(result.seen.length,2);
    assert.match(result.seen[0].url,/\/accounts\/acct\/d1\/database\?/);
    assert.match(result.seen[1].url,/\/accounts\/acct\/d1\/database\/u$/);
    assert.equal(result.usage.databases[0].tables,24);
    // Never followed, so the read token cannot be handed on to another host.
    for(const made of result.seen){
      assert.equal(made.redirect,'manual');
      assert.equal(made.auth,'Bearer synthetic-read-token');
    }
  }finally{await mf.dispose();}
});

// A restore is one D1 batch: a foreign-key pragma, the deletes, and inserts
// that take each row apart from one JSON parameter. node:sqlite cannot say
// whether D1 accepts that batch or hands rows back in the shape the backup
// reads, so the whole round trip runs here against the runtime's own D1.
test('a backup read and restore round-trips the ledger through D1 in Cloudflare runtime',async()=>{
  const {readFileSync}=await import('node:fs');
  const schema=readFileSync(new URL('../finance-schema.sql',import.meta.url),'utf8');
  const {outputFiles}=await build({stdin:{contents:`
  import {tableList,readTables,writeTables} from './src/backup.js';
  const schema=${JSON.stringify(schema)};
  export default {async fetch(request,env){
    for(const statement of schema.replace(/--.*$/gm,'').split(';').map(text=>text.trim()).filter(Boolean))
      await env.DB.prepare(statement).run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO finance_portfolios (id, value, revision) VALUES (1, ?, 'r1')").bind(JSON.stringify({v:1,iv:'aXY=',ciphertext:'c2VhbGVk'})),
      env.DB.prepare('INSERT INTO finance_marks (portfolio, class, firm, as_of, cents) VALUES (1, 1, 3, 20260630, 4300000000), (1, 2, 0, 20260630, 125050)'),
      env.DB.prepare("INSERT INTO finance_holdings (id, portfolio, value, revision) VALUES (9, 1, 'sealed', 'r9')"),
      env.DB.prepare('INSERT INTO finance_capital (holding, as_of, cents, contributed, distributed, commitment, unfunded) VALUES (9, 20260630, 1, 2, 3, 4, NULL)')
    ]);
    const list=(await tableList(env)).filter(table=>table.name.startsWith('finance_'));
    const saved=await readTables(env,list);
    // Damage: a figure overwritten, a portfolio lost with its figures.
    await env.DB.batch([env.DB.prepare('UPDATE finance_marks SET cents = 1'),env.DB.prepare('DELETE FROM finance_marks'),
      env.DB.prepare('DELETE FROM finance_capital'),env.DB.prepare('DELETE FROM finance_holdings'),env.DB.prepare('DELETE FROM finance_portfolios')]);
    // Children first on purpose: the pragma is what lets the order not matter.
    await writeTables(env,[...saved].reverse());
    const after=await readTables(env,list);
    let orphaned=null;
    try{await writeTables(env,[{...saved.find(table=>table.name==='finance_portfolios'),rows:[]}]);}
    catch(error){orphaned=error.message;}
    const kept=await readTables(env,list);
    return Response.json({saved,after,kept,orphaned,types:await env.DB.prepare('SELECT typeof(cents) AS c, typeof(value) AS v FROM finance_marks, finance_portfolios LIMIT 1').first()});
  }};`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,format:'esm',write:false,platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-08',script:outputFiles[0].text,d1Databases:['DB']}));
  try{
    const response=await mf.dispatchFetch('http://localhost/');
    assert.equal(response.status,200,await response.clone().text());
    const result=await response.json();
    const marks=result.saved.find(table=>table.name==='finance_marks');
    assert.deepEqual(marks.columns,['portfolio','class','firm','as_of','cents']);
    assert.equal(marks.rows.length,2);
    assert.deepEqual(result.saved.find(table=>table.name==='finance_capital').rows,[[9,20260630,1,2,3,4,null]]);
    // Every table comes back exactly as it was read, value for value and type
    // for type: an integer is still an integer, sealed text still text.
    assert.deepEqual(result.after,result.saved);
    assert.deepEqual(result.types,{c:'integer',v:'text'});
    // Emptying the portfolios would orphan their figures, so D1 refuses the
    // batch and every table is left as it was.
    assert.match(result.orphaned||'',/Nothing was restored/);
    assert.deepEqual(result.kept,result.saved);
  }finally{await mf.dispose();}
});
