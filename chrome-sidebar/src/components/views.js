import {CapabilityPicker} from './capabilities.js';
import * as UI from './ui.js';
import {AI_PROVIDERS} from '../ai-providers.js';
const {SubPage,ActionGroup,AppHeader,Section,Main,Stack,Text,Heading,Note,Notice,Button,Link,Badge,List,Field,SectionTitle,Disclosure,ToolHeading,Highlight,StatusCard,Metrics,SourceNote,UploadField,EditableResult}=UI;
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
    Note('Clears this board’s picks and corrections and switches live capture off. Other drafts and rankings stay saved. Turn capture back on in Settings to use ESPN history again.'),
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
export function GmailView() {
  return Section([UI.PageHeader({title:'Open an email in Gmail',titleId:'email-subject',action:Button('Refresh',{id:'refresh-email',variant:'secondary',size:'compact'})}),Main([Note('',{id:'email-from',className:'footnote content-meta'}),Note('',{id:'email-read-status',role:'status'}),
    ActionGroup([Button('Summarize',{id:'summarize-email',variant:'primary',disabled:true}),Button('Generate reply',{id:'reply-email',variant:'secondary',disabled:true})]),Note('',{id:'email-action-status',role:'status'}),
    EditableResult({id:'email-result',titleId:'email-result-title',copyId:'copy-email-output',fieldId:'email-output'}),Disclosure('Email text',[Text('',{id:'email-preview',className:'source-preview'})],{id:'email-source',hidden:true})
  ])],{id:'gmail-tool',className:'tool-page',hidden:true});
}
export const HomeView=()=>Section([UI.PageHeader({title:'Ready when you are.'}),Main([Note('Open a tool or a relevant website to get started.')])],{id:'home-tool',className:'tool-page',hidden:true});
export function SettingsView() {
  return SubPage({id:'settings-tool',title:'Settings',backId:'close-settings',children:[
    UI.SettingsList([
    // One cloud connection, owned by the wallet that holds this device's copies,
    // and one link to the page that owns AI connections and their keys.
    Stack([],{id:'travel-settings-connection',className:'travel-wallet connection-only'}),
    UI.SettingsLink('AI connections','settings.html'),
    UI.SettingsItem('Draft',[DraftSettings(),DraftReset()])
    ])
  ]});
}

export function mountApp(root) {root.replaceChildren(AppHeader({}),DraftView(),GmailView(),HomeView(),RewardsView(),Section([],{id:'travel-tool',hidden:true}),Section([],{id:'finance-tool',className:'tool-page',hidden:true}),Section([],{id:'taxes-tool',className:'tool-page',hidden:true}),SettingsView());}

export function AISettingsView() {
  const field=UI.FormField;
  return Stack([
    Section([Stack([UI.Strong('eb',{className:'settings-monogram'}),UI.Strong('ericberry')],{className:'settings-brand'}),
      Note('Personal settings'),CapabilityPicker(),Text('AI connections',{className:'settings-nav-current'}),
      Note('Open here anytime: ericberry → Tab → Enter',{className:'settings-shortcut'})
    ],{className:'settings-rail'}),
    Main([
      Stack([Stack([Heading('AI connections',1)]),
        Badge('Not connected',{id:'settings-connection-badge'})],{className:'settings-heading'}),
      Disclosure('Cloud connection',[
        Stack([
          field({id:'settings-token',label:'Extension access token',kind:'password',placeholder:'Paste your private token'}),
          ActionGroup([Button('Connect',{id:'settings-connect',variant:'primary'}),Button('Disconnect this browser',{id:'settings-disconnect',variant:'secondary'})]),
          Note('',{id:'settings-cloud-status',role:'status'})],{className:'connection-setup'})
      ],{id:'settings-cloud'}),
      Notice('',{id:'settings-status',role:'status',hidden:true}),
      Stack([
        Section([SectionTitle('Saved connections'),
          ActionGroup([Button('Add connection',{id:'connection-add',variant:'primary',size:'compact'}),Button('Reload connections',{id:'connection-reload',variant:'secondary',size:'compact'})],{compact:true,id:'connection-actions',hidden:true}),
          Text('Connect your browser to load your AI settings.',{id:'connections-empty',className:'settings-empty'}),
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
            Note('Keys are stored encrypted. Saved keys are never displayed.',{id:'ai-key-help'}),
            UI.Toggle({id:'ai-clear-key',label:'Remove the saved API key',checked:false}),
            ActionGroup([Button('Save connection',{id:'connection-save',variant:'primary',type:'submit'}),Button('Cancel',{id:'connection-cancel',variant:'secondary'})]),
            Button('Remove connection',{id:'connection-remove',variant:'danger-subtle',hidden:true}),
            Stack([Notice('Remove this connection and its saved API key?'),
              ActionGroup([Button('Yes, remove',{id:'connection-confirm-remove',variant:'danger'}),Button('Keep connection',{id:'connection-keep'})])
            ],{id:'connection-remove-confirm',hidden:true})
          ],{id:'connection-form'})
        ],{className:'settings-card settings-editor'})
      ],{className:'settings-columns'}),
      UI.Panel([
        SectionTitle('Try a connection',Button('Fetch models',{id:'connection-models',variant:'secondary',size:'compact'})),
        Note('Select a saved connection above. Tests and prompts use that provider’s API credit.',{id:'playground-context'}),
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
      ],{className:'settings-card playground-card'})
    ])
  ],{className:'settings-shell'});
}
export function mountSettings(root) {root.replaceChildren(AISettingsView());}

export function RewardsView(){return SubPage({id:'rewards-tool',title:'Rewards & benefits',backId:'close-rewards',children:[Stack([],{id:'rewards-root'})]});}

export {RestaurantWorkspace,RestaurantCandidate,ReservationResult} from './restaurant-views.js';
