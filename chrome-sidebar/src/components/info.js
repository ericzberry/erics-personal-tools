import {Stack,ToolTitle,FindField,FormField,ActionGroup,Button,RecordRow,RowAction,RowLink,OPEN_GLYPH,SEARCH_GLYPH,Note} from './ui.js';
import {INFO_FILTERS,productSearchURL} from '../info-data.js';
export function InfoView(){return Stack([
  ToolTitle('Info',{actionsId:'info-actions',statusId:'info-status'}),
  Stack([Stack([],{id:'info-capture'}),FormField({id:'info-manual-kind',label:'Or add by hand',kind:'select',options:[{value:'personal',text:'Personal information'},{value:'travel',text:'Membership'},{value:'people',text:'Person or place'},{value:'sizes',text:'Size'},{value:'gifts',text:'Gift idea'},{value:'replacements',text:'Buy again'}]}),Button('Open form',{id:'info-manual',variant:'secondary',size:'compact'})],{id:'info-add',hidden:true}),
  FindField({id:'info-search',label:'Find saved information',placeholder:'Name, brand, program, size…'}),
  FormField({id:'info-filter',label:'Show',kind:'select',options:INFO_FILTERS.map(([value,text])=>({value,text}))}),
  Stack([],{id:'info-coverage'}),Stack([],{id:'info-records'})
],{className:'info-collection'});}
export function InfoRows(rows,onOpen){return rows.map(row=>RecordRow({title:row.title,
  detail:[INFO_FILTERS.find(([key])=>key===row.kind)?.[1],row.detail,row.conflict?'Resolve sync conflict':row.pending?'Waiting to sync':''].filter(Boolean).join(' · '),
  actions:[RowAction(OPEN_GLYPH,`Open ${row.title}`,()=>onOpen(row)),row.web?RowLink(SEARCH_GLYPH,`Search the web for ${row.title}`,productSearchURL(row)):null].filter(Boolean)
}));}
