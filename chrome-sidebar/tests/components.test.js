import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
import {RecommendationCard,Field,DataTable,Button,PickRow} from '../src/components/ui.js';
import {capabilities} from '../src/capabilities.js';
function setup(){const {document}=parseHTML('<html><body><div id="app"></div></body></html>');globalThis.document=document;return document;}
test('all screens mount through components with unique, accessible controller hooks',()=>{
  const doc=setup();mountApp(doc.getElementById('app'));
  const ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
  for(const filename of ['sidepanel.js','context-panel.js','settings.js']){
    const source=readFileSync(new URL(`../src/${filename}`,import.meta.url),'utf8');
    for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(doc.getElementById(id),`${filename}: missing ${id}`);
  }
  for(const label of doc.querySelectorAll('label'))assert.ok(doc.getElementById(label.getAttribute('for')));
  assert.equal(doc.getElementById('rankings-drop'),null);
  assert.equal(doc.getElementById('email-result').hidden,true);
  assert.equal(doc.querySelectorAll('header').length,1);
});
test('every Tools entry carries an icon and the sidebar menu renders one per row',()=>{
  const doc=setup();mountApp(doc.getElementById('app'));
  for(const item of capabilities)assert.ok(item.icon,`${item.id} has no icon`);
  for(const item of capabilities){
    const glyph=doc.querySelector(`#navigate-${item.id} svg`);
    assert.ok(glyph,`${item.id} rendered no icon`);
    assert.equal(glyph.getAttribute('aria-hidden'),'true');
    assert.equal(glyph.querySelector('path').getAttribute('d'),item.icon);
  }
  // The label, not the icon, names each row.
  assert.equal(doc.querySelector('#navigate-travel .capability-text > strong').textContent,'Travel wallet');
  assert.ok(doc.querySelector('#open-settings svg'));
  // Gmail follows the active tab; AI connections and League rules left the menu.
  for(const id of ['navigate-gmail','navigate-ai','navigate-rules'])assert.equal(doc.getElementById(id),null);
  // Fantasy football sits under its own Misc heading, after the ungrouped tools.
  const headings=[...doc.querySelectorAll('.capability-list .capability-group')].map(node=>node.textContent);
  assert.deepEqual(headings,['Misc']);
  const misc=[];for(let node=doc.querySelector('.capability-group').nextElementSibling;node?.classList.contains('capability-item');node=node.nextElementSibling)misc.push(node.id);
  assert.deepEqual(misc,['navigate-rankings','navigate-football']);
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
  assert.ok(doc.querySelector('.sticky-group').contains(doc.getElementById('advice-context')));
  assert.match(doc.querySelector('.sticky-group').textContent,/Bedford Bridges/);
  assert.equal(doc.querySelector('.advisor'),null);
  assert.ok(doc.getElementById('draft-view').contains(doc.getElementById('spreadsheet-players')));
  assert.ok(doc.getElementById('settings-tool').contains(doc.getElementById('reset-draft')));
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

test('tier 4 folds other owners and archives on the final pick, then reopens on undo',async()=>{
 const {TieredRankings,Stack}=await import('../src/components/ui.js');const doc=setup();const states=new Map();
 const players=[{key:'a',rank:25,tier:4,name:'Available'},{key:'m',rank:26,tier:4,name:'Mine'},{key:'o',rank:27,tier:4,name:'Other'}];
 const picks=new Map([['m',{teamId:8}],['o',{teamId:2}]]);
 const render=()=>Stack(TieredRankings(players,picks,8,{confirmed:true,tierStates:states}));
 let board=render();let group=board.querySelector('.tier-group');
 assert.equal(group.open,true);assert.equal(group.querySelector('details').open,false);
 assert.equal(group.querySelector('details').querySelector('.ranked-player').textContent.includes('Other'),true);
 assert.equal(group.querySelectorAll('.ranked-player--mine').length,1);
 picks.set('a',{teamId:2});board=render();
 const archive=board.querySelector('.completed-tiers');group=archive.querySelector('.tier-group');
 assert.equal(archive.open,false);assert.equal(group.open,false);assert.equal(board.children.length,1);
 assert.equal(group.querySelectorAll('.ranked-player--mine').length,1);
 assert.equal(group.querySelectorAll('.ranked-player--taken').length,2);
 group.open=true;group.dispatchEvent(new doc.defaultView.Event('toggle'));
 assert.equal(render().querySelector('.tier-group').open,true);
 picks.delete('a');board=render();assert.equal(board.querySelector('.completed-tiers'),null);assert.equal(board.querySelector('.tier-group').open,true);
 picks.set('a',{teamId:8});board=render();assert.equal(board.querySelector('.completed-tiers').open,false);assert.equal(board.querySelector('.tier-group').open,false);
});

test('scarcity highlights roster needs and available players without obscuring ownership',async()=>{
 const {RosterCounts,TieredRankings,Stack}=await import('../src/components/ui.js');setup();
 const alert={position:'RB',pick:40,message:'1/2 quality RB starters. Waiting risks losing Tier 2 RBs.',playerKeys:['a']};
 const roster=RosterCounts({RB:2,WR:2},{alerts:[alert]});assert.equal(roster.querySelectorAll('.roster-count--scarce').length,1);assert.match(roster.querySelector('.scarcity-notice').textContent,/1\/2 quality/);
 const players=[{name:'Last RB',key:'a',rank:5,tier:2,position:'RB',nflTeam:'KC',adp:5}];
 const board=Stack(TieredRankings(players,new Map(),8,{confirmed:true,recommended:['a'],rosterAlerts:[alert]}));
 const row=board.querySelector('.ranked-player');assert.ok(row.classList.contains('ranked-player--scarce'));assert.ok(row.classList.contains('ranked-player--recommended'));assert.match(row.textContent,/RB getting thin/);assert.equal(row.querySelector('.scarcity-detail'),null);
 for(const [picks,confirmed] of [[new Map([['a',{teamId:8}]]),true],[new Map([['a',{teamId:2}]]),true],[new Map(),false]])assert.equal(Stack(TieredRankings(players,picks,8,{confirmed,rosterAlerts:[alert]})).querySelector('.scarcity-tag'),null);
 assert.equal(RosterCounts({RB:2}).querySelector('.scarcity-notice'),null);
});

test('settings remain open across active-tab updates and return to the latest tool',async()=>{
 const doc=setup();mountApp(doc.getElementById('app'));
 const {showTool,showSettings}=await import('../src/navigation.js');
 showTool('football');showSettings(true);showTool('gmail');
 assert.equal(doc.getElementById('settings-tool').hidden,false);assert.equal(doc.getElementById('gmail-tool').hidden,true);
 assert.equal(doc.getElementById('credential-secret').getAttribute('type'),'password');
 showSettings(false);assert.equal(doc.getElementById('gmail-tool').hidden,false);assert.equal(doc.getElementById('settings-tool').hidden,true);
});
