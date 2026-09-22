import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTaxes} from '../src/taxes.js';
import {rc4Locked} from './fixtures/locked-pdf.js';

const settle=async(check,attempts=600)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the taxes tool to settle.');
};
// linkedom's select has no value setter, so assignments made by the tool have to
// land the way they do in a browser. The selection is written as attributes
// rather than through `option.selected`, whose setter clears whichever option is
// selected whenever another is set to false.
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,
    set(value){for(const option of this.options){if(option.value===value)option.setAttribute('selected','');else option.removeAttribute('selected');}}});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
// What a reader actually meets: the host hides `[hidden]` with CSS, which a
// DOM-only test has to do for itself.
const visibleText=node=>[...node.childNodes].map(child=>
  child.nodeType===3?child.textContent:child.hidden?'':visibleText(child)).join(' ');
function setup(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  return {document,window,restore:selectValues(window)};
}
const FILED=[{id:'k1-averin-document',name:'K-1 - Averin Capital LLC.pdf',modifiedTime:'2026-03-02T00:00:00.000Z',size:2240000,webViewLink:'https://drive.example/k1'}];
const GROUPS=[{name:'Berry EA 2024 Family Trust',folderId:'trust',files:[],groups:[
  {name:'Filings',folderId:'filings',
    files:[{name:'Return - Federal - Berry EA 2024 Family Trust.pdf',modifiedTime:'2026-04-10T00:00:00.000Z',size:4100000,webViewLink:'https://drive.example/return'}]},
  {name:'Payments',folderId:'payments',
    files:[{name:'Estimated payment - Q3 Federal - Berry EA 2024 Family Trust.pdf',modifiedTime:'2026-09-15T00:00:00.000Z',size:90000,webViewLink:'https://drive.example/q3'}]}
]}];
// One synthetic Worker, recording what the tool asked it for.
function worker({connected=true,groups=[],connections=[{id:'newest',name:'Newest',hasApiKey:true},{id:'older',name:'Older',hasApiKey:true}]}={}){
  const asked=[];
  return {asked,
    async remote(_token,path,options={}){
      asked.push({path,value:options.value});
      if(path==='/v1/drive/status')return {connected,account:connected?'owner@example.com':'',configured:true};
      if(path.startsWith('/v1/drive/filed'))return {year:'2025',files:connected?FILED:[],groups:connected?groups:[]};
      if(path==='/v1/ai-connections')return {connections};
      if(path.endsWith('/tax-intake'))return {type:'1099',issuer:'Schwab',year:'2025',confidence:'high',reason:'Read off the form header.'};
      if(path==='/v1/drive/plan')return {ticket:'t',year:options.value.year,name:options.value.name,path:options.value.path,
        folder:{id:'f',created:false},existing:null,keepBothName:''};
      return {};
    }};
}
const document1099=()=>new File(['2025 Form 1099-DIV\nPayer: Schwab\nTotal ordinary dividends 1,284.00\n'],'download.txt',{type:'text/plain'});

test('a connected Drive says nothing about itself, and the reading picks its own connection',async()=>{
  const {document,window,restore}=setup();
  const api=worker();
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:api.remote,upload:async()=>({filed:{name:'x',year:'2025'}})});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===1);

  // Nothing names the account or the service it files into while it is working.
  assert.equal(/Google Drive|owner@example\.com|Disconnect/.test(visibleText(root)),false,visibleText(root));
  assert.equal(document.getElementById('taxes-connection-section').hidden,true);
  // Nor is a connection asked for: there is no picker to answer.
  assert.equal(document.getElementById('taxes-connection-picker'),null);
  assert.equal(document.getElementById('taxes-ai-status').textContent,'');
  // The filed list is still there, under its own heading.
  assert.match(visibleText(root),/Already filed/);
  assert.match(document.getElementById('taxes-filed').textContent,/2025 · 1 document/);
  // UI-35: the sections open the same way. Filing is what the tool is opened
  // for, so it starts open; a year of filed names is dozens of lines, so that
  // list starts shut until it is asked for.
  const filedPanel=document.getElementById('taxes-filed-panel');
  assert.equal(filedPanel.tagName,'DETAILS');
  assert.equal(filedPanel.hasAttribute('open'),false);
  assert.equal(document.getElementById('taxes-drop').closest('details').hasAttribute('open'),true);

  // A dropped document is read through the connection changed most recently,
  // which is the first the Worker lists.
  document.getElementById('taxes-drop').dispatchEvent(Object.assign(new window.Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{files:[document1099()]}}));
  await settle(()=>document.getElementById('taxes-destination').hidden===false);
  assert.equal(api.asked.some(request=>request.path==='/v1/ai-connections/newest/tax-intake'),true);
  const typeField=document.getElementById('taxes-type');
  assert.equal(typeField.value,'1099');
  assert.equal(document.getElementById('taxes-issuer').value,'Schwab');
  assert.match(document.getElementById('taxes-destination').textContent,/2025 \/ Form 1099 - Schwab\.txt/);
  // A reading it is sure of leaves the status line empty, so nothing renders
  // between the destination and the actions.
  assert.equal(document.getElementById('taxes-file-form-status').textContent,'');
  assert.deepEqual([...document.getElementById('taxes-file-actions').children].map(node=>node.textContent),['File it','Clear']);
  restore();
});

