// Local synthetic fixture for the purchase advisor. Not copied into release
// builds. The controller, components and styles are the real modules; only the
// cards, the wallet, the catalogues and the reading of the description are
// synthetic.
import {mountPurchaseAdvisor} from '../src/purchase-advisor.js';
import {normalizeCard} from '../src/card-data.js';
const PLATINUM='11111111-1111-4111-8111-111111111111',EVERYDAY='22222222-2222-4222-8222-222222222222';
const cards=[
  {id:PLATINUM,revision:'1',...normalizeCard({name:'Synthetic Platinum Card',unit:'points',base:1,cpp:1.5,checked:'2026-09-20',source:'https://example.com/platinum',
    rules:JSON.stringify([{category:'Online shopping',channel:'Any',rate:3,remaining:null,active:true,end:'',condition:'',merchant:''},
      {category:'Travel',channel:'Issuer portal',rate:5,remaining:null,active:true,end:'',condition:'',merchant:''}])})},
  {id:EVERYDAY,revision:'1',...normalizeCard({name:'Synthetic Everyday Card',unit:'cash',base:2,cpp:1,checked:'2026-06-01',rules:'[]',notes:'2% on everything, no caps.'})}
];
const wallet=[
  {id:'w-plat',kind:'card',name:'Synthetic Platinum Card',source:'Synthetic Bank',value:'5x flights',state:'available'},
  {id:'w-dell',kind:'benefit',name:'Dell credit',source:'Synthetic Platinum Card',value:'$200 per year',remaining:'$150',state:'available',card:'w-plat'},
  {id:'w-uber',kind:'benefit',name:'Uber Cash',source:'Synthetic Platinum Card',value:'$15 per month',remaining:'',state:'activation',card:'w-plat'},
  {id:'w-gold',kind:'card',name:'Synthetic Gold Card',source:'Synthetic Bank',value:'4x dining',state:'available'}
];
const catalogs=[
  {id:'amex-offers',programId:'amex-offers',label:'Amex Offers',offers:[
    {key:'dell-everyday',name:'Dell',category:'Electronics',badge:'',card:'Synthetic Everyday Card (-72005)',summary:'Spend $1,500 or more, get $300 back.',path:'/offers/eligible?account_key=e',dates:'Expires 10/31/2026'},
    {key:'dell-gold',name:'Dell Technologies',category:'Electronics',badge:'Added',card:'Synthetic Gold Card (-31002)',summary:'Spend $250 or more, get $50 back.',path:'/offers/eligible?account_key=g'},
    {key:'uber-plat',name:'Uber',category:'Transit',badge:'Added',card:'Synthetic Platinum Card (-61007)',summary:'Get 10% back, up to $20.',path:'/offers/eligible?account_key=p'}]},
  {id:'ms-reserved',programId:'ms-reserved',label:'Morgan Stanley Reserved',offers:[
    {key:'/offer/dell',name:'Dell',category:'Home',badge:'New',summary:'Save up to 10% off select laptops and monitors.'}]}
];
const store=records=>({saved:async()=>records,request:async()=>({records,syncMessage:''})});
const readings={dell:{merchant:'Dell',category:'Online shopping',channel:'Online',amount:2000,confidence:'high',reason:'A laptop bought from Dell directly.'},
  uber:{merchant:'Uber',category:'Transit',channel:'Direct',amount:12,confidence:'high',reason:'A ride.'},
  vague:{merchant:'',category:'Other',channel:'Direct',amount:null,confidence:'low',reason:'Nothing in the description says what kind of shop this is.'}};
const remote=async(token,path,options)=>{
  await new Promise(resolve=>setTimeout(resolve,300));
  if(path==='/v1/ai-connections')return {connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]};
  const text=options.value.purchase.toLowerCase();
  return text.includes('dell')||text.includes('laptop')?readings.dell:text.includes('uber')?readings.uber:readings.vague;
};
const root=document.getElementById('advisor-states');
for(const [label,options,fill] of [
  ['Connected · Dell laptop for $2,000 (type a description and press Recommend; “uber ride” and “something” are the other readings)',{cards:store(cards),wallet:store(wallet),programs:store(catalogs),remote},'I’m buying a laptop from Dell for $2,000'],
  ['Connected with no cards rated yet',{cards:store([]),wallet:store(wallet),programs:store(catalogs),remote},''],
  ['Not connected',{cards:store(cards),wallet:store(wallet),programs:store(catalogs),remote},'']
]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const credentials={get:async()=>label.startsWith('Not')?'':'synthetic-preview-token-at-least-32-characters'};
  const tool=mountPurchaseAdvisor(host,{credentials,...options});
  if(fill)tool.ready.then(()=>{host.querySelector('#advisor-purchase').value=fill;host.querySelector('#advisor-form').requestSubmit?.();});
}
