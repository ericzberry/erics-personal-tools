import * as UI from './ui.js';
const {Stack,Heading,Note,Notice,Button,ActionGroup,Disclosure}=UI;
export function RewardsView(){
  const field=(key,label,kind='text',options)=>UI.FormField({id:`reward-${key}`,label,kind,options});
  return Stack([Heading('Rewards & benefits',1),
    Note('Your points, miles, credits, and discounts in one place. Saved entries work offline and sync across your devices. Balances and offers are entered manually.'),
    UI.SettingsGroup({title:'Next actions',level:2,children:[Note('Deadlines within 30 days, activation steps, and balances due for review.'),Stack([],{id:'rewards-actions'})]}),
    UI.SettingsGroup({title:'Your wallet',level:2,children:[
      UI.FormField({id:'rewards-search',label:'Find a program or benefit',kind:'search',placeholder:'Airline, card, merchant, membership…'}),
      Stack([],{id:'rewards-list'})]}),
    Disclosure('Add or edit a reward',[
      Note('Add each card or airline balance, then add its benefits separately. Include discounts from work, memberships, and other sources. Do not enter account numbers or passwords.'),
      UI.Form([
        field('kind','Entry type','select',[{text:'Points or miles balance',value:'balance'},{text:'Credit, discount, or offer',value:'benefit'}]),
        field('name','Program or benefit name'),field('source','Card, airline, or benefit source'),
        field('value','Balance or benefit (e.g. 42,000 miles or $50 credit)'),
        field('due','Expiration or use-by date (optional)','date'),
        field('state','Status','select',[{text:'Available',value:'available'},{text:'Needs activation',value:'activation'},{text:'Used',value:'used'}]),
        field('url','Official account or offer URL (optional)','url'),
        UI.FormField({id:'reward-notes',label:'Terms, eligibility, and next step (optional)',kind:'textarea',rows:3}),
        Notice('',{id:'reward-form-status'}),
        ActionGroup([Button('Save reward',{id:'reward-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'reward-cancel',variant:'secondary'})])
      ],{id:'reward-form',className:'form-stack'})
    ],{id:'reward-editor'}),
    UI.SettingsGroup({title:'Cloud sync',level:2,children:[Notice('Loading rewards…',{id:'rewards-status'}),ActionGroup([Button('Refresh rewards',{id:'rewards-refresh',variant:'secondary'}),Button('Connection settings',{id:'rewards-connect',variant:'secondary'})],{compact:true})]}),
    Note('Actions cover your saved entries only. Check official terms before using a benefit. Recurring credits need a new entry for each period; no automatic discovery or background alerts yet.')
  ],{className:'travel-wallet rewards-wallet'});
}
