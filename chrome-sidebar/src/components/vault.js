import {Stack,Section,Heading,Note,Notice,Button,ActionGroup,FormField} from './ui.js';
// The lock screen for a capability whose whole contents are protected. While
// locked it is the only thing rendered — record names are as revealing as
// values in these sections — so it carries the page's heading. Once unlocked it
// says nothing about being open: it collapses to its controls and hands the
// heading back to the tool.
export function VaultGateView({id='vault',title='Locked',detail=''}={}){
  return Stack([
    Section([
      Heading(title,1,{id:`${id}-title`}),
      Notice('',{id:`${id}-status`,role:'status','aria-live':'polite'}),
      ActionGroup([],{id:`${id}-actions`,compact:true}),
      Stack([],{id:`${id}-code`}),
      Stack([
        FormField({id:`${id}-recovery-code`,label:'Recovery code',kind:'text',placeholder:'EV1-…'}),
        ActionGroup([
          Button('Unlock with this code',{id:`${id}-recovery-submit`,variant:'secondary',size:'compact'}),
          Button('Cancel',{id:`${id}-recovery-cancel`,variant:'secondary',size:'compact'})
        ],{compact:true})
      ],{id:`${id}-recovery`,hidden:true}),
      Note(detail,{id:`${id}-detail`})
    ],{id:`${id}-panel`,className:'vault-gate'}),
    Stack([],{id:`${id}-content`,className:'vault-content',hidden:true})
  // The gate is the wallet container for the whole section, so the gate panel
  // and the tool inside it share one set of controls, spacing and padding
  // rather than nesting two.
  ],{className:'travel-wallet vault-section'});
}
