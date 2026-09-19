import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {mountApp} from '../src/components/views.js';
import {selectTool} from '../src/navigation.js';
import {capabilities,PANEL_CAPABILITIES} from '../src/capabilities.js';
import {FinanceView} from '../src/components/finance.js';
import {activeAccountTab} from '../src/finance-page-read.js';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';

const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
function unlockedVault(){
  let key=null;
  return {idleMs:900000,available:()=>true,unlocked:()=>true,touch(){},lock(){},
    async key(){key??=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(7),'AES-GCM',false,['encrypt','decrypt']);return key;},
    async open(id,envelope){return openSecret(await this.key(),id,envelope);},
    async unlockWithRecoveryCode(){return this.key();},recoveryCode:()=>'EV1-SYNTHETIC'};
}
// linkedom's <select> value is read-only; the app sets it like a browser does.
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
function financeHost(document,options){
  return mountFinance(document.querySelector('main'),{vault:unlockedVault(),credentials:{get:async()=>'token'},
    remote:async()=>({connections:[]}),
    offline:{request:async()=>({records:[]})},...options});
}

function setup(){
  const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
  globalThis.document=document;return document;
}

test('Finance opens inside the sidebar instead of sending the owner to a tab',()=>{
  const doc=setup();mountApp(doc.getElementById('app'));
  const entry=capabilities.find(item=>item.id==='finance');
  assert.equal(entry.href,undefined,'a sidebar tool must not carry a tab link');
  selectTool('finance');
  assert.equal(doc.getElementById('finance-tool').hidden,false);
  assert.equal(doc.getElementById('travel-tool').hidden,true);
  assert.equal(doc.getElementById('current-function').textContent,'Finance');
  selectTool('travel');
  assert.equal(doc.getElementById('finance-tool').hidden,true);
});

test('the finance screen leads with its title, status and one action, and has no Cloud sync footer',()=>{
  const doc=setup();
  doc.getElementById('app').replaceChildren(FinanceView());
  const headings=[...doc.querySelectorAll('.settings-group-title')].map(node=>node.textContent);
  assert.equal(headings.includes('Cloud sync'),false,'connection maintenance no longer trails the page');
  assert.equal(headings.includes('Ledger'),false,'the saved figures are named for what they hold');
  assert.ok(headings.includes('Holdings'));
  const title=doc.querySelector('.tool-title-block');
  assert.equal(title.querySelector('h1').textContent,'Finance');
  assert.ok(title.contains(doc.getElementById('finance-actions')));
  assert.ok(title.contains(doc.getElementById('finance-status')));
  // Labels and live status only: no intro paragraph above the upload zone.
  assert.equal(doc.getElementById('finance-drop').previousElementSibling,null);
  // Figures arrive from a statement or the page itself; there is no box to type
  // them into, so there is no field standing there without a purpose.
  assert.equal(doc.querySelector('label[for=finance-intake]'),null);
  assert.equal(doc.getElementById('finance-intake'),null);
  const ids=[...doc.querySelectorAll('[id]')].map(node=>node.id);
  assert.equal(new Set(ids).size,ids.length);
});

test('the open page is read from beside the sidebar, never from the tool’s own tab',async()=>{
  const tabs=[
    {id:1,url:'chrome-extension://abc/finance.html',active:true},
    {id:2,url:'https://example.invalid/accounts',active:true}
  ];
  const beside=async query=>query.currentWindow?[tabs[1]]:tabs;
  assert.equal((await activeAccountTab({tabs:{query:beside}})).id,2);
  // Opened as a full tab, this tool is the active tab, so another window's page wins.
  const ownTab=async query=>query.currentWindow?[tabs[0]]:tabs;
  assert.equal((await activeAccountTab({tabs:{query:ownTab}})).id,2);
  const none=async()=>[tabs[0]];
  await assert.rejects(()=>activeAccountTab({tabs:{query:none}}),/No ordinary web page/);
});

