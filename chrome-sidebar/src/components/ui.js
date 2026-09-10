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
export const Notice=(text='',props={})=>Text(text,{className:'notice',role:'status',...props});
// Small label heading a run of records. Sans-serif and quiet on purpose so it
// reads as a divider between groups rather than competing with record names.
export const GroupTitle=(text,{className='',...props}={})=>element('h2',{text,...props,className:`group-title ${className}`.trim()});
export const SectionTitle=(title,action,props={})=>Stack([Heading(title,props.level||2,{id:props.titleId}),action],{className:'section-title'});
export const Disclosure=(title,children=[],{titleHeading=false,...props}={})=>element('details',props,[titleHeading?element('summary',{},[Title(title,2)]):element('summary',{text:title}),...children]);
export function Field({id,label,kind='search',options=[],hiddenLabel=false,placeholder,rows=9,disabled=false,list}) {
  const caption=element('label',{for:id,id:kind==='select'?`${id}-label`:undefined,text:label,className:hiddenLabel?'sr-only':undefined});
  const control=kind==='select'?Select({id,label,disabled,options}):kind==='textarea'?element('textarea',{id,rows,className:'editable-output'}):element('input',{id,type:kind,placeholder,disabled,list,...(kind==='password'?{autocomplete:'off',spellcheck:'false'}:{})});
  if(kind==='select'){const trigger=control.querySelector('button');trigger.setAttribute('aria-labelledby',`${id}-label`);caption.addEventListener('click',()=>trigger.focus());}
  return [caption,list?FormattedSuggestions(control,list,label):control];
}
// Grid of small tool icons, alphabetical by label within each section. Used
// where the whole tool list should be visible at a glance: the mobile home
// screen, and the mobile Tools dropdown once a tool is open.
const SETTINGS_GLYPH='M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M12 2.8l1.6 2.3 2.8-.4 1 2.6 2.6 1-.4 2.8 2.3 1.6-2.3 1.6.4 2.8-2.6 1-1 2.6-2.8-.4-1.6 2.3-1.6-2.3-2.8.4-1-2.6-2.6-1 .4-2.8L2.8 12l2.3-1.6-.4-2.8 2.6-1 1-2.6 2.8.4L12 2.8Z';
const HOME_GLYPH='M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z M9.5 21v-6h5v6';
const LauncherTile=(id,icon,label,className='launcher-tile',props={})=>element('button',{id,type:'button',className,...props},[Glyph(icon),Label(label,{className:'launcher-label'})]);
export function CapabilityLauncher(items=capabilitiesByName,{id='tool-launcher',label='Tools',settings=false,home=false}={}) {
  const groups=capabilitySections(items).map(({title,items:entries})=>{
    const grid=element('div',{className:'launcher-grid'},entries.map(item=>LauncherTile(`navigate-${item.id}`,item.icon,item.label)));
    if(!title)return grid;
    return element('section',{className:'launcher-group'},[Title(title,2,{className:'launcher-group-title'}),grid]);
  });
  if(home&&groups[0])groups[0].prepend(LauncherTile('navigate-home',HOME_GLYPH,'Home'));
  if(settings)groups.push(element('div',{className:'launcher-grid launcher-grid--utility'},[LauncherTile('open-settings',SETTINGS_GLYPH,'Settings','launcher-tile launcher-tile--settings',{'aria-expanded':'false'})]));
  return element('nav',{id,'aria-label':label,className:'capability-launcher'},groups);
}
function capabilityRow(item){
  const props={id:`navigate-${item.id}`,className:'capability-item'};
  const children=[Glyph(item.icon,{size:16}),Stack([Strong(item.label),Label(item.description)],{className:'capability-text'})];
  return item.href?element('a',{...props,href:item.href,target:'_blank',rel:'noreferrer'},children):element('button',{...props,type:'button'},children);
}
export function CapabilityNavigation(items){
  const summary=element('summary',{id:'navigation-toggle',className:'capability-toggle'},[Label('Tools'),Strong('Current tab',{id:'current-function'})]);
  const rows=capabilitySections(items).flatMap(({title,items:entries})=>[
    ...(title?[Title(title,2,{className:'capability-group'})]:[]),
    ...entries.map(capabilityRow)
  ]);
  const settings=element('button',{id:'open-settings',type:'button',className:'capability-settings','aria-controls':'settings-tool','aria-expanded':'false'},[Glyph(SETTINGS_GLYPH,{size:16}),Stack([Strong('Settings')],{className:'capability-text'})]);
  const nav=element('nav',{'aria-label':'Tools',className:'capability-list'},[...rows,settings]);
  const disclosure=element('details',{id:'app-navigation',className:'capability-navigation'},[summary,nav]);
  disclosure.addEventListener('keydown',event=>{if(event.key==='Escape'){disclosure.open=false;summary.focus();}});
  return disclosure;
}
// Mobile Tools menu: the same icon grid, collapsed behind a dropdown once a
// tool is open. On the home screen the caller unhides the grid in place.
export function CapabilityMenu(items=capabilitiesByName,{current='Home'}={}){
  const summary=element('summary',{id:'navigation-toggle',className:'capability-toggle'},[Label('Tools'),Strong(current,{id:'current-function'})]);
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
export function EditableResult({id,titleId,copyId,fieldId,title='Summary',label='Generated text — editable'}) {
  const fields=Field({id:fieldId,label,kind:'textarea',hiddenLabel:true});
  const output=fields[1];output.classList.add('editable-output--fit');
  const resize=()=>{if(!output.getClientRects().length)return;output.style.height='auto';output.style.height=`${output.scrollHeight+2}px`;};
  output.addEventListener('input',resize);
  if(globalThis.ResizeObserver){let width=-1;new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(next!==width){width=next;resize();}}).observe(output);}
  output.addEventListener('output-updated',resize);
  return Section([SectionTitle(title,Button('Copy',{id:copyId,variant:'secondary'}),{titleId}),...fields],{id,hidden:true});
}
export function downloadFile({url,filename}) {const link=Link('',url,{download:filename});link.removeAttribute('target');link.click();}

