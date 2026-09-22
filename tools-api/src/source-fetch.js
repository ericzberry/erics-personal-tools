// Reading a source (docs/RESTAURANT_SEARCH_SPEC.md §9.4): HTTPS only, a public
// host, each redirect checked again, three at most, ten seconds, one megabyte,
// eight fetches per stage. What comes back is untrusted text, returned apart
// from anything a model says about it, and it carries no credential of ours.
import {safePublicURL} from '../../chrome-sidebar/src/public-url.js';
export const SOURCE_LIMITS=Object.freeze({fetchesPerStage:8,timeoutMs:10000,bytes:1000000,redirects:3,quoteWords:6});
const PRIVATE_HOST=/(?:^|\.)(localhost|local|internal|test|invalid|lan|home|corp|localdomain)$|^(?:10|127|0)\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\.|^169\.254\.|^\[?::1\]?$|^\[?fc|^\[?fd|^\[?fe80/i;
export function publicDestination(url){
  const safe=safePublicURL(url);if(!safe)return null;
  const host=new URL(safe).hostname;
  if(PRIVATE_HOST.test(host)||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':'))return null;
  return safe;
}
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:'’',nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',mdash:'—',ndash:'–',hellip:'…',eacute:'é',egrave:'è',agrave:'à',ccedil:'ç',uuml:'ü',ouml:'ö',auml:'ä',ntilde:'ñ'};
const decode=text=>text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,code)=>{
  if(code[0]==='#')return String.fromCodePoint(code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10))||'';
  return ENTITIES[code.toLowerCase()]??all;
});
// The words of a page, with what was never words removed.
export function htmlText(html){
  const source=String(html||'');
  const title=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1]||'';
  const text=source.replace(/<!--[\s\S]*?-->/g,' ').replace(/<head\b[\s\S]*?<\/head>/i,' ').replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi,' ').replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer|nav|main|aside|dd|dt|blockquote|table|ul|ol|figure|figcaption)>/gi,'\n').replace(/<[^>]+>/g,' ');
  return {title:decode(title).replace(/\s+/g,' ').trim().slice(0,150),text:decode(text).replace(/[ \t ]+/g,' ').replace(/\s*\n\s*/g,'\n').trim()};
}
export async function fetchSource(url,{fetcher=fetch,now=()=>new Date().toISOString()}={}){
  let target=publicDestination(url);
  if(!target)return {url,finalURL:'',status:'refused',text:'',title:'',retrievedAt:now(),reason:'Not a public HTTPS address.'};
  for(let hop=0;hop<=SOURCE_LIMITS.redirects;hop++){
    let response;
    try{response=await fetcher(target,{method:'GET',redirect:'manual',headers:{Accept:'text/html,text/plain;q=0.9,*/*;q=0.1','User-Agent':'Mozilla/5.0 (compatible; erics-tools-research/2; +https://tools.ezberry.net)'},signal:AbortSignal.timeout(SOURCE_LIMITS.timeoutMs)});}
    catch(error){return {url,finalURL:target,status:'failed',text:'',title:'',retrievedAt:now(),reason:error.name==='TimeoutError'||error.name==='AbortError'?'The source took longer than 10 seconds.':'The source could not be reached.'};}
    if(response.status>=300&&response.status<400){
      await response.body?.cancel().catch(()=>{});
      const next=publicDestination(new URL(response.headers.get('location')||'',target).href);
      if(!next||hop===SOURCE_LIMITS.redirects)return {url,finalURL:target,status:'failed',text:'',title:'',retrievedAt:now(),reason:next?'Too many redirects.':'Redirected to an address that is not public.'};
      target=next;continue;
    }
    if(!response.ok){await response.body?.cancel().catch(()=>{});return {url,finalURL:target,status:response.status===401||response.status===403||response.status===402?'inaccessible':'failed',text:'',title:'',retrievedAt:now(),reason:`The source answered HTTP ${response.status}.`};}
    const type=(response.headers.get('content-type')||'').toLowerCase();
    if(!/text\/html|text\/plain|application\/xhtml|application\/json/.test(type)){await response.body?.cancel().catch(()=>{});return {url,finalURL:target,status:'failed',text:'',title:'',retrievedAt:now(),reason:'The source is not a readable page.'};}
    const reader=response.body?.getReader();
    if(!reader)return {url,finalURL:target,status:'failed',text:'',title:'',retrievedAt:now(),reason:'The source returned nothing.'};
    const decoder=new TextDecoder();let size=0,raw='';
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>SOURCE_LIMITS.bytes){await reader.cancel().catch(()=>{});break;}raw+=decoder.decode(value,{stream:true});}
    raw+=decoder.decode();
    const {title,text}=/html|xhtml/.test(type)?htmlText(raw):{title:'',text:raw};
    return {url,finalURL:target,status:'ok',text:text.slice(0,400000),title,retrievedAt:now(),reason:''};
  }
  return {url,finalURL:target,status:'failed',text:'',title:'',retrievedAt:now(),reason:'Too many redirects.'};
}
const tokens=text=>String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9.]+/g,' ').replace(/(?<=\d)\.(?!\d)|(?<!\d)\./g,' ').split(/\s+/).filter(Boolean);
const NUMBER_WORDS={one:'1',two:'2',three:'3',four:'4',five:'5'};
// Whether the page says what the claim quotes. Most of the quote's words must
// appear in order inside a short stretch of the page — a model paraphrases —
// and the number a numerical claim rests on must be in that stretch.
export function findExcerpt(text,quote,{value=null,name=''}={}){
  const page=tokens(text),wanted=tokens(quote).map(t=>NUMBER_WORDS[t]||t);
  if(wanted.length<SOURCE_LIMITS.quoteWords)return {found:false,excerpt:'',reason:'The quoted passage is too short to check.'};
  let best={hits:0,start:0,end:0};
  for(let start=0;start<page.length;start++){
    if(page[start]!==wanted[0])continue;
    let hits=0,at=start;
    for(const word of wanted){
      const limit=Math.min(page.length,start+Math.ceil(wanted.length*1.6)+4);
      let found=-1;for(let i=at;i<limit;i++)if(page[i]===word){found=i;break;}
      if(found>=0){hits++;at=found+1;}
    }
    if(hits>best.hits)best={hits,start,end:at};
    if(hits===wanted.length)break;
  }
  const ratio=best.hits/wanted.length;
  if(ratio<0.8)return {found:false,excerpt:'',reason:'The quoted passage was not found on the source page.'};
  const window=page.slice(Math.max(0,best.start-12),Math.min(page.length,best.end+12));
  if(value!==null&&value!==undefined&&typeof value!=='object'&&typeof value!=='boolean'){
    const needle=String(value).toLowerCase();
    if(!window.some(t=>(NUMBER_WORDS[t]||t)===needle))return {found:false,excerpt:'',reason:`The source passage does not state ${value}.`};
  }
  if(name){
    const nameTokens=tokens(name).filter(t=>t.length>2);
    const near=page.slice(Math.max(0,best.start-80),Math.min(page.length,best.end+80));
    if(nameTokens.length&&!nameTokens.some(t=>near.includes(t)))return {found:false,excerpt:'',reason:'The passage is not attributed to this restaurant on the page.'};
  }
  return {found:true,excerpt:window.join(' ').slice(0,500),reason:''};
}
// Every claim that quotes a source is read against that source (§5.1). Eight
// pages at most per stage; a claim whose page was not among them stays a lead.
export async function verifyClaims(candidates,{fetcher=fetch,limit=SOURCE_LIMITS.fetchesPerStage,now=()=>new Date().toISOString(),expiry=7*86400000}={}){
  const pages=new Map();let fetches=0;
  const order=[...new Set(candidates.flatMap(v=>v.claims.filter(c=>c.status==='unknown'&&c.excerpt&&c.source.url).map(c=>c.source.url)))];
  const results=[];
  for(const url of order.slice(0,limit)){fetches++;pages.set(url,await fetchSource(url,{fetcher,now}));}
  for(const venue of candidates)for(const c of venue.claims){
    if(c.status!=='unknown'||!c.excerpt||!c.source.url)continue;
    const page=pages.get(c.source.url);
    if(!page){c.reason='Not read: the source budget for this search was used up.';continue;}
    if(page.status!=='ok'){c.reason=`${page.status==='inaccessible'?'The source is not accessible':'The source could not be read'}: ${page.reason}`;c.retrievedAt=page.retrievedAt;continue;}
    const check=findExcerpt(page.text,c.excerpt,{value:typeof c.value==='object'?null:c.value,name:venue.name});
    c.retrievedAt=page.retrievedAt;
    if(!c.source.title&&page.title)c.source.title=page.title;
    if(check.found){c.status='supported';c.excerpt=check.excerpt;c.reason='';c.extractor='source-read';c.expiresAt=new Date(Date.parse(page.retrievedAt)+expiry).toISOString();}
    else{c.reason=check.reason;c.excerpt=c.excerpt.slice(0,200);}
    results.push({venue:venue.id,field:c.field,status:c.status});
  }
  return {fetches,results,sources:[...pages.values()].map(p=>({url:p.url,status:p.status,reason:p.reason}))};
}
