import {Stack,Section,GroupTitle,Label,Note,Amount,money} from './ui.js';

// Each firm, quarter by quarter.
//
// It reads like the ledger's own trend because it is that question asked of a
// narrower thing: a quarter, what it came to, and what that is against the
// quarter before. What it adds is the heading — the firm — which is the whole
// of what the figures could not say until they started carrying one.
//
// A firm with one quarter behind it is still a firm: the row is the first point
// of a series, and a series has to start somewhere. Nothing here says so in
// words.
export function FirmQuarters(firms=[],currency='USD'){
  if(!firms.length)return Note('No account page has been read yet.');
  return Stack(firms.map(firm=>Section([
    GroupTitle(firm.label,{className:'record-group-title group-title--name'}),
    ...firm.quarters.map(quarter=>Stack([
      // A quarter read before its closing month says the day it was struck,
      // because the heading claims a quarter that had not finished when the
      // figure was taken. It qualifies the quarter, so it rides beside it
      // rather than in the column the changes are read down — and it is its
      // own word, so a narrow panel drops it under the quarter instead of
      // widening every row in the tool to fit it on one line.
      Stack([Label(quarter.label),
        quarter.struck?Label(`· ${quarter.struck}`,{className:'trend-struck'}):null],
        {className:'trend-when'}),
      Amount(quarter.amount,currency),
      // The change when there is one to draw, the coverage when there is not.
      Note(quarter.complete
        ?(quarter.change===null?'':`${quarter.change>=0?'+':''}${money(quarter.change,currency)}`)
        :`${quarter.figures} of ${quarter.whole} figures`)
    ],{className:`trend-row${quarter.complete?'':' trend-row--partial'}`}))
  ],{className:'record-group'})),{className:'trend-table'});
}