test('an unconnected Drive is named, and a device with no AI connection is told where to save one',async()=>{
  const {document,restore}=setup();
  const api=worker({connected:false,connections:[{id:'keyless',name:'No key yet',hasApiKey:false}]});
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:api.remote,upload:async()=>({})});
  await settle(()=>document.getElementById('taxes-ai-status').textContent!=='');

  assert.equal(document.getElementById('taxes-connection-section').hidden,false);
  assert.match(visibleText(root),/Google Drive/);
  assert.equal([...root.querySelectorAll('#taxes-connection button')].map(node=>node.textContent).join(),'Connect Google Drive');
  assert.match(document.getElementById('taxes-ai-status').textContent,/Save an AI connection in Settings/);
  // Nothing is filed yet, so the list stays out of the way entirely.
  assert.equal(document.getElementById('taxes-drive-contents').hidden,true);
  restore();
});

// Every document a year holds is read down this list, so a row is the name and
// nothing else: a date and a size on each one doubled its length.
test('what is already filed is one line per document, under the taxpayer it belongs to',async()=>{
  const {document,window,restore}=setup();
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:worker({groups:GROUPS}).remote,upload:async()=>({filed:{name:'x',year:'2025'}})});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===3);

  const rows=[...root.querySelectorAll('.tax-filed-row')].map(node=>node.textContent);
  assert.deepEqual(rows,['K-1 - Averin Capital LLC.pdf',
    'Return - Federal - Berry EA 2024 Family Trust.pdf',
    'Estimated payment - Q3 Federal - Berry EA 2024 Family Trust.pdf']);
  // Neither the date it was filed nor how large it is appears anywhere in it.
  const listed=document.getElementById('taxes-filed').textContent;
  assert.doesNotMatch(listed,/Mar 2|Apr 10|Sep 15|MB|KB/);
  // Each heading names what is under it, the taxpayer above what it is for.
  assert.deepEqual([...root.querySelectorAll('.tax-filed-group')].map(node=>node.textContent),
    ['Berry EA 2024 Family Trust','Filings','Payments']);
  assert.equal(root.querySelector('.tax-filed-group--1').textContent,'Berry EA 2024 Family Trust');
  assert.equal(root.querySelector('.tax-filed-group--2').textContent,'Filings');
  // A document counts wherever in the year it sits, however deep that is.
  assert.match(listed,/2025 · 3 documents/);
  restore();
});

// Where a document went is said once it is there, and the folder it names is
// the one it opens.
test('a filed document names the folder it went into, and that folder opens',async()=>{
  const {document,window,restore}=setup();
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:worker().remote,
    upload:async()=>({filed:{name:'Form 1099 - Schwab.txt',year:'2025',path:['2025']}})});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===1);
  document.getElementById('taxes-drop').dispatchEvent(Object.assign(new window.Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{files:[document1099()]}}));
  await settle(()=>document.getElementById('taxes-destination').hidden===false);
  document.getElementById('taxes-file-actions').querySelector('button').click();
  const line=document.getElementById('taxes-file-form-status');
  await settle(()=>line.classList.contains('notice--success'));

  assert.equal(line.textContent,'Filed 2025 / Form 1099 - Schwab.txt.');
  const folder=line.querySelector('a');
  assert.equal(folder.textContent,'2025');
  assert.equal(folder.getAttribute('href'),'https://drive.google.com/drive/folders/f');
  assert.equal(folder.getAttribute('target'),'_blank');
  restore();
});

