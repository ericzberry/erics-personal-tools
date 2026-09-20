import {CapabilityPicker} from './capabilities.js';
import * as UI from './ui.js';
import {AI_PROVIDERS} from '../ai-providers.js';
import {usageSummary,formatBytes} from '../quota-data.js';
const {SubPage,ActionGroup,AppHeader,Section,Main,Stack,Text,Strong,Label,Heading,Note,Notice,Button,Link,Badge,List,Field,SectionTitle,Disclosure,ToolHeading,Highlight,StatusCard,Metrics,SourceNote,UploadField}=UI;
export function DraftView() {
  const draft=Section([
    Notice('',{id:'advice-status',className:'notice notice-subtle'}),
    Notice('',{id:'coverage',hidden:true}),
    Notice('',{id:'manual-feedback',hidden:true}),Stack([],{id:'spreadsheet-players'}),
    Note('Saved on this device · Keep ESPN open.')
  ],{id:'draft-view'});
  return Section([UI.StickyGroup([ToolHeading('Bedford Bridges','10 teams · Half-PPR'),Stack([],{id:'roster-counts','aria-live':'polite'}),Note('',{id:'advice-context',className:'footnote context-note'})]),Main([draft,Notice('',{id:'error',role:'alert',hidden:true})])],{id:'football-tool'});
}
export function DraftReset() {
  return Disclosure('Reset draft data',[
    Note('Clears this board’s picks and turns capture off.'),
    Button('Reset this draft',{id:'reset-draft',variant:'danger'}),Notice('',{id:'reset-draft-status',hidden:true})
  ],{className:'settings-panel'});
}
export function DraftSettings() {
  return Disclosure('Draft capture',[
    Button('Download ESPN diagnostics',{id:'download-espn-diagnostics'}),
    UI.Toggle({id:'capture-picks',label:'ESPN is capturing picks',checked:true,descriptionId:'capture-help'}),
    Note('On: use ESPN picks. Off: mark players on the board.',{id:'capture-help'}),
    Stack([
      ...Field({id:'manual-clock',label:'Current overall pick',kind:'number',placeholder:'Unknown'}),
      ...Field({id:'manual-slot',label:'Your draft position',kind:'select',options:[{text:'Unknown',value:''},...Array.from({length:10},(_,i)=>({text:String(i+1),value:String(i+1)}))]}),
      Button('Save progress',{id:'save-manual-progress',variant:'primary'}),
      ...Field({id:'manual-search',label:'Player outside your spreadsheet',placeholder:'Search ESPN players…'}),
      Note('',{id:'manual-result-count'}),Stack([],{id:'manual-players'})
    ],{id:'manual-settings',hidden:true}),
    Button('Refresh ESPN player list',{id:'sync-espn-players'}),Note('',{id:'espn-sync-status',role:'status'})
  ],{id:'draft-settings',className:'settings-panel'});
}
// The message itself is not shown: it is open in the tab beside this panel,
// and a second copy of it here only pushes the reply further down. What the
// panel adds are the two things it can do with that message — and they are two
// different things, so they are two sections rather than two buttons under one
// box. Reading it takes nothing but a click; answering it takes the line where
// Eric says what the reply should do, which is the whole of what he has to type.
export function GmailView() {
  return Section([UI.PageHeader({title:'Open an email in Gmail',titleId:'email-subject',action:Button('Refresh',{id:'refresh-email',variant:'secondary',size:'compact'})}),Main([Note('',{id:'email-from',className:'footnote content-meta'}),Note('',{id:'email-read-status',role:'status'}),
    UI.ResultSection({id:'email-summary',title:'Summary',
      action:Button('Summarize',{id:'summarize-email',variant:'secondary',size:'compact',disabled:true}),
      statusId:'summary-status',resultId:'summary-result',copyId:'copy-summary',fieldId:'summary-output',label:'Summary — editable'}),
    UI.ResultSection({id:'email-reply',title:'Reply',
      fields:[UI.FormField({id:'reply-intent',label:'What the reply should say',kind:'textarea',rows:3,className:'form-field--compact'}),
        ActionGroup([Button('Generate reply',{id:'reply-email',variant:'primary',disabled:true})])],
      statusId:'reply-status',resultId:'reply-result',copyId:'copy-reply',fieldId:'reply-output',label:'Reply draft — editable',
      // The voice belongs to the reply and to nothing else on this screen, so
      // it is kept inside that section rather than under the whole page.
      footer:VoiceView()})
  ])],{id:'gmail-tool',className:'tool-page',hidden:true});
}
// Where the voice replies are written in is kept and corrected. It sits under
// the reply because that is the only thing it changes, and it is closed
// because it is read once and then left alone for months.
export function VoiceView() {
  return Disclosure('Writing voice',[
    // One line: what the voice currently is, and the action that applies to it.
    Stack([Note('',{id:'voice-status',role:'status'}),ActionGroup([],{id:'voice-actions',compact:true})],{className:'voice-head'}),
    Stack([],{id:'voice-list',className:'voice-list'}),
    Stack([UI.FormField({id:'voice-prompt',label:'How you write — editable',kind:'textarea',rows:8,className:'form-field--compact'})],{id:'voice-editor',hidden:true})
  ],{id:'email-voice',className:'settings-panel voice-panel'});
}
export const VoiceLines=(voices=[])=>voices.map(voice=>Stack([
  Strong(voice.name),Note([voice.audience,...voice.markers].filter(Boolean).join(' · '))
],{className:'voice-line'}));
// The quiet screen, and the things it is worth interrupting for: whose birthday
// it is, and the money on a card that the close of the quarter takes back.
// Nothing coming leaves it exactly as it was.
export const HomeView=()=>Section([UI.PageHeader({title:'Ready when you are.'}),
  Main([Note('Open a tool, or a site a tool knows.'),Stack([],{id:'home-birthdays'})])],{id:'home-tool',className:'tool-page',hidden:true});
