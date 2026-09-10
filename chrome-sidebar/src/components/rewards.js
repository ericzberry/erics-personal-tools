import * as UI from './ui.js';
const {Stack,Heading,Note,Notice,Button,ActionGroup,Disclosure}=UI;
export function RewardsView(){
  const field=(key,label,kind='text',options)=>UI.FormField({id:`reward-${key}`,label,kind,options});
  return Stack([Heading('Rewards & benefits',1),
    UI.SettingsGroup({title:'Next actions',level:2,children:[Stack([],{id:'rewards-actions'})]}),
    UI.SettingsGroup({title:'Your wallet',level:2,children:[
      UI.FormField({id:'rewards-search',label:'Find a program or benefit',kind:'search',placeholder:'Airline, card, merchant, membership…'}),
      Stack([],{id:'rewards-list'})]}),
    UI.SettingsGroup({title:'Protected values',level:2,children:[
      Notice('',{id:'vault-status'}),
      ActionGroup([],{id:'vault-actions',compact:true}),
      Stack([],{id:'vault-code'}),
      Stack([
        UI.FormField({id:'vault-recovery-code',label:'Recovery code',kind:'text',placeholder:'EV1-…'}),
        ActionGroup([Button('Unlock with this code',{id:'vault-recovery-submit',variant:'secondary',size:'compact'}),
          Button('Cancel',{id:'vault-recovery-cancel',variant:'secondary',size:'compact'})],{compact:true})
      ],{id:'vault-recovery',hidden:true}),
      Note('',{id:'vault-detail'})
    ]}),
    Disclosure('Add or edit a reward',[
      Note('Do not enter passwords or security codes.'),
      UI.Form([
        field('kind','Entry type','select',[{text:'Points or miles balance',value:'balance'},{text:'Credit, discount, or offer',value:'benefit'}]),
        field('name','Program or benefit name'),field('source','Card, airline, or benefit source'),
        field('value','Balance or benefit (e.g. 42,000 miles or $50 credit)'),
        field('due','Expiration or use-by date (optional)','date'),
        field('state','Status','select',[{text:'Available',value:'available'},{text:'Needs activation',value:'activation'},{text:'Used',value:'used'}]),
        field('url','Official account or offer URL (optional)','url'),
        UI.FormField({id:'reward-notes',label:'Terms, eligibility, and next step (optional)',kind:'textarea',rows:3}),
        UI.ProtectedField({id:'reward-secret',label:'Card details (optional)',
          help:'Encrypted with your passkey before it leaves this device, so the cloud stores only unreadable text. Never enter the security code (CVV).'}),
        Notice('',{id:'reward-form-status'}),
        ActionGroup([Button('Save reward',{id:'reward-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'reward-cancel',variant:'secondary'})])
      ],{id:'reward-form',className:'form-stack'})
    ],{id:'reward-editor'}),
    UI.SettingsGroup({title:'Cloud sync',level:2,children:[Notice('Loading rewards…',{id:'rewards-status'}),ActionGroup([Button('Refresh rewards',{id:'rewards-refresh',variant:'secondary'}),Button('Connection settings',{id:'rewards-connect',variant:'secondary'})],{compact:true})]})
  ],{className:'travel-wallet rewards-wallet'});
}
