// The strip under the header: what these tools can do with the page in front of
// the owner, and one press to go there.
//
// It computes nothing about the page itself. The sidebar already watches the
// tab beside it for Gmail and for account sites, so this is handed that watch's
// answer and adds only what is saved on the device — the gift ideas, read from
// this device's own copy with no request, because a strip that cost a round
// trip per tab would be a worse thing than no strip.
import {pageOffers} from './page-offers.js';
import {PageOfferStrip} from './components/ui.js';
import {activeCapability,onNavigate,selectCapability,selectTool} from './navigation.js';
import {giftsOffline} from './gifts-offline.js';
import {propertiesOffline} from './properties-offline.js';
import {travelChanges} from './travel-changes.js';
import {deviceCredentials} from './cloud-storage.js';

export function mountPageStrip(root,{
  gifts=giftsOffline(),properties=propertiesOffline(),credentials=deviceCredentials(),changes=travelChanges,
  active=activeCapability,subscribe=onNavigate,
  // Pressing an offer goes exactly where the Tools menu would: a tool of the
  // tab's own hands the panel back to the tab, which is what Automatic mode
  // shows; anything else is selected in the panel.
  select=selectCapability,toTab=selectTool
}={}){
  let page={url:'',site:null},saved={gifts:[],properties:[]},stopped=false;
  function render(){
    const offers=pageOffers({...page,...saved,active:active()});
    root.replaceChildren(...PageOfferStrip(offers,{onSelect:offer=>offer.viaTab?toTab():select(offer.capability,offer)}));
    root.hidden=!offers.length;
  }
  async function load(){
    // No token is not an error here: a browser that has never been connected
    // has no records to recognize a page with, and the rest of the strip still
    // works.
    try{
      const token=await credentials.get();
      const [giftRecords,propertyRecords]=token?await Promise.all([gifts.saved(token),properties.saved(token)]):[[],[]];
      saved={gifts:giftRecords,properties:propertyRecords};
    }catch{saved={gifts:[],properties:[]};}
    if(!stopped)render();
  }
  const watches=['gifts','properties'].map(resource=>changes(load,{resource}));
  const unsubscribe=subscribe(render);
  credentials.subscribe?.(load);
  load();
  return {
    update(next){page=next||{url:'',site:null};render();},
    refresh:load,
    stop(){stopped=true;for(const watch of watches)watch.close();unsubscribe();}
  };
}