// In the side panel a filed row can be dragged onto the page beside it. The
// tool's part is which document, fetched how, and what to say when it did not
// go; drag-out.js carries it across.
test('a filed row hands its own document to the page beside the panel, and says when it did not go',async()=>{
  const {document,window,restore}=setup();
  const root=document.querySelector('main');
  const offered=[],fetched=[];
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:worker().remote,upload:async()=>({}),
    download:async(token,path,options)=>{fetched.push({token,path,options});return new File(['%PDF'],options.name,{type:'application/pdf'});},
    handOff:(event,offer)=>offered.push({event,offer})});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===1);
  const row=root.querySelector('.tax-filed-row');
  assert.equal(row.draggable,true);
  row.dispatchEvent(new window.Event('dragstart',{bubbles:true}));
  assert.equal(offered.length,1);
  const file=await offered[0].offer.read();
  assert.deepEqual(fetched,[{token:'token',path:'/v1/drive/file?id=k1-averin-document',options:{name:'K-1 - Averin Capital LLC.pdf'}}]);
  assert.equal(file.name,'K-1 - Averin Capital LLC.pdf');

  // Landing somewhere is shown by the page; not landing is said here, in the section it came from.
  const line=document.getElementById('taxes-filed-status');
  offered[0].offer.onResult({accepted:true,error:''});
  assert.equal(line.textContent,'');
  offered[0].offer.onResult({accepted:false,error:''});
  assert.ok(line.classList.contains('notice--alert'));
  assert.match(line.textContent,/upload box/);
  offered[0].offer.onResult({accepted:false,error:'That document is no longer in the tax folder.'});
  assert.ok(line.classList.contains('notice--error'));
  assert.match(line.textContent,/Couldn’t hand over K-1 - Averin Capital LLC\.pdf\. That document is no longer/);
  // A new drag starts with a clean line.
  row.dispatchEvent(new window.Event('dragstart',{bubbles:true}));
  assert.equal(line.textContent,'');
  restore();
});

test('without a page beside it, a filed row is only a link',async()=>{
  const {document,restore}=setup();
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:worker().remote,upload:async()=>({})});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===1);
  assert.equal(root.querySelector('.tax-filed-row').draggable,false);
  restore();
});

// A year before 2026 has no folders to say what a document is for, so the list
// says it: under Supporting Documents, Payments and Filings, and by type within.
test('an undivided year is listed under what each document is for',async()=>{
  const {document,restore}=setup();
  const root=document.querySelector('main');
  const {FiledList}=await import('../src/components/taxes.js');
  root.replaceChildren(FiledList('2025',[{name:'Return - Federal.pdf'},{name:'K-1 - Averin.pdf'},
    {name:'Q2 Vouchers.pdf'},{name:'1099-INT - Popular.pdf'}]));
  assert.deepEqual([...root.querySelectorAll('.tax-filed-group')].map(node=>node.textContent),
    ['Supporting Documents','Schedule K-1','Form 1099','Payments','Filings']);
  assert.deepEqual([...root.querySelectorAll('.tax-filed-row')].map(node=>node.textContent),
    ['K-1 - Averin.pdf','1099-INT - Popular.pdf','Q2 Vouchers.pdf','Return - Federal.pdf']);
  restore();
});

