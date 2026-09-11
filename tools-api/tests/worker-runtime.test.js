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
