// Anonymized ESPN fixture replay. Not included in releases.
import {mergeSnapshot,sessionKey} from '../src/draft-state.js';
const html=await (await fetch('tests/fixtures/espn-practice.html')).text();
const captured=new DOMParser().parseFromString(html,'text/html');
const snapshot=EspnDraftReader.read(captured,'https://fantasy.espn.com/football/draft?leagueId=1998678762&seasonId=2026&teamId=8');
snapshot.picks=snapshot.picks.slice(0,15);snapshot.state='drafting';snapshot.onClock=16;
const session=mergeSnapshot(null,snapshot,Date.now(),1);const sessions={[sessionKey(session)]:session};
const listeners=[];
const saved={draftSessions:sessions};
window.chrome={storage:{local:{get:async()=>structuredClone(saved),set:async values=>{Object.assign(saved,values);for(const listener of listeners)listener(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{newValue:v}])), 'local');}},onChanged:{addListener:fn=>listeners.push(fn)}}};
await import('../src/app.js');
setInterval(()=>{session.lastSeenAt=Date.now();for(const listener of listeners)listener({draftSessions:{newValue:sessions}},'local');},5000);
