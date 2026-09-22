import test from 'node:test';
import assert from 'node:assert/strict';
import {publicDestination,fetchSource,htmlText,findExcerpt,verifyClaims,SOURCE_LIMITS} from '../src/source-fetch.js';
import {claim,venue} from '../../chrome-sidebar/src/restaurant-data.js';
test('only public HTTPS pages are read, redirects are checked again and bounded, and bodies are capped',async()=>{
  for(const url of ['http://example.com','https://127.0.0.1/x','https://10.0.0.5/x','https://intranet.local/x','https://user:pw@example.com','https://[::1]/x','https://192.168.1.1/'])assert.equal(publicDestination(url),null,url);
  assert.equal(publicDestination('https://guide.michelin.com/us/en/x?utm=1#frag'),'https://guide.michelin.com/us/en/x?utm=1');
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);
    if(url==='https://a.example.com/')return new Response('',{status:302,headers:{location:'https://b.example.com/'}});
    if(url==='https://b.example.com/')return new Response('',{status:302,headers:{location:'https://127.0.0.1/'}});
    if(url==='https://loop.example.com/')return new Response('',{status:302,headers:{location:'https://loop.example.com/'}});
    if(url==='https://big.example.com/')return new Response('x'.repeat(SOURCE_LIMITS.bytes+10),{status:200,headers:{'content-type':'text/plain'}});
    if(url==='https://pdf.example.com/')return new Response('%PDF',{status:200,headers:{'content-type':'application/pdf'}});
    return new Response('<p>Hello &amp; welcome</p>',{status:200,headers:{'content-type':'text/html'}});
  };
  const chained=await fetchSource('https://a.example.com/',{fetcher});
  assert.equal(chained.status,'failed');assert.match(chained.reason,/not public/);
  const loop=await fetchSource('https://loop.example.com/',{fetcher});
  assert.equal(loop.status,'failed');assert.match(loop.reason,/Too many redirects/);
  assert.equal(calls.filter(u=>u==='https://loop.example.com/').length,SOURCE_LIMITS.redirects+1);
  const big=await fetchSource('https://big.example.com/',{fetcher});
  assert.equal(big.status,'ok');assert.ok(big.text.length<=400000);
  assert.equal((await fetchSource('https://pdf.example.com/',{fetcher})).status,'failed');
  const ok=await fetchSource('https://ok.example.com/',{fetcher});
  assert.equal(ok.text,'Hello & welcome');
  assert.equal((await fetchSource('https://127.0.0.1/',{fetcher})).status,'refused');
});
test('the words of a page, and whether the quoted passage is among them with its figure',()=>{
  const {title,text}=htmlText('<html><head><title>Guide &ndash; Example</title><script>x()</script></head><body><nav>Menu</nav><h1>Example Bistro</h1><p>Awarded two MICHELIN Stars in the <b>2030</b> guide.</p></body></html>');
  assert.equal(title,'Guide – Example');assert.match(text,/Menu\nExample Bistro\nAwarded two MICHELIN Stars in the 2030 guide\./);
  assert.equal(findExcerpt(text,'awarded two Michelin stars in the 2030 guide',{value:2,name:'Example Bistro'}).found,true);
  assert.equal(findExcerpt(text,'awarded two Michelin stars in the 2030 guide',{value:3,name:'Example Bistro'}).found,false);
  assert.equal(findExcerpt(text,'awarded two Michelin stars in the 2030 guide',{value:2,name:'Other Place'}).found,false);
  assert.match(findExcerpt(text,'two stars',{}).reason,/too short/);
  assert.equal(findExcerpt(text,'the chef trained at a three star kitchen in Lyon for years',{}).found,false);
});
test('claims are read against at most eight sources, and every outcome is named',async()=>{
  const venues=Array.from({length:10},(_,i)=>venue({name:`Place ${i}`,address:`${i} St`,claims:[claim({field:'michelin_stars',value:1,status:'unknown',source:{url:`https://guide.example.com/${i}`},excerpt:`Place ${i} holds one Michelin star in the current guide edition`})]}));
  const fetched=[];
  const fetcher=async url=>{fetched.push(url);const i=Number(url.split('/').pop());return new Response(i%2?`<p>Place ${i} holds one Michelin star in the current guide edition.</p>`:'<p>Nothing here.</p>',{status:200,headers:{'content-type':'text/html'}});};
  const result=await verifyClaims(venues,{fetcher});
  assert.equal(result.fetches,8);assert.equal(fetched.length,8);
  assert.deepEqual(venues.slice(0,8).map(v=>v.claims[0].status),['unknown','supported','unknown','supported','unknown','supported','unknown','supported']);
  assert.match(venues[8].claims[0].reason,/budget/);
  assert.match(venues[0].claims[0].reason,/not found/);
});
