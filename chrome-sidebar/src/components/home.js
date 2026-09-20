import {Stack,Section,Strong,Note,GroupTitle} from './ui.js';
import {duePhrase,reminderAge,dueDay} from '../reminder-data.js';
import {formatAmount} from '../credit-data.js';

// The home screen's glance. Three runs, because they answer three different
// questions: whose birthday it is today, which is the only day anything can be
// done about it; whose is coming inside the fortnight, which is how long there
// is to do something about that one; and what money is sitting on a card that
// stops being spendable when the quarter closes.
//
// Today's run is the one thing on the screen that is about today, so it is the
// one thing given a surface, and it stays at the top whatever follows it. All
// three are empty markup until a controller fills them, and a run with nothing
// in it is hidden rather than headed — an empty "Birthdays today" would be a
// heading over the fact that it is nobody's.
export const HomeGlance=()=>Stack([
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
export function setHomeGlance(root,{today=[],upcoming=[],credits=[]}={}){
  fill(root,'home-today',today.map(record=>GlanceRow(record.title,birthdayDetail(record))));
  fill(root,'home-upcoming',upcoming.map(record=>GlanceRow(record.title,birthdayDetail(record))));
  const rest=credits.slice(QUARTER_ROWS);
  fill(root,'home-quarter',[...credits.slice(0,QUARTER_ROWS).map(credit=>GlanceRow(credit.name,creditDetail(credit))),
    ...(rest.length?[Note(`${rest.length} more · ${formatAmount(rest.reduce((sum,credit)=>sum+credit.worth,0))}`,{className:'footnote home-more'})]:[])],credits.length);
}
