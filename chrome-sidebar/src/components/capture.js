import {Stack,Notice,Button,ActionGroup,FormField,Form} from './ui.js';
// One line of text and one button. Everything else about the record — what kind
// of thing it is, when it falls due, how much warning it deserves — is worked
// out from what was typed, so there is no form to fill in and nothing to
// explain before typing.
export function CaptureField({id='capture',label='Quick add',placeholder='Derek’s birthday is today'}={}){
  return Form([
    FormField({id:`${id}-note`,label,kind:'text',placeholder}),
    ActionGroup([Button('Add',{id:`${id}-add`,variant:'primary',type:'submit'})],{id:`${id}-actions`,compact:true}),
    Notice('',{id:`${id}-status`})
  ],{id:`${id}-form`,className:'capture-field'});
}