export function SettingsView() {
  return SubPage({id:'settings-tool',title:'Settings',backId:'close-settings',children:[
    UI.SettingsList([
    // One cloud connection, owned by the wallet that holds this device's copies,
    // and one link to the page that owns AI connections and their keys.
    Stack([],{id:'travel-settings-connection',className:'travel-wallet connection-only'}),
    UI.SettingsLink('AI connections','settings.html'),
    // The recovery code is device maintenance, not part of any tool, so this is
    // where it lives — out of the way of the sections it can open.
    UI.SettingsItem('Recovery code',[
      ActionGroup([Button('Show recovery code',{id:'show-recovery-code',variant:'secondary',size:'compact'})],{compact:true}),
      Stack([],{id:'recovery-code-output'}),
      Note('',{id:'recovery-code-status',role:'status'})
    ]),
    UI.SettingsItem('Draft',[DraftSettings(),DraftReset()])
    ])
  ]});
}

// Every capability that lives in the panel gets an empty section here; the
// controller for it fills the section in on first use.
const PanelTool=id=>Section([],{id:`${id}-tool`,className:'tool-page',hidden:true});
export function mountApp(root) {root.replaceChildren(AppHeader({}),UI.PageOfferBar(),DraftView(),GmailView(),HomeView(),RewardsView(),Section([],{id:'travel-tool',hidden:true}),
  ...['finance','taxes','attention','subscriptions','gifts','sizes','reminders','cards','personal'].map(PanelTool),SettingsView());}

