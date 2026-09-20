// Local synthetic fixture for the home screen. Not copied into release builds.
// The view, the controller and the styles are the real modules; only the
// records, the wallet, the clock and the connection are synthetic, so the
// states a person actually meets can be inspected at sidebar widths without a
// connection.
import {HomeView} from '../src/components/views.js';
import {mountHome} from '../src/home.js';
import {normalizeReminder} from '../src/reminder-data.js';
const today=()=>'2026-09-20';
const of=records=>records.map((record,index)=>({...normalizeReminder(record),id:`home-${index}`,revision:'first'}));
const store=records=>({async request(){return {records,syncMessage:''};}});
const connected={get:async()=>'synthetic-preview-token-at-least-32-characters'};
const maisie={kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12,since:'2016'};
const credit=(name,source,value,extra={})=>({id:`credit-${name}`,kind:'benefit',name,source,value,state:'available',...extra});
// A quarter's worth of credits as a premium card actually states them: one read
// off the issuer's tracker, one that has to be enrolled in, one with a date of
// its own, and two that are true and not worth interrupting anybody for.
const wallet=[
  credit('Airline fee credit','Synthetic Platinum','$200 airline fee credit',{cadence:'annual',due:'2026-09-30'}),
  credit('Dining credit','Synthetic Gold','$100 dining credit',{cadence:'quarterly',remaining:'$62.50'}),
  credit('Hotel credit','Synthetic Platinum','$300 prepaid hotel credit',{due:'2026-09-25',state:'activation'}),
  credit('Ride credit','Synthetic Platinum','$15 ride credit',{cadence:'monthly'}),
  credit('Fitness credit','Synthetic Platinum','$300 fitness credit',{cadence:'annual'})
];
const many=Array.from({length:9},(unused,index)=>
  credit(`Statement credit ${index+1}`,'Synthetic Platinum',`$${120+index*15} credit`,{cadence:'quarterly'}));
const states=[
  ['One today, three inside the fortnight, three before the quarter closes',of([
    maisie,
    {kind:'Birthday',title:'Derek’s birthday',subject:'Next door',date:'1985-09-24',every:12,since:'1985'},
    {kind:'Birthday',title:'Ashley',date:'1990-09-28',every:12},
    {kind:'Birthday',title:'Rosalind Abernathy-Whitcombe’s birthday',subject:'Ashley’s mother, Wellington',date:'1952-10-03',every:12,since:'1952'},
    // Neither of these belongs on this screen: one is past the fortnight, the
    // other is not a birthday.
    {kind:'Birthday',title:'Rune',date:'1979-10-05',every:12},
    {kind:'Service',title:'Furnace filter',date:'2026-06-25',every:3}
  ]),wallet,connected],
  ['Two today and nothing after',of([maisie,{kind:'Birthday',title:'Tobias',date:'2001-09-20',every:12}]),[],connected],
  ['Nobody today, and money about to reset',of([{kind:'Birthday',title:'Derek’s birthday',date:'1985-10-02',every:12,since:'1985'}]),wallet,connected],
  ['More credits than a glance holds',[],many,connected],
  ['Nothing in the fortnight, nothing in the wallet',of([{kind:'Birthday',title:'Rune',date:'1979-12-05',every:12}]),[],connected],
  ['Not connected',[],[],{get:async()=>''}]
];
const root=document.getElementById('home-states');
for(const [label,records,rewards,credentials] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:20px 0 0;color:#666';
  // The home screen as the panel builds it, so the runs are reviewed with the
  // title and the note they actually sit under.
  const host=HomeView();
  host.hidden=false;
  host.style.cssText='border:1px solid #dedfd5;border-radius:10px;background:#f7f6f2';
  root.append(heading,host);
  // Every state is a whole home screen, so the ids repeat down the page as
  // they do in the reminders fixture. Each controller is handed its own host
  // and looks no further, so each fills its own.
  mountHome(host.querySelector('#home-birthdays'),{credentials,reminders:store(records),rewards:store(rewards),today});
}
