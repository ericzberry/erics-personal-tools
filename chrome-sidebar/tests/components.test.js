import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
import {RecommendationCard,Field,DataTable,Button,PickRow} from '../src/components/ui.js';
function setup(){const {document}=parseHTML('<html><body><div id="app"></div></body></html>');globalThis.document=document;return document;}
test('all screens mount through components with unique, accessible controller hooks',()=>{
  const doc=setup();mountApp(doc.getElementById('app'));
  const ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
  for(const filename of ['sidepanel.js','context-panel.js']){
    const source=readFileSync(new URL(`../src/${filename}`,import.meta.url),'utf8');
    for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(doc.getElementById(id),`${filename}: missing ${id}`);
  }
  for(const label of doc.querySelectorAll('label'))assert.ok(doc.getElementById(label.getAttribute('for')));
  assert.equal(doc.getElementById('rankings-drop'),null);
  assert.equal(doc.getElementById('email-result').hidden,true);
  assert.equal(doc.querySelectorAll('header').length,1);
});
test('shared cards and tables treat external text as text, not markup',()=>{
  setup();const payload='<img src=x onerror=alert(1)>';
  const card=RecommendationCard({name:payload,position:'RB',rank:1,adp:2,reasons:[payload]},{primary:true});
  assert.equal(card.querySelector('img'),null);assert.ok(card.textContent.includes(payload));
  assert.equal(DataTable(['Name'],[[payload]]).querySelector('img'),null);
  assert.equal(Button('Action').getAttribute('type'),'button');
  const [label,field]=Field({id:'query',label:'Search',hiddenLabel:true});assert.equal(label.getAttribute('for'),field.id);
});
test('feature code cannot introduce raw markup or element construction',()=>{
  const dir=new URL('../src/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.js'))){
    const source=readFileSync(new URL(name,dir),'utf8');
    assert.doesNotMatch(source,/createElement\s*\(|innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/,name);
  }
  const shell=readFileSync(new URL('../sidepanel.html',import.meta.url),'utf8');
  assert.doesNotMatch(shell,/<(?:button|input|select|textarea|section|header|details)\b/);
  const css=readFileSync(new URL('../src/components/styles.css',import.meta.url),'utf8');
  for(const rule of css.split('{').slice(0,-1))assert.doesNotMatch(rule.split('}').at(-1),/#[a-zA-Z][\w-]*/, 'Use component classes, not feature IDs');
});

test('pick history uses one compact metadata line',()=>{
  setup();const row=PickRow({player:'Drake London',overall:15,round:2,pickInRound:5,nflTeam:'ATL',position:'WR',team:'East Dillon Lions',teamId:1},2);
  assert.ok(row.classList.contains('pick--compact'));assert.equal(row.querySelectorAll('.pick-meta').length,1);assert.ok(row.textContent.includes('East Dillon Lions'));
});

test('shared tabs expose one panel and support click, arrows, Home and End',async()=>{
  const {Tabs,Text}=await import('../src/components/ui.js');const doc=setup();
  const tabs=Tabs({id:'example',label:'Example',items:[{key:'a',label:'First',content:Text('A')},{key:'b',label:'Second',content:Text('B')}]});doc.body.append(tabs);
  const buttons=[...tabs.querySelectorAll('[role=tab]')],panels=[...tabs.querySelectorAll('[role=tabpanel]')];
  assert.equal(buttons[0].getAttribute('aria-selected'),'true');assert.equal(panels[1].hidden,true);
  buttons[1].click();assert.equal(panels[0].hidden,true);assert.equal(panels[1].hidden,false);
  for(const [key,index] of [['ArrowRight',0],['End',1],['Home',0],['ArrowLeft',1]]){
    const current=buttons.find(b=>b.getAttribute('aria-selected')==='true');
    const event=new doc.defaultView.Event('keydown',{cancelable:true});event.key=key;current.dispatchEvent(event);
    assert.equal(buttons[index].getAttribute('aria-selected'),'true');assert.equal(buttons[index].getAttribute('tabindex'),'0');assert.equal(panels[index].hidden,false);
  }
});
test('ranked spreadsheet keeps source order, tiers, ownership and explicit availability labels',async()=>{
  const {TieredRankings,Stack}=await import('../src/components/ui.js');setup();
  const players=[{rank:3,tier:2,name:'C',key:'c'},{rank:1,tier:1,name:'A',key:'a'},{rank:2,tier:1,name:'B',key:'b'}];
  const board=Stack(TieredRankings(players,new Map([['a',{teamId:8}],['b',{teamId:2}]]),8,{confirmed:true}));
  assert.deepEqual([...board.querySelectorAll('.pick-name')].map(p=>p.textContent),['A','B','C']);
  assert.deepEqual([...board.querySelectorAll('.tier-heading')].map(p=>p.textContent),['Tier 1','Tier 2']);
  for(const status of ['mine','taken','available'])assert.equal(board.querySelectorAll(`.ranked-player--${status}`).length,1);
  const unknown=Stack(TieredRankings(players,new Map(),8));assert.equal(unknown.querySelectorAll('.ranked-player--unknown').length,3);
});
test('recommendations have one top container and spreadsheet lives in a reusable tab panel',()=>{
  const doc=setup();mountApp(doc.getElementById('app'));
  assert.equal(doc.querySelectorAll('#recommendations').length,1);
  assert.ok(doc.getElementById('next-pick-chip').contains(doc.getElementById('recommendations')));
  assert.equal(doc.querySelector('.advisor'),null);
  assert.ok(doc.getElementById('draft-data-spreadsheet-panel').contains(doc.getElementById('spreadsheet-players')));
});
