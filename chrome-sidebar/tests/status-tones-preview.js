// Every status tone at sidebar width, with synthetic sentences: the one place
// to check that alert, error, progress and success read as four different
// things, and that the progress indicators keep moving. Not copied into
// release builds; the components and styles are the real modules.
import {Notice,Spinner,ProgressBar,setProgress,Stack,Label,Title,Text,STATUS_TONES} from '../src/components/ui.js';
const examples={
  alert:'2 changes waiting to sync. Your records are safe on this device.',
  error:'That did not save. Reconnect with a valid access token and try again.',
  progress:'Reading the accounts on the open page…',
  success:'Saved 3 snapshots.'
};
const root=document.getElementById('status-tones');
root.append(Title('Status tones',1));
for(const tone of STATUS_TONES){
  root.append(Stack([Label(tone,{className:'group-title'}),Notice(examples[tone],{tone})],{className:'settings-group'}));
}
root.append(Stack([Label('untoned',{className:'group-title'}),Notice('4 offers · read 2026-09-18')],{className:'settings-group'}));
const bar=ProgressBar({label:'Saving benefits'});
root.append(Stack([Label('in place',{className:'group-title'}),
  Stack([Spinner(),Text('Looking up this card…')],{className:'action-group'}),bar],{className:'settings-group'}));
let value=0;
setInterval(()=>{value=(value+7)%100;setProgress(bar,value);},400);