test('a return is asked who filed it and where, not who issued it',async()=>{
  const {document,window,restore}=setup();
  const api=worker();
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:api.remote,upload:async()=>({filed:{name:'x',year:'2026'}})});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===1);
  document.getElementById('taxes-drop').dispatchEvent(Object.assign(new window.Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{files:[document1099()]}}));
  await settle(()=>document.getElementById('taxes-destination').hidden===false);

  const shown=id=>!document.getElementById(`taxes-${id}`).closest('.form-field').hidden;
  // A document that arrived is named by its issuer and asked nothing else. The
  // year on the drop is 2025, which is not divided, so nothing asks what it is
  // for either.
  assert.deepEqual([shown('issuer'),shown('taxpayer'),shown('jurisdiction'),shown('quarter'),shown('category')],
    [true,true,false,false,false]);

  const type=document.getElementById('taxes-type');
  const category=document.getElementById('taxes-category');
  assert.equal(category.value,'supporting');
  type.value='return';
  type.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.deepEqual([shown('issuer'),shown('jurisdiction'),shown('quarter')],[false,true,false]);
  // Choosing the type answers what the document is for.
  assert.equal(category.value,'filings');
  const estimate=document.getElementById('taxes-quarter');
  type.value='estimated-payment';
  type.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(shown('quarter'),true);
  assert.equal(category.value,'payments');

  // Named and placed from the answers: from 2026 the year is divided by
  // taxpayer, and the destination says so before anything moves.
  type.value='return';
  type.dispatchEvent(new window.Event('change',{bubbles:true}));
  document.getElementById('taxes-taxpayer').value='ea-2024';
  document.getElementById('taxes-jurisdiction').value='federal';
  document.getElementById('taxes-year').value='2026';
  estimate.value='';
  document.getElementById('taxes-jurisdiction').dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(shown('category'),true,'a divided year asks what the document is for');
  assert.match(document.getElementById('taxes-destination').textContent,
    /2026 \/ Berry EA 2024 Family Trust \/ Filings \/ Return - Federal - Berry EA 2024 Family Trust\.txt/);
  // Answering over it moves the document without renaming it.
  category.value='supporting';
  category.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.match(document.getElementById('taxes-destination').textContent,
    /2026 \/ Berry EA 2024 Family Trust \/ Supporting Documents \/ Return - Federal - /);
  restore();
});

// A locked document is not a broken one: it is the owner's file, and they have
// the password. What reaches Drive is the copy that opens without it.
test('a document that needs a password asks for it, and files the unlocked copy',async()=>{
  const {document,window,restore}=setup();
  const api=worker();
  const sent=[];
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:api.remote,
    upload:async(_token,_path,{file})=>{sent.push(file);return {filed:{name:file.name,year:'2025',path:['2025']}};}});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===1);

  const locked=new File([rc4Locked()],'Return.pdf',{type:'application/pdf'});
  document.getElementById('taxes-drop').dispatchEvent(Object.assign(new window.Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{files:[locked]}}));
  await settle(()=>document.getElementById('taxes-password').hidden===false);

  // What is wrong is said once, on the line above the field that answers it.
  assert.match(document.getElementById('taxes-file-status').textContent,/needs a password/);
  assert.doesNotMatch(document.getElementById('taxes-password').textContent,/needs a password/);
  // Nothing is named or filed while it cannot be opened.
  assert.equal(document.getElementById('taxes-file-actions').children.length,0);
  assert.equal(document.getElementById('taxes-type').closest('.form-field').hidden,true);

  // A wrong password is refused and asked again rather than filed.
  const type=value=>{
    const input=document.getElementById('taxes-password-value');
    input.value=value;
    input.dispatchEvent(new window.Event('input',{bubbles:true}));
  };
  const press=()=>[...root.querySelectorAll('#taxes-password button')][0].click();
  type('not-it');press();
  await settle(()=>/did not open/.test(document.getElementById('taxes-file-status').textContent));
  assert.equal(document.getElementById('taxes-file-actions').children.length,0);

  // What was typed survives the refusal, so the panel comes back with it in
  // place rather than empty.
  assert.equal(document.getElementById('taxes-password-value').value,'not-it');
  type('taxes-2025');press();
  await settle(()=>document.getElementById('taxes-password').hidden===true);
  assert.match(document.getElementById('taxes-document').textContent,/Unlocked on this device/);

  document.getElementById('taxes-file-actions').querySelector('button').click();
  await settle(()=>sent.length===1);
  // The bytes that went to Drive are the unlocked copy, not the file dropped.
  const filed=new Uint8Array(await sent[0].arrayBuffer());
  assert.equal(Buffer.from(filed).includes('/Encrypt'),false);
  assert.ok(filed.length&&filed.length!==locked.size,'the copy filed is not the file that arrived');
  restore();
});
