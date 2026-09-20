import * as UI from './ui.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,GroupTitle,Section,ToolTitle,Strong,Label}=UI;
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
// One saved size, read as a line rather than as a block: who says so on the
// left, the size itself in a column down the right, and the row's own Edit and
// Delete kept as quiet glyphs at the end of the line. A word-wide row of
// actions under every size would be the loudest thing in the list and would
// double its length, when what the list is for is running an eye down a column
// of answers. The actions stay out of sight until the row is pointed at or
// reached by keyboard, and are always shown where there is no pointer to hover
// with. Anything that needs a sentence — a note about the fit, a pending sync,
// a delete to confirm — sits under the line, where it reads as this row's.
export function SizeRow({name,size,note,actions,extra=[],confirmation}){
  return Section([
    Stack([
      Strong(name,{className:'size-name'}),
      Label(size,{className:'size-value'}),
      ActionGroup(actions,{compact:true,className:'action-group action-group--compact size-actions'})
    ],{className:'size-line'}),
    note?Note(note):null,
    ...extra,
    confirmation
  ],{className:'record-row'});
}
