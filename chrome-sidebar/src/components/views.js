import * as UI from './ui.js';
const {SubPage,ActionGroup,AppHeader,Section,Main,Stack,Text,Heading,Note,Notice,Button,Link,Badge,List,Field,SectionTitle,Disclosure,ToolHeading,Highlight,StatusCard,Metrics,SourceNote,UploadField,EditableResult}=UI;
export function DraftView() {
  const history=Stack([
    SectionTitle('Pick history',Button('Export',{id:'export',disabled:true})),
    Stack([...Field({id:'team',label:'Filter by team',kind:'select',hiddenLabel:true,options:[{text:'All teams',value:'all'}]}),...Field({id:'search-picks',label:'Search picks',placeholder:'Find a player…',hiddenLabel:true})],{className:'filters'}),
    Text('Picks will appear as ESPN announces them.',{id:'empty',className:'empty'}),List([],{id:'picks',className:'pick-list'})
  ]);
  const spreadsheet=Stack([
    Note('Combined Ranks · original order'),UI.StatusLegend(),Note('',{id:'spreadsheet-context'}),Stack([],{id:'spreadsheet-players'})
  ]);
  const draft=Section([
    Section([UI.Label('RECOMMENDED NEXT PICKS'),Note('',{id:'advice-context',className:'footnote context-note'}),UI.Strong('Waiting for live draft',{id:'next-pick-name'}),Notice('',{id:'advice-status',className:'notice notice-subtle'}),Stack([],{id:'recommendations'})],{id:'next-pick-chip',className:'next-pick-chip recommendation-summary','aria-label':'Recommended next picks'}),
    StatusCard({statusId:'connection',detailId:'status-detail',dotId:'dot',status:'Waiting for ESPN',detail:'Open your ESPN draft room to start capturing picks.',links:[{text:'Open league ↗',href:'https://fantasy.espn.com/football/team?leagueId=182527585&teamId=8&seasonId=2026'},{text:'Practice draft ↗',href:'https://fantasy.espn.com/football/mockdraftlobby'}]}),
    Button('Correct draft picks',{id:'open-corrections'}),
    ...Field({id:'session',label:'Draft session',kind:'select',options:[{text:'2026 league draft',value:'league:2026:182527585'}]}),
    Metrics([{id:'pick-count',value:0,label:'PICKS CAPTURED'},{id:'round',value:'—',label:'ROUND'},{id:'my-count',value:0,label:'YOUR PICKS'}]),Notice('',{id:'coverage',hidden:true}),
    UI.Tabs({id:'draft-data',label:'Draft data',items:[{key:'history',label:'Pick history',content:history},{key:'spreadsheet',label:'Spreadsheet',content:spreadsheet}]}),
    Note('Saved on this device · Keep ESPN open.')
  ],{id:'draft-view'});
  return Section([ToolHeading('Bedford Bridges','10 teams · Half-PPR'),Main([draft,RulesView(),CorrectionsView(),Notice('',{id:'error',role:'alert',hidden:true})])],{id:'football-tool'});
}
export function CorrectionsView() {
  return SubPage({id:'corrections-view',title:'Correct draft picks',backId:'close-corrections',children:[
    Note('',{id:'manual-session-label'}),
    SectionTitle('ESPN players',Button('Sync ESPN players',{id:'sync-espn-players'})),Note('',{id:'espn-sync-status',role:'status'}),
    Notice('Mark players below to use a manually maintained board. Live capture keeps running separately.',{id:'manual-mode-note'}),
    ActionGroup([Button('Use manual board',{id:'enable-manual',variant:'primary'}),Button('Use live feed',{id:'disable-manual',variant:'secondary'})]),
    Disclosure('Draft progress',[
      ...Field({id:'manual-clock',label:'Current overall pick',kind:'number',placeholder:'Unknown'}),
      ...Field({id:'manual-slot',label:'Your draft position',kind:'select',options:[{text:'Unknown',value:''},...Array.from({length:10},(_,i)=>({text:String(i+1),value:String(i+1)}))]}),
      Button('Save progress',{id:'save-manual-progress'})
    ]),
    Note('If the feed stops, update the current pick here. Leave your position unknown until ESPN assigns it.'),
    ...Field({id:'manual-search',label:'Find a player',placeholder:'Search name or position…'}),
    Note('',{id:'manual-result-count'}),Notice('',{id:'manual-feedback',hidden:true}),Stack([],{id:'manual-players'})
  ]});
}
export function RulesView() {
  return Disclosure('League rules',[SectionTitle('The rulebook',Badge('SAVED RULES')),Note('Saved September 8, 2026 · Settings won’t update automatically.'),...Field({id:'search-rules',label:'Search rules',placeholder:'Search scoring, waivers, roster…',hiddenLabel:true}),Stack([],{id:'rules'}),Text('No matching rules.',{id:'no-rules',hidden:true})],{id:'rules-view'});
}
export function GmailView() {
  return Section([SectionTitle('Current email',Button('Refresh',{id:'refresh-email'}),{level:1}),Heading('Open an email in Gmail',2,{id:'email-subject',className:'content-title'}),Note('',{id:'email-from',className:'footnote content-meta'}),Note('',{id:'email-read-status',role:'status'}),
    ActionGroup([Button('Summarize',{id:'summarize-email',variant:'secondary',disabled:true}),Button('Generate reply',{id:'reply-email',variant:'primary',disabled:true})]),Note('',{id:'email-action-status',role:'status'}),
    EditableResult({id:'email-result',titleId:'email-result-title',copyId:'copy-email-output',fieldId:'email-output'}),Disclosure('Email text',[Text('',{id:'email-preview',className:'source-preview'})],{id:'email-source',hidden:true})
  ],{id:'gmail-tool',className:'tool-page',hidden:true});
}
export const HomeView=()=>Section([Heading('Ready when you are.',1),Note('Open Gmail or an ESPN draft. The sidebar follows your current tab.'),Link('Open Gmail ↗','https://mail.google.com/')],{id:'home-tool',className:'tool-page',hidden:true});
export function mountApp(root) {root.replaceChildren(AppHeader({}),DraftView(),GmailView(),HomeView());}
