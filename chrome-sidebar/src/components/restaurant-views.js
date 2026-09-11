import * as UI from './ui.js';
const {Workspace,WorkspaceFlow,FieldGrid,FormField:F,Form,Section,Heading,Note,Notice,Button,Link,Stack,Toggle,SegmentedField,SettingsGroup,ActionGroup,Disclosure,ResultBlock,ChoiceRow,EvidenceList}=UI;
// One full-width page: the search sits above its own results, so nothing is
// squeezed into a side column and the shortlist appears where it was asked for.
export function RestaurantWorkspace({mobile=false}={}) {
  return Workspace([
    Stack([Stack([mobile?null:Note('ERIC’S PERSONAL TOOLS'),Heading('Find a table',1)]),mobile?null:Link('AI settings','settings.html')],{className:'workspace-heading'}),
    WorkspaceFlow([
      Section([
        Form([
          Stack([
            SettingsGroup({title:'Where to eat',level:2,children:[
              SegmentedField({id:'restaurant-mode',label:'Search for',options:[{text:'A specific restaurant',value:'restaurant'},{text:'A category',value:'category'}]}),
              F({id:'restaurant-query',label:'Restaurant name',kind:'text',placeholder:'Name or approximate spelling'}),
              Note('For example: 2 Michelin stars, NYT top 20, Infatuation above 8.5.',{id:'restaurant-category-help',hidden:true}),
              FieldGrid([F({id:'restaurant-city',label:'City',kind:'text'}),F({id:'restaurant-neighborhood',label:'Neighborhood (optional)',kind:'text',placeholder:'Any neighborhood'})]),
              Stack([Toggle({id:'restaurant-travel',label:'Include longer travel options',descriptionId:'restaurant-travel-help'}),Note('Off excludes the Lower East Side, East Village, Brooklyn, and Queens.',{id:'restaurant-travel-help'})],{id:'restaurant-nyc'})
            ]}),
            SettingsGroup({title:'When & how many',level:2,children:[
              Stack([Toggle({id:'restaurant-flex-dates',label:'Flexible dates',descriptionId:'restaurant-date-help'})],{id:'restaurant-date-options',hidden:true}),
              FieldGrid([F({id:'restaurant-date',label:'Date',kind:'date'}),Stack([F({id:'restaurant-through',label:'Last date',kind:'date'})],{id:'restaurant-through-field',hidden:true})]),
              Note('Up to 7 dates, each checked separately.',{id:'restaurant-date-help',hidden:true}),
              FieldGrid([F({id:'restaurant-start',label:'From',kind:'time'}),F({id:'restaurant-end',label:'Until',kind:'time'})]),
              Toggle({id:'restaurant-flexible',label:'Flexible party size',descriptionId:'restaurant-party-help'}),
              Stack([F({id:'restaurant-party',label:'People',kind:'number'})],{id:'restaurant-fixed-fields'}),
              Stack([FieldGrid([F({id:'restaurant-min',label:'Minimum people',kind:'number'}),F({id:'restaurant-max',label:'Maximum people',kind:'number'})])],{id:'restaurant-flex-fields',hidden:true}),
              Note('Up to 8 sizes between 1 and 20, checked separately.',{id:'restaurant-party-help',hidden:true})
            ]})
          ],{className:'workspace-form'}),
          Disclosure('Research settings',[
            Stack([
              F({id:'restaurant-limit',label:'Maximum restaurants',kind:'select',options:[{text:'6 restaurants',value:'6'},{text:'12 restaurants',value:'12'},{text:'24 restaurants',value:'24'}]}),
              F({id:'restaurant-connection',label:'OpenAI connection',kind:'select',options:[{text:'Loading connections\u2026',value:''}]}),
              Button('Reload',{id:'restaurant-reload',variant:'secondary'})
            ],{className:'research-grid'}),
            Notice('',{id:'restaurant-connection-status',role:'status',hidden:true})
          ],{className:'research-settings'}),
          ActionGroup([Button('Find restaurants',{id:'restaurant-find',variant:'primary',type:'submit'}),Button('Stop search',{id:'restaurant-stop',variant:'secondary',hidden:true})],{compact:true}),
          Notice('',{id:'restaurant-status','aria-live':'polite',hidden:true}),
          Notice('',{id:'restaurant-error',role:'alert',hidden:true})
        ],{id:'restaurant-form',className:'form-stack'})
      ],{id:'restaurant-search-section','aria-label':'Restaurant search'}),
      Section([
        Heading('Shortlist',2),
        Note('Your last shortlist stays available offline.',{id:'restaurant-empty',hidden:true}),
        Notice('',{id:'restaurant-summary',hidden:true}),
        Notice('',{id:'restaurant-clarification',hidden:true}),
        Stack([],{id:'restaurant-candidates',className:'result-list'}),
        ActionGroup([Button('Check selected restaurants',{id:'restaurant-check',variant:'primary',hidden:true})],{compact:true}),
        Section([Heading('Availability',2),Note('',{id:'restaurant-result-context'}),Stack([],{id:'restaurant-results',className:'result-list'})],{id:'restaurant-availability',hidden:true})
      ],{id:'restaurant-shortlist',hidden:true,'aria-label':'Restaurant results'})
    ])
  ]);
}