test('reading the open page is offered only where there is a page beside the tool, and goes straight to drafts',async()=>{
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  const restore=selectValues(window);
  const plain=financeHost(document);
  await settle(()=>document.getElementById('finance-list').textContent.includes('No figures yet'));
  assert.equal(document.getElementById('finance-page').hidden,true,'a full tab has no page to read');
  assert.equal(document.getElementById('finance-actions').textContent,'Refresh');
  plain.stop();

  document.querySelector('main').replaceChildren();
  let asked=0,sent=null;
  const sidebar=financeHost(document,{
    readPage:async()=>{asked++;return {text:'Cash 1,200.00',host:'example.invalid',title:'',trimmed:0,tables:1,filtered:true};},
    remote:async(token,path,options)=>{
      if(path==='/v1/ai-connections')return {connections:[{id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true}]};
      sent={path,value:options.value};
      return {readings:[{account:'Checking',label:'Cash',class:'cash',registration:'',scope:'account',value:1200,asOf:'2026-09-19',confidence:'high',reason:'Balance on the page.'}],unread:''};
    }
  });
  await settle(()=>document.getElementById('finance-list').textContent.includes('No figures yet'));
  assert.equal(document.getElementById('finance-page').hidden,false);
  document.getElementById('finance-page').click();
  await settle(()=>document.getElementById('finance-drafts').textContent.includes('Cash'));
  assert.equal(asked,1,'the page is read once, and only when asked');
  // One press, one errand: there is no box for the page to be pasted into on
  // the way through, and no connection had to be chosen first.
  assert.equal(document.getElementById('finance-intake'),null);
  assert.equal(document.getElementById('finance-connection'),null,'the connection is not a question put to the owner');
  assert.equal(sent.path,'/v1/ai-connections/connection-1/finance-intake');
  assert.equal(sent.value.live,true,'an open page is read as today’s balances');
  assert.match(sent.value.text,/Cash 1,200\.00/);
  assert.match(document.getElementById('finance-intake-status').textContent,/1 figure read from example\.invalid, folded into 1/);
  sidebar.stop();restore();
});

// A tool that mounts inside the side panel brings its markup but not its
// stylesheet links: those belong to the page. Finance's unlocked gate leaves an
// empty live region behind, and without vault.css that empty line painted a
// notice bar across the top of the panel. Whatever a tool's own page needs to
// render, the panel that also mounts it needs too.
function stylesheets(page){
  const seen=new Set();
  const visit=(file,base)=>{
    const path=new URL(file,base);
    const name=path.pathname.split('/').pop();
    if(seen.has(name))return;
    seen.add(name);
    const source=readFileSync(path,'utf8');
    for(const [,imported] of source.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g))visit(imported,path);
  };
  const markup=readFileSync(new URL(`../${page}`,import.meta.url),'utf8');
  for(const [,href] of markup.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g))visit(href,new URL('../x',import.meta.url));
  return seen;
}
test('the side panel loads the styles of every tool it mounts in place',()=>{
  const panel=stylesheets('sidepanel.html');
  // capability-links.js mounts each of these inside the panel rather than
  // opening its page, so the panel has to carry the styles that page carries.
  for(const id of PANEL_CAPABILITIES){
    const page=`${id}.html`;
    for(const sheet of stylesheets(page))
      assert.ok(panel.has(sheet),`sidepanel.html is missing ${sheet}, which ${page} loads`);
  }
});

test('a capability in the panel opens there, and nothing left opens a tab but the two that have no panel home',()=>{
  const doc=setup();mountApp(doc.getElementById('app'));
  for(const id of PANEL_CAPABILITIES){
    const entry=capabilities.find(item=>item.id===id);
    assert.equal(entry.href,undefined,`${id} must not carry a tab link`);
    assert.ok(doc.getElementById(`${id}-tool`),`${id} has no section in the panel to mount into`);
    selectTool(id);
    assert.equal(doc.getElementById(`${id}-tool`).hidden,false,`${id} did not open in the panel`);
    assert.equal(doc.getElementById('current-function').textContent,entry.label);
  }
  // Player rankings is reference data and Restaurants is a workspace of its own;
  // neither has a panel home yet, so both stay links.
  assert.deepEqual(capabilities.filter(item=>item.href).map(item=>item.id),['rankings','restaurants']);
});
