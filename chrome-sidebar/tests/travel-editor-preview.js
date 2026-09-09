// Local synthetic integration fixture. Not copied into release builds.
const storageKey='travel-editor-preview-records';
const initial=[{id:'11111111-1111-4111-8111-111111111111',revision:'first',name:'Synthetic airline',category:'Airline',traveler:'Test traveler',number:'001234567',notes:'',expires:''}];
const records=()=>JSON.parse(localStorage.getItem(storageKey)||JSON.stringify(initial));
const realFetch=window.fetch.bind(window);
window.fetch=async(url,options={})=>{
  const path=new URL(url,location.href).pathname;
  if(!path.startsWith('/v1/travel'))return realFetch(url,options);
  if(path.endsWith('/snapshot'))return Response.json({records:records()});
  const id=path.split('/').at(-1),value=JSON.parse(options.body||'{}');
  const current=records(),previous=current.find(record=>record.id===id);
  if((previous?.revision??null)!==(value.revision??null))return Response.json({}, {status:409});
  const record={...previous,...value,id,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
  localStorage.setItem(storageKey,JSON.stringify([...current.filter(record=>record.id!==id),...(options.method==='DELETE'?[]:[record])]));
  return Response.json({record});
};
window.chrome={
  runtime:{getURL:path=>new URL('travel-editor-preview.html'+path.slice(path.indexOf('?')),location.href).href},
  tabs:{create:async({url})=>window.open(url,'_blank')},
  storage:{local:{get:async key=>({[key]:{token:'synthetic-editor-preview-token-at-least-32-characters'}})},onChanged:{addListener(){}}}
};
await import('../src/travel-page.js');
