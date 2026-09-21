import {Stack,Section,Strong,Note,GroupTitle,Glyph,Label} from './ui.js';
import {duePhrase,reminderAge,dueDay} from '../reminder-data.js';
import {formatAmount} from '../credit-data.js';
import {rangeLabel,feelsLabel} from '../weather-data.js';

// The home screen's glance. It opens on the day itself — what the sky will do,
// what to wear, and whether to take an umbrella — and then three runs, because
// they answer three different questions: whose birthday it is today, which is the only day
// anything can be done about it; whose is coming inside the fortnight, which
// is how long there is to do something about that one; and what money is
// sitting on a card that stops being spendable when the quarter closes.
//
// Today's birthdays are the one record on the screen that is about today, so
// they are the one thing given a surface. Every group is empty markup until a
// controller fills it, and a group with nothing in it is hidden rather than
// headed — an empty "Birthdays today" would be a heading over the fact that it
// is nobody's.
export const HomeGlance=()=>Stack([
  Section([Stack([],{id:'home-weather'})],{className:'home-group home-group--weather',hidden:true,'aria-label':'Today’s weather'}),
  Section([GroupTitle('Birthdays today'),Stack([],{id:'home-today'})],{className:'home-group home-group--today',hidden:true}),
  Section([GroupTitle('Next two weeks'),Stack([],{id:'home-upcoming'})],{className:'home-group home-group--upcoming',hidden:true}),
  Section([GroupTitle('Use this quarter'),Stack([],{id:'home-quarter'})],{className:'home-group home-group--quarter',hidden:true})
],{className:'home-glance'});

// What is worth saying beside a name. Today's row says nothing about when,
// because the heading over it already did; every other row says how long there
// is and which day that lands on, since one week out there are two Thursdays.
// An age is shown only where somebody recorded the year — a birthday with no
// year has no age, and never grows one here.
export function birthdayDetail(record){
  const age=reminderAge(record);
  return [record.days?`${duePhrase(record)} · ${dueDay(record.due,{weekday:true})}`:'',record.subject,age?`turns ${age}`:'']
    .filter(Boolean).join(' · ');
}
// What is worth saying beside a credit: the money first, because it is what put
// the credit on this screen and what the run is ordered by, then the card it
// sits on and how long there is left to spend it. A credit nobody has enrolled
// in says so — it is the one of these that cannot be used without doing
// something else first.
export function creditDetail(credit){
  return [`${formatAmount(credit.worth)}${credit.remaining?' left':''}`,credit.source,duePhrase(credit),
    credit.state==='activation'?'needs enrollment':''].filter(Boolean).join(' · ');
}
const GlanceRow=(title,detail)=>Section([Strong(title),...(detail?[Note(detail)]:[])],{className:'home-row'});

// A glance holds what can be taken in at once. Past that, the wallet is where
// they are read, so the rest are counted rather than listed: how many, and what
// they come to, which is the only thing a cut-off run would lose.
const QUARTER_ROWS=6;
const fill=(root,id,rows,any=rows.length)=>{
  const list=root.querySelector(`#${id}`);
  if(!list)return;
  list.replaceChildren(...rows);
  list.closest('.home-group').hidden=!any;
};
// The sky, on the 24px grid and 1.5px stroke every glyph here is drawn on. It
// is the one picture on the home screen because it is information: what the
// day looks like, before a word of it is read. The cloud sits lower on its own
// and higher over whatever falls from it.
const cloud=base=>`M6.5 ${base}H17a3.5 3.5 0 0 0 0-7 4.6 4.6 0 0 0-9-1 4 4 0 0 0-1.5 8Z`;
export const SKIES={
  clear:{label:'Sunny',icon:'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7Z M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4'},
  partly:{label:'Partly cloudy',icon:'M11 8a3 3 0 1 0-3 3 M8 2.5V4 M2.5 8H4 M4.1 4.1l1.1 1.1 M11.9 4.1l-1.1 1.1 M4.1 11.9l1.1-1.1 M11 20h6.5a3 3 0 0 0 0-6 4 4 0 0 0-7.6-.6A3.3 3.3 0 0 0 11 20Z'},
  cloudy:{label:'Cloudy',icon:cloud(18)},
  fog:{label:'Fog',icon:`${cloud(14)} M5 18h14 M7 21h10`},
  rain:{label:'Rain',icon:`${cloud(15)} M8.5 18l-1 2.5 M12.5 18l-1 2.5 M16.5 18l-1 2.5`},
  storm:{label:'Storms',icon:`${cloud(15)} M12.5 17l-2 3h3l-2 3`},
  snow:{label:'Snow',icon:`${cloud(15)} M8.5 19h.01 M12.5 19h.01 M16.5 19h.01 M10.5 22h.01 M14.5 22h.01`}
};
// One piece of advice, and when it applies where that is not the whole day.
const Advice=(text,when)=>Stack([Strong(text),when?Label(` · ${when}`,{className:'home-weather-when'}):null],{className:'home-weather-advice'});
// The day's weather is one reading, not a run of records: the sky, the range
// in the serif the product keeps for its figures, what the sky does and where
// beside it, and what to wear hung underneath. It has no heading and no rules
// between its lines — a sky and a pair of temperatures say what they are, and
// nothing in it is a list. The sky is not named in words on a wet day: the
// umbrella's line already says rain, and when.
export const HomeWeather=day=>{
  const sky=SKIES[day.sky];
  const meta=[day.rain||day.snow?'':sky?.label,feelsLabel(day),day.place].filter(Boolean).join(' · ');
  return Stack([
    Stack(sky?[Glyph(sky.icon,{size:28})]:[],{className:`home-weather-sky home-weather-sky--${sky?day.sky:'unknown'}`}),
    Stack([
      Stack([Label(rangeLabel(day),{className:'home-weather-range'}),meta?Label(meta,{className:'home-weather-meta'}):null],{className:'home-weather-reading'}),
      day.dress?Advice(day.dress,day.snow?`snow likely ${day.snow}`:''):null,
      day.rain?Advice('Bring an umbrella',`${day.sky==='storm'?'storms':'rain'} likely ${day.rain}`):null
    ],{className:'home-weather-body'})
  ],{className:'home-weather'});
};
export function setHomeWeather(root,day){
  const holder=root.querySelector('#home-weather');
  if(!holder)return;
  const shown=!!(day&&(rangeLabel(day)||day.dress||day.rain));
  holder.replaceChildren(...(shown?[HomeWeather(day)]:[]));
  holder.closest('.home-group').hidden=!shown;
}
export function setHomeGlance(root,{today=[],upcoming=[],credits=[]}={}){
  fill(root,'home-today',today.map(record=>GlanceRow(record.title,birthdayDetail(record))));
  fill(root,'home-upcoming',upcoming.map(record=>GlanceRow(record.title,birthdayDetail(record))));
  const rest=credits.slice(QUARTER_ROWS);
  fill(root,'home-quarter',[...credits.slice(0,QUARTER_ROWS).map(credit=>GlanceRow(credit.name,creditDetail(credit))),
    ...(rest.length?[Note(`${rest.length} more · ${formatAmount(rest.reduce((sum,credit)=>sum+credit.worth,0))}`,{className:'footnote home-more'})]:[])],credits.length);
}
