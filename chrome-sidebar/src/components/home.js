import {Stack,Section,Strong,Note,GroupTitle} from './ui.js';
import {duePhrase,reminderAge,dueDay} from '../reminder-data.js';

// The birthdays on a home screen. Two runs, because they are answers to two
// different questions: whose birthday it is today, which is the only day
// anything can be done about it, and whose is coming inside the fortnight,
// which is how long there is to do something about that one.
//
// Today's run is the one thing on the screen that is about today, so it is the
// one thing given a surface. Both are empty markup until a controller fills
// them, and a run with nothing in it is hidden rather than headed — an empty
// "Birthdays today" would be a heading over the fact that it is nobody's.
export const BirthdaysView=()=>Stack([
  Section([GroupTitle('Birthdays today'),Stack([],{id:'home-today'})],{className:'home-group home-group--today',hidden:true}),
  Section([GroupTitle('Next two weeks'),Stack([],{id:'home-upcoming'})],{className:'home-group home-group--upcoming',hidden:true})
],{className:'home-birthdays'});

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
const BirthdayRow=record=>{
  const detail=birthdayDetail(record);
  return Section([Strong(record.title),...(detail?[Note(detail)]:[])],{className:'home-birthday'});
};

export function setBirthdays(root,{today=[],upcoming=[]}={}){
  for(const [id,rows] of [['home-today',today],['home-upcoming',upcoming]]){
    const list=root.querySelector(`#${id}`);
    if(!list)continue;
    list.replaceChildren(...rows.map(BirthdayRow));
    list.closest('.home-group').hidden=!rows.length;
  }
}
