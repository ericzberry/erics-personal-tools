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
  assert.deepEqual([...board.querySelectorAll('.tier-group')].map(p=>p.getAttribute('aria-label')),['Tier 1','Tier 2']);
  for(const status of ['mine','taken','available'])assert.equal(board.querySelectorAll(`.ranked-player--${status}`).length,1);
  const unknown=Stack(TieredRankings(players,new Map(),8));assert.equal(unknown.querySelectorAll('.ranked-player--unknown').length,3);
});
test('roster stays in a shared sticky group and recommendation panel is removed',()=>{
  const doc=setup();mountApp(doc.getElementById('app'));
  assert.equal(doc.querySelectorAll('#recommendations').length,0);
  assert.equal(doc.getElementById('next-pick-chip'),null);
  assert.ok(doc.querySelector('.sticky-group').contains(doc.getElementById('roster-counts')));
  assert.match(doc.querySelector('.sticky-group').textContent,/Bedford Bridges/);
  assert.equal(doc.querySelector('.advisor'),null);
  assert.ok(doc.getElementById('draft-view').contains(doc.getElementById('spreadsheet-players')));
  for(const id of ['draft-data','session','open-corrections','picks'])assert.equal(doc.getElementById(id),null);
});

test('taken tiers collapse, remain expandable, and recommendation marks follow ownership edits',async()=>{
 const {TieredRankings,Stack}=await import('../src/components/ui.js');const doc=setup();
 const p={rank:1,tier:1,name:'Test',key:'a'},states=new Map(),picks=new Map([['a',{teamId:8}]]);
 let group=TieredRankings([p],picks,8,{tierStates:states})[0].querySelector('.tier-group');assert.equal(group.open,false);
 group.open=true;group.dispatchEvent(new doc.defaultView.Event('toggle'));
 group=TieredRankings([p],picks,8,{tierStates:states})[0].querySelector('.tier-group');assert.equal(group.open,true);
 let selected;const board=Stack(TieredRankings([p],new Map(),8,{tierStates:states,recommended:['a'],onSelect:(player,owner)=>{selected=[player.key,owner];}}));
 assert.equal(board.querySelector('.tier-group').open,true);assert.equal(board.querySelectorAll('.ranked-player--recommended').length,1);
 board.querySelector('[aria-label="Test: taken by me"]').click();assert.deepEqual(selected,['a','me']);
 const taken=Stack(TieredRankings([p],picks,8,{tierStates:states,recommended:[]}));assert.equal(taken.querySelector('.tier-group').open,false);assert.equal(taken.querySelectorAll('.ranked-player--recommended').length,0);
});

test('settings use one accessible capture toggle and no duplicate default player list',()=>{
 const doc=setup();mountApp(doc.getElementById('app'));
 const toggle=doc.getElementById('capture-picks');assert.equal(toggle.getAttribute('role'),'switch');assert.equal(toggle.checked,true);
 assert.equal(doc.getElementById('manual-settings').hidden,true);assert.equal(doc.getElementById('manual-players').children.length,0);
 for(const id of ['board-tools','enable-manual','disable-manual'])assert.equal(doc.getElementById(id),null);
});
test('tier board omits manual controls unless an edit handler is explicitly enabled',async()=>{
 const {TieredRankings,Stack}=await import('../src/components/ui.js');setup();const players=[{rank:1,tier:1,key:'a',name:'Player'}];
 const live=Stack(TieredRankings(players,new Map(),8,{confirmed:true}));assert.equal(live.querySelectorAll('button').length,0);
 const manual=Stack(TieredRankings(players,new Map(),8,{confirmed:true,onSelect:()=>{}}));assert.equal(manual.querySelectorAll('button').length,2);
});

test('all exhausted tiers share one expandable archive and reopen when a pick is undone',async()=>{
 const {TieredRankings,Stack}=await import('../src/components/ui.js');const doc=setup();
 const players=[{name:'A',rank:1,tier:1,key:'a'},{name:'B',rank:2,tier:2,key:'b'},{name:'C',rank:3,tier:3,key:'c'}],states=new Map();
 const picks=new Map([['a',{teamId:8}],['b',{teamId:1}]]);
 let board=Stack(TieredRankings(players,picks,8,{tierStates:states}));
 const archive=board.querySelector('.completed-tiers');assert.equal(archive.open,false);assert.equal(archive.querySelectorAll('.tier-group').length,2);assert.equal(board.children.length,2);
 archive.open=true;archive.dispatchEvent(new doc.defaultView.Event('toggle'));
 board=Stack(TieredRankings(players,picks,8,{tierStates:states}));assert.equal(board.querySelector('.completed-tiers').open,true);
 picks.delete('a');board=Stack(TieredRankings(players,picks,8,{tierStates:states}));assert.equal(board.querySelector('.completed-tiers').querySelectorAll('.tier-group').length,1);
 assert.equal([...board.children].find(el=>el.getAttribute('aria-label')==='Tier 1').open,true);
});

test('late tiers fold other owners while keeping available and own picks visible',async()=>{
 const {TieredRankings,Stack}=await import('../src/components/ui.js');setup();
 const players=[{key:'a',rank:60,tier:5,name:'Available'},{key:'m',rank:61,tier:5,name:'Mine'},{key:'o',rank:62,tier:5,name:'Other'}];
 const picks=new Map([['m',{teamId:8}],['o',{teamId:2}]]);
 let board=Stack(TieredRankings(players,picks,8,{confirmed:true}));let group=board.querySelector('.tier-group');
 assert.equal(group.open,true);assert.equal(group.querySelector('details').open,false);
 assert.equal(group.querySelector('details').querySelector('.ranked-player').textContent.includes('Other'),true);
 assert.equal(group.querySelectorAll('.ranked-player--mine').length,1);
 picks.set('a',{teamId:2});board=Stack(TieredRankings(players,picks,8,{confirmed:true}));
 assert.equal(board.querySelector('.completed-tiers'),null);assert.equal(board.querySelector('.tier-group').open,true);
 assert.equal(board.querySelectorAll('details details .ranked-player').length,2);
});
