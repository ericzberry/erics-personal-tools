import * as UI from './ui.js';
import {displayTime,displayDate,kindLabel,describeValue,areaLabel,CLAIM_FIELDS} from '../restaurant-data.js';
const {Workspace,WorkspaceFlow,FieldGrid,FormField:F,Form,Section,Heading,Note,Notice,Button,Link,Stack,Toggle,ActionGroup,Disclosure,RecordGroup,Text,Strong,Label,ProgressBar,RowLink,OPEN_GLYPH}=UI;
const TIMES=Array.from({length:23},(_,i)=>{const minutes=11*60+30+i*30;const value=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;return {text:displayTime(value),value};});
const WINDOWS=[{text:'± 30 min',value:'30'},{text:'± 1 hour',value:'60'},{text:'± 1½ hours',value:'90'},{text:'± 2 hours',value:'120'}];
// One page: the request, then what was understood, then one result per
// restaurant (docs/RESTAURANT_SEARCH_SPEC.md §3.1, §4). Nothing here decides;
// it lays out what the controller hands it.
export function RestaurantWorkspace({mobile=false}={}) {
  return Workspace([
    Stack([Stack([mobile?null:Note('ERIC’S PERSONAL TOOLS'),Heading('Find a table',1)]),mobile?null:Link('AI settings','settings.html')],{className:'workspace-heading'}),
    WorkspaceFlow([
      Section([
        Form([
          Stack([
            F({id:'restaurant-text',label:'Restaurant or dinner idea',kind:'text',placeholder:'Quiet Italian near the UWS, no tasting menu'}),
            F({id:'restaurant-city',label:'City',kind:'text'})
          ],{className:'form-stack collapsible',id:'restaurant-request'}),
          Stack([
            F({id:'restaurant-date',label:'Date',kind:'date'}),
            F({id:'restaurant-people',label:'People',kind:'number',min:1,max:20,step:1}),
            F({id:'restaurant-time',label:'Time',kind:'select',options:TIMES}),
            F({id:'restaurant-window',label:'Window',kind:'select',options:WINDOWS})
          ],{className:'outing-row'}),
          Stack([
            Stack([Toggle({id:'restaurant-flex-dates',label:'More dates'}),Stack([F({id:'restaurant-through',label:'Last date',kind:'date'})],{id:'restaurant-through-field',hidden:true})],{className:'outing-flex'}),
            Stack([Toggle({id:'restaurant-flex-party',label:'More sizes'}),Stack([F({id:'restaurant-max',label:'Up to',kind:'number',min:1,max:20,step:1})],{id:'restaurant-max-field',hidden:true})],{className:'outing-flex'})
          ],{className:'outing-flex-row',id:'restaurant-flex-row'}),
          Disclosure('Preferences',[
            FieldGrid([F({id:'restaurant-neighborhood',label:'Neighborhood',kind:'text',placeholder:'Any'}),F({id:'restaurant-spend',label:'Most per person',kind:'money',placeholder:'Any'})]),
            FieldGrid([F({id:'restaurant-dietary',label:'Dietary',kind:'text',placeholder:'None'}),F({id:'restaurant-format',label:'Menu',kind:'select',options:[{text:'Any',value:''},{text:'No tasting menu',value:'no-tasting'},{text:'Tasting menu',value:'tasting'}]})]),
            Stack([Toggle({id:'restaurant-travel',label:'Include longer travel'})],{id:'restaurant-nyc'})
          ],{id:'restaurant-preferences',className:'research-settings collapsible'}),
          ActionGroup([Button('Find restaurants',{id:'restaurant-find',variant:'primary',type:'submit'}),Button('Stop',{id:'restaurant-stop',variant:'secondary',hidden:true})],{compact:true}),
          Notice('',{id:'restaurant-connection-status',role:'status',hidden:true}),
          Notice('',{id:'restaurant-status','aria-live':'polite',hidden:true}),
          Notice('',{id:'restaurant-error',role:'alert',hidden:true})
        ],{id:'restaurant-form',className:'form-stack'})
      ],{id:'restaurant-search-section','aria-label':'Restaurant search'}),
      Section([
        Stack([Stack([],{id:'restaurant-summary-chips',className:'query-summary'}),ActionGroup([Button('Edit search',{id:'restaurant-edit',variant:'secondary',size:'compact'}),Button('',{id:'restaurant-mode-switch',variant:'quiet',size:'compact',hidden:true})],{compact:true})],{className:'query-summary-line'}),
        Note('',{id:'restaurant-summary-notes'})
      ],{id:'restaurant-summary',hidden:true,'aria-label':'What was understood'}),
      Section([Heading('Which location?',2),Stack([],{id:'restaurant-choices',className:'choice-list'})],{id:'restaurant-choice',hidden:true,'aria-label':'Choose the restaurant'}),
      Section([
        Stack([ProgressBar({id:'restaurant-progress',label:'Checking availability'})],{id:'restaurant-progress-row',hidden:true}),
        Stack([],{id:'restaurant-groups',className:'result-groups'}),
        Note('',{id:'restaurant-limited'}),
        ActionGroup([Button('Check remaining restaurants',{id:'restaurant-more',variant:'secondary',hidden:true}),Button('Continue checking',{id:'restaurant-continue',variant:'secondary',hidden:true}),Button('Retry research',{id:'restaurant-retry',variant:'secondary',hidden:true})],{compact:true}),
        Disclosure('',[Stack([],{id:'restaurant-unverified-list'})],{id:'restaurant-unverified',hidden:true,className:'result-fold'}),
        Disclosure('',[Stack([],{id:'restaurant-excluded-list'})],{id:'restaurant-excluded',hidden:true,className:'result-fold'})
      ],{id:'restaurant-results',hidden:true,'aria-label':'Restaurant results'})
    ])
  ]);
}
export function MobileRestaurantWorkspace() {
  const view=RestaurantWorkspace({mobile:true});
  view.classList.add('workspace-shell--mobile');
  return view;
}
// The request as it was understood: one chip per thing it asks for (§3.2).
export function summaryChips(parts){return parts.map(text=>Label(text,{className:'pill query-chip'}));}
// Up to three places that share a name, each a press (§3.3).
export function LocationChoice(options,onChoose){
  return options.map(option=>{
    const button=Button('',{variant:'secondary',className:'choice-option'});
    button.append(Strong(option.name),Note([option.neighborhood,option.address].filter(Boolean).join(' · ')));
    button.addEventListener('click',()=>onChoose(option));
    return button;
  });
}
const FIELD_LABELS={michelin_stars:'Michelin stars',michelin_bib:'Bib Gourmand',nyt_rank:'NYT rank',nyt_stars:'NYT stars',infatuation_score:'Infatuation score',price_per_person:'Price per person',dining_format:'Menu',cuisine:'Cuisine',area:'Area',address:'Address',status:'Status',dietary:'Dietary',atmosphere:'Atmosphere',booking:'Booking',menu:'Menu'};
const claimValue=c=>c.value===null||c.value===undefined?'':c.field==='price_per_person'?`$${Math.round(c.value.minorUnits/100)} (${c.value.basis})`:Array.isArray(c.value)?c.value.join(', '):typeof c.value==='boolean'?(c.value?'Yes':'No'):String(c.value);
const STATUS_WORDS={supported:'read from the source',contradicted:'contradicted',unknown:'not verified'};
// Each fact with what it rests on: the value, the source, whether it was read
// there, and the passage (§5.1). A lead says it is a lead.
export function ClaimRows(claims){
  return claims.map(c=>Stack([
    Stack([Strong(`${FIELD_LABELS[c.field]||c.field}${claimValue(c)?`: ${claimValue(c)}`:''}`),Label(STATUS_WORDS[c.status]||c.status,{className:'pill'})],{className:'claim-line'}),
    c.source.url?Link(c.source.title||c.source.publisher||c.source.url,c.source.url):null,
    Note([c.excerpt?`“${c.excerpt}”`:'',c.edition?`${c.edition} edition`:'',c.published?`Published ${c.published}`:'',c.retrievedAt?`Read ${new Date(c.retrievedAt).toLocaleDateString()}`:'',c.status!=='supported'&&c.reason?c.reason:''].filter(Boolean).join(' · '))
  ],{className:'evidence-row'}));
}
const ago=(iso,now)=>{const minutes=Math.max(0,Math.round((now-Date.parse(iso))/60000));return minutes<1?'just now':minutes<60?`${minutes} min ago`:`${Math.round(minutes/60)} h ago`;};
const STATUS_LINES={checking:'Checking…',not_checked:'',login_required:'Sign in on the site to see times.',challenge_required:'The site asked for a verification step.',choose_experience:'Choose an experience on the site to see times.',unsupported:'Times are checked on the site.',failed:'',cancelled:'Not checked.',stale:'Previously observed.'};
// One restaurant, one result (§4.1): who it is, why it fits, what it costs,
// what was observed, one way in, and the detail behind a disclosure.
export function RestaurantResult(entry,{outing=null,summary=null,mobile=false,handoffs=[],onOpen,onRecheck,userTab=false,busy=false,now=Date.now()}={}){
  const {venue,explanation,eligibility,fit}=entry;
  const meta=[venue.neighborhood||areaLabel(''),...(venue.cuisine||[]).slice(0,2)].filter(Boolean).join(' · ');
  const price=fit.contributions.find(d=>d.dimension==='price'&&!d.unknown)?.detail||(venue.claims||[]).filter(c=>c.field==='price_per_person'&&c.status==='supported'&&c.value).map(c=>`About $${Math.round(c.value.minorUnits/100)} per person`)[0]||'';
  const missing=[...new Set([...explanation.unknowns,...eligibility.checks.filter(c=>c.status==='unknown').map(c=>c.detail)])].filter(Boolean);
  const basis=[price,explanation.compromise&&explanation.compromise!==price?`Compromise: ${explanation.compromise}`:'',missing.length?`Not verified: ${missing.join('; ')}`:''].filter(Boolean).join(' · ');
  const children=[];
  if(explanation.reason)children.push(Text(explanation.reason));
  if(basis)children.push(Note(basis));
  const providers=venue.providers||[];
  if(outing&&!mobile){
    if(summary?.slots?.length){
      // A time with a stable link opens that slot; without one the action says
      // what it does — open the provider's search near that time — and the
      // seating stays on the label, because 7:15 at the bar is not 7:15 in
      // the dining room (§4.1).
      const times=summary.slots.map(slot=>{
        const where=slot.seating||slot.experience||'Seating not specified';
        const text=slot.slotURL?`${displayTime(slot.time)} · ${where}`:`Open ${displayTime(slot.time)} search · ${where}`;
        const button=Button(text,{variant:'secondary',size:'compact',className:'slot-action',title:slot.slotURL?`Opens this ${displayTime(slot.time)} slot on ${venue.providers?.[0]?.provider||'the provider'}`:`Opens the provider search near ${displayTime(slot.time)}; the table is chosen there`});
        button.addEventListener('click',()=>onOpen?.(slot));
        return button;
      });
      children.push(Stack(times,{className:'slot-list','aria-label':'Times observed'}));
      if(summary.detail)children.push(Note(summary.detail));
    }else if(summary){
      const line=summary.detail||STATUS_LINES[summary.status]||'';
      if(line)children.push(Note(line));
    }else if(providers.length)children.push(Note('Not checked yet.'));
    else children.push(Note('No booking page was verified for this restaurant.'));
  }
  const actions=[];
  if(mobile||!outing){
    for(const link of handoffs)actions.push(Link(link.label,link.url,{className:'button-secondary button--compact'}));
  }else{
    const primary=providers[0];
    if(primary){const open=Button(`Open on ${primary.provider}`,{variant:summary?.slots?.length?'secondary':'primary',size:'compact'});open.addEventListener('click',()=>onOpen?.(null));actions.push(open);}
    if(userTab){const recheck=Button('Recheck page',{variant:'secondary',size:'compact',disabled:busy});recheck.addEventListener('click',()=>onRecheck?.());actions.push(recheck);}
  }
  const details=[];
  if(venue.address)details.push(Note(venue.address));
  if(venue.officialURL)details.push(Link('Official site',venue.officialURL));
  if(venue.claims?.length)details.push(...ClaimRows(venue.claims));
  if(providers.length)details.push(Note(`Booking: ${providers.map(p=>p.provider).join(', ')}`));
  if(summary?.observedAt)details.push(Note(`Observed ${ago(summary.observedAt,now)}${summary.coverage==='partial'?' · Coverage incomplete':''}`));
  if(details.length)children.push(Disclosure('Details',details,{className:'result-details'}));
  const head=Stack([Stack([Heading(venue.name,3),meta?Label(meta,{className:'record-meta'}):null],{className:'record-head'}),ActionGroup(actions,{compact:true,className:'action-group action-group--compact record-actions'})],{className:'record-line'});
  return Section([head,...children],{className:'result-block',id:`restaurant-result-${venue.id}`});
}
export const ResultGroup=(title,rows)=>title?RecordGroup(title,rows):Stack(rows,{className:'record-group'});
// A restaurant that is not a choice, with the fact that placed it here (§3.4).
export function FoldedResult(entry){
  const {venue,eligibility}=entry;
  const why=eligibility.closure?.detail||eligibility.checks.filter(c=>c.status!=='pass').map(c=>c.detail).filter(Boolean).join(' · ');
  return Section([Stack([Stack([Strong(venue.name),Label(venue.neighborhood||'',{className:'record-meta'})],{className:'record-head'})],{className:'record-line'}),why?Note(why):null],{className:'record-row'});
}
