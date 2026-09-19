import * as UI from './ui.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,GroupTitle,Section,ToolTitle,Strong}=UI;
export function SizesView(){
  return Stack([
    ToolTitle('Clothing sizes',{actionsId:'sizes-actions',statusId:'sizes-status'}),
    Stack([],{id:'sizes-capture'}),
    SettingsGroup({title:'Sizes',level:2,children:[
      FormField({id:'sizes-search',label:'Find a size',kind:'search',placeholder:'Brand, garment or measurement…'}),
      Stack([],{id:'sizes-list',className:'travel-list'})
    ]}),
    Disclosure('Add or edit a size',[
      Form([
        Strong('New size',{id:'sizes-editor-title'}),
        // Brand is first and optional on purpose: leaving it empty is what files
        // a measurement under General rather than under a label.
        FormField({id:'sizes-brand',label:'Brand (leave empty for a measurement)',kind:'text',placeholder:'e.g. Lululemon'}),
        FormField({id:'sizes-item',label:'What it is for',kind:'text',placeholder:'e.g. Dress shirt, or Inseam'}),
        FormField({id:'sizes-size',label:'The size',kind:'text',placeholder:'e.g. M, 32x34, 15.5/34, 33 in'}),
        FormField({id:'sizes-fit',label:'How it fits (optional)',kind:'text',placeholder:'e.g. Runs small, size up'}),
        Notice('',{id:'sizes-form-status',role:'status'}),
        ActionGroup([Button('Save size',{id:'sizes-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'sizes-cancel',variant:'secondary'})])
      ],{id:'sizes-form',className:'form-stack'})
    ],{id:'sizes-editor'})
  ],{className:'travel-wallet size-list'});
}
// One garment's run: the heading names the garment, and the rows under it go
// from the general size and its measurements to what each brand calls it.
export function SizeGroup(garment,rows){
  return Section([GroupTitle(garment,{className:'record-group-title'}),...rows],{className:'record-group'});
}