// Mobile uses the same research form and candidate evidence. Booking providers
// are opened explicitly: a web app cannot inspect another site's signed-in tab.
export function MobileRestaurantWorkspace() {
  const view=RestaurantWorkspace({mobile:true});
  view.classList.add('workspace-shell--mobile');
  const columns=view.querySelector('.workspace-flow');
  const form=columns.firstElementChild,results=columns.lastElementChild;
  results.hidden=false;
  const disclosure=Disclosure('Search restaurants',[form],{id:'restaurant-search-panel'});
  disclosure.open=true;
  columns.replaceChildren(results,disclosure);
  // Keep success and cache errors visible even after collapsing the search form.
  view.querySelector('.workspace-heading').after(view.querySelector('#restaurant-status'),view.querySelector('#restaurant-error'));
  view.querySelector('#restaurant-check').remove();
  view.querySelector('#restaurant-availability').remove();
  return view;
}

export function MobileRestaurantCandidate(r,{search,links,expired=false}) {
  return ResultBlock({title:r.name,meta:[r.neighborhood,r.borough,r.city].filter(Boolean).join(' · '),detail:r.reason,children:[
    Note(r.address),
    r.travel==='longer'?Notice('Longer travel from the UWS. Review the address before booking.'):r.travel==='unknown'?Notice('Neighborhood is unverified. Review the address before booking.'):null,
    EvidenceList(r.evidence),
    Disclosure('Booking pages',[
      Note(`${search.endDate&&search.endDate!==search.date?`${search.date} – ${search.endDate}`:search.date} · ${search.startTime}–${search.endTime} local time`),
      expired?Note('This search date has passed. Run a new search for current booking links.'):
        links.length?Stack(links.map(link=>Link(`${link.provider} · ${link.size} people${link.date?` · ${link.date}`:''}${link.time?` · near ${link.time}`:''}`,link.url)),{className:'booking-links'}):Note('No booking destination was verified.')
    ])
  ]});
}
export function RestaurantCandidate(r,selected,onChange) {
  return ResultBlock({title:r.name,meta:[r.neighborhood,r.borough,r.city].filter(Boolean).join(' · '),detail:r.reason,children:[
    ChoiceRow({title:`Check ${r.name}`,description:r.address,checked:selected,onChange}),
    r.travel==='longer'?Notice('Longer travel from the UWS. Select this restaurant to include it.'):r.travel==='unknown'?Notice('Neighborhood is unverified. Review the address before selecting.'):null,
    Note(r.booking.length?`Booking providers: ${r.booking.map(b=>b.provider).join(', ')}`:'No current booking destination was verified.'),EvidenceList(r.evidence)
  ]});
}
const labels={available:'Tables found',unavailable:'No tables shown',unreleased:'Not released',attention:'Needs attention',checking:'Checking…',error:'Check failed',cancelled:'Not checked'};
export function ReservationResult(result,{onOpen,onRecheck,busy}) {
  const open=Button('Open booking page',{variant:'secondary'});open.addEventListener('click',onOpen);
  const recheck=Button('Recheck page',{variant:'secondary',disabled:busy||!result.tabId});recheck.addEventListener('click',onRecheck);
  return ResultBlock({title:`${result.restaurant.name} · ${result.size} ${result.size===1?'person':'people'}`,meta:`${result.provider} · ${result.date}${result.checkedAt?` · Checked ${new Date(result.checkedAt).toLocaleTimeString()}`:''}`,status:labels[result.status]||result.status,detail:result.detail,children:[
    result.slots?.length?Stack(result.slots.map(slot=>UI.Badge(`${slot.time} · ${slot.label}`)),{className:'slot-list','aria-label':'Available times'}):null,
    ActionGroup([open,recheck],{compact:true}),result.status==='attention'?Note('Open the page, complete any login or verification, select the requested filters, then return here and recheck.'):null
  ]});
}
