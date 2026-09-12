// What these tools can do with the page the owner is already looking at.
//
// The sidebar has always recognized a few pages, but recognizing one meant
// being moved: Automatic mode follows the tab, and a tool chosen by hand never
// hears about the tab at all. This module answers the smaller question — which
// capabilities have something for this page — and leaves the deciding to the
// owner. What renders the answer is one row of destinations under the header;
// nothing on screen changes until one of them is pressed.
//
// Nothing here reads a page, navigates, or touches the network. It is handed
// what the watchers beside it already know: the tab's URL, the account site the
// sign-in probe has already identified, and the gift ideas this device has
// saved. A source that wanted more than that would have to earn it, because
// recognizing a page must never cost a request or a second look inside one.
//
// Adding a source is one entry. `match` returns the label to show, or null when
// the page is not its business. Where pressing it goes is not the source's to
// decide: a capability with a page of its own opens that page in a tab, exactly
// as the Tools menu does, and one that lives in the panel is selected there.
// `viaTab` is the exception, for the tools Automatic mode already follows the
// tab to show — handing the panel back to the tab is what the owner means by
// pressing those, and it is navigation the sidebar already had.
import {capabilities} from './capabilities.js';
import {rewardProgram} from './program-data.js';
import {isBought} from './gift-data.js';
import {money} from './property-data.js';
import {listingSite} from './listing-sites.js';
import {samePage} from './public-url.js';

// Gmail has no capability entry, because it is not a tool you choose: it
// appears when the tab is Gmail. So its offer carries its own icon.
const MAIL_GLYPH='M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3.5 7.4 12 13l8.5-5.6';
// One row, at a sidebar's width. More than this would be a menu, and there is
// already a menu.
export const MAX_STRIP_OFFERS=3;

const parse=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)?url:null;}catch{return null;}};
// A saved link is about this page when it names the same page; see samePage.
const savedHere=(records,page)=>records.filter(record=>record.link&&samePage(record.link,page.href));

export const OFFER_SOURCES=[
  // A record about this exact page comes first: it is the only offer that knows
  // something the owner may have forgotten.
  {id:'gift-link',capability:'gifts',match:({page,gifts})=>{
    const saved=savedHere(gifts,page);
    if(!saved.length)return null;
    if(saved.length>1)return `${saved.length} saved ideas`;
    const [record]=saved;
    // Already bought is the more useful half of this: it is what stops the same
    // present being bought twice.
    return `${isBought(record)?'Bought':'Saved'} for ${record.person}`;
  }},
  // A property already on the shortlist says where the search stands with it,
  // which is what stops the same house being reviewed twice.
  {id:'property-link',capability:'properties',match:({page,properties})=>{
    const [record]=savedHere(properties,page);
    return record?[record.status,money(record.price)].filter(Boolean).join(' · '):null;
  }},
  // A listing not on the shortlist yet is one press from being on it.
  {id:'listing-site',capability:'properties',intent:'save-listing',match:({page,properties})=>
    listingSite(page.href)&&!savedHere(properties,page).length?'Save this listing':null},
  {id:'account-site',capability:'finance',viaTab:true,match:({site})=>site?`Store ${site.label} snapshots`:null},
  {id:'reward-program',capability:'rewards',match:({page})=>{
    const program=rewardProgram(page.href);
    return program?`${program.label} offers`:null;
  }},
  {id:'gmail',capability:'gmail',viaTab:true,icon:MAIL_GLYPH,match:({page})=>page.hostname==='mail.google.com'?'Summarize or reply':null},
  // Only inside a draft room. Advice on a draft is worth nothing between one
  // draft and the next, and the room itself is the one thing that says a draft
  // is happening — so this offer leaves when the draft ends and comes back next
  // August without a date in the code.
  {id:'draft',capability:'football',viaTab:true,match:({page})=>page.hostname==='fantasy.espn.com'&&/^\/football\/draft/i.test(page.pathname)?'Draft advice':null}
];

const entry=id=>capabilities.find(item=>item.id===id)||null;
// `active` is the capability already on screen. An offer to go where the owner
// already is would be a label for a visible state, so it is left out.
export function pageOffers({url='',site=null,gifts=[],properties=[],active=''}={}){
  const page=parse(url);
  if(!page)return [];
  const offers=[];
  for(const source of OFFER_SOURCES){
    if(source.capability===active)continue;
    const label=source.match({page,site,gifts,properties});
    if(!label)continue;
    const item=entry(source.capability);
    offers.push({
      id:source.id,capability:source.capability,label,
      icon:source.icon||item?.icon||'',
      href:item?.href||'',
      viaTab:!!source.viaTab,
      intent:source.intent||''
    });
    if(offers.length===MAX_STRIP_OFFERS)break;
  }
  return offers;
}
