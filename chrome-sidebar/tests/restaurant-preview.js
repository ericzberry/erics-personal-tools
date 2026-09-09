// Test-only integration harness. No network, provider credentials, or real inventory.
const tabs=new Map();let counter=0;
const restaurant={id:'1',name:'Example Bistro',address:'100 Example Street, New York, NY',city:'New York City',borough:'Manhattan',neighborhood:'Upper West Side',travel:'included',reason:'Synthetic example: two Michelin stars in a fictional guide. This is not a real restaurant recommendation.',evidence:[{title:'Synthetic rating source',url:'https://example.com/guide',detail:'Two stars · fictional test data',published:'2030 fixture'}],booking:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/example-bistro'}]};
globalThis.chrome={
  runtime:{id:'preview',sendMessage:async message=>{
    if(message.action==='list')return {ok:true,connections:[{id:'00000000-0000-0000-0000-000000000000',name:'Synthetic connection · no real API calls',provider:'openai',hasApiKey:true}]};
    if(message.action==='restaurants')return {ok:true,restaurants:[restaurant],summary:'SYNTHETIC DEMO — no real availability or web research.',clarification:message.search.query==='Example Bistro'?'':'Did you mean Example Bistro on the Upper West Side? Select it below.',excluded:0,unverified:0};
    if(message.action==='generate')return {ok:true,text:JSON.stringify({status:'attention',detail:'Synthetic login challenge. Open the page to continue.',slots:[]})};
    throw Error('Unexpected preview action');
  }},
  storage:{local:{get:async()=>({}),set:async()=>{}}},
  tabs:{create:async({url})=>{const tab={id:++counter,url,status:'complete',windowId:1};tabs.set(tab.id,tab);return tab;},get:async id=>{if(!tabs.has(id))throw Error('Tab closed');return tabs.get(id);},remove:async id=>tabs.delete(id),update:async(id,value)=>Object.assign(tabs.get(id),value)},
  windows:{update:async()=>{}},
  scripting:{executeScript:async({target})=>{
    const url=tabs.get(target.tabId).url,size=Number(new URL(url).searchParams.get('seats')),date=new URL(url).searchParams.get('date');
    const controls=[{tag:'select',label:'Guests',text:`${size} Guests`,value:String(size)},{tag:'button',label:'Date',text:date}];
    if(size===2||size===4)controls.push({tag:'button',text:'6:30 PM · Dining Room',disabled:false},{tag:'button',text:'8:00 PM · Bar',disabled:false});
    return [{result:{url,heading:restaurant.name,text:size===3?'Complete verification before viewing reservation availability.':`Sorry, we don't currently have any tables available for ${size}.`,controls,capturedAt:new Date().toISOString()}}];
  }}
};
await import('../src/restaurant-page.js');