// One AI action and the model that runs it. The action's name reads down the
// left and its model sits at the end of the line, the way a record's own
// controls do. Nothing explains what routing is: the choice is the explanation.
export function AiTaskRow({task,label,automatic,chosen,options,onChange}) {
  const id=`ai-task-${task.replace('.','-')}`;
  const select=UI.Select({id,label:`Model for ${label}`,options:[
    {text:automatic?`Automatic · ${automatic}`:'Automatic',value:''},
    ...options.map(option=>({text:option.id,value:option.id}))
  ]});
  const control=select.querySelector('select');
  // Selecting the option rather than assigning `value` works the same in every
  // host this screen renders in. `selected` is a property, so the shared list
  // is told to catch up before this row starts listening for the owner's own
  // change — otherwise the trigger would keep reading "Automatic".
  for(const option of control.options)option.selected=option.value===(chosen||'');
  control.dispatchEvent(new control.ownerDocument.defaultView.Event('change'));
  control.addEventListener('change',()=>onChange([...control.options].find(option=>option.selected)?.value||''));
  return Section([Stack([UI.Strong(label,{className:'record-name'}),
    Stack([select],{className:'ai-task-model'})],{className:'record-line'})],{className:'record-row ai-task-row'});
}
export function AISettingsView() {
  const field=UI.FormField;
  return Stack([
    Section([Stack([UI.Strong('eb',{className:'settings-monogram'}),UI.Strong('ericberry')],{className:'settings-brand'}),
      Note('Personal settings'),CapabilityPicker(),Text('AI connections',{className:'settings-nav-current'}),
      Note('ericberry → Tab → Enter',{className:'settings-shortcut'})
    ],{className:'settings-rail'}),
    Main([
      Stack([Stack([Heading('AI connections',1)]),
        Badge('Not connected',{id:'settings-connection-badge'})],{className:'settings-heading'}),
      Notice('',{id:'settings-status',role:'status',hidden:true}),
      // Three different things live on this page: the connections themselves,
      // which model runs which action, and one box for trying a connection out.
      // Down one page they were a long scroll with the thing being looked for
      // somewhere in the middle of it, so each is a tab and the tab's label is
      // its heading. What went wrong stays above the row, because it can come
      // from any of them.
      UI.Tabs({id:'settings-tabs',label:'Settings',items:[
      {key:'connections',label:'Connections',content:[
      Disclosure('Cloud connection',[
        Stack([
          field({id:'settings-token',label:'Extension access token',kind:'password',placeholder:'Paste your private token'}),
          ActionGroup([Button('Connect',{id:'settings-connect',variant:'primary'}),Button('Disconnect this browser',{id:'settings-disconnect',variant:'secondary'})]),
          Note('',{id:'settings-cloud-status',role:'status'})],{className:'connection-setup'})
      ],{id:'settings-cloud'}),
      // What the account's cloud is holding, against what the plan allows. It
      // sits with the connection because it is that connection's resource, and
      // it is the whole of the answer: a size, a limit, and the databases the
      // size is made of.
      UI.Panel([
        SectionTitle('Cloud storage',Button('Refresh',{id:'storage-refresh',variant:'secondary',size:'compact'})),
        Stack([Strong('—',{id:'storage-headline'}),Label('',{id:'storage-scope'})],{className:'storage-figure'}),
        UI.Meter({id:'storage-meter',label:'Cloud storage used',value:0}),
        Stack([],{id:'storage-databases',className:'storage-databases'}),
        Notice('',{id:'storage-status',role:'status',hidden:true})
      ],{className:'settings-card storage-card'}),
      Stack([
        Section([SectionTitle('Saved connections'),
          ActionGroup([Button('Add connection',{id:'connection-add',variant:'primary',size:'compact'}),Button('Reload connections',{id:'connection-reload',variant:'secondary',size:'compact'})],{compact:true,id:'connection-actions',hidden:true}),
          Text('Not connected.',{id:'connections-empty',className:'settings-empty'}),
          Stack([],{id:'connection-list',className:'connection-list'})],{className:'settings-library'}),
        UI.Panel([
          SectionTitle('Add connection',undefined,{titleId:'connection-editor-title'}),
          UI.Form([
            field({id:'ai-name',label:'Connection name',kind:'text',placeholder:'e.g. Writing assistant'}),
            field({id:'ai-provider',label:'Provider',kind:'select',options:AI_PROVIDERS.map(provider=>({text:provider.name,value:provider.id}))}),
            Stack([field({id:'ai-format',label:'API format',kind:'select',options:[{text:'OpenAI Chat Completions',value:'chat'},{text:'OpenAI Responses',value:'responses'},{text:'Anthropic Messages',value:'anthropic'}]})],{id:'ai-format-field',hidden:true}),
            field({id:'ai-base-url',label:'API base URL (optional)',kind:'url',placeholder:'https://…'}),
            Note('',{id:'ai-endpoint-help'}),
            field({id:'ai-key',label:'API key',kind:'password',placeholder:'Paste your provider’s key'}),
            Note('Stored encrypted, never shown again.',{id:'ai-key-help'}),
            UI.Toggle({id:'ai-clear-key',label:'Remove the saved API key',checked:false}),
            ActionGroup([Button('Save connection',{id:'connection-save',variant:'primary',type:'submit'}),Button('Cancel',{id:'connection-cancel',variant:'secondary'})]),
            Button('Remove connection',{id:'connection-remove',variant:'danger-subtle',hidden:true}),
            Stack([Notice('Remove this connection and its saved API key?'),
              ActionGroup([Button('Yes, remove',{id:'connection-confirm-remove',variant:'danger'}),Button('Keep connection',{id:'connection-keep'})])
            ],{id:'connection-remove-confirm',hidden:true})
          ],{id:'connection-form'})
        ],{className:'settings-card settings-editor'})
      ],{className:'settings-columns'})]},
      // Every action the app can ask a model to do, listed in one place with the
      // model that runs it. No feature offers this choice next to its own
      // button: a model is a setting, not a decision to make mid-errand.
      {key:'models',label:'Models',content:
      UI.Panel([
        Notice('',{id:'ai-tasks-status',role:'status'}),
        Stack([],{id:'ai-tasks-list',className:'record-group'})
      ],{className:'settings-card ai-tasks-card'})},
      {key:'playground',label:'Playground',content:
      UI.Panel([
        ActionGroup([Button('Fetch models',{id:'connection-models',variant:'secondary',size:'compact'})],{compact:true}),
        Note('',{id:'playground-context'}),
        UI.ModelSuggestions({id:'provider-model-list'}),
        Note('',{id:'model-list-status',role:'status'}),
        UI.Form([
          field({id:'playground-model',label:'Model',kind:'text',placeholder:'Type or choose a model ID',list:'provider-model-list'}),
          ActionGroup([Button('Test connection',{id:'connection-test',variant:'secondary'})]),
          field({id:'playground-system',label:'Instructions (optional)',kind:'textarea',rows:2}),
          field({id:'playground-prompt',label:'Your prompt',kind:'textarea',rows:4}),
          field({id:'playground-limit',label:'Output token limit',kind:'select',options:[512,1024,2048,4096,8192].map(value=>({text:String(value),value:String(value)}))}),
          ActionGroup([Button('Run prompt',{id:'playground-run',type:'submit',variant:'primary'}),Button('Copy response',{id:'playground-copy',variant:'secondary'})])
        ],{id:'playground-form'}),
        Note('',{id:'playground-status',role:'status'}),
        UI.OutputText({id:'playground-output',hidden:true})
      ],{className:'settings-card playground-card'})}
      ]})
    ])
  ],{className:'settings-shell'});
}
// The cloud storage panel, filled. It lives beside the markup it fills so the
// Settings controller and the preview harness put the same thing on screen: a
// size against its limit, the tone that size has earned, and the databases the
// size is made of. No reading at all reads as a dash, not as zero.
export function setCloudStorage(root, usage) {
  const find = id => root.querySelector(`#${id}`);
  const summary = usageSummary(usage);
  find('storage-headline').textContent = summary ? summary.headline : '—';
  find('storage-scope').textContent = summary ? `${summary.scope} · ${usage.plan} plan` : '';
  UI.setMeter(find('storage-meter'), summary ? summary.percent : 0, summary ? summary.tone : '');
  find('storage-databases').replaceChildren(...(usage?.databases || []).map(database =>
    Stack([Label(`${database.name} · ${database.tables} table${database.tables === 1 ? '' : 's'}`), Label(formatBytes(database.bytes))])));
}

export function mountSettings(root) {root.replaceChildren(AISettingsView());}

export function RewardsView(){return SubPage({id:'rewards-tool',title:'Rewards & benefits',backId:'close-rewards',children:[Stack([],{id:'rewards-root'})]});}

export {RestaurantWorkspace,RestaurantCandidate,ReservationResult} from './restaurant-views.js';
