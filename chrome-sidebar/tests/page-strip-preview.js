// Local synthetic fixture for the strip that says what these tools can do with
// the page the owner is on. The header, the strip and their styles are the real
// modules; only the page beside the panel is synthetic, so each state can be
// inspected at sidebar widths without visiting the site it describes.
import {AppHeader,PageOfferBar,PageOfferStrip,Stack,Label} from '../src/components/ui.js';
import {pageOffers} from '../src/page-offers.js';
const schwab={id:'schwab',label:'Schwab',institution:'Charles Schwab',kind:'brokerage'};
const idea=(person,link,status='Idea')=>({id:person,person,idea:'Something',link,status});
const shop='https://shop.example.com/thing/42';
const states=[
  ['Nothing this page offers',{url:'https://example.invalid/article'}],
  ['Beside a signed-in Schwab page',{url:'https://client.schwab.com/app/accounts/summary/',site:schwab}],
  ['On the page an idea was saved from',{url:shop,gifts:[idea('Maisie',shop)]}],
  ['On the page a present was already bought from',{url:shop,gifts:[idea('Celeste',shop,'Bought')]}],
  ['On a reward program’s own site',{url:'https://www.msreserved.com/offers'}],
  ['In Gmail, with a tool chosen by hand',{url:'https://mail.google.com/mail/u/0/#inbox',active:'gifts'}],
  ['Everything at once',{url:'https://www.msreserved.com/offers',site:schwab,gifts:[idea('Ariana','https://www.msreserved.com/offers')]}]
];
const root=document.getElementById('strip-states');
for(const [label,page] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const bar=PageOfferBar();
  const offers=pageOffers(page);
  bar.replaceChildren(...PageOfferStrip(offers,{onSelect:offer=>{window.name=offer.id;}}));
  bar.hidden=!offers.length;
  const empty=Stack([Label(offers.length?'':'No strip: nothing on this page to offer.')],{style:'padding:8px 14px;font-size:11px;color:#626f67'});
  root.append(heading,Stack([AppHeader({}),bar,empty],{style:'border:1px solid #dedfd5;border-radius:10px;overflow:hidden'}));
}
