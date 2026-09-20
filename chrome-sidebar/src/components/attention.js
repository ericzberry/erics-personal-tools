import {Stack,ToolTitle,Note} from './ui.js';
export function AttentionView(){return Stack([
  ToolTitle('Needs attention',{actionsId:'attention-actions',statusId:'attention-status'}),
  Stack([],{id:'attention-coverage'}),Stack([],{id:'attention-records'})
]);}
