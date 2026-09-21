// Local synthetic fixture for Subscriptions & renewals: a list of saved
// services, and the states a dropped file leaves behind — read on arrival,
// waiting for a connection, too long for one reading, and not read at all,
// which is an error and must not arrive looking like a success. Not
// copied into release builds. The controller, components and styles are the
// real modules; only the records, the connection list and the file are
// synthetic.
import {mountSubscriptions} from '../src/subscriptions.js';
import {normalizeSubscription} from '../src/subscription-data.js';

const records=[
  {name:'Peloton Membership',account:'Everyday card',amount:49.99,currency:'USD',cycle:'monthly',state:'Active',notice:'14',
   charges:[{on:'2026-07-12',amount:49.99,description:'PELOTON* MEMBERSHIP ONEPELOTON.CO NY',source:'July.pdf'},{on:'2026-08-12',amount:49.99,description:'PELOTON* MEMBERSHIP ONEPELOTON.CO NY',source:'August.pdf'}],
   research:{checked:'2026-09-01',country:'United States',requirements:'',summary:'Two cheaper tiers from the same provider.',options:[
     {name:'Peloton App One',amount:12.99,currency:'USD',cycle:'monthly',url:'https://www.onepeloton.com/app',terms:'No classes on the Bike screen; one user.'}]}},
  {name:'Morgan Stanley Platinum Card membership fee',account:'Amex Platinum',amount:895,currency:'USD',cycle:'unknown',state:'Review',notice:'14',
   charges:[{on:'2025-10-21',amount:895,description:'MEMBERSHIP FEE',source:'YearEndSummary_2025.pdf'}]},
  {name:'Apple One Premier — family plan shared with the house',account:'Everyday card',amount:37.95,currency:'USD',cycle:'monthly',state:'Review',notice:'14',
   charges:[{on:'2026-08-04',amount:37.95,description:'APPLE.COM/BILL 866-712-7753 CA',source:'August.pdf'}],
   notes:'Two charges in the same month; the second may be an app purchase rather than the subscription.'},
  {name:'Hudson Yards Parking',account:'Everyday card',amount:420,currency:'USD',cycle:'quarterly',state:'Canceled',canceledOn:'2026-07-01',notice:'30',charges:[]}
].map((value,index)=>({...normalizeSubscription(value),id:`5000000${index}-0000-4000-8000-00000000000${index}`,revision:'first'}));

const store=list=>{
  let saved=[...list];
  return {
    async request(token,url,options={}){
      if(!options.method)return {records:[...saved],syncMessage:''};
      const id=url.slice('/v1/subscriptions/'.length);
      if(options.method==='DELETE'){saved=saved.filter(entry=>entry.id!==id);return {records:[...saved]};}
      const value={...options.value,revision:'next'};
      saved=saved.some(entry=>entry.id===id)?saved.map(entry=>entry.id===id?value:entry):[...saved,value];
      return {record:value,records:[...saved]};
    },
    async resolve(){return {records:[...saved]};}
  };
};
const credentials={get:async()=>'synthetic-preview-token-at-least-32-characters'};
const vault={unlocked:()=>true,available:()=>true,borrowed:()=>true,lock(){},touch(){},key:async()=>null};
const reading={account:'Amex Platinum',subscriptions:[{name:'Synthetic Stream',currency:'USD',notes:'',charges:[{on:'2026-09-01',amount:15.49,description:'SYNTHETIC STREAM 800-555-0100'}]}]};
const connected=async(token,path)=>path==='/v1/ai-connections'?{connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]}
  :path.endsWith('/subscription-intake')?reading:{};
const unconnected=async(token,path)=>path==='/v1/ai-connections'?{connections:[]}:{};

const root=document.getElementById('subscription-states');
for(const [label,list,remote,after] of [
  ['Saved services · a candidate awaiting review',records,connected,null],
  ['Nothing saved yet',[],connected,null],
  ['A statement read on arrival · what it found is in the list',[],connected,'read'],
  ['No AI connection saved · the file waits with Read',[],unconnected,'read'],
  ['A statement longer than one reading',[],connected,'trimmed'],
  ['A statement that did not read at all',[],connected,'failed']
]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const tool=mountSubscriptions(host,{credentials,offline:store(list),remote,vault});
  await tool.refresh();
    if(after){
    // Driven through the real drop zone, so the status line is the one the
    // reader actually sets: a half-read file warns, a failed one errors.
    const body=after==='failed'?'':`ACME BANK · Statement of account\n${'07/25  MERCHANT NAME 866-000-0000 CA  4.30\n'.repeat(after==='trimmed'?700:40)}`;
    const file=new File([new TextEncoder().encode(body)],after==='failed'?'scan.pdf':'statement.txt',{type:'text/plain'});
    const input=host.querySelector('#subscriptions-file');
    Object.defineProperty(input,'files',{value:[file],configurable:true});
    input.dispatchEvent(new Event('change'));
    await new Promise(resolve=>setTimeout(resolve,50));
  }
}
