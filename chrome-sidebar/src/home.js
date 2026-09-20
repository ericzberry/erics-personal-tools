import {HomeGlance,setHomeGlance} from './components/home.js';
import {birthdaysAhead,localDate} from './reminder-data.js';
import {creditsThisQuarter} from './rewards-data.js';

// The screen both hosts open on: whose birthday it is, and the money on a card
// that stops being spendable when the quarter closes.
//
// It reads the stores the tools read and writes nothing, so there is no action
// here, no status line and no error to report: a home screen that cannot reach
// one set of records shows the home screen it always showed, and Reminders and
// Rewards are where a connection problem is said out loud. That is also why
// this never asks for a connection — nothing is missing to anyone who has not
// made one. Each store is read on its own, so a wallet that will not open
// still leaves the birthdays where they were.
//
// The records are the device's own copies, so a phone with no signal still
// knows whose birthday it is and what is about to reset.
export function mountHome(root,{credentials,reminders,rewards,today=localDate}={}){
  if(!root)return null;
  root.replaceChildren(HomeGlance());
  let generation=0;
  const clear=()=>{generation++;setHomeGlance(root,{});};
  const read=async(store,token,path,of)=>{
    try{const {records=[]}=await store.request(token,path);return of(records);}catch{return null;}
  };
  async function refresh(){
    const current=++generation;
    let token='';
    try{token=await credentials.get();}catch{token='';}
    if(!token){if(current===generation)setHomeGlance(root,{});return;}
    const day=today();
    const [birthdays,credits]=await Promise.all([
      reminders?read(reminders,token,'/v1/reminders',records=>birthdaysAhead(records,{today:day})):null,
      rewards?read(rewards,token,'/v1/rewards',records=>creditsThisQuarter(records,{now:new Date(`${day}T12:00:00`)})):null
    ]);
    if(current!==generation)return;
    setHomeGlance(root,{...(birthdays||{}),credits:credits||[]});
  }
  refresh();
  // Coming back to the app is when the day may have turned over, which is the
  // one thing that changes these runs without anybody editing a record.
  globalThis.addEventListener?.('online',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear};
}
