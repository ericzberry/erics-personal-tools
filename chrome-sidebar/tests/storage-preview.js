// The Settings screen's cloud storage panel at every size worth seeing: an
// account using almost nothing, one that has crossed each threshold, one whose
// reading could not be taken again, and a Worker that was never given the
// Cloudflare token. Synthetic readings only — the panel, the meter and the
// tones are the real modules, and the controller fills them the same way.
import {mountSettings,setCloudStorage} from '../src/components/views.js';
import {Button,ActionGroup,Stack,Label,setStatus} from '../src/components/ui.js';
const MB=1024*1024;
const reading=(bytes,extra={})=>({plan:'Free',checkedAt:'2026-09-20T09:14:00.000Z',
  databases:[{name:'erics-personal-tools',bytes,tables:24},{name:'ranking-archive',bytes:4096,tables:1}],
  totalBytes:bytes+4096,databaseLimitBytes:500*MB,accountLimitBytes:5*1024*MB,
  fraction:bytes/(500*MB),worst:'database',...extra});
const states={
  'today':[reading(310_000),''],
  'three quarters':[reading(0.78*500*MB),''],
  'nine tenths':[reading(0.93*500*MB),''],
  'at the limit':[reading(500*MB),''],
  'across the account':[{...reading(300*MB),totalBytes:4.6*1024*MB,fraction:4.6/5,worst:'account'},''],
  'could not re-read':[reading(0.93*500*MB),['Showing the reading from 20/09/2026, 09:14. Cloudflare could not report storage: HTTP 500','alert']],
  'no token':[null,['Storage reporting needs CLOUDFLARE_ACCOUNT_ID and the CLOUDFLARE_API_TOKEN secret.','error']],
  'not connected':[null,'']
};
mountSettings(document.getElementById('app'));
const status=document.getElementById('storage-status');
function show(name){
  const [usage,notice]=states[name];
  setCloudStorage(document,usage);
  setStatus(status,notice?notice[0]:'',notice?notice[1]:'');
  status.hidden=!notice;
}
const panel=document.querySelector('.storage-card');
panel.before(Stack([Label('Preview state',{className:'group-title'}),
  ActionGroup(Object.keys(states).map(name=>{const button=Button(name,{variant:'secondary',size:'compact'});button.addEventListener('click',()=>show(name));return button;}))],
  {className:'settings-group'}));
show('today');
