import {Stack,Section,Strong,Note,GroupTitle} from './ui.js';
import {duePhrase,reminderAge,dueDay} from '../reminder-data.js';
import {formatAmount} from '../credit-data.js';
import {rangeLabel} from '../weather-data.js';

// The home screen's glance. It opens on the day itself — what to wear, and
// whether to take an umbrella — and then three runs, because they answer three
// different questions: whose birthday it is today, which is the only day
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
  Section([GroupTitle('Today',{id:'home-weather-title'}),Stack([],{id:'home-weather'})],{className:'home-group home-group--weather',hidden:true}),
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
// The day's advice leads its row and the numbers it was decided on sit under
// it. An umbrella is a row of its own, with the hours it is for; snow needs no
// umbrella, so its hours ride under the jacket instead.
export function setHomeWeather(root,day){
  const rows=day?.dress?[GlanceRow(day.dress,[rangeLabel(day),day.snow?`snow likely ${day.snow}`:''].filter(Boolean).join(' · '))]:[];
  if(day?.rain)rows.push(GlanceRow('Bring an umbrella',`Rain likely ${day.rain}`));
  const title=root.querySelector('#home-weather-title');
  if(title)title.textContent=day?.place?`Today in ${day.place}`:'Today';
  fill(root,'home-weather',rows);
}
export function setHomeGlance(root,{today=[],upcoming=[],credits=[]}={}){
  fill(root,'home-today',today.map(record=>GlanceRow(record.title,birthdayDetail(record))));
  fill(root,'home-upcoming',upcoming.map(record=>GlanceRow(record.title,birthdayDetail(record))));
  const rest=credits.slice(QUARTER_ROWS);
  fill(root,'home-quarter',[...credits.slice(0,QUARTER_ROWS).map(credit=>GlanceRow(credit.name,creditDetail(credit))),
    ...(rest.length?[Note(`${rest.length} more · ${formatAmount(rest.reduce((sum,credit)=>sum+credit.worth,0))}`,{className:'footnote home-more'})]:[])],credits.length);
}