export const ActionGroup=(children,{compact=false,...props}={})=>Stack(children,{className:`action-group${compact?' action-group--compact':''}`,...props});
export const SettingsGroup=({title,children=[],level=3})=>Section([Heading(title,level,{className:'settings-group-title'}),...children],{className:'settings-group','aria-label':title});

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

export function Toggle({id,label,checked=false,descriptionId}) {
  const input=element('input',{id,type:'checkbox',role:'switch','aria-describedby':descriptionId});input.checked=checked;
  return element('label',{className:'toggle-field',for:id},[Label(label),input]);
}

export function RosterCounts(counts,{known=true,alerts=[]}={}) {
  return Section([Label('YOUR ROSTER',{className:'eyebrow'}),Stack(Object.entries(counts).map(([position,count])=>Stack([Strong(known?count:'—'),Label(position)],{'aria-label':`${position}: ${known?count:'unknown'}`,className:alerts.some(a=>a.position===position)?'roster-count--scarce':undefined})),{className:'roster-count-grid'}),...alerts.map(alert=>Notice(alert.message,{className:'scarcity-notice',title:'ADP estimate. Quality means ranked above starter replacement; short boards use current-or-better tiers. Alerts start when a starter is due: RB rounds 2/4, WR rounds 3/5.'}))],{className:'roster-count-card','aria-label':'Your roster by position'});
}

export const StickyGroup=children=>Stack(children,{className:'sticky-group'});

export function CredentialRow(credential,{onEdit,onDelete}) {
  const edit=Button('Replace',{variant:'secondary','aria-label':`Replace ${credential.name}`});edit.addEventListener('click',onEdit);
  const remove=Button('Delete',{variant:'danger','aria-label':`Delete ${credential.name}`});remove.addEventListener('click',onDelete);
  return Stack([Stack([Strong(credential.name),Note(credential.hasApiKey===false?'No API key saved':credential.hasApiKey===true?'API key saved in D1':'Key saved')]),ActionGroup([edit,remove],{compact:true})],{className:'credential-row'});
}

export function CredentialServiceOptions(services,savedNames=[]) {
  return [Option('Select a service',''),...[...new Set([...services,...savedNames])].map(name=>Option(name,name))];
}
export const Form=(children,props={})=>element('form',props,children);
export const Panel=(children,props={})=>Section(children,{className:'settings-card',...props});
export const FormStack=children=>Stack(children,{className:'form-stack'});
export const FormField=options=>Stack(Field(options),{className:'form-field'});

// Reusable layouts for searchable workspaces and evidence-backed results.
export const Workspace=children=>Stack(children,{className:'workspace-shell'});
export const WorkspaceColumns=children=>Stack(children,{className:'workspace-columns'});
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
export function RecordRow({title,detail,notes='',actions=[]}) {
  return Section([Strong(title),Note(detail),notes?Text(notes):null,ActionGroup(actions,{compact:true})],{className:'record-row'});
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
