import {mountTrips} from '../src/trips.js';
import {fixture} from './trips-fixture.js';
if(new URLSearchParams(location.search).get('layout')==='page'){document.body.classList.add('workspace-site');document.getElementById('preview').classList.add('workspace-shell');}
const state=new URLSearchParams(location.search).get('state');
let records=state==='empty'?[]:[{...fixture(),id:'11111111-1111-4111-8111-111111111111',revision:'r1'}];
if(state==='login'){records[0].channels=[{id:'amex',label:'Amex Travel',status:'login',nextStep:'Unlock Apple Passwords on your Mac, then tell me it’s ready.',resumeURL:'https://www.americanexpress.com/en-us/travel/'}];}
if(state==='conflict'){records[0].pending=true;records[0].conflict=true;}
if(state==='stale'){records[0].request='A changed request, with a longer itinerary and a different room.';}
mountTrips(document.getElementById('preview'),{research:async({trip,save,signal,onProgress})=>{onProgress('Checking the booking page…');await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return save({...trip,summary:'Search stopped; checkpoint preserved.'});},credentials:{get:async()=>'synthetic-token'},offline:{
  async request(token,path,options={}){
    if(state==='failure'&&options.method)throw Error('Synthetic connection failure. Your changes are still here.');
    if(options.method==='PUT')records=[{...options.value,revision:'r2'},...records.filter(r=>r.id!==options.value.id)];
    if(options.method==='DELETE')records=records.filter(r=>r.id!==options.value.id);
    return {records:structuredClone(records)};
  },
  async resolve(){records[0].conflict=false;records[0].pending=false;return {records:structuredClone(records)};}
}});
