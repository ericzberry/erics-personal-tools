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

// Gmail has no capability entry, because it is not a tool you choose: it
// appears when the tab is Gmail. So its offer carries its own icon.
const MAIL_GLYPH='M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3.5 7.4 12 13l8.5-5.6';
// One row, at a sidebar's width. More than this would be a menu, and there is
// already a menu.
export const MAX_STRIP_OFFERS=3;

const parse=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)?url:null;}catch{return null;}};
const path=url=>url.pathname.replace(/\/+$/,'')||'/';
// A saved link is about this page when it is the same page: same host, same
// path. Query strings are left out because the link that was saved and the one
// in front of the owner rarely carry the same tracking parameters, and a host
// on its own would light up every page of a shop where one thing was saved once.
const samePage=(left,right)=>!!left&&!!right&&left.hostname===right.hostname&&path(left)===path(right);

export const OFFER_SOURCES=[
  // A record about this exact page comes first: it is the only offer that knows
  // something the owner may have forgotten.
  {id:'gift-link',capability:'gifts',match:({page,gifts})=>{
    const saved=gifts.filter(record=>samePage(parse(record.link||''),page));
    if(!saved.length)return null;
    if(saved.length>1)return `${saved.length} saved ideas`;
    const [record]=saved;
    // Already bought is the more useful half of this: it is what stops the same
    // present being bought twice.
    return `${isBought(record)?'Bought':'Saved'} for ${record.person}`;
  }},
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
export function pageOffers({url='',site=null,gifts=[],active=''}={}){
  const page=parse(url);
  if(!page)return [];
  const offers=[];
  for(const source of OFFER_SOURCES){
    if(source.capability===active)continue;
    const label=source.match({page,site,gifts});
    if(!label)continue;
    const item=entry(source.capability);
    offers.push({
      id:source.id,capability:source.capability,label,
      icon:source.icon||item?.icon||'',
      href:item?.href||'',
      viaTab:!!source.viaTab
    });
    if(offers.length===MAX_STRIP_OFFERS)break;
  }
  return offers;
}
