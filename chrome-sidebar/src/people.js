import {PeopleView,PersonRow} from './components/people.js';
import {Button,Note,setStatus} from './components/ui.js';
import {normalizePerson} from './people-data.js';
const fields=['name','role','age','ageYear','location','notes'];
export function mountPeople(root,{credentials,offline,onSettings=()=>{}}){
  root.replaceChildren(PeopleView());const $=id=>root.querySelector(`#people-${id}`);
  let records=[],editing=null,loaded=false,busy=false,generation=0,activeToken='';
  function edit(record=null){editing=record;for(const key of fields)$(key).value=record?.[key]??(key==='role'?'Other':'');$('role').dispatchEvent(new document.defaultView.Event('change'));setStatus($('form-status'),'');$('editor').open=true;$('name').focus();}
  function render(){
    $('list').replaceChildren(...(records.length?records.map(p=>PersonRow(p,{busy,onEdit:()=>edit(p),onDelete:()=>run(token=>offline.request(token,`/v1/people/${p.id}`,{method:'DELETE',value:p})),onResolve:choice=>run(token=>offline.resolve(token,p.id,choice))})):[Note(loaded?'No people saved.':'')]));
    const add=Button('Add person',{variant:'secondary',size:'compact',disabled:busy||!loaded});add.addEventListener('click',()=>edit());
    const refresh=Button(loaded?'Refresh':'Connection settings',{variant:'secondary',size:'compact',disabled:busy});refresh.addEventListener('click',loaded?load:onSettings);
    $('actions').replaceChildren(...(loaded?[add,refresh]:[refresh]));
    for(const key of [...fields,'save'])$(key).disabled=busy||!loaded;$('cancel').disabled=busy;
  }
  function clear(){generation++;records=[];editing=null;loaded=false;busy=false;activeToken='';$('editor').open=false;for(const key of fields)$(key).value='';setStatus($('status'),'');render();}
  async function run(action){
    if(busy)return false;busy=true;const epoch=++generation;render();setStatus($('status'),'Updating context…','progress');
    try{const token=await credentials.get();if(!token)throw Error('Open Settings to connect this device.');if(activeToken&&activeToken!==token){clear();return false;}activeToken=token;
      const result=await action(token);if(epoch!==generation)return false;records=result.records;loaded=true;setStatus($('status'),result.syncMessage||'',result.syncMessage?'alert':'');return true;
    }catch(e){if(epoch===generation){if($('editor').open){setStatus($('status'),'');setStatus($('form-status'),e.message||'Could not save. Try again.','error');}else setStatus($('status'),e.message||'Could not load context.','error');}return false;}
    finally{if(epoch===generation){busy=false;render();}}
  }
  async function load(){await run(token=>offline.request(token,'/v1/people'));}
  $('form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!loaded)return;
    try{const value=normalizePerson(Object.fromEntries(fields.map(k=>[k,$(k).value])),editing||{}),id=editing?.id||crypto.randomUUID();
      if(await run(token=>offline.request(token,`/v1/people/${id}`,{method:'PUT',value:{...value,id,revision:editing?.revision??null}}))){$('editor').open=false;editing=null;}
    }catch(e){setStatus($('form-status'),e.message||'Check the fields.','error');}
  });
  $('cancel').addEventListener('click',()=>{$('editor').open=false;editing=null;});
  const refresh=()=>{if(!busy&&!$('editor').open)load();};window.addEventListener('online',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});credentials.subscribe?.(()=>{clear();load();});clear();load();return {refresh,clear};
}
