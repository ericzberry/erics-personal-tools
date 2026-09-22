import {HealthView,HealthGroup,HealthRow,ChangeEditor,RelativeEditor,ExportPreview,ExportChoice} from './components/health.js';
import {Button,RowAction,EDIT_GLYPH,DELETE_GLYPH,Note,Stack,ActionGroup,Text,Strong,FormField,Option,Disclosure,RecordRow,setStatus,downloadFile} from './components/ui.js';
import * as health from './health-data.js';
import {mountVaultGate,vaultReason} from './vault-gate.js';
import {sealSecret} from './secret-vault.js';
import {writePdf} from './pdf-write.js';
const {HEALTH_TYPES,recordTitle,parseWhen,detectRelative,historyGroups,familyGroups,searchHealth,summaryOf,SUMMARY_SECTIONS,includedInSummary,
  isMedication,isCondition,medicationStatusLabel,applyMedicationChange,medicationsToReview,isReviewed,markReviewed,reviewDate,
  relativeOf,exportLabel,visitSummaryLines,validateHealthRecord,validateRelative,validateRevision,validateHealthPayload,assertHealthWriteFits}=health;
// Envelopes are bound to a namespaced identity, so a health record moved onto
// another record's id, or onto a personal record's, does not open.
const sealedId=id=>`health:${id}`;
const DRAFT_ID='health:draft';
const dateText=iso=>iso?new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'';
const shorten=(text,max=60)=>text.length>max?`${text.slice(0,max-1)}…`:text;
const uuid=()=>crypto.randomUUID();

