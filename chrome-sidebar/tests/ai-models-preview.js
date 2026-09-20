// Local synthetic fixture for the AI models list in Settings. Not copied into
// release builds. The row component and its styles are the real ones; only the
// actions and the models are synthetic.
import {AiTaskRow} from '../src/components/views.js';
import {Stack, SectionTitle, Panel} from '../src/components/ui.js';
const options=[{id:'gpt-5-nano'},{id:'gpt-4o-mini'},{id:'gpt-4.1-mini'},{id:'gpt-5-mini'},{id:'gpt-5.6-terra'}];
const tasks=[
  {task:'capture.note',label:'Quick note reading',automatic:'',chosen:''},
  {task:'finance.intake',label:'Finance reading',automatic:'',chosen:'gpt-5-mini'},
  {task:'email.summary',label:'Email summary',automatic:'gpt-5.6-terra',chosen:''},
  {task:'restaurant.research',label:'Restaurant research',automatic:'',chosen:''},
  {task:'subscriptions.research',label:'Subscription alternatives',automatic:'',chosen:'gpt-4.1-mini'}
];
const chosen=new Map(tasks.map(task=>[task.task,task.chosen]));
function render(){
  document.getElementById('ai-models').replaceChildren(Panel([
    SectionTitle('AI models'),
    Stack(tasks.map(task=>AiTaskRow({...task,options,chosen:chosen.get(task.task),
      onChange:model=>{chosen.set(task.task,model);render();}})),{className:'record-group'})
  ],{className:'settings-card ai-tasks-card'}));
}
render();
