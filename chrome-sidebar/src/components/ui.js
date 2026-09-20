import {FormattedSelect,FormattedSuggestions} from './select.js';
import {capabilities,capabilitiesByName,capabilitySections} from '../capabilities.js';
// All DOM construction lives here. Features compose components and supply data.
function element(tag, props={}, children=[]) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(props)) {
    if(value===undefined || value===null)continue;
    if(key==='text')node.textContent=value;
    else if(key==='className')node.className=value;
    else if(key==='hidden'||key==='disabled')node[key]=value;
    else node.setAttribute(key,String(value));
  }
  node.append(...children.filter(Boolean));return node;
}
const SVG_NS='http://www.w3.org/2000/svg';
function svgElement(tag, props={}) {
  const node=document.createElementNS(SVG_NS,tag);
  for(const [key,value] of Object.entries(props))node.setAttribute(key,String(value));
  return node;
}
// Decorative-by-default icon. Callers supply a 24x24 path; the label beside it
// carries the accessible name.
export function Glyph(d,{size=20}={}) {
  const svg=svgElement('svg',{viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'glyph'});
  svg.append(svgElement('path',{d}));
  return svg;
}
export const Text=(text='',props={})=>element('p',{text,...props});
export const Label=(text,props={})=>element('span',{text,...props});
export const Title=(text,level=2,{className='',...props}={})=>element(`h${level}`,{text,...props,className:`title-text ${className}`.trim()});
export const Heading=Title;
export const Strong=(text,props={})=>element('strong',{text,...props});
export const Stack=(children=[],props={})=>element('div',props,children);
export const Section=(children=[],props={})=>element('section',props,children);
export const PageBody=children=>element('main',{className:'page-body'},children);
export const Main=PageBody;
export const Button=(text,{variant='quiet',size,className,...props}={})=>element('button',{type:'button',text,className:[className||(variant==='quiet'?'quiet':`button-${variant}`),size?`button--${size}`:''].filter(Boolean).join(' '),...props});
export const Link=(text,href,props={})=>element('a',{text,href,target:'_blank',rel:'noreferrer',...props});
export const Select=({id,label='',disabled=false,options=[]})=>FormattedSelect(element('select',{id,disabled,className:'select-control'},options.map(o=>Option(o.text,o.value))),label);
export const Option=(text,value)=>element('option',{text,value});
export const List=(children=[],props={})=>element('ol',props,children);
export const Note=(text,props={})=>Text(text,{className:'footnote',...props});
export const Badge=(text,props={})=>Label(text,{className:'pill',...props});
// A status line. Four tones, and nothing else may colour one: `alert` for
// something that needs a decision, `error` for what did not happen,
// `progress` for work running right now, `success` for what worked. The tone
// carries the look — colour, mark, and for progress a spinner that turns for
// as long as the work lasts — so no feature invents its own status styling.
export const STATUS_TONES=['alert','error','progress','success'];
export function Notice(text='',{tone='',...props}={}) {
  const node=Text(text,{className:'notice',role:'status',...props});
  return tone?setStatus(node,text,tone):node;
}
// Says one thing about one operation. Clearing the text clears the tone, so a
// finished operation never leaves its old colour behind, and a new tone
// replaces the last one rather than stacking on it.
export function setStatus(node,text='',tone='') {
  if(!node)return node;
  if(tone&&!STATUS_TONES.includes(tone))throw Error(`Unknown status tone: ${tone}`);
  const active=text?tone:'';
  node.textContent=text||'';
  for(const name of STATUS_TONES)node.classList.toggle(`notice--${name}`,name===active);
  // The element keeps whatever role it was built with — controllers find their
  // status lines by it — so urgency is carried by the live region instead.
  node.setAttribute('aria-live',active==='error'||active==='alert'?'assertive':'polite');
  if(active==='progress')node.setAttribute('aria-busy','true');
  else node.removeAttribute('aria-busy');
  return node;
}
// The in-place indicator for work whose length is unknown: it turns for the
// whole operation instead of appearing once. Put it beside the thing being
// worked on; a status line uses the progress tone instead.
export const Spinner=({label='Working…',...props}={})=>element('span',{className:'spinner',role:'status','aria-label':label,...props});
// Work with a knowable fraction. Left alone it runs indeterminate, which is
// still constant motion; `setProgress` switches it to the measured form.
export function ProgressBar({label='Working…',value=null,...props}={}) {
  const bar=element('div',{className:'progress-bar',role:'progressbar','aria-label':label,'aria-valuemin':'0','aria-valuemax':'100',...props},[element('span',{})]);
  return setProgress(bar,value);
}
export function setProgress(bar,value=null) {
  const measured=Number.isFinite(value);
  const percent=measured?Math.min(100,Math.max(0,Math.round(value))):null;
  bar.classList.toggle('progress-bar--indeterminate',!measured);
  bar.firstChild.style.width=measured?`${percent}%`:'';
  if(measured)bar.setAttribute('aria-valuenow',String(percent));
  else bar.removeAttribute('aria-valuenow');
  return bar;
}
// A measured amount of a fixed limit — storage used of storage allowed. It is
// deliberately not a `ProgressBar`: nothing is running, so it does not move and
// it does not borrow the progress tone. It stays neutral while the amount is
// only a fact, and takes `alert` or `error` once the amount is something to
// decide about. The number beside it, not the colour, is what is read.
export function Meter({id,label,value=0,tone='',...props}={}) {
  const meter=element('div',{id,className:'meter',role:'meter','aria-label':label,'aria-valuemin':'0','aria-valuemax':'100',...props},[element('span',{})]);
  return setMeter(meter,value,tone);
}
export function setMeter(meter,value=0,tone='') {
  const measured=Number.isFinite(value);
  const percent=measured?Math.min(100,Math.max(0,value)):0;
  // A non-zero amount always shows: a sliver the owner can see is the
  // difference between "almost nothing" and "nothing at all".
  meter.firstChild.style.width=`${percent>0?Math.max(percent,1.5):0}%`;
  meter.setAttribute('aria-valuenow',String(Math.round(percent)));
  meter.setAttribute('aria-valuetext',`${percent>0&&percent<1?'less than 1':Math.round(percent)} percent of the limit`);
  for(const name of STATUS_TONES)meter.classList.toggle(`meter--${name}`,tone===name);
  return meter;
}
// The label heading a run of records. It is never set below the records it
// names: a category in smaller, paler type than its own rows inverts the
// hierarchy, and the list then reads as rows with a caption stuck above them.
// It is told apart from them by weight, by its rule, and by the space around
// it. Sans-serif keeps it out of the way of the serif page title.
export const GroupTitle=(text,{className='',...props}={})=>element('h2',{text,...props,className:`group-title ${className}`.trim()});
export const SectionTitle=(title,action,props={})=>Stack([Heading(title,props.level||2,{id:props.titleId}),action],{className:'section-title'});
// A tool's own title line: the name, the whole-tool actions that currently
// apply beside it, and a status line that collapses when there is nothing to
// report. The controller fills the action group, so a tool that is connected
// and idle shows a title and nothing else.
export const ToolTitle=(title,{actionsId,statusId}={})=>Stack([
  Stack([Heading(title,1),ActionGroup([],{id:actionsId,compact:true})],{className:'tool-title'}),
  statusId?Notice('',{id:statusId}):null
],{className:'tool-title-block'});
export const Disclosure=(title,children=[],{titleHeading=false,...props}={})=>element('details',props,[titleHeading?element('summary',{},[Title(title,2)]):element('summary',{text:title}),...children]);
export function Field({id,label,kind='search',options=[],hiddenLabel=false,placeholder,rows=9,disabled=false,list,min,max,step}) {
  const caption=element('label',{for:id,id:kind==='select'?`${id}-label`:undefined,text:label,className:hiddenLabel?'sr-only':undefined});
  const control=kind==='select'?Select({id,label,disabled,options}):kind==='textarea'?element('textarea',{id,rows,className:'editable-output'}):element('input',{id,type:kind,placeholder,disabled,list,min,max,step,...(kind==='password'?{autocomplete:'off',spellcheck:'false'}:{})});
  if(kind==='select'){const trigger=control.querySelector('button');trigger.setAttribute('aria-labelledby',`${id}-label`);caption.addEventListener('click',()=>trigger.focus());}
  return [caption,list?FormattedSuggestions(control,list,label):control];
}
// Grid of small tool icons, alphabetical by label within each section. Used
// where the whole tool list should be visible at a glance: the mobile home
// screen, and the mobile Tools menu once a tool is open.
const SETTINGS_GLYPH='M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M12 2.8l1.6 2.3 2.8-.4 1 2.6 2.6 1-.4 2.8 2.3 1.6-2.3 1.6.4 2.8-2.6 1-1 2.6-2.8-.4-1.6 2.3-1.6-2.3-2.8.4-1-2.6-2.6-1 .4-2.8L2.8 12l2.3-1.6-.4-2.8 2.6-1 1-2.6 2.8.4L12 2.8Z';
const HOME_GLYPH='M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z M9.5 21v-6h5v6';
const MENU_GLYPH='M4 7h16 M4 12h16 M4 17h16';
const LauncherTile=(id,icon,label,className='launcher-tile',props={})=>element('button',{id,type:'button',className,...props},[Glyph(icon),Label(label,{className:'launcher-label'})]);
export function CapabilityLauncher(items=capabilitiesByName,{id='tool-launcher',label='Tools',settings=false,home=false}={}) {
  const groups=capabilitySections(items).map(({title,items:entries})=>{
    const grid=element('div',{className:'launcher-grid'},entries.map(item=>LauncherTile(`navigate-${item.id}`,item.icon,item.label)));
    if(!title)return grid;
    return element('section',{className:'launcher-group'},[Title(title,2,{className:'launcher-group-title'}),grid]);
  });
  if(home&&groups[0])groups[0].prepend(LauncherTile('navigate-home',HOME_GLYPH,'Home'));
  if(settings)groups.push(element('div',{className:'launcher-grid launcher-grid--utility'},[LauncherTile('open-settings',SETTINGS_GLYPH,'Settings','launcher-tile launcher-tile--settings')]));
  return element('nav',{id,'aria-label':label,className:'capability-launcher'},groups);
}
function capabilityRow(item){
  const props={id:`navigate-${item.id}`,className:'capability-item'};
  // Menu rows are labels only: no explanatory text under an entry.
  const children=[Glyph(item.icon,{size:16}),Stack([Strong(item.label)],{className:'capability-text'})];
  return item.href?element('a',{...props,href:item.href,target:'_blank',rel:'noreferrer'},children):element('button',{...props,type:'button'},children);
}
// A named section is a single row that opens to reveal its tools, so the menu
// stays short until someone asks for the extras.
function capabilityBranch(title,icon,entries){
  const row=element('summary',{id:`navigate-section-${title.toLowerCase()}`,className:'capability-item capability-item--branch'},[Glyph(icon,{size:16}),Stack([Strong(title)],{className:'capability-text'})]);
  return element('details',{className:'capability-submenu'},[row,...entries.map(capabilityRow)]);
}
export function CapabilityNavigation(items){
  const summary=element('summary',{id:'navigation-toggle',className:'capability-toggle'},[Label('Tools'),Strong('Current tab',{id:'current-function'})]);
  const rows=capabilitySections(items).flatMap(({title,icon,items:entries})=>
    title?[capabilityBranch(title,icon,entries)]:entries.map(capabilityRow));
  const settings=element('button',{id:'open-settings',type:'button',className:'capability-settings','aria-controls':'settings-tool','aria-expanded':'false'},[Glyph(SETTINGS_GLYPH,{size:16}),Stack([Strong('Settings')],{className:'capability-text'})]);
  const nav=element('nav',{'aria-label':'Tools',className:'capability-list'},[...rows,settings]);
  const disclosure=element('details',{id:'app-navigation',className:'capability-navigation'},[summary,nav]);
  // Escape leaves the open section first, then the menu itself.
  disclosure.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const branch=event.target.closest?.('.capability-submenu[open]');
    if(branch){branch.open=false;branch.querySelector('summary').focus();return;}
    disclosure.open=false;summary.focus();
  });
  return disclosure;
}
// What the page in front of the owner has to offer, as one row under the
// header: the same icon and label the Tools menu uses for the same
// destination, because pressing one goes to exactly where that row goes. The
// bar is empty and hidden until a page offers something.
export const PageOfferBar=()=>element('nav',{id:'page-offers',className:'page-offers','aria-label':'This page',hidden:true});
export function PageOfferStrip(offers=[],{onSelect=()=>{}}={}){
  return offers.map(offer=>{
    const props={id:`page-offer-${offer.id}`,className:'page-offer'};
    const children=[Glyph(offer.icon,{size:14}),Strong(offer.label)];
    // A capability with a page of its own is a link to it, as in the menu; one
    // that lives in the panel is a button that selects it there.
    if(offer.href)return element('a',{...props,href:offer.href,target:'_blank',rel:'noreferrer'},children);
    const node=element('button',{...props,type:'button'},children);
    node.addEventListener('click',()=>onSelect(offer));
    return node;
  });
}
// Mobile Tools menu: the same icon grid, collapsed behind a hamburger once a
// tool is open. On the home screen the caller unhides the grid in place.
export function CapabilityMenu(items=capabilitiesByName,{current='Home'}={}){
  const summary=element('summary',{id:'navigation-toggle',className:'capability-toggle','aria-label':'Tools menu'},[Glyph(MENU_GLYPH,{size:20}),Strong(current,{id:'current-function'})]);
  const disclosure=element('details',{id:'app-navigation',className:'capability-navigation capability-navigation--launcher'},[summary,CapabilityLauncher(items,{settings:true,home:true})]);
  disclosure.addEventListener('keydown',event=>{if(event.key==='Escape'&&!summary.hidden){disclosure.open=false;summary.focus();}});
  return disclosure;
}
export function AppHeader({name='Eric’s tools'}={}) {
  return element('header',{className:'app-header app-header--navigation'},[
    Stack([element('img',{className:'mark',src:'icons/icon-32.png',width:24,height:24,alt:''}),Label(name,{className:'compact-brand'})],{className:'app-brand'}),CapabilityNavigation(capabilities)
  ]);
}
export const PageHeader=({title,subtitle,action,titleId})=>Stack([Title(title,1,{id:titleId}),action||(subtitle?Label(subtitle,{className:'subtitle'}):null)],{className:'tool-heading'});
export const ToolHeading=(title,subtitle)=>PageHeader({title,subtitle});
export const Highlight=({id,valueId,label,value})=>Stack([Label(label),Strong(value,{id:valueId})],{id,className:'next-pick-chip',role:'status'});
export const StatusCard=({statusId,detailId,dotId,status,detail,links=[]})=>Stack([Stack([Label('',{id:dotId,className:'dot'}),Strong(status,{id:statusId})],{className:'status-label'}),Text(detail,{id:detailId}),...links.map(l=>Link(l.text,l.href))],{className:'status-card'});
export const Metrics=items=>Stack(items.map(item=>Stack([Strong(item.value,{id:item.id}),Label(item.label)])),{className:'metrics'});
export const SourceNote=(title,description)=>Stack([Label('',{className:'board-dot','aria-hidden':true}),Stack([Strong(title),Text(description)])],{className:'board-note'});
export function UploadField({id,inputId,statusId,label,formats,accept,status,resetId,resetLabel}) {
  return Stack([element('button',{id,type:'button',className:'file-drop','aria-describedby':statusId},[Label('↑',{className:'upload-symbol','aria-hidden':true}),Strong(label),Label(`${formats} · or browse files`)]),element('input',{id:inputId,type:'file',accept,hidden:true}),Text(status,{id:statusId,className:'upload-status',role:'status'}),Button(resetLabel,{id:resetId,hidden:true})],{className:'upload-panel'});
}
export function DataTable(headers,rows) {
  return element('table',{},[element('thead',{},[element('tr',{},headers.map(text=>element('th',{text})))]),element('tbody',{},rows.map(row=>element('tr',{},row.map(text=>element('td',{text:String(text)}))))) ]);
}
export function PickRow(p,ownTeamId) {
  return element('li',{className:`pick pick--compact${p.teamId===ownTeamId?' mine':''}`},[Label(p.overall??'—',{className:'pick-number'}),Stack([Strong(p.player,{className:'pick-name'}),Text(`${p.manual?'Manual':`R${p.round} · P${p.pickInRound}`} · ${p.nflTeam} · ${p.team}`,{className:'pick-meta'})]),Label(p.position,{className:'position'})]);
}
export function RecommendationCard(p,{primary=false,compact=false}={}) {
  const children=[Text(primary?'PICK NEXT':'ALTERNATIVE',{className:'eyebrow'}),Heading(`${p.name} · ${p.position}`,3),Text(`${p.tier?`Tier ${p.tier} · `:''}Rank #${p.rank} · ADP ${p.adp ?? '—'}`,{className:'pick-meta'})];
  if(compact)return element('article',{className:'recommendation-compact'},[Stack([Label(primary?'1':'2',{className:'recommendation-number'}),Heading(`${p.name} · ${p.position}`,3)]),Text(`${p.tier?`Tier ${p.tier} · `:''}Rank #${p.rank} · ADP ${p.adp??'—'}`,{className:'pick-meta'}),Disclosure('Why this pick',[Text(p.shortWhy||'',{className:'recommendation-why'}),Text(p.outlook||'',{className:'recommendation-outlook'}),...(p.reasons||[]).map(reason=>Note(reason))])]);
  if (p.shortWhy) children.push(Text(p.shortWhy,{className:'recommendation-why'}));
  if (p.outlook) children.push(Text(p.outlook,{className:'recommendation-outlook'}));
  children.push(Disclosure('Reasoning',[element('ul',{},p.reasons.map(text=>element('li',{text})))]));
  return element('article',{className:`recommendation${primary?' recommendation--primary':''}`},children);
}
// One generated thing, with everything that belongs to it: its name, the
// action that makes it, whatever has to be typed first, how it is going, and
// the result, editable, with a Copy. Two of these is how a screen says that
// two functions are two functions.
export function ResultSection({id,title,action,fields=[],statusId,resultId,copyId,fieldId,label='Generated text — editable',footer}) {
  const copy=Button('Copy',{id:copyId,variant:'secondary',size:'compact',hidden:true});
  const controls=ActionGroup([action,copy].filter(Boolean),{compact:true});
  const output=Field({id:fieldId,label,kind:'textarea',hiddenLabel:true});
  const field=output[1];field.classList.add('editable-output--fit');
  const resize=()=>{if(!field.getClientRects().length)return;field.style.height='auto';field.style.height=`${field.scrollHeight+2}px`;};
  field.addEventListener('input',resize);
  if(globalThis.ResizeObserver){let width=-1;new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(next!==width){width=next;resize();}}).observe(field);}
  field.addEventListener('output-updated',resize);
  return Section([SectionTitle(title,controls),...fields,Note('',{id:statusId,role:'status'}),
    Stack(output,{id:resultId,className:'result-output',hidden:true}),footer].filter(Boolean),{id,className:'result-section'});
}
export function downloadFile({url,filename}) {const link=Link('',url,{download:filename});link.removeAttribute('target');link.click();}