export function mountHealth(root,{credentials,offline,drafts=null,onSettings=()=>{},onChanged=()=>{},vault,now=()=>new Date().toISOString(),download=downloadFile}){
  const gate=mountVaultGate(root,{id:'health-vault',title:'Health',...(vault?{vault}:{}),onChange:unlocked=>{unlocked?arrived():clear();}});
  gate.content.replaceChildren(HealthView());
  const $=id=>gate.content.querySelector(`#health-${id}`);
  const tabs=$('tabs');
  const status=(text,tone='')=>setStatus($('status'),text,tone);
  const formStatus=(text,tone='')=>setStatus($('form-status'),text,tone);

  // What the device holds: the store's rows, and each one opened once per
  // revision. Opening is the only place plaintext comes from, and everything
  // opened is dropped on lock.
  let rows=[],records=[],relatives=[],revisions=[],unreadable=0,cloudTexts=new Map();
  const opened=new Map();
  let editing=null,busy=false,loaded=false,activeToken='',generation=0,undo=null,draftOffer=null,draftTimer=null,exportUrl='';
  const expanded=new Set();
  let changeOpen=null,confirming=null,relativeEditing=null,relativeConfirm=null,exporting=null,reviewOpen=false;
  // Where the note being written will be filed. `auto` follows the sentence;
  // once the owner chooses, typing more never changes it back.
  let destination={mode:'auto',relative:'',label:'',side:'Unspecified'};

  const rowAction=(glyph,label,handler,danger=false)=>RowAction(glyph,label,handler,{danger,disabled:busy||!loaded});
  const action=(label,handler,variant='secondary',{enabled=false,size='compact',...props}={})=>{
    const button=Button(label,{variant,size,disabled:busy||(!loaded&&!enabled),...props});
    button.addEventListener('click',handler);
    return button;
  };

  // --- Opening what was downloaded.
  async function open(current){
    const next=new Map();
    const listed=[],people=[],history=[];unreadable=0;cloudTexts=new Map();
    for(const row of rows){
      for(const [copy,label] of [[row,''],[row.cloud,'cloud']]){
        if(!copy?.secret)continue;
        const key=`${row.id}:${copy.revision}:${label}`;
        let payload=opened.get(key);
        if(!payload){
          try{payload=validateHealthPayload(await gate.open(sealedId(row.id),copy.secret));}
          catch(error){payload={kind:'unreadable',error:error.message||'This record could not be read.'};}
          if(current!==generation)return false;
        }
        next.set(key,payload);
        if(label){if(payload.kind==='record')cloudTexts.set(row.id,payload);continue;}
        const item={...payload,id:row.id,revision:row.revision,pending:!!row.pending,conflict:!!row.conflict,deleting:!!row.deleting};
        if(payload.kind==='record')listed.push(item);
        else if(payload.kind==='relative')people.push(item);
        else if(payload.kind==='revision')history.push(item);
        else unreadable++;
      }
    }
    opened.clear();for(const [key,value] of next)opened.set(key,value);
    records=listed.filter(record=>!record.deleting);relatives=people.filter(relative=>!relative.deleting);revisions=history;
    return true;
  }

  // --- Drawing.
  const personal=()=>records.filter(record=>!record.relative);
  function subtitleOf(record,{showRelative=false}={}){
    const relative=relativeOf(record,relatives);
    return [record.when,isMedication(record)&&!record.relative?medicationStatusLabel(record):isCondition(record)&&record.status!=='Unspecified'?record.status:'',
      showRelative&&record.relative?relative?.label||'Relative':'',
      record.conflict?'Conflict':record.pending?'Waiting to sync':''].filter(Boolean).join(' · ');
  }
  function changeLine(change){
    const what=change.kind==='directions'?`Directions: ${change.from||'none recorded'} → ${change.to}`
      :change.kind==='resumed'?`Resumed · directions ${change.to}${change.from&&change.from!==change.to?` (before: ${change.from})`:''}`
      :`${change.to}`;
    return `${what} · Recorded ${dateText(change.at)}, ${change.effective?`effective ${change.effective}`:'effective date not recorded'}${change.applied?'':' · history only'}`;
  }
  function recordRow(record,{showRelative=false}={}){
    const relative=relativeOf(record,relatives),title=recordTitle(record);
    const detail=[record.type,record.relative?`about ${relative?.label||'a relative'}`:'',record.when?`when: ${record.when}`:'',
      isMedication(record)?medicationStatusLabel(record):record.status&&record.status!=='Unspecified'?`status: ${record.status}`:''].filter(Boolean).join(' · ');
    const lines=[];
    if(record.directions)lines.push(`${isMedication(record)?'Directions':'Recorded directions'}: ${record.directions}`);
    if(!isMedication(record)&&record.status&&record.status!=='Unspecified'&&!isCondition(record))lines.push(`Recorded status: ${record.status}`);
    for(const change of record.changes)lines.push(changeLine(change));
    const priors=revisions.filter(revision=>revision.record===record.id).sort((a,b)=>b.at.localeCompare(a.at));
    if(priors.length)lines.push(`Edited ${priors.length} time${priors.length===1?'':'s'}, last ${dateText(priors[0].at)}`);
    const actions=[rowAction(EDIT_GLYPH,`Edit ${shorten(title)}`,()=>edit(record)),
      rowAction(DELETE_GLYPH,`Delete ${shorten(title)}`,()=>{confirming=record.id;render();},true)];
    const words=[];
    if(isMedication(record)&&!record.relative&&!record.conflict){
      const openChange=kind=>()=>{changeOpen={id:record.id,kind};render();};
      if(record.status==='Stopped')words.push(action('Resume',openChange('resumed')));
      else{
        words.push(action('Change directions',openChange('directions')));
        if(record.status!=='Taking')words.push(action('Mark taking',openChange('taking')));
        words.push(action('Mark stopped',openChange('stopped')));
      }
    }
    const extra=[];
    if(changeOpen?.id===record.id)extra.push(changeEditor(record,changeOpen.kind));
    if(record.conflict){
      const cloud=cloudTexts.get(record.id);
      extra.push(Stack([Note('This record changed on another device. Both versions are kept until you choose.'),
        ...(cloud?[Strong('Cloud version'),Text(cloud.note,{className:'health-note'})]:[Note('The cloud version was deleted.')]),
        ActionGroup([action('Keep my change',()=>resolve(record.id,'local')),action('Use cloud version',()=>resolve(record.id,'cloud'))],{compact:true})],{className:'health-decision'}));
    }
    if(confirming===record.id){
      extra.push(Stack([Note('Delete this note from every synced device? A device that is offline deletes it when it next syncs, and existing backups can keep older copies.'),
        ActionGroup([action('Delete from all devices',()=>remove(record),'danger'),action('Keep',()=>{confirming=null;render();})],{compact:true})],{className:'health-decision'}));
    }
    const row=HealthRow({title,subtitle:subtitleOf(record,{showRelative}),note:record.note,detail,actions,words,lines,extra,
      onToggle:open=>{open?expanded.add(record.id):expanded.delete(record.id);}});
    if(expanded.has(record.id))row.querySelector('.record-row-toggle').click();
    return row;
  }
  function changeEditor(record,kind){
    const id=`health-change-${record.id.slice(0,8)}`;
    const editor=ChangeEditor({id,directions:kind==='directions'||kind==='resumed'});
    const field=name=>editor.querySelector(`#${id}-${name}`);
    if(kind==='resumed')field('to').value=record.directions;
    const decide=current=>save(applyMedicationChange(record,{kind,to:field('to')?.value||'',effective:field('effective').value,at:now(),current}),record,'change');
    editor.addEventListener('submit',async event=>{
      event.preventDefault();
      try{await decide(undefined);}
      catch(error){
        if(error.code==='ordering'){
          setStatus(field('status'),error.message,'alert');
          field('current').hidden=false;field('history').hidden=false;field('save').hidden=true;
        }else setStatus(field('status'),error.message||'That did not save.','error');
      }
    });
    for(const [name,current] of [['current',true],['history',false]])field(name).addEventListener('click',async()=>{
      try{await decide(current);}catch(error){setStatus(field('status'),error.message||'That did not save.','error');}
    });
    field('cancel').addEventListener('click',()=>{changeOpen=null;render();});
    return editor;
  }
  function relativeHead(relative){
    const actions=[action('Add a note',()=>startFor(relative)),
      rowAction(EDIT_GLYPH,`Edit ${relative.label}`,()=>{relativeEditing=relative.id;relativeConfirm=null;render();}),
      rowAction(DELETE_GLYPH,`Delete ${relative.label}`,()=>{relativeConfirm=relative.id;relativeEditing=null;render();},true)];
    const extra=[];
    if(relativeEditing===relative.id){
      const id=`health-relative-${relative.id.slice(0,8)}`;
      const editor=RelativeEditor({id});
      const field=name=>editor.querySelector(`#${id}-${name}`);
      field('label').value=relative.label;field('side').value=relative.side;field('aliases').value=relative.aliases.join(', ');
      editor.addEventListener('submit',async event=>{
        event.preventDefault();
        try{
          const next=validateRelative({...relative,label:field('label').value,side:field('side').value,aliases:field('aliases').value.split(',')});
          if(await save(next,relative,'relative')){relativeEditing=null;render();}
        }catch(error){setStatus(field('status'),error.message,'error');}
      });
      field('cancel').addEventListener('click',()=>{relativeEditing=null;render();});
      extra.push(editor);
    }
    if(relativeConfirm===relative.id){
      const others=relatives.filter(other=>other.id!==relative.id);
      const mine=records.filter(record=>record.relative===relative.id);
      const target=others.length?FormField({id:`health-move-${relative.id.slice(0,8)}`,label:'Move notes to',kind:'select',options:others.map(other=>({text:other.label,value:other.id}))}):null;
      const words=[];
      if(mine.length&&target)words.push(action('Move notes',()=>moveNotes(mine,target.querySelector('select').value)));
      words.push(action(mine.length?`Delete ${relative.label} and ${mine.length} note${mine.length===1?'':'s'}`:`Delete ${relative.label}`,()=>removeRelative(relative,mine),'danger'));
      words.push(action('Keep',()=>{relativeConfirm=null;render();}));
      extra.push(Stack([Note(mine.length?`Deleting ${relative.label} deletes the ${mine.length} note${mine.length===1?'':'s'} filed under them on every synced device. Move the notes to another relative first to keep them.`:`Delete ${relative.label} on every synced device?`),
        target,ActionGroup(words,{compact:true})],{className:'health-decision'}));
    }
    return {actions,extra};
  }
  function renderSummary(){
    const sections=summaryOf(records);
    const blocks=SUMMARY_SECTIONS.filter(([key])=>sections[key].length)
      .map(([key,title])=>HealthGroup(title,sections[key].map(record=>recordRow(record,{showRelative:key==='family'}))));
    const children=[];
    if(!records.length&&!relatives.length)children.push(Note(loaded?'Add your first health note.':''));
    else if(!blocks.length)children.push(Note('Nothing is selected for the summary yet. Everything saved is in History and Family.'));
    else children.push(...blocks);
    if(records.length)children.push(ActionGroup([action('Create visit summary',openExport)],{compact:true}));
    const toReview=medicationsToReview(records);
    if(toReview.length){
      const reviewed=reviewDate(records);
      const list=toReview.map(record=>RecordRow({title:recordTitle(record),detail:[record.directions,medicationStatusLabel(record),isReviewed(record)?`Reviewed ${dateText(record.reviewedAt)}`:'Not reviewed since last change'].filter(Boolean).join(' · ')}));
      const review=Disclosure('Review medications',[...list,
        Note(reviewed?`All reviewed · ${dateText(reviewed)}`:''),
        ActionGroup([action('Mark reviewed',markAllReviewed)],{compact:true})],{className:'health-review'});
      review.open=reviewOpen;
      review.addEventListener('toggle',()=>{reviewOpen=review.open;});
      children.push(review);
    }
    $('summary').replaceChildren(...children);
  }
  function renderHistory(){
    const type=$('filter').value;
    const list=personal().filter(record=>!type||record.type===type);
    $('history').replaceChildren(...(list.length
      ?historyGroups(list).map(group=>HealthGroup(group.title,group.records.map(record=>recordRow(record))))
      :[Note(type?'No records of this type.':'')]));
  }
  function renderFamily(){
    $('family').replaceChildren(...familyGroups(records,relatives).map(({relative,records:list})=>{
      const {actions,extra}=relativeHead(relative);
      return HealthGroup(relative.label,list.map(record=>recordRow(record)),{actions,name:true,extra});
    }));
  }
  function renderResults(query){
    const found=searchHealth(records,relatives,query);
    $('results').replaceChildren(...(found.length?found.map(record=>recordRow(record,{showRelative:true})):[Note('No matching records. Clear the search to see all of them.')]));
  }
  function destinationText(){
    if(destination.mode==='explicit')return destination.relative?`Family · ${relatives.find(relative=>relative.id===destination.relative)?.label||'Relative'}`:destination.label?`Family · ${destination.label} (new)`:'Me';
    const note=$('note').value;
    if(!note.trim()||/^\s*my\s*\S*$/i.test(note))return '';
    const found=detectRelative(note,relatives);
    if(found.status==='found')return `Family · ${found.relative.label}`;
    if(found.status==='new')return `Family · ${found.label} (new)`;
    if(found.status==='ambiguous')return 'Family · which relative?';
    return 'Me';
  }
  const familyBound=()=>destination.mode==='explicit'?!!(destination.relative||destination.label):destinationText().startsWith('Family');
  function renderEditor(){
    const type=$('type').value;
    for(const key of ['note','type','when','directions','medication-status','condition-status','side','summary-choice','destination','relative-label','filter','search'])$(key).disabled=busy||!loaded;
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;
    $('directions').closest('.form-field').hidden=type!=='Medication';
    $('medication-status').closest('.form-field').hidden=type!=='Medication';
    $('condition-status').closest('.form-field').hidden=type!=='Condition';
    const family=familyBound();
    $('side').closest('.form-field').hidden=!family;
    const existing=destination.mode==='explicit'&&destination.relative?relatives.find(relative=>relative.id===destination.relative):null;
    setStatus($('side-note'),existing&&family?`Applies to every note about ${existing.label}.`:'');
    $('destination-where').textContent=destinationText();
    $('destination-line').hidden=!$('destination-where').textContent;
    $('relative-label').closest('.form-field').hidden=!(destination.mode==='explicit'&&!destination.relative&&$('destination').value==='new');
    $('undo').hidden=!undo;
    $('actions').replaceChildren(loaded?action('Refresh',refresh):action('Connection settings',onSettings,'secondary',{enabled:true}));
  }
  function fillDestinationOptions(){
    const select=$('destination');
    const current=select.value;
    select.replaceChildren(Option('Me',''),...relatives.map(relative=>Option(relative.label,relative.id)),Option('New relative…','new'));
    select.value=[...select.options].some(option=>option.value===current)?current:'';
  }
  function render(){
    const query=$('search').value.trim();
    tabs.show('history',personal().length>0);
    tabs.show('family',relatives.length>0||records.some(record=>record.relative));
    tabs.hidden=!!query;$('results').hidden=!query;
    if(query)renderResults(query);
    else{renderSummary();renderHistory();renderFamily();}
    if(unreadable)status(`${unreadable} record${unreadable===1?'':'s'} could not be opened with this passkey.`,'alert');
    fillDestinationOptions();
    renderEditor();
    renderExport();
    $('editor').open=$('editor').open||(loaded&&!records.length&&!relatives.length);
  }

  // --- The editor.
  function clearForm(){
    editing=null;undo=null;
    $('note').value='';$('type').value=HEALTH_TYPES[0];$('when').value='';$('directions').value='';
    $('medication-status').value='Unspecified';$('condition-status').value='Unspecified';$('side').value='Unspecified';$('summary-choice').value='auto';
    destination={mode:'auto',relative:'',label:'',side:'Unspecified'};
    $('destination').value='';$('relative-label').value='';$('destination-fields').hidden=true;
    $('editor-title').textContent='New record';
    formStatus('');
  }
  function edit(record){
    clearForm();
    editing={id:record.id,revision:record.revision,record};
    $('note').value=record.note;$('type').value=record.type;$('when').value=record.when;$('directions').value=record.directions;
    if(isMedication(record))$('medication-status').value=record.status;
    if(isCondition(record))$('condition-status').value=record.status;
    $('summary-choice').value=record.summary;
    destination={mode:'explicit',relative:record.relative,label:'',side:'Unspecified'};
    $('destination').value=record.relative;
    const relative=relativeOf(record,relatives);
    if(relative)$('side').value=relative.side;
    $('editor-title').textContent=`Editing ${shorten(recordTitle(record),40)}`;
    $('editor').open=true;renderEditor();$('note').focus();
  }
  function startFor(relative){
    clearForm();
    destination={mode:'explicit',relative:relative.id,label:'',side:relative.side};
    $('destination').value=relative.id;$('side').value=relative.side;
    $('editor').open=true;renderEditor();$('note').focus();
  }
  // Which relative, or which new one, the saved note goes to. Detection is
  // consulted only while the owner has not chosen for themselves.
  function resolveDestination(note){
    if(destination.mode==='explicit'){
      if(destination.relative)return {relative:destination.relative};
      if($('destination').value==='new'){
        const label=$('relative-label').value.trim();
        if(!label)throw Error('Name the relative this note is about.');
        return {create:{label,side:$('side').value}};
      }
      return {relative:''};
    }
    const found=detectRelative(note,relatives);
    if(found.status==='found')return {relative:found.relative.id};
    if(found.status==='new')return {create:{label:found.label,side:$('side').closest('.form-field').hidden?found.side:$('side').value}};
    if(found.status==='ambiguous'){
      $('destination-fields').hidden=false;destination={...destination,mode:'explicit'};
      $('destination').value=found.matches[0].id;$('destination').focus();
      throw Object.assign(Error('Which relative?'),{tone:'alert'});
    }
    return {relative:''};
  }
  async function seal(id,payload){
    const secret=await sealSecret(await gate.key(),sealedId(id),payload);
    assertHealthWriteFits(id,secret);
    return secret;
  }
  async function put(token,id,payload,revision){
    return offline.request(token,`/v1/health/${id}`,{method:'PUT',value:{id,revision,secret:await seal(id,payload)}});
  }
  async function submit(event){
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const note=$('note').value;
      const type=$('type').value;
      const when=parseWhen($('when').value);
      if(when.error)throw Error(when.error);
      const target=resolveDestination(note);
      const base=editing?.record||{changes:[],summary:'auto',status:'Unspecified',directions:'',createdAt:now()};
      const record=validateHealthRecord({...base,note,type,when:when.text,relative:target.relative??'',
        directions:type==='Medication'?$('directions').value:base.directions,
        status:type==='Medication'?$('medication-status').value:type==='Condition'?$('condition-status').value:base.status,
        summary:$('summary-choice').value});
      const created=target.create?{id:uuid(),payload:validateRelative({...target.create,aliases:[],createdAt:now()})}:null;
      if(created)record.relative=created.id;
      const existing=target.relative?relatives.find(relative=>relative.id===target.relative):null;
      const sideChanged=existing&&familyBound()&&$('side').value!==existing.side?validateRelative({...existing,side:$('side').value}):null;
      const id=editing?.id||uuid();
      const saved=await run(async token=>{
        if(created)await put(token,created.id,created.payload,null);
        if(sideChanged)await put(token,existing.id,sideChanged,existing.revision);
        if(editing)await put(token,uuid(),validateRevision({record:id,at:now(),change:editing.record.relative!==record.relative?'destination':editing.record.type!==record.type?'type':'edit',prior:editing.record}),null);
        return put(token,id,record,editing?.revision??null);
      });
      if(!saved)return;
      const where=record.relative?`Family · ${created?.payload.label||existing?.label||'Relative'}`:'';
      const wasNew=!editing;
      clearForm();
      if(wasNew)undo={id,revision:saved.record?.revision??null,relative:created?.id||''};
      await drafts?.remove(activeToken).catch(()=>{});
      formStatus(where?`Saved · ${where}`:'Saved','success');
      $('undo').hidden=!undo;
      onChanged();
    }catch(error){formStatus(vaultReason(error),error.tone||'error');}
  }
  async function undoSave(){
    const last=undo;
    if(!last)return;
    const done=await run(async token=>{
      await offline.request(token,`/v1/health/${last.id}`,{method:'DELETE',value:{id:last.id,revision:last.revision}});
      const relative=relatives.find(relative=>relative.id===last.relative);
      if(relative&&!records.some(record=>record.relative===relative.id&&record.id!==last.id))
        await offline.request(token,`/v1/health/${relative.id}`,{method:'DELETE',value:{id:relative.id,revision:relative.revision}});
      return offline.request(token,'/v1/health');
    });
    if(done){undo=null;formStatus('Undone.','success');render();onChanged();}
  }

  // --- Saving what a record decides for itself.
  async function save(payload,previous,change){
    const ok=await run(async token=>{
      if(change!=='relative')await put(token,uuid(),validateRevision({record:previous.id,at:now(),change,prior:previous}),null);
      return put(token,previous.id,payload,previous.revision);
    });
    if(ok){changeOpen=null;onChanged();}
    return ok;
  }
  async function remove(record){
    const ok=await run(async token=>{
      for(const revision of revisions.filter(revision=>revision.record===record.id))
        await offline.request(token,`/v1/health/${revision.id}`,{method:'DELETE',value:{id:revision.id,revision:revision.revision}});
      return offline.request(token,`/v1/health/${record.id}`,{method:'DELETE',value:{id:record.id,revision:record.revision}});
    });
    if(ok){confirming=null;expanded.delete(record.id);onChanged();}
  }
  async function moveNotes(list,targetId){
    if(!targetId)return;
    const ok=await run(async token=>{
      for(const record of list){
        await put(token,uuid(),validateRevision({record:record.id,at:now(),change:'destination',prior:record}),null);
        await put(token,record.id,validateHealthRecord({...record,relative:targetId}),record.revision);
      }
      return offline.request(token,'/v1/health');
    });
    if(ok)onChanged();
  }
  async function removeRelative(relative,mine){
    const ok=await run(async token=>{
      for(const record of mine){
        for(const revision of revisions.filter(revision=>revision.record===record.id))
          await offline.request(token,`/v1/health/${revision.id}`,{method:'DELETE',value:{id:revision.id,revision:revision.revision}});
        await offline.request(token,`/v1/health/${record.id}`,{method:'DELETE',value:{id:record.id,revision:record.revision}});
      }
      return offline.request(token,`/v1/health/${relative.id}`,{method:'DELETE',value:{id:relative.id,revision:relative.revision}});
    });
    if(ok){relativeConfirm=null;onChanged();}
  }
  async function markAllReviewed(){
    const at=now();
    const ok=await run(async token=>{
      for(const record of medicationsToReview(records))if(!isReviewed(record))await put(token,record.id,markReviewed(record,at),record.revision);
      return offline.request(token,'/v1/health');
    });
    if(ok)onChanged();
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}

  // --- The visit summary.
  function openExport(){
    exporting={selected:new Set(records.filter(record=>!record.conflict&&includedInSummary(record)).map(record=>record.id)),
      labels:new Map(relatives.map(relative=>[relative.id,exportLabel(relative)]))};
    render();
    $('export').hidden=false;
  }
  function closeExport(){
    exporting=null;
    if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl='';}
    $('export').hidden=true;$('export').replaceChildren();
  }
  function renderExport(){
    if(!exporting){if(!$('export').hidden)closeExport();return;}
    const id='health-visit';
    const usable=records.filter(record=>!record.conflict);
    const everything=summaryOf(usable,{selected:new Set(usable.map(record=>record.id))});
    const groups=SUMMARY_SECTIONS.filter(([key])=>everything[key].length).map(([key,title])=>({title,
      rows:everything[key].map(record=>ExportChoice({title:recordTitle(record),detail:subtitleOf(record,{showRelative:true}),checked:exporting.selected.has(record.id),
        onChange:checked=>{checked?exporting.selected.add(record.id):exporting.selected.delete(record.id);renderLines();}}))}));
    const labels=relatives.filter(relative=>records.some(record=>record.relative===relative.id)).map((relative,index)=>{
      const field=FormField({id:`${id}-label-${index}`,label:relative.label,kind:'text'});
      const input=field.querySelector('input');
      input.value=exporting.labels.get(relative.id);
      input.addEventListener('input',()=>{exporting.labels.set(relative.id,input.value.trim()||'Relative');renderLines();});
      return field;
    });
    const preview=ExportPreview({id,groups,labels,warning:'This file will contain health information outside the vault.'});
    setStatus(preview.querySelector(`#${id}-warning`),'This file will contain health information outside the vault.','alert');
    const left=records.length-usable.length;
    if(left)preview.querySelector(`#${id}-lines`).before(Note(`${left} record${left===1?'':'s'} with an unresolved conflict ${left===1?'is':'are'} left out until resolved.`));
    preview.querySelector(`#${id}-close`).addEventListener('click',closeExport);
    preview.querySelector(`#${id}-save`).addEventListener('click',exportPdf);
    $('export').replaceChildren(preview);
    renderLines();
  }
  const exportLines=()=>visitSummaryLines({records,relatives,selected:exporting.selected,labels:Object.fromEntries(exporting.labels),preparedAt:now(),review:reviewDate(records)});
  function renderLines(){
    const host=$('export')?.querySelector('#health-visit-lines');
    if(!host||!exporting)return;
    host.replaceChildren(...exportLines().map(line=>line.style==='title'?Strong(line.text):line.style==='heading'?Strong(line.text,{className:'health-export-heading'}):line.style==='small'?Note(line.text):Text(line.text,{className:'health-note'})));
  }
  function exportPdf(){
    if(!exporting||!gate.unlocked())return;
    const current=generation;
    const statusLine=$('export').querySelector('#health-visit-status');
    try{
      const {bytes,pages,unwritable}=writePdf(exportLines(),{title:'Health summary'});
      if(current!==generation||!gate.unlocked())return;
      if(exportUrl)URL.revokeObjectURL(exportUrl);
      exportUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      const filename=`health-summary-${now().slice(0,10)}.pdf`;
      download({url:exportUrl,filename});
      setStatus(statusLine,`Saved ${filename} · ${pages} page${pages===1?'':'s'}.${unwritable?` ${unwritable} character${unwritable===1?'':'s'} outside the PDF’s character set ${unwritable===1?'was':'were'} written as “?”.`:''}`,'success');
    }catch(error){setStatus(statusLine,error.message||'The file could not be written.','error');}
  }

  // --- Drafts: sealed as they change, before anything is written.
  function scheduleDraft(){
    if(!drafts||!loaded)return;
    clearTimeout(draftTimer);
    draftTimer=setTimeout(saveDraft,300);
  }
  async function saveDraft(){
    clearTimeout(draftTimer);draftTimer=null;
    if(!drafts||!gate.unlocked()||!activeToken)return;
    const note=$('note').value;
    try{
      if(!note.trim()&&!editing){await drafts.remove(activeToken);return;}
      const draft={note,type:$('type').value,when:$('when').value,directions:$('directions').value,medicationStatus:$('medication-status').value,
        conditionStatus:$('condition-status').value,side:$('side').value,summary:$('summary-choice').value,
        destination:{...destination,choice:$('destination').value,label:$('relative-label').value},editing:editing?{id:editing.id,revision:editing.revision}:null,at:now()};
      await drafts.write(activeToken,await sealSecret(await gate.key(),DRAFT_ID,draft),draft.at);
    }catch{/* A draft that cannot be kept is not claimed to be. */}
  }
  async function offerDraft(token){
    const saved=await drafts?.read(token);
    if(!saved?.sealed){$('draft').replaceChildren();return;}
    draftOffer=saved;
    $('draft').replaceChildren(Stack([Note(`An unsaved note from ${dateText(saved.at)}.`),
      ActionGroup([action('Restore draft',restoreDraft,'secondary',{enabled:true}),action('Discard',discardDraft,'subtle',{enabled:true})],{compact:true})],{className:'health-decision'}));
  }
  async function restoreDraft(){
    try{
      const draft=await gate.open(DRAFT_ID,draftOffer.sealed);
      clearForm();
      $('note').value=draft.note||'';$('type').value=draft.type||HEALTH_TYPES[0];$('when').value=draft.when||'';$('directions').value=draft.directions||'';
      $('medication-status').value=draft.medicationStatus||'Unspecified';$('condition-status').value=draft.conditionStatus||'Unspecified';
      $('side').value=draft.side||'Unspecified';$('summary-choice').value=draft.summary||'auto';
      if(draft.destination?.mode==='explicit'){
        destination={mode:'explicit',relative:draft.destination.relative||'',label:draft.destination.label||'',side:draft.side||'Unspecified'};
        $('destination-fields').hidden=false;$('destination').value=draft.destination.choice||draft.destination.relative||'';$('relative-label').value=draft.destination.label||'';
      }
      const record=draft.editing?records.find(record=>record.id===draft.editing.id):null;
      if(record&&record.revision===draft.editing.revision){editing={id:record.id,revision:record.revision,record};$('editor-title').textContent=`Editing ${shorten(recordTitle(record),40)}`;}
      else if(draft.editing)formStatus('The record this edit was for has changed since; save it as a new note or discard it.','alert');
      $('draft').replaceChildren();draftOffer=null;
      $('editor').open=true;renderEditor();$('note').focus();
    }catch(error){status(vaultReason(error),'error');}
  }
  async function discardDraft(){
    try{await drafts.remove(activeToken);}catch{}
    draftOffer=null;$('draft').replaceChildren();
  }

  // --- Loading, locking, and the run guard every operation goes through.
  async function run(operation){
    if(busy)return false;
    busy=true;const current=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh your records before editing.');}
      activeToken=token;
      const result=await operation(token);
      if(current!==generation)return false;
      if(result?.records){
        rows=result.records;
        if(!await open(current))return false;
        loaded=true;status(result.syncMessage||'','alert');
      }
      return result??true;
    }catch(error){
      if(current!==generation)return false;
      const text=vaultReason(error);
      status(text,'error');formStatus(text,'error');
      return false;
    }finally{if(current===generation){busy=false;render();}}
  }
  async function refresh(){
    if(!gate.unlocked())return;
    status('Loading records…','progress');
    await run(token=>offline.request(token,'/v1/health'));
  }
  async function arrived(){
    await refresh();
    if(gate.unlocked()&&activeToken)await offerDraft(activeToken);
  }
  function clear(){
    generation++;rows=[];records=[];relatives=[];revisions=[];opened.clear();cloudTexts=new Map();unreadable=0;
    loaded=false;busy=false;activeToken='';expanded.clear();changeOpen=null;confirming=null;relativeEditing=null;relativeConfirm=null;reviewOpen=false;draftOffer=null;
    clearTimeout(draftTimer);draftTimer=null;
    closeExport();
    clearForm();$('editor').open=false;$('draft').replaceChildren();$('results').replaceChildren();$('search').value='';
    status('Unlock this section with your passkey to load your records.');
    render();
  }

  $('search').addEventListener('input',render);
  $('filter').addEventListener('change',renderHistory);
  $('type').addEventListener('change',()=>{renderEditor();scheduleDraft();});
  $('note').addEventListener('input',()=>{renderEditor();scheduleDraft();});
  for(const key of ['when','directions','medication-status','condition-status','side','summary-choice','relative-label'])$(key).addEventListener('input',scheduleDraft);
  for(const key of ['note','when','directions','relative-label'])$(key).addEventListener('blur',saveDraft);
  $('destination-change').addEventListener('click',()=>{
    $('destination-fields').hidden=false;
    // Opening the control is a choice: whatever is shown stands until changed.
    const found=destination.mode==='auto'?detectRelative($('note').value,relatives):null;
    if(found?.status==='found')$('destination').value=found.relative.id;
    else if(found?.status==='new'){$('destination').value='new';$('relative-label').value=found.label;$('side').value=found.side;}
    destination={mode:'explicit',relative:$('destination').value==='new'?'':$('destination').value,label:$('destination').value==='new'?$('relative-label').value:'',side:$('side').value};
    renderEditor();$('destination').focus();
  });
  $('destination').addEventListener('change',()=>{
    const value=$('destination').value;
    destination={mode:'explicit',relative:value==='new'?'':value,label:value==='new'?$('relative-label').value:'',side:$('side').value};
    const relative=relatives.find(relative=>relative.id===value);
    if(relative)$('side').value=relative.side;
    renderEditor();scheduleDraft();
  });
  $('relative-label').addEventListener('input',()=>{destination={...destination,label:$('relative-label').value};renderEditor();});
  $('cancel').addEventListener('click',async()=>{clearForm();$('editor').open=false;await drafts?.remove(activeToken).catch(()=>{});render();});
  $('undo').addEventListener('click',undoSave);
  $('form').addEventListener('submit',submit);
  clearForm();clear();
  if(gate.unlocked())arrived();
  const reload=()=>{if(gate.unlocked())refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();else reload();});
  credentials.subscribe?.(()=>{clear();if(gate.unlocked())arrived();});
  return {refresh,clear,changed:reload,stop(){gate.stop();clearTimeout(draftTimer);}};
}
