import {mountAttention} from '../src/attention.js';
import {mountSubscriptions} from '../src/subscriptions.js';
import {normalizeSubscription} from '../src/subscription-data.js';
const credentials={get:async()=>'synthetic-preview-token-at-least-32-characters'};
const vault={unlocked:()=>true,available:()=>true,borrowed:()=>true,touch(){}};
let failed=false;
let records=[{...normalizeSubscription({name:'Synthetic family streaming subscription with a very long name',currency:'USD',amount:19.99,cycle:'monthly',state:'Active',renewal:'2026-09-20',account:'Everyday card',charges:[{on:'2026-08-20',amount:19.99,description:'SYNTHETIC STREAM',source:'August statement'}]}),id:'one',revision:'first'}];
const store={async request(token,path,options={}){if(failed)throw Error('Synthetic network failure');if(options.method==='DELETE')records=records.filter(r=>r.id!==path.split('/').at(-1));if(options.method==='PUT'){const id=path.split('/').at(-1);records=records.filter(r=>r.id!==id).concat({...normalizeSubscription(options.value),id,revision:crypto.randomUUID()});}return {records};},resolve:async()=>({records})};
const subscriptionsRoot=document.getElementById('subscriptions-preview'),attentionRoot=document.getElementById('attention-preview');
const openSubscriptions=()=>{attentionRoot.hidden=true;subscriptionsRoot.hidden=false;};
const subscriptions=mountSubscriptions(subscriptionsRoot,{credentials,vault,offline:store,remote:async(token,path)=>{
  if(failed)throw Error('Synthetic research failure');
  if(path==='/v1/ai-connections')return {connections:[{id:'test',provider:'openai',name:'Synthetic AI',hasApiKey:true}]};
  if(path.endsWith('/subscription-intake'))return {subscriptions:[{name:'Synthetic cloud storage',currency:'USD',charges:[{on:'2026-08-01',amount:3,description:'SYNTHETIC CLOUD'},{on:'2026-09-01',amount:3,description:'SYNTHETIC CLOUD'}]}]};
  return {research:{checked:'2026-09-14',country:'United States',requirements:'',summary:'Synthetic prices for layout testing.',options:[{name:'Synthetic annual plan',amount:120,currency:'USD',cycle:'annual',url:'https://example.com/pricing',terms:'Pay upfront; no ads. Taxes excluded. Check eligibility.'}]}};
}});
const attention=mountAttention(attentionRoot,{credentials,vault,stores:{subscriptions:store,reminders:{request:async()=>({records:[{id:'birthday',kind:'Birthday',title:'A birthday with gift ideas waiting',date:'2020-09-20',every:12,notice:14}]})}},onOpen:openSubscriptions});
document.getElementById('show-attention').onclick=()=>{subscriptionsRoot.hidden=true;attentionRoot.hidden=false;attention.refresh();};document.getElementById('show-subscriptions').onclick=openSubscriptions;
document.getElementById('empty').onclick=()=>{records=[];subscriptions.refresh();attention.refresh();};document.getElementById('failure').onclick=()=>{failed=!failed;subscriptions.refresh();attention.refresh();};
