import {Stack,ToolTitle,Note} from './ui.js';
export function AttentionView(){return Stack([
  ToolTitle('Needs attention',{actionsId:'attention-actions',statusId:'attention-status'}),
  Note('Upcoming dates, unused benefits, stale balances and subscriptions to review.'),
  Stack([],{id:'attention-coverage'}),Stack([],{id:'attention-records'})
]);}
