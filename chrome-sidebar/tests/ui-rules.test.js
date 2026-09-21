import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// The register these enforce is docs/UI_RULES.md. Rules UI-2 to UI-5 are
// checked in components.test.js and status-tones.test.js, where the code they
// guard already had a test; only UI-1 and the four ratcheting rules live here.
//
// A budget is the number of existing violations in one sheet. It may go down
// and never up, which is how a rule arrives while the drift it names is still
// on the screen: nothing new lands, and the number falls as the old cases are
// cleaned up. A sheet with no entry has a budget of zero, so a new stylesheet
// starts clean whether or not anyone remembers to list it. Raising a number is
// a decision and needs a line here saying which rule the case is exempt from
// and why. Measure a budget against the committed file, not the working tree:
// several sessions edit these sheets at once, and a number taken from someone
// else's half-finished cleanup fails the suite for everyone at HEAD.

const COMPONENTS=new URL('../src/components/',import.meta.url);
const sheets=()=>readdirSync(COMPONENTS).filter(name=>name.endsWith('.css')).sort();
// A rule cannot be read out of a comment, and the comments here carry the
// reasoning, so they are stripped before anything is counted.
const sheet=name=>readFileSync(new URL(name,COMPONENTS),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');

// tokens.css and status.css define the palette every other sheet consumes.
// Holding a hex is what they are for.
const PALETTE=['tokens.css','status.css'];

// UI-9. 7px is the inner curve of an 8px box with a 1px border, and nothing
// else; 4, 6, 8, 12 and 14px are the block, control and page radii.
const RADII=new Set(['0','inherit','50%','999px','4px','6px','7px','8px','12px','14px',
  'var(--radius)','var(--control-radius)','var(--control-radius,6px)']);

const RULES={
  'UI-6 colour comes from a token':{
    // capabilities.css keeps one: the forest-at-12% shadow under the open Tools
    // menu, which has no token because it is the only elevation in the product.
    budget:{'styles.css':91,'select.css':16,'upload.css':7,'travel.css':5,
      'workspace.css':4,'cards.css':2,'capabilities.css':1,'home.css':1,'reminders.css':1},
    fix:'use a token from tokens.css, or add one there if the tone is genuinely new',
    count:name=>PALETTE.includes(name)?0:(sheet(name).match(/#[0-9a-fA-F]{3,8}\b/g)||[]).length
  },
  'UI-7 nothing is set below 10px':{
    budget:{},
    fix:'metadata is 10-11px and body text 12-14px; 7, 8 and 9px is loss, not density',
    count:name=>[...sheet(name).matchAll(/font-size: *([0-9.]+)px/g),
      ...sheet(name).matchAll(/font: *(?:[a-z0-9]+ )*?([0-9.]+)px/g)]
      .filter(([,size])=>Number(size)<10).length
  },
  'UI-8 one system font stack, held in a token':{
    // travel.css is left for the next pass because another session is editing
    // it; capabilities.css needs `@import tokens.css` first, since data.html
    // loads it with no palette at all and relies on its var() fallbacks.
    budget:{},
    fix:'inherit the stack from :root in tokens.css instead of inlining it again',
    count:name=>name==='tokens.css'?0:(sheet(name).match(/-apple-system/g)||[]).length
  },
  'UI-9 corners come from the radius set':{
    budget:{},
    fix:`use one of ${[...RADII].join(', ')}`,
    count:name=>[...sheet(name).matchAll(/border-radius: *([^;}]+)/g)]
      .flatMap(([,value])=>value.trim().split(/\s+/)).filter(part=>!RADII.has(part)).length
  }
};

test('the ratcheting UI rules hold, and their budgets only go down',()=>{
  const slack=[];
  for(const [rule,{budget,fix,count}] of Object.entries(RULES)){
    for(const name of sheets()){
      const found=count(name),allowed=budget[name]??0;
      assert.ok(found<=allowed,
        `${rule}: ${name} has ${found} where ${allowed} are budgeted — ${fix}. `+
        'See docs/UI_RULES.md; a budget goes down, not up.');
      if(found<allowed)slack.push(`${rule}: ${name} is down to ${found} from ${allowed} — lower the budget`);
    }
    // A sheet that was deleted or renamed leaves a budget behind that would
    // silently forgive the next file to take its name.
    for(const name of Object.keys(budget))assert.ok(sheets().includes(name),`${rule}: budget for missing ${name}`);
  }
  if(slack.length)console.log(`\n  ${slack.join('\n  ')}\n`);
});

// UI-1. Twenty-five screens ask for a dropdown and one component answers, so
// the open options menu, its keyboard handling and its type-ahead are the same
// everywhere and a native OS menu never appears.
test('one owner per dropdown: only the shared Select builds a select element',()=>{
  const src=new URL('../src/',import.meta.url);
  const owners=['components/ui.js','components/select.js'];
  const walk=dir=>readdirSync(new URL(dir,src),{withFileTypes:true}).flatMap(entry=>
    entry.isDirectory()?walk(`${dir}${entry.name}/`):[`${dir}${entry.name}`]);
  for(const file of walk('').filter(name=>name.endsWith('.js'))){
    const code=readFileSync(new URL(file,src),'utf8');
    if(owners.includes(file))continue;
    assert.doesNotMatch(code,/element\(\s*'select'/,
      `${file} builds its own select — use FormField({kind:'select'}) or the shared Select`);
  }
  for(const page of readdirSync(new URL('../',import.meta.url)).filter(name=>name.endsWith('.html'))){
    const markup=readFileSync(new URL(`../${page}`,import.meta.url),'utf8');
    assert.doesNotMatch(markup,/<select\b/,`${page} writes a select into the shell`);
  }
});

// UI-16. The owner's complaint was a dead Refresh/Disconnect row sitting under
// Connect while the tool was disconnected — "something the app keeps doing".
// Two rows of buttons where most are dead read as clutter and hide which action
// applies right now, so a state gets one row and the rest are hidden, not
// disabled. Adjacent sibling groups are the shape of the defect and the part a
// file can be read for; whether a row's own buttons are all dead is read on the
// screen.
test('one action row per state: no component builds two action groups side by side',()=>{
  const dir=new URL('../src/components/',import.meta.url);
  for(const name of readdirSync(dir).filter(file=>file.endsWith('.js'))){
    const code=readFileSync(new URL(name,dir),'utf8');
    for(let at=code.indexOf('ActionGroup(');at>=0;at=code.indexOf('ActionGroup(',at+1)){
      let depth=0,end=at+'ActionGroup'.length;
      for(;end<code.length;end++){
        if(code[end]==='(')depth++;
        else if(code[end]===')'&&--depth===0)break;
      }
      const after=code.slice(end+1,end+40).replace(/\s+/g,'');
      assert.ok(!after.startsWith(',ActionGroup('),
        `${name}: two action groups as siblings around character ${at} — give the state one row `+
        'and hide the actions that do not apply. See UI-16 in docs/UI_RULES.md.');
    }
  }
});

// UI-17, the half a file can be read for. He asked for this about the Tools
// menu's "Follow Gmail and ESPN automatically" and then generalised it: these
// are his own tools and he knows what each one does, so a description field is
// a place for clutter to grow back. A capability is a name, a way in and an
// icon.
test('nothing explains itself: a capability entry carries a name, a way in and an icon',async()=>{
  const {CAPABILITIES,capabilities}=await import('../src/capabilities.js');
  const allowed=new Set(['id','label','href','icon','section']);
  for(const list of [CAPABILITIES,capabilities])for(const entry of list){
    for(const key of Object.keys(entry))assert.ok(allowed.has(key),
      `capability ${entry.id} carries "${key}" — the launcher and the Tools menu show a label and `+
      'an icon, and nothing on screen explains itself. See UI-17 in docs/UI_RULES.md.');
    assert.ok(entry.label&&entry.icon,`capability ${entry.id} needs both a label and an icon`);
  }
});

// UI-21. Keyboard focus is the one state a reader cannot discover by pointing,
// so it has to look the same everywhere. It did not: the extension's global
// ring was brass and the segmented control's matched it, the Tools navigation
// drew a 3px yellow-green one, and the phone carried three more of those that
// a later rule in its own sheet already superseded. The gear in the header is
// the single exception, because it sits on forest and a forest ring on forest
// is no ring at all.
test('one focus ring: 2px, forest, in every sheet either host loads',()=>{
  const sheets=[...readdirSync(COMPONENTS).filter(name=>name.endsWith('.css'))
    .map(name=>[name,sheet(name)]),
    ['mobile-app/public/app/styles.css',
      readFileSync(new URL('../../mobile-app/public/app/styles.css',import.meta.url),'utf8')
        .replace(/\/\*[\s\S]*?\*\//g,'')]];
  const colours=['var(--forest)','var(--wallet-forest)','var(--control-focus)','currentColor'];
  let found=0;
  for(const [name,css] of sheets)
    for(const [,rule] of css.matchAll(/:focus-visible[^{]*\{([^}]*)\}/g)){
      const outline=/outline: *([^;}]+)/.exec(rule);
      if(!outline)continue;
      found++;
      const [width,style,...rest]=outline[1].trim().split(/\s+/);
      const colour=rest.join(' ')||style;
      assert.equal(width,'2px',`${name}: a ${width} focus ring — every ring in the product is 2px`);
      assert.ok(colours.includes(colour),
        `${name}: focus ring painted ${colour} — use var(--forest) (or the token that resolves to it). `+
        'See UI-21 in docs/UI_RULES.md.');
    }
  assert.ok(found>=12,`only ${found} focus rings found — the check stopped matching`);
});

// UI-26. Three modules formatted currency, each with its own rounding, and one
// of them printed what is owed as -$15,835 — a minus sign in front of a
// currency symbol is a hyphen the eye skips, and the figure passed for an
// asset. `money()` in `src/money.js` is the only one now, it writes a negative
// in parentheses, and it holds no DOM so a data module the Worker imports can
// use it without dragging the component library in behind it.
test('one currency formatter, and it writes what is owed in parentheses',async()=>{
  const {money}=await import('../src/money.js');
  assert.equal(money(-15835),'($15,835)');
  assert.equal(money(-0.54),'($0.54)');
  assert.equal(money(2039492),'$2,039,492');
  const src=new URL('../src/',import.meta.url);
  const walk=dir=>readdirSync(new URL(dir,src),{withFileTypes:true}).flatMap(entry=>
    entry.isDirectory()?walk(`${dir}${entry.name}/`):[`${dir}${entry.name}`]);
  for(const file of walk('').filter(name=>name.endsWith('.js'))){
    if(file==='money.js')continue;
    // Constructing one to check that a currency code is real is not formatting;
    // calling .format on it is.
    assert.doesNotMatch(readFileSync(new URL(file,src),'utf8'),
      /new Intl\.NumberFormat\([^;]*style:'currency'[^;]*\)\.format\(/,
      `${file} formats its own currency — use money() from src/money.js. See UI-26 in docs/UI_RULES.md.`);
  }
});

// UI-27. A list of money is read down its right edge, so every figure in one
// list ends on the same one — a portfolio's total included. Giving the heading
// its own two-column layout put the total 104px right of the figures it totals
// and squeezed the name into 75px, where a trust's name broke into three lines
// with the total jammed against them. Both lines reserve the same slot for the
// verbs that ride at the end of a row, in one declaration, so neither can
// drift from the other again.
test('one column of money: a heading total reserves the same slot as the rows under it',()=>{
  const css=readFileSync(new URL('../src/components/finance.css',import.meta.url),'utf8');
  const shared=/([^{}]*\.action-group)\{[^}]*min-width:calc\(var\(--verbs\)\*var\(--verb\)\)/.exec(css);
  assert.ok(shared,'no rule reserves the verb slot');
  for(const line of ['.record-line','.group-line'])
    assert.ok(shared[1].includes(line),
      `${line} does not share the reserved verb slot — its figures will end on a different edge. `+
      'See UI-27 in docs/UI_RULES.md.');
  // The name takes the whole line and the total follows underneath. At sidebar
  // width the amount and the slot leave under 80px, which is not a name.
  assert.match(css,/\.group-name\{flex:1 1 100%/,
    'the heading name shares its line with the total again — there is no room for both');
  // The same edge, in a list of quarters. A row whose change is empty — the
  // first quarter of any series, and every quarter that covers less of the
  // ledger than the newest — has nothing in its last slot, and the shared
  // rule that hides an empty footnote took the slot away with it: that row's
  // amount ended 88px right of every amount below it.
  assert.match(css,/\.trend-row \.footnote:empty\{display:block\}/,
    'an empty change collapses, so the first quarter\u2019s amount ends on its own edge. See UI-27 in docs/UI_RULES.md.');
});

// UI-29. A heading's title runs inline so a tag can follow its last word, and a
// border on inline text underlines the words and stops where they stop — which
// left the rule half the width of the list and dropped a tag that wrapped
// underneath the very rule meant to close the heading. The rule belongs to
// whatever holds the whole heading.
test('a rule closes the whole heading, never the words in it',()=>{
  const css=readFileSync(new URL('../src/components/finance.css',import.meta.url),'utf8');
  const inline=/\.group-name>\.record-group-title\{([^}]*)\}/.exec(css);
  assert.ok(inline,'no rule makes a heading title inline');
  assert.match(inline[1],/display:inline/);
  assert.match(inline[1],/border-bottom:0/,
    'an inline title carries the rule on its words — put it on the heading. See UI-29 in docs/UI_RULES.md.');
  // And something does carry it, with air on both sides. UI-30.
  const heading=/\.snapshot-group>\.group-name\{([^}]*)\}/.exec(css);
  assert.ok(heading&&/border-bottom:1px/.test(heading[1]),'the reading’s holder heading carries no rule at all');
  assert.match(heading[1],/margin:0 0 4px/,'the figures start on the rule — see UI-30');
});

// UI-31 and UI-32. The stray rule under every trust's name in 0.6.228 was a
// tie: `.group-name>.record-group-title` and `.travel-wallet
// .record-group-title` weigh the same, so the winner was whichever sheet came
// last — and `gifts.css`, `sizes.css` and `reminders.css` each import
// `travel.css`, all three after `finance.css`, which put the shared rule last.
// The preview loaded three sheets and saw a cascade the sidebar does not have.
test('an override out-specifies, and a harness loads what its host loads',()=>{
  const css=readFileSync(new URL('../src/components/finance.css',import.meta.url),'utf8');
  const override=/([^{}]*)\.group-name>\.record-group-title\{[^}]*border-bottom:0/.exec(css);
  assert.ok(override,'nothing takes the rule off an inline heading title');
  assert.match(css,/\.travel-wallet \.group-name>\.record-group-title/,
    'the override ties with `.travel-wallet .record-group-title` and would be left to sheet order. '+
    'See UI-31 in docs/UI_RULES.md.');
  // Co-occurring classes tie as surely as the same class does: the account type
  // carries `pill` beside `portfolio-kind`, and `.pill` is in travel.css.
  assert.match(css,/\.travel-wallet \.portfolio-kind\{/,
    'a bare `.portfolio-kind` weighs what `.pill` weighs and loses to it. See UI-31.');
  const links=markup=>[...markup.matchAll(/<link rel="stylesheet" href="[^"]*components\/([^"]+)"/g)].map(m=>m[1]);
  const imports=css=>[...css.matchAll(/@import url\('\.\.\/src\/components\/([^']+)'\)/g)].map(m=>m[1]);
  const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
  const panel=links(readFileSync(new URL('../sidepanel.html',import.meta.url),'utf8'));
  assert.ok(panel.length>3,'the side panel stopped linking its sheets');
  // One list, shared by every harness that previews a panel screen.
  assert.deepEqual(imports(read('panel-cascade.css')),panel,
    'panel-cascade.css has drifted from the side panel. See UI-32 in docs/UI_RULES.md.');
  // A harness previews one host and loads that host's sheets. The three that
  // are not panel screens say which host they are, and why.
  const elsewhere={'ai-models':'settings.html','storage-preview':'settings.html',
    'restaurant':'restaurants.html','espn-page':null};
  for(const file of readdirSync(new URL('.',import.meta.url)).filter(name=>name.endsWith('-preview.html'))){
    const markup=read(file),own=links(markup),host=Object.entries(elsewhere).find(([key])=>file.startsWith(key));
    if(host&&host[1]===null){assert.deepEqual(own,[],`${file} links sheets but claims to need none`);continue;}
    if(host){
      assert.deepEqual(own,links(readFileSync(new URL('../'+host[1],import.meta.url),'utf8')),
        `${file} previews ${host[1]} and loads different sheets. See UI-32 in docs/UI_RULES.md.`);
      continue;
    }
    assert.match(markup,/href="panel-cascade\.css"/,
      `${file} previews a side-panel screen with its own short list of sheets, so it shows a cascade `+
      'the owner never sees. Link panel-cascade.css. See UI-32 in docs/UI_RULES.md.');
    assert.deepEqual(own,[],`${file} links a component sheet beside panel-cascade.css`);
  }
});
