import {travelChanges} from './travel-changes.js';
import {mountRewards} from './rewards-tool.js';
import {rewardsOffline} from './rewards-offline.js';
import {programsOffline} from './program-offline.js';
import {cardsOffline} from './cards-offline.js';
import {loadRewards} from './rewards-sync.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
import {showRewards,onNavigate} from './navigation.js';
import {readOpenAccountPage} from './finance-page-read.js';
const storage=globalThis.chrome?.storage?.local;
const credentials={get:async()=>storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':''};
const offline=rewardsOffline({remote:async(token,path,options)=>{
  if(!options?.method&&storage)return loadRewards(storage,(action,data)=>cloudRequest(token,path,action==='rewards-save'?{method:'PUT',value:data}:{}));
  return cloudRequest(token,path,options);
}});
const programs=programsOffline();
// The Best card store, so a rate read off a card's own page lands on the card
// the terms belong to. The wallet touches it only when a reading returns a
// rate; the same adapter and the same lock serve Best card itself.
const cards=cardsOffline();
const root=document.getElementById('rewards-root');
const changes=travelChanges(()=>rewardsTool.refresh({quiet:true}),{resource:'rewards'});
window.addEventListener('pagehide',()=>changes.close(),{once:true});
// The page beside the panel is the sidebar's to read; a full tab has no such
// page, and neither has the phone, so neither is given one.
const readPage=globalThis.chrome?.scripting&&document.getElementById('rewards-tool')?()=>readOpenAccountPage():null;
export const rewardsTool=mountRewards(root,{credentials,offline,programs,readPage,cards,remote:cloudRequest,onChanged:()=>changes.publish(),onSettings:()=>document.getElementById('open-settings')?document.getElementById('open-settings').click():location.assign('settings.html')});
// The sidebar owns the page heading and return navigation.
root.querySelector('h1').hidden=!!document.getElementById('close-rewards');
document.getElementById('close-rewards')?.addEventListener('click',()=>showRewards(false));
// The wallet loads when the panel arrives on it, by whichever route brought it
// there. Its own menu row used to be the only one that loaded it, and it is not
// the only way in: the strip under the header offers "Read your Bonvoy balance"
// beside a program's own site, and lands here — where a wallet that never
// loaded has every control in it disabled, so the reading the strip had just
// offered did nothing when it was pressed, and said nothing either. Only the
// arrival loads it: the panel renders again on every poll of the tab beside it,
// and loading on each of those would be a request a second.
let onScreen=false;
onNavigate(capability=>{
  const arrived=capability==='rewards'&&!onScreen;
  onScreen=capability==='rewards';
  if(arrived)rewardsTool.refresh({quiet:true});
});
if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY]){rewardsTool.clear();rewardsTool.refresh();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!document.getElementById('rewards-tool')?.hidden)rewardsTool.refresh({quiet:true});});

if(!document.getElementById('close-rewards'))rewardsTool.refresh();
