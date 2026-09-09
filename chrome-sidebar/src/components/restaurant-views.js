import * as UI from './ui.js';
const {Workspace,WorkspaceColumns,FieldGrid,FormField:F,Form,FormStack,Section,Heading,Text,Note,Notice,Button,Link,Stack,Toggle,SettingsGroup,ActionGroup,Disclosure,ResultBlock,ChoiceRow,EvidenceList}=UI;
export function RestaurantWorkspace() {
  return Workspace([
    Stack([Stack([Note('ERIC’S PERSONAL TOOLS'),Heading('Find a table',1),Text('A favorite restaurant, or somewhere worth discovering.')]),Link('AI settings','settings.html')],{className:'workspace-heading'}),
    WorkspaceColumns([
      Section([
        Form([
          SettingsGroup({title:'Where to eat',level:2,children:[
            F({id:'restaurant-mode',label:'Search for',kind:'select',options:[{text:'A specific restaurant',value:'restaurant'},{text:'A category of restaurants',value:'category'}]}),
            F({id:'restaurant-query',label:'Restaurant name',kind:'text',placeholder:'Name or approximate spelling'}),
            Note('For example: exactly 2 Michelin stars, NYT top 20, or Infatuation above 8.5.',{id:'restaurant-category-help',hidden:true}),
            F({id:'restaurant-city',label:'City',kind:'text'}),
            F({id:'restaurant-neighborhood',label:'Neighborhood (optional)',kind:'text',placeholder:'Any neighborhood'}),
            Stack([Toggle({id:'restaurant-travel',label:'Include longer travel options',descriptionId:'restaurant-travel-help'}),Note('From the Upper West Side. Off excludes the Lower East Side, East Village, Brooklyn, and Queens from category searches.',{id:'restaurant-travel-help'})],{id:'restaurant-nyc'})
          ]}),
          SettingsGroup({title:'When & how many',level:2,children:[
            F({id:'restaurant-date',label:'Date',kind:'date'}),
            FieldGrid([F({id:'restaurant-start',label:'From',kind:'time'}),F({id:'restaurant-end',label:'Until',kind:'time'})]),
            Note('Times are local to the restaurant. Results cover this time window.'),
            Toggle({id:'restaurant-flexible',label:'Flexible party size',descriptionId:'restaurant-party-help'}),
            Stack([F({id:'restaurant-party',label:'People',kind:'number'})],{id:'restaurant-fixed-fields'}),
            Stack([FieldGrid([F({id:'restaurant-min',label:'Minimum people',kind:'number'}),F({id:'restaurant-max',label:'Maximum people',kind:'number'})])],{id:'restaurant-flex-fields',hidden:true}),
            Note('Flexible searches check each size separately, up to 8 sizes between 1 and 20.',{id:'restaurant-party-help'})
          ]}),
          Disclosure('Research settings',[
            F({id:'restaurant-limit',label:'Maximum restaurants',kind:'select',options:[{text:'6 restaurants',value:'6'},{text:'12 restaurants',value:'12'},{text:'24 restaurants',value:'24'}]}),
            F({id:'restaurant-connection',label:'OpenAI connection',kind:'select',options:[{text:'Loading connections…',value:''}]}),
            Note('A suitable model is selected automatically. Research and page interpretation use your API credit. Booking pages open in temporary background tabs; their rendered booking content is sent to your saved OpenAI connection.'),
            ActionGroup([Button('Reload connections',{id:'restaurant-reload',variant:'secondary'})],{compact:true}),
            Note('',{id:'restaurant-connection-status',role:'status'})
          ],{className:'research-settings'}),
          ActionGroup([Button('Find restaurants',{id:'restaurant-find',variant:'primary',type:'submit'}),Button('Stop search',{id:'restaurant-stop',variant:'secondary',hidden:true})],{compact:true}),
          Notice('',{id:'restaurant-status','aria-live':'polite',hidden:true}),
          Notice('',{id:'restaurant-error',role:'alert',hidden:true})
        ],{id:'restaurant-form',className:'form-stack'})
      ]),
      Section([
        Heading('Your shortlist',2),
        Note('Choose a restaurant and date to start. We’ll resolve the name, find booking providers, and check their live pages.',{id:'restaurant-empty'}),
        Notice('',{id:'restaurant-summary',hidden:true}),
        Notice('',{id:'restaurant-clarification',hidden:true}),
        Stack([],{id:'restaurant-candidates',className:'result-list'}),
        ActionGroup([Button('Check selected restaurants',{id:'restaurant-check',variant:'primary',hidden:true})],{compact:true}),
        Section([Heading('Availability',2),Note('',{id:'restaurant-result-context'}),Note('Availability can change. Open the provider to review details and finish booking.'),Stack([],{id:'restaurant-results',className:'result-list'})],{id:'restaurant-availability',hidden:true})
      ],{'aria-label':'Restaurant results'})
    ])
  ]);
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
