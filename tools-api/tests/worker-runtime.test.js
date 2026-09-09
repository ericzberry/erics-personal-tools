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