export const ActionGroup=(children,{compact=false,...props}={})=>Stack(children,{className:`action-group${compact?' action-group--compact':''}`,...props});
// A group's own actions ride at the end of its heading line, never in a row of
// words beneath the records they act on. `actionsId` is filled by the feature
// the same way `ToolTitle` already fills its own.
export const SettingsGroup=({title,children=[],level=3,actionsId,...props})=>Section([
  actionsId
    ? Stack([Heading(title,level,{className:'settings-group-title'}),ActionGroup([],{id:actionsId,compact:true})],{className:'settings-group-head'})
    : Heading(title,level,{className:'settings-group-title'}),
  ...children],{className:'settings-group','aria-label':title,...props});

export function OwnershipActions(player,{owner=null,corrected=false,onSelect}) {
  const actions=ActionGroup(['me','other'].map(value=>{
    const button=Button(value==='me'?'Me':'Someone else',{variant:owner===value?'primary':'secondary',disabled:!!player.identityUnverified,'aria-label':`${player.name}: ${value==='me'?'taken by me':'taken by someone else'}`,'aria-pressed':String(owner===value)});
    button.addEventListener('click',()=>onSelect(value));return button;
  }));
  if(corrected){const undo=Button('Undo',{'aria-label':`Undo correction for ${player.name}`});undo.addEventListener('click',()=>onSelect('undo'));actions.append(undo);}
  return actions;
}
export function SelectionRow(player,options) {
  const {owner}=options,actions=OwnershipActions(player,options);
  return Stack([Stack([Strong(player.name,{className:'pick-name'}),Note(`${player.position} · ${player.nflTeam} · ${player.rank?`Rank #${player.rank}`:'Not in your ranks'} · ${player.espnId!==undefined?`ESPN ${player.espnId}`:'Unmatched — refresh ESPN'}${owner?` · ${owner==='me'?'Yours':'Taken'}`:''}`)]),actions],{className:'selection-row'});
}
export const SubPage=({id,title,backId,children=[]})=>Section([PageHeader({title,action:Button('← Back',{id:backId})}),Main(children)],{id,hidden:true,className:'sub-page'});

// Shared, keyboard-accessible tabs. Selection is owned here and survives content updates.
export function Tabs({id,label,items}) {
  const panels=items.map(item=>Section([item.content],{id:`${id}-${item.key}-panel`,role:'tabpanel','aria-labelledby':`${id}-${item.key}-tab`,tabindex:0}));
  const buttons=items.map(item=>Button(item.label,{id:`${id}-${item.key}-tab`,className:'tabs-button',role:'tab','aria-controls':`${id}-${item.key}-panel`}));
  function select(index,focus=false){buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.setAttribute('tabindex',i===index?'0':'-1');panels[i].hidden=i!==index;});if(focus)buttons[index].focus();}
  buttons.forEach((button,i)=>{
    button.addEventListener('click',()=>select(i));
    button.addEventListener('keydown',event=>{const next={ArrowRight:(i+1)%items.length,ArrowLeft:(i-1+items.length)%items.length,Home:0,End:items.length-1}[event.key];if(next!==undefined){event.preventDefault();select(next,true);}});
  });
  select(0);return Stack([Stack(buttons,{role:'tablist','aria-label':label,className:'tabs-list'}),...panels],{id,className:'tabs'});
}
const statusLabels={available:'Available',mine:'Yours',taken:'Taken',unknown:'Unconfirmed'};
export const StatusLegend=()=>Stack(['available','mine','taken'].map(status=>Label(statusLabels[status],{className:`availability-label availability-label--${status}`})),{className:'availability-legend','aria-label':'Player status legend'});
export function RankedPlayerRow(player,status='unknown',{recommendation=0,scarcity=null,owner=null,corrected=false,onSelect}={}) {
  const risk=status==='available'?scarcity:null;
  return element('li',{className:`ranked-player ranked-player--${status}${recommendation?' ranked-player--recommended':''}${risk?' ranked-player--scarce':''}`,value:player.rank},[
    Label(player.rank,{className:'pick-number'}),Stack([recommendation?Badge(`NEXT PICK ${recommendation}`,{className:'recommendation-tag'}):null,risk?Badge(`${player.position} getting thin`,{className:'scarcity-tag',title:risk.message}):null,Strong(player.name,{className:'pick-name'}),Text(`${player.position} · ${player.nflTeam} · ADP ${player.adp??'—'}`,{className:'pick-meta'})]),Label(statusLabels[status],{className:'availability-label'}),
    onSelect?Stack([OwnershipActions(player,{owner,corrected,onSelect})],{className:'ranked-actions'}):null
  ]);
}
export function TieredRankings(players,picks,ownTeamId,{confirmed=false,recommended=[],rosterAlerts=[],overrides={},onSelect,tierStates=new Map()}={}) {
  const groups=new Map();
  for(const player of [...players].sort((a,b)=>a.rank-b.rank)){
    const tier=player.tier??'Unspecified';if(!groups.has(tier))groups.set(tier,[]);
    groups.get(tier).push(player);
  }
  const sections=[...groups].map(([tier,entries])=>{
    const taken=entries.filter(p=>picks.has(p.key)).length,full=taken===entries.length;
    const compact=Number(tier)>=4;
    const archived=full;
    const previous=tierStates.get(tier);
    const open=previous&&previous.full===full&&previous.archived===archived?previous.open:!archived;
    tierStates.set(tier,{full,archived,open});
    const rows=[],hiddenRows=[];
    for(const player of entries){
      const pick=picks.get(player.key),owner=pick?(pick.teamId===ownTeamId?'me':'other'):null;
      const status=pick?(owner==='me'?'mine':'taken'):confirmed?'available':'unknown';
      const row=RankedPlayerRow(player,status,{recommendation:recommended.indexOf(player.key)+1,scarcity:rosterAlerts.find(alert=>alert.playerKeys.includes(player.key)),owner,corrected:!!overrides[player.key],onSelect:onSelect?value=>onSelect(player,value):null});
      (compact&&owner==='other'?hiddenRows:rows).push(row);
    }
    const contents=[List(rows,{className:'ranked-list'})];
    if(hiddenRows.length){
      const key=`taken:${tier}`,saved=tierStates.get(key);
      const disclosure=Disclosure(`Taken by others · ${hiddenRows.length}`,[List(hiddenRows,{className:'ranked-list'})],{'aria-label':`Tier ${tier} taken by others`});
      disclosure.open=saved?.open??false;
      disclosure.addEventListener('toggle',()=>tierStates.set(key,{open:disclosure.open}));
      contents.push(disclosure);
    }
    const section=Disclosure(`Tier ${tier} · ${full?'All taken':`${entries.length-taken} remaining`}`, contents,{className:`tier-group${archived?' tier-group--complete':''}`,'aria-label':`Tier ${tier}`});
    section.open=open;
    section.addEventListener('toggle',()=>tierStates.set(tier,{full,archived,open:section.open}));
    return section;
  });
  const completed=sections.filter(section=>section.classList.contains('tier-group--complete'));
  const remaining=sections.filter(section=>!section.classList.contains('tier-group--complete'));
  if(!completed.length)return remaining;
  const archive=Disclosure(`All taken · ${completed.length} ${completed.length===1?'tier':'tiers'}`,completed,{className:'completed-tiers','aria-label':'All taken tiers'});
  archive.open=tierStates.get('archive')?.open??false;
  archive.addEventListener('toggle',()=>tierStates.set('archive',{open:archive.open}));
  return [archive,...remaining];
}

// Two or three mutually exclusive choices, shown side by side instead of hidden
// inside a menu. Native radios keep the keyboard and screen-reader behavior; the
// group exposes `value` so a controller reads it exactly like the select it replaces.
export function SegmentedField({id,label,options=[]}) {
  const inputs=options.map(option=>element('input',{type:'radio',name:id,id:`${id}-${option.value}`,value:option.value,className:'segmented-input'}));
  const choices=options.map((option,index)=>element('label',{className:'segmented-option',for:inputs[index].id},[inputs[index],Label(option.text)]));
  const group=element('fieldset',{id,className:'segmented'},[element('legend',{text:label,className:'segmented-legend'}),Stack(choices,{className:'segmented-options'})]);
  Object.defineProperty(group,'value',{get:()=>inputs.find(input=>input.checked)?.value??'',set(value){for(const input of inputs)input.checked=input.value===String(value);}});
  return group;
}

export function Toggle({id,label,checked=false,descriptionId}) {
  const input=element('input',{id,type:'checkbox',role:'switch','aria-describedby':descriptionId});input.checked=checked;
  return element('label',{className:'toggle-field',for:id},[Label(label),input]);
}

export function RosterCounts(counts,{known=true,alerts=[]}={}) {
  return Section([Label('YOUR ROSTER',{className:'eyebrow'}),Stack(Object.entries(counts).map(([position,count])=>Stack([Strong(known?count:'—'),Label(position)],{'aria-label':`${position}: ${known?count:'unknown'}`,className:alerts.some(a=>a.position===position)?'roster-count--scarce':undefined})),{className:'roster-count-grid'}),...alerts.map(alert=>Notice(alert.message,{className:'scarcity-notice',title:'ADP estimate. Quality means ranked above starter replacement; short boards use current-or-better tiers. Alerts start when a starter is due: RB rounds 2/4, WR rounds 3/5.'}))],{className:'roster-count-card','aria-label':'Your roster by position'});
}

export const StickyGroup=children=>Stack(children,{className:'sticky-group'});

export const Form=(children,props={})=>element('form',props,children);
export const Panel=(children,props={})=>Section(children,{className:'settings-card',...props});
export const FormStack=children=>Stack(children,{className:'form-stack'});
export const FormField=({className='',...options})=>Stack(Field(options),{className:`form-field ${className}`.trim()});

// Reusable layouts for searchable workspaces and evidence-backed results.
export const Workspace=children=>Stack(children,{className:'workspace-shell'});
export const WorkspaceFlow=children=>Stack(children,{className:'workspace-flow'});
export const FieldGrid=children=>Stack(children,{className:'field-grid'});
export function ChoiceRow({title,description,checked=false,onChange}) {
  const input=element('input',{type:'checkbox','aria-label':title});input.checked=checked;
  input.addEventListener('change',()=>onChange(input.checked));
  return element('label',{className:'choice-row'},[input,Stack([Strong(title),Note(description)])]);
}
export function EvidenceList(sources) {
  return Disclosure('Sources & rating details',sources.map(s=>Stack([Link(s.title,s.url),Note(s.detail),Note(s.published)],{className:'evidence-row'})),{className:'evidence-list'});
}
export function ResultBlock({title,meta,status,detail,children=[]}) {
  return Section([Stack([Heading(title,3),status?Badge(status):null],{className:'result-heading'}),Note(meta),detail?Text(detail):null,...children],{className:'result-block'});
}
export const ModelSuggestions=props=>element('datalist',props);
export function setModelSuggestions(node,models){node.replaceChildren(...models.map(model=>Option(model.name,model.id)));}
export const OutputText=props=>element('pre',{className:'ai-output',...props});
export function ConnectionCard(connection, {selected=false,onSelect}={}) {
  const button=Button('',{className:'connection-card','aria-pressed':String(selected),'aria-label':`Edit ${connection.name}`});
  button.append(Stack([Strong(connection.name),Label(connection.provider,{className:'provider-tag'})],{className:'connection-heading'}),
    Label('Models chosen per task',{className:'connection-model'}),
    Label(connection.hasApiKey?'API key saved':'No API key',{className:'connection-key'}));
  button.addEventListener('click',()=>onSelect(connection));
  return button;
}

export const SettingsList=children=>Stack(children,{className:'settings-list'});
export const SettingsItem=(title,children=[])=>Disclosure(title,children,{className:'settings-panel settings-panel--compact settings-item',titleHeading:true});
export const SettingsLink=(title,href)=>Link(title,href,{className:'settings-link'});

// Flat saved-record pattern shared by personal trackers.
// The record's own actions ride at the end of its name's line, not in a row of
// words under it: Edit and Delete repeated beneath every record double the
// length of a list and end up the loudest thing in it, when the list is there
// to be read down. `notes` takes one line or several. Several stay inside the
// row rather than being stacked under it, where the last one reads as the next
// record's first. `extra` is what this record raised and only it can answer — a
// delete confirmation, a sync conflict, a revealed value — kept inside the row
// so it stays visibly attached to the record that asked.
// A record whose one important number belongs on its own line takes `figure`,
// and `meta` for the qualification that number needs — an older date, a figure
// still waiting to sync. Both ride on the name's line, so a run of records is
// read down one column of names and one column of amounts instead of down a
// name with a grey sentence hanging under it. A record with neither is the
// same row it always was.
//
// The line divides in two, and the halves are what make it read: the name and
// its qualification on the left, the amount and the record's verbs on the
// right. The qualification belongs to the name and is set against it —
// floating loose in the space between name and amount it read as a label for
// neither. The two halves keep the line whichever one is long, so a name that
// needs three lines wraps inside its own half rather than pushing the amount
// out of the column its neighbours are read down.
export function RecordRow({title,detail,meta='',figure='',notes='',actions=[],extra=[]}) {
  const lines=(Array.isArray(notes)?notes:[notes]).filter(Boolean);
  const verbs=ActionGroup(actions,{compact:true,className:'action-group action-group--compact record-actions'});
  const name=Strong(title,{className:'record-name'});
  // What qualifies the name belongs beside it whether or not the row ends in a
  // figure, and a row with nothing further to say prints no empty line under
  // itself.
  const head=meta?Stack([name,Label(meta,{className:'record-meta'})],{className:'record-head'}):name;
  return Section([
    Stack([head,
      figure?Stack([Strong(figure),verbs],{className:'record-figure'}):verbs],
      {className:`record-line${figure?' record-line--figure':''}`}),
    ...(detail?[Note(detail)]:[]),...lines.map(line=>Text(line)),...extra.filter(Boolean)
  ],{className:'record-row'});
}

export const ReleaseBanner=()=>Notice('',{className:'release-banner',hidden:true});

// A compact list row with a separate quick action and optional inline details.
export function ExpandableRecord({title,subtitle,action,preview,children,onToggle}) {
  const toggle=Button('',{variant:'secondary',className:'record-row-toggle','aria-expanded':'false'});
  toggle.append(Strong(title),...(subtitle?[Note(subtitle)]:[]));
  const content=Stack(children,{className:'record-row-content',hidden:true});
  toggle.addEventListener('click',()=>{
    content.hidden=!content.hidden;
    toggle.setAttribute('aria-expanded',String(!content.hidden));
    onToggle?.(!content.hidden);
  });
  return Section([Stack([toggle,action],{className:'record-row-heading'}),...(preview?[preview]:[]),content],{className:'record-row'});
}

export function CopyIconButton(label){
  const button=Button('',{className:'icon-button row-copy','aria-label':label,title:label});
  button.append(element('span',{className:'copy-glyph','aria-hidden':'true'}));
  return button;
}

// What a saved record's own actions look like when the record is one line: the
// verb is carried by a glyph rather than by a word under every row, and the
// label names it for a screen reader and for the pointer that pauses on it.
export const EDIT_GLYPH='M4 20h4L18.4 9.6a2.26 2.26 0 0 0-3.2-3.2L4.8 16.8V20Z M14.4 7.2l2.4 2.4';
export const DELETE_GLYPH='M4 7h16 M10 4h4 M9 11v6 M15 11v6 M6 7l.9 12a2 2 0 0 0 2 1.9h6.2a2 2 0 0 0 2-1.9L18 7';
export function IconButton(path,label,{className='',...props}={}){
  const button=Button('',{className:`icon-button ${className}`.trim(),'aria-label':label,title:label,...props});
  button.append(Glyph(path,{size:16}));
  return button;
}
// The verbs a record's own line carries. A row action is one of these: a verb
// that repeats down every row and is understood from its glyph alone. Anything
// that needs a sentence to be understood — a confirmation, a sync conflict, a
// decision only some records are asking for — is not a row action, and belongs
// in words under the record that raised it.
export const DONE_GLYPH='M5 12.5 10.5 18 19 6.5';
export const UNDO_GLYPH='M4.5 10h10a4.5 4.5 0 0 1 0 9H9 M4.5 10l4-4 M4.5 10l4 4';
export const SHOW_GLYPH='M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z';
export const HIDE_GLYPH='M4 4l16 16 M9.8 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.6 4.3 M6.5 7.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.9-.5 M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6';
export const COPY_GLYPH='M9.5 8.5h9v11h-9z M14.5 8.5v-4h-9v11h4';
export const OPEN_GLYPH='M14 4h6v6 M20 4l-8.5 8.5 M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10';
export const HISTORY_GLYPH='M12 7.5V12l3.2 1.9 M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z';
// A record's own action, at the end of its line. The glyph is the verb and the
// label is what a screen reader and a paused pointer are told, so it names the
// record it would act on rather than saying "Delete" twelve times down a list.
export function RowAction(glyph,label,handler,{danger=false,className='',...props}={}){
  const button=IconButton(glyph,label,{className:['row-action',danger?'row-action--danger':'',className].filter(Boolean).join(' '),...props});
  if(handler)button.addEventListener('click',handler);
  return button;
}
// The same action where it is a link: opening the record's own page elsewhere.
export function RowLink(glyph,label,href,{className='',...props}={}){
  const link=Link('',href,{className:`row-action ${className}`.trim(),'aria-label':label,title:label,...props});
  link.append(Glyph(glyph,{size:16}));
  return link;
}

// Values that stay sealed until the device vault is unlocked. The masked form
// carries only the last four digits, which are safe to render at any time.
export const MaskedValue=(text,props={})=>Label(text,{className:'masked-value',...props});
// Editor group for a value encrypted on the device before it is saved. The
// inputs are left empty when a value already exists: an empty input means
// "keep what is stored", never "erase it".
export function ProtectedField({id,label,help,numberLabel='Card number',expiryLabel='Expiration (MM/YY, optional)'}) {
  const number=FormField({id:`${id}-number`,label:numberLabel,kind:'password'});
  const expiry=FormField({id:`${id}-expiry`,label:expiryLabel,kind:'text'});
  for(const [field,mode,pattern] of [[number,'numeric','[0-9 ]*'],[expiry,'numeric','[0-9/]*']]) {
    const input=field.querySelector('input');
    input.setAttribute('inputmode',mode);
    input.setAttribute('autocomplete','off');
    input.setAttribute('pattern',pattern);
  }
  return Stack([
    Stack([Label(label,{className:'protected-title'}),Badge('Encrypted on device')],{className:'protected-heading'}),
    Text('',{id:`${id}-state`,className:'protected-state',role:'status',hidden:true}),
    ActionGroup([],{id:`${id}-actions`,compact:true}),
    number,expiry,
    Note(help,{id:`${id}-help`})
  ],{id,className:'protected-field'});
}
