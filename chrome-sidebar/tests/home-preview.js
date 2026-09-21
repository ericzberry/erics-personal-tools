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
// Days as `weatherDay` works them out, handed in already worked out, the way
// every look after the first of the day reads them back.
const weatherDay=(extra={})=>({day:'2026-09-20',date:'2026-09-20',place:'Synthetic Heights',low:59,high:70,coldest:60,sky:'cloudy',layer:'light',dress:'Bring a light jacket',rain:'',snow:'',...extra});
const weatherOf=day=>({saved:async()=>day,today:async()=>{if(!day)throw Error('The forecast is unavailable.');return day;}});
const rainy=weatherDay({sky:'rain',rain:'2–5 PM'});
const states=[
  ['One today, three inside the fortnight, three before the quarter closes; a light jacket and an umbrella',rainy,of([
    maisie,
    {kind:'Birthday',title:'Derek’s birthday',subject:'Next door',date:'1985-09-24',every:12,since:'1985'},
    {kind:'Birthday',title:'Ashley',date:'1990-09-28',every:12},
    {kind:'Birthday',title:'Rosalind Abernathy-Whitcombe’s birthday',subject:'Ashley’s mother, Wellington',date:'1952-10-03',every:12,since:'1952'},
    // Neither of these belongs on this screen: one is past the fortnight, the
    // other is not a birthday.
    {kind:'Birthday',title:'Rune',date:'1979-10-05',every:12},
    {kind:'Service',title:'Furnace filter',date:'2026-06-25',every:3}
  ]),wallet,connected],
  ['Two today and nothing after; a sweater, and no place named',weatherDay({place:'',low:63,high:77,coldest:64,sky:'partly',layer:'sweater',dress:'Wear a sweater, no jacket'}),of([maisie,{kind:'Birthday',title:'Tobias',date:'2001-09-20',every:12}]),[],connected],
  ['Nobody today, and money about to reset; a windy cold day with snow in the afternoon',weatherDay({place:'Bartholomew-on-the-Marsh Heights',low:24,high:33,coldest:12,sky:'snow',layer:'heavy',dress:'Bring a heavy jacket',snow:'1–4 PM'}),of([{kind:'Birthday',title:'Derek’s birthday',date:'1985-10-02',every:12,since:'1985'}]),wallet,connected],
  ['More credits than a glance holds; a warm, clear day',weatherDay({low:74,high:88,coldest:75,sky:'clear',layer:'none',dress:'No jacket or sweater'}),[],many,connected],
  ['Nothing but the weather: a grey, foggy morning',weatherDay({low:55,high:63,coldest:54,sky:'fog'}),[],[],connected],
  ['Nothing but the weather: storms twice',weatherDay({low:71,high:84,coldest:72,sky:'storm',layer:'none',dress:'No jacket or sweater',rain:'8–10 AM and 4–6 PM'}),[],[],connected],
  ['Nothing in the fortnight, nothing in the wallet; no forecast to be had',null,of([{kind:'Birthday',title:'Rune',date:'1979-12-05',every:12}]),[],connected],
  ['Not connected',rainy,[],[],{get:async()=>''}]
];
const root=document.getElementById('home-states');
for(const [label,weather,records,rewards,credentials] of states){
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
  mountHome(host.querySelector('#home-birthdays'),{credentials,reminders:store(records),rewards:store(rewards),weather:weatherOf(weather),today});
}
