import * as UI from './ui.js';
const {SubPage,ActionGroup,AppHeader,Section,Main,Stack,Text,Heading,Note,Notice,Button,Link,Badge,List,Field,SectionTitle,Disclosure,ToolHeading,Highlight,StatusCard,Metrics,SourceNote,UploadField,EditableResult}=UI;
export function DraftView() {
  const draft=Section([
    Section([UI.Label('RECOMMENDED NEXT PICKS'),Note('',{id:'advice-context',className:'footnote context-note'}),UI.Strong('Waiting for live draft',{id:'next-pick-name'}),Notice('',{id:'advice-status',className:'notice notice-subtle'}),Stack([],{id:'recommendations'})],{id:'next-pick-chip',className:'next-pick-chip recommendation-summary','aria-label':'Recommended next picks'}),
    Stack([],{id:'roster-counts','aria-live':'polite'}),
    StatusCard({statusId:'connection',detailId:'status-detail',dotId:'dot',status:'Waiting for ESPN',detail:'Open your ESPN draft room to start capturing picks.',links:[{text:'Open league ↗',href:'https://fantasy.espn.com/football/team?leagueId=182527585&teamId=8&seasonId=2026'},{text:'Practice draft ↗',href:'https://fantasy.espn.com/football/mockdraftlobby'}]}),
    Metrics([{id:'pick-count',value:0,label:'PICKS CAPTURED'},{id:'round',value:'—',label:'ROUND'},{id:'my-count',value:0,label:'YOUR PICKS'}]),Notice('',{id:'coverage',hidden:true}),
    SectionTitle('Draft board'),UI.StatusLegend(),Note('',{id:'spreadsheet-context'}),
    Notice('',{id:'manual-feedback',hidden:true}),DraftSettings(),Stack([],{id:'spreadsheet-players'}),
    Note('Saved on this device · Keep ESPN open.')
  ],{id:'draft-view'});
  return Section([ToolHeading('Bedford Bridges','10 teams · Half-PPR'),Main([draft,RulesView(),Notice('',{id:'error',role:'alert',hidden:true})])],{id:'football-tool'});
}
export function DraftSettings() {
  return Disclosure('Settings',[
    UI.Toggle({id:'capture-picks',label:'ESPN is capturing picks',checked:true,descriptionId:'capture-help'}),
    Note('On: use ESPN picks. Off: mark players on the board.',{id:'capture-help'}),
    Stack([
      ...Field({id:'manual-clock',label:'Current overall pick',kind:'number',placeholder:'Unknown'}),
      ...Field({id:'manual-slot',label:'Your draft position',kind:'select',options:[{text:'Unknown',value:''},...Array.from({length:10},(_,i)=>({text:String(i+1),value:String(i+1)}))]}),
      Button('Save progress',{id:'save-manual-progress'}),
      Note('Update the current pick as your manual draft progresses.'),
      ...Field({id:'manual-search',label:'Player outside your spreadsheet',placeholder:'Search ESPN players…'}),
      Note('',{id:'manual-result-count'}),Stack([],{id:'manual-players'})
    ],{id:'manual-settings',hidden:true}),
    Button('Refresh ESPN player list',{id:'sync-espn-players'}),Note('',{id:'espn-sync-status',role:'status'})
  ],{id:'draft-settings',className:'settings-panel'});
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
