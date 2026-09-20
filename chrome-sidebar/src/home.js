import {BirthdaysView,setBirthdays} from './components/home.js';
import {birthdaysAhead,localDate} from './reminder-data.js';

// Whose birthday it is, on the screen both hosts open on.
//
// It reads the same reminders store the tool reads and writes nothing, so
// there is no action here, no status line and no error to report: a home
// screen that cannot reach the records shows the home screen it always showed,
// and the Reminders tool is where a connection problem is said out loud. That
// is also why this never asks for a connection — nothing is missing to anyone
// who has not made one.
//
// The records are the device's own copies, so a phone with no signal still
// knows whose birthday it is.
export function mountHomeBirthdays(root,{credentials,offline,today=localDate}={}){
  if(!root)return null;
  root.replaceChildren(BirthdaysView());
  let generation=0;
  const clear=()=>{generation++;setBirthdays(root,{});};
  async function refresh(){
    const current=++generation;
    try{
      const token=await credentials.get();
      if(!token){if(current===generation)setBirthdays(root,{});return;}
      const {records=[]}=await offline.request(token,'/v1/reminders');
      if(current!==generation)return;
      setBirthdays(root,birthdaysAhead(records,{today:today()}));
    }catch{if(current===generation)setBirthdays(root,{});}
  }
  refresh();
  // Coming back to the app is when the day may have turned over, which is the
  // one thing that changes this list without anybody editing a record.
  globalThis.addEventListener?.('online',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear};
}
