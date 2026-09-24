import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';

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
    budget:{'styles.css':88,'select.css':14,'upload.css':7,'travel.css':5,
      'workspace.css':3,'cards.css':2,'capabilities.css':1,'home.css':1,'reminders.css':1},
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

// UI-17, the other half, from the Gmail panel's "Open a message, then expand
// it." — "Get rid of the explanatory text here (and really everywhere). This
// app is just for me. No UX cues are needed." A literal Note in a component
// that tells him how to use the screen — what a control does, what to press
// next, what will be kept safe, what a figure rests on — is removed, not
// shortened. What a static Note may still say is that there is nothing to
// show, or what one record is asking to have decided. Those are listed here
// by name, so a new sentence has to argue its way in. Text computed from data
// is a reading, not a cue, and is not counted.
const PROSE_ALLOWED={
  'finance.js':['No dated figures yet.'],
  'travel.js':['Changed on another device. Choose which version to use.']
};
// restaurant-views.js is left for the next pass because another session is
// rewriting it as this rule lands; at HEAD it still carries eight cues ("Up to
// 7 dates.", "For example: 2 Michelin stars…"). When that work is in, drop the
// exemption, allow only its "No booking page was verified" result line, and
// remove what is left.
const PROSE_LATER=new Set(['restaurant-views.js']);
test('nothing explains itself: no component carries a note telling him how to use it',()=>{
  for(const name of readdirSync(COMPONENTS).filter(n=>n.endsWith('.js')&&!PROSE_LATER.has(n)).sort()){
    const code=readFileSync(new URL(name,COMPONENTS),'utf8').replace(/\/\/.*$/gm,'');
    const allowed=new Set(PROSE_ALLOWED[name]||[]);
    for(const [,text] of code.matchAll(/\bNote\('([^']*)'/g)){
      if(text.split(/\s+/).length<4||!text.endsWith('.')||allowed.has(text))continue;
      assert.fail(`${name}: Note('${text}') explains the screen — remove it; the labels and controls say what it does. See UI-17 in docs/UI_RULES.md.`);
    }
    assert.ok(!/\bhelp:/.test(code),`${name}: a help line under a field is a UX cue. See UI-17 in docs/UI_RULES.md.`);
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
  // Where a page's links really lead, read the way a browser reads them: a
  // <base> moves every one. The draft preview linked panel-cascade.css under a
  // base of ../, which reached the server root and loaded nothing at all, while
  // a check that read the words of the link passed it.
  const sheetsOf=url=>{
    const markup=readFileSync(url,'utf8'),base=new URL(/<base href="([^"]*)"/.exec(markup)?.[1]??'',url);
    return [...markup.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([,href])=>new URL(href,base));
  };
  const components=new URL('../src/components/',import.meta.url).href;
  const names=urls=>urls.filter(url=>url.href.startsWith(components)).map(url=>url.href.slice(components.length));
  const hostSheets=page=>names(sheetsOf(new URL(`../${page}`,import.meta.url)));
  const imports=css=>[...css.matchAll(/@import url\('\.\.\/src\/components\/([^']+)'\)/g)].map(m=>m[1]);
  const cascade=new URL('panel-cascade.css',import.meta.url);
  const panel=hostSheets('sidepanel.html');
  assert.ok(panel.length>3,'the side panel stopped linking its sheets');
  // One list, shared by every harness that previews a panel screen.
  assert.deepEqual(imports(readFileSync(cascade,'utf8')),panel,
    'panel-cascade.css has drifted from the side panel. See UI-32 in docs/UI_RULES.md.');
  // A harness previews one host and loads that host's sheets. The ones that
  // are not panel screens say which host they are, and why. Every page here is
  // a harness, whatever it is called: the whole side panel's harness and the
  // Settings layout were never named -preview, and each loaded one to three
  // of the panel's fourteen sheets.
  const elsewhere={'ai-models':'settings.html','storage-preview':'settings.html','restaurant':'restaurants.html',
    'finance-page':'finance.html','connection-preview':'travel.html','espn-page':null};
  const harnesses=readdirSync(new URL('.',import.meta.url),{recursive:true})
    .filter(name=>name.endsWith('.html')&&!name.startsWith('fixtures'));
  assert.ok(harnesses.length>20,`only ${harnesses.length} harnesses found — the check stopped matching`);
  for(const file of harnesses){
    const own=sheetsOf(new URL(file,import.meta.url)),host=Object.entries(elsewhere).find(([key])=>file.startsWith(key));
    for(const url of own)assert.ok(existsSync(url),
      `${file} links ${url.pathname}, which is not there, so it previews with no styles at all. See UI-32 in docs/UI_RULES.md.`);
    if(host&&host[1]===null){assert.deepEqual(own,[],`${file} links sheets but claims to need none`);continue;}
    if(host){
      assert.deepEqual(names(own),hostSheets(host[1]),
        `${file} previews ${host[1]} and loads different sheets. See UI-32 in docs/UI_RULES.md.`);
      continue;
    }
    assert.deepEqual(own.map(url=>url.href),[cascade.href],
      `${file} previews a side-panel screen without the panel's cascade, so it shows one the owner never sees. `+
      'Link tests/panel-cascade.css, and nothing beside it. See UI-32 in docs/UI_RULES.md.');
  }
});

// UI-34. A total wrapped mid-number in the sidebar: "$7,496," on one line and
// "850" on the next, which reads as seven thousand. The column an amount sits
// in is the thing that has to give — take the next row whole, or drop the
// qualifier under it — and the figure itself never splits. Every class that
// renders money says so, in a sheet both hosts load.
test('an amount is one word, wherever either host draws it',()=>{
  const MONEY=['.amount','.figure-value','.snapshot-figure strong','.line-chart-end','.line-chart-tick','.line-chart-tip'];
  const shared=sheets().map(name=>[name,sheet(name)]);
  for(const selector of MONEY){
    const owner=shared.find(([,css])=>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\{[^}]*white-space: *nowrap`).test(css)
      ||new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} *\\{[^}]*white-space: *nowrap`).test(css));
    assert.ok(owner,`${selector} renders an amount and lets it break across lines. `+
      'See UI-34 in docs/UI_RULES.md.');
  }
});

// UI-36. A negative margin moves a box; it does not widen one. A band pulled
// out to its block's edges on both sides with a width of 100% (a button, an
// input, anything given one) slides left and stops short on the right by twice
// the bleed — the open rental-car row's band ended 16px inside its block. So
// every rule that bleeds sideways says how wide the result is, in the same
// declaration: `calc(100% + <left + right>)`. Vertical bleeds are not this bug.
test('a band that bleeds to its block edge widens by what it bleeds',()=>{
  const px=value=>{const n=/^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());return n?Number(n[1]):0;};
  const every=[...sheets().map(name=>[name,sheet(name)]),
    ['mobile styles.css',readFileSync(new URL('../../mobile-app/public/app/styles.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'')]];
  for(const [name,css] of every){
    for(const [,selector,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
      const decl=prop=>[...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`,'g'))].map(m=>m[1]).pop();
      let left=0,right=0;
      const inline=decl('margin-inline');
      if(inline){const [a,b=a]=inline.trim().split(/\s+/);left=px(a);right=px(b);}
      const margin=decl('margin');
      if(margin){const v=margin.trim().split(/\s+/);const r=v[1]??v[0],l=v[3]??r;left=left||px(l);right=right||px(r);}
      left=px(decl('margin-left')??'')||left;right=px(decl('margin-right')??'')||right;
      if(left>=0||right>=0)continue; // bleeds on one side or none
      const width=decl('width')?.replace(/\s+/g,'');
      if(/^\d+(?:\.\d+)?px$/.test(width??''))continue; // a fixed box, like .sr-only, is not a band
      assert.equal(width,`calc(100%+${-(left+right)}px)`,
        `${name}: ${selector.trim()} bleeds ${-left}px and ${-right}px past its block and does not widen by it, `+
        'so its band stops short of the right edge. See UI-36 in docs/UI_RULES.md.');
    }
  }
});

// UI-46. A glyph with no words carries a verb on the record whose line it
// rides, and nothing else. Adding makes a different record, and a + cannot say
// which: on an institution's card it sat beside the balance, where it read as
// the balance's sign — "the plus icon in the finance view isn't super
// intuitive." So the verbs a glyph may carry are a closed list, and a new one
// is an argument to have here rather than an export to slip into ui.js.
test('a glyph alone carries a verb on its own record, and adding is said in words',async()=>{
  const ui=await import('../src/components/ui.js');
  const RECORD_VERBS=['EDIT','DELETE','DONE','UNDO','SHOW','HIDE','COPY','NOTES','OPEN','SEARCH','HISTORY','REFRESH'];
  const glyphs=Object.keys(ui).filter(name=>name.endsWith('_GLYPH')).map(name=>name.slice(0,-'_GLYPH'.length));
  for(const verb of glyphs)assert.ok(RECORD_VERBS.includes(verb),
    `ui.js exports ${verb}_GLYPH, which is not a verb on the record it rides. If it makes something new, `+
    'say what it makes in words. See UI-46 in docs/UI_RULES.md.');
  const src=new URL('../src/',import.meta.url);
  const walk=dir=>readdirSync(new URL(dir,src),{withFileTypes:true}).flatMap(entry=>
    entry.isDirectory()?walk(`${dir}${entry.name}/`):[`${dir}${entry.name}`]);
  for(const file of walk('').filter(name=>name.endsWith('.js'))){
    assert.doesNotMatch(readFileSync(new URL(file,src),'utf8'),/['"]M12 5v14 ?M5 12h14['"]/,
      `${file} draws a + of its own. See UI-46 in docs/UI_RULES.md.`);
  }
});

// UI-47. A dropped file is shown as itself. Subscriptions took a statement and
// poured the text pulled out of it into a box on the screen — "why is it giving
// me the text like that?" — while Finance and Taxes each drew a card of their
// own for the same file. The text is the reading's input and the reading's
// results are what the owner reviews, so every tool that opens a dropped file
// shows it with the one card in ui.js and writes no extracted text into a field.
test('a dropped file is shown as one shared card, never as the text pulled out of it',()=>{
  const src=new URL('../src/',import.meta.url);
  const read=file=>readFileSync(new URL(file,src),'utf8');
  const components=readdirSync(new URL('components/',src)).filter(name=>name.endsWith('.js'));
  for(const file of components.filter(name=>name!=='ui.js'))
    assert.doesNotMatch(read(`components/${file}`),/export function \w*Card\(\{label,detail,note,tone,onRemove\}\)/,
      `components/${file} draws a card of its own for a dropped file. Use AttachmentCard from ui.js. See UI-47 in docs/UI_RULES.md.`);
  const readers=readdirSync(src).filter(name=>name.endsWith('.js')&&/import \{[^}]*\breadStatement\b[^}]*\} from '\.\/statement-text\.js'/.test(read(name)));
  assert.ok(readers.length>=3,'Finance, Taxes and Subscriptions each open a dropped file');
  for(const file of readers){
    const code=read(file);
    assert.match(code,/\bAttachmentCard\(/,`${file} opens a dropped file without showing it as the shared card. See UI-47.`);
    assert.doesNotMatch(code,/\.value\s*=\s*(?:text|result\.text)\b/,
      `${file} writes the text pulled out of a file into a field. See UI-47 in docs/UI_RULES.md.`);
  }
});

// UI-50. Money is typed the way it reads. Finance showed a capital account's
// value as 4384000 while the owner typed it, and refused 4,384,000 when he put
// the commas in himself. Every form that takes money is built here, and each
// figure's box must be the shared money field: grouped as it is typed and as it
// is filled, and read back as the plain number every record check expects.
test('money is typed the way it reads, in every form that takes it',async()=>{
  const {parseHTML}=await import('linkedom');
  const {document,window}=parseHTML('<html><body></body></html>');
  const before=globalThis.document;globalThis.document=document;
  // This DOM cannot set a select's value, and the reviews and bonus rows set
  // theirs as they are built. The same stand-in the tool tests use.
  const selectValue=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:selectValue.get,
    set(value){for(const option of this.options)option.selected=option.value===String(value);}});
  try{
    const {Field,Stack}=await import('../src/components/ui.js');
    const {FinanceView,CapitalReview,FoldReview}=await import('../src/components/finance.js');
    const {SubscriptionsView}=await import('../src/components/subscriptions.js');
    const {CardsView,BonusRule}=await import('../src/components/cards.js');
    const capital={portfolioName:'Synthetic Estate',vehicle:1,asOf:'2026-06-30',share:10000,value:4384000,
      commitment:1000000,contributed:800000,distributed:250000,unfunded:null,name:'Synthetic Fund'};
    document.body.append(FinanceView(),SubscriptionsView(),CardsView(),Stack([BonusRule({},0,()=>{})]),
      CapitalReview({rows:[capital],editing:true,portfolios:[]}),
      FoldReview({rows:[{class:3,amount:124500.5,currency:'USD',asOf:'2026-09-11'}],editing:true}));
    const MONEY=['finance-amount','finance-inv-commitment','finance-inv-value','finance-inv-funded','finance-inv-returned',
      'finance-inv-unfunded','finance-prop-value','finance-prop-debt','finance-flow-amount',
      'finance-capital-value-0','finance-capital-commitment-0','finance-capital-contributed-0','finance-capital-distributed-0',
      'finance-capital-unfunded-0','finance-fold-value-0','subscriptions-amount','cards-amount','cards-rule-0-remaining'];
    const label=input=>document.querySelector(`label[for="${input.id}"]`)?.textContent||'';
    const money=input=>input.hasAttribute('data-money')&&input.getAttribute('type')==='text'&&input.getAttribute('inputmode')==='decimal';
    for(const id of MONEY){
      const input=document.getElementById(id);
      assert.ok(input,`${id} is not built any more — update this list. See UI-50 in docs/UI_RULES.md.`);
      assert.ok(money(input),`${id} (${label(input)}) takes money without the shared money field. See UI-50 in docs/UI_RULES.md.`);
    }
    // The next form nobody listed: a figure's placeholder, or a number box
    // whose label names money, is a money box too.
    const MONEY_WORDS=/\b(amount|price|spend|owed|balance|commitment|funded|returned|invested|proceeds)\b|\$|\bUSD\b/i;
    for(const input of document.querySelectorAll('input')){
      if(input.getAttribute('placeholder')==='0.00')assert.ok(money(input),
        `${input.id} asks for 0.00 but is not the shared money field. See UI-50 in docs/UI_RULES.md.`);
      if(input.getAttribute('type')==='number')assert.doesNotMatch(label(input),MONEY_WORDS,
        `${input.id} takes money in a number box, which cannot hold a comma. Use kind:'money'. See UI-50 in docs/UI_RULES.md.`);
    }
    // A form nobody has written yet cannot be built here, so the sources are
    // read too: no field whose label names money is a number box.
    const components=new URL('../src/components/',import.meta.url);
    for(const file of readdirSync(components).filter(name=>name.endsWith('.js'))){
      const code=readFileSync(new URL(file,components),'utf8');
      for(const [,text] of [...code.matchAll(/'([^']*)','number'/g),...code.matchAll(/label:'([^']*)',kind:'number'/g)])
        assert.doesNotMatch(text,MONEY_WORDS,`components/${file}: "${text}" takes money in a number box. Use kind:'money'. See UI-50 in docs/UI_RULES.md.`);
    }
    // Filled in from a record, typed a digit at a time, pasted as a statement
    // prints it: shown grouped, read as the number.
    const [,box]=Field({id:'money-check',label:'Current value',kind:'money'});
    document.body.append(box);
    const shown=()=>box.getAttribute('value');
    box.value=4384000;
    assert.equal(shown(),'4,384,000');assert.equal(box.value,'4384000');
    box.value=1234.5;
    assert.equal(shown(),'1,234.50','a filled figure shows its cents as cents');
    const native=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
    native.set.call(box,'43840001');box.dispatchEvent(new window.Event('input'));
    assert.equal(shown(),'43,840,001');assert.equal(box.value,'43840001');
    native.set.call(box,'$4,384,000.25');box.dispatchEvent(new window.Event('input'));
    assert.equal(shown(),'4,384,000.25');assert.equal(box.value,'4384000.25');
    box.value='';
    assert.equal(box.value,'','an empty box stays empty rather than becoming 0');
  }finally{globalThis.document=before;Object.defineProperty(window.HTMLSelectElement.prototype,'value',selectValue);}
});

// UI-55. A dropdown shows a value, so it is drawn as a field. Restaurants put
// Date, People, Time and Window in one row, and while a search ran the three
// dropdowns turned into grey slabs of faded text beside boxes that had not
// changed at all — a disabled text box had no look of its own. At rest the
// dropdowns were still the odd ones out: the trigger is a button element and
// took a button's medium weight and 12px inset, and the date box stood 2px
// taller than the row. The family is defined once, in select.css.
test('fields side by side are one family: a dropdown matches the boxes beside it, at rest and disabled',()=>{
  const css=sheet('select.css');
  const rules=text=>[...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({parts:selector.split(',').map(part=>part.trim()),body}));
  const rule=part=>rules(css).find(entry=>entry.parts.includes(part));
  const declared=(entry,name)=>new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(entry.body)?.[1].trim();
  const box=rule('.form-field > textarea'),trigger=rule('.formatted-select .formatted-select-trigger');
  assert.ok(box&&trigger,'the shared field and dropdown rules moved; point this check at them. See UI-55 in docs/UI_RULES.md.');
  assert.equal(declared(trigger,'padding'),declared(box,'padding'),
    'a chosen value starts further in than a typed one beside it. See UI-55 in docs/UI_RULES.md.');
  assert.equal(declared(trigger,'font-weight'),undefined,
    'a dropdown sets its value in a button\'s weight rather than a field\'s. See UI-55 in docs/UI_RULES.md.');
  const disabled=rule('.formatted-select .formatted-select-trigger:disabled');
  for(const member of ['.form-field > input:not([type=checkbox]):not([type=radio]):disabled','.form-field > textarea:disabled'])
    assert.ok(disabled?.parts.includes(member),`${member} is not dimmed with the rest of its family. See UI-55 in docs/UI_RULES.md.`);
  assert.match(css,/::-webkit-datetime-edit-fields-wrapper\s*\{[^}]*padding-block:\s*0/,
    'a date or time box stands taller than the fields in its row. See UI-55 in docs/UI_RULES.md.');
  // No sheet in either host gives a field a disabled look of its own.
  const mobile=['styles.css','tool-navigation.css'].map(name=>[`mobile-app/public/app/${name}`,
    readFileSync(new URL(`../../mobile-app/public/app/${name}`,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'')]);
  const FIELD=/\b(input|textarea|select|formatted-select-trigger|select-control)\b/;
  let found=0;
  for(const [name,text] of [...sheets().map(name=>[name,sheet(name)]),...mobile])
    for(const entry of rules(text))for(const part of entry.parts){
      if(!/:disabled/.test(part.replace(/:not\(:disabled\)/g,''))||!FIELD.test(part))continue;
      found++;
      assert.match(entry.body,/opacity:\s*0?\.5\s*(?:;|$)/,`${name}: ${part} dims a field by something other than half. See UI-55 in docs/UI_RULES.md.`);
      assert.doesNotMatch(entry.body,/(?:^|;)\s*(?:background|color|border)[a-z-]*\s*:/,
        `${name}: ${part} repaints a disabled field rather than dimming it. See UI-55 in docs/UI_RULES.md.`);
      assert.doesNotMatch(entry.body,/cursor:(?!\s*default\b)/,`${name}: ${part} gives a disabled field a cursor of its own. See UI-55 in docs/UI_RULES.md.`);
    }
  assert.ok(found>=3,`only ${found} disabled field rules found — the check stopped matching`);
});

// Reading a sheet rule by rule, for the checks from here down. A selector
// list splits only at its own commas, never inside :is() or :not().
const split=selector=>{const out=[];let depth=0,part='';for(const c of selector){
  if('(['.includes(c))depth++;else if(')]'.includes(c))depth--;
  if(c===','&&!depth){out.push(part.trim());part='';}else part+=c;}out.push(part.trim());return out;};
const parse=text=>[...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({parts:split(selector),
  props:[...body.matchAll(/(?:^|;)\s*(-{0,2}[a-z][a-z-]*)\s*:\s*([^;]+)/g)].map(([,name,value])=>[name,value.trim()])}));
// What a selector draws: its last compound, outside any brackets.
const subject=part=>{let depth=0,start=0;for(let i=0;i<part.length;i++){const c=part[i];
  if('(['.includes(c))depth++;else if(')]'.includes(c))depth--;else if(!depth&&/[\s>+~]/.test(c))start=i+1;}return part.slice(start);};
const value=(entry,prop)=>entry?.props.find(([name])=>name===prop)?.[1];
const PAINT=/^(?:font(?:-[a-z]+)?|line-height|padding(?:-[a-z]+)?|border(?:-(?:top|right|bottom|left))?(?:-(?:color|width|style))?|border-radius|background(?:-color)?|color|appearance)$/;
// The phone's own shell sheets, beside the shared ones it loads.
const mobile=['styles.css','tool-navigation.css'].map(name=>[`mobile-app/public/app/${name}`,
  readFileSync(new URL(`../../mobile-app/public/app/${name}`,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'')]);

// UI-55, the rest of the family. The dropdown was not the only field drawn
// apart. Rewards' Notes, the purchase box on Best card and Pay, and the
// settings playground each had a text area repainted by a feature sheet — a
// paler edge, a 14 or 15px face, an 8px inset — that won or lost by sheet
// order, so one box looked two ways between the side panel and its own page.
// A focused text area put a forest border inside its ring that no other field
// wore, and a dropdown took a tinted fill under the pointer. On a phone the
// wallet's own tokens left its text boxes 40px tall under 44px dropdowns. The
// draft panel's boxes were never fields at all, and the switch was drawn only
// for the extension, so the phone showed a bare checkbox.
test('fields side by side are one family in every state, in every sheet of both hosts',()=>{
  const others=[...sheets().filter(name=>name!=='select.css').map(name=>[name,parse(sheet(name))]),...mobile.map(([name,text])=>[name,parse(text)])];
  const family=parse(sheet('select.css'));
  const find=part=>family.find(entry=>entry.parts.includes(part));
  // Only select.css paints a text area or a dropdown. The two named
  // differences: the compact face a 280px panel asks for, and a generated
  // result, which is not a child of a field and so draws itself — with the
  // family's own tokens, checked below.
  const ALLOWED={'.form-field.form-field--compact > textarea':['font'],
    '.editable-output':['padding','font','color','border','border-radius','background']};
  let seen=0;
  for(const [name,rules] of others)for(const entry of rules)for(const part of entry.parts){
    const drawn=subject(part);
    if(drawn.includes('::')||!/^(?:textarea|\.editable-output)(?![\w])|\.formatted-select-trigger(?![\w-])/.test(drawn))continue;
    seen++;
    const painted=entry.props.map(([prop])=>prop).filter(prop=>PAINT.test(prop)&&!(ALLOWED[part]||[]).includes(prop));
    assert.deepEqual(painted,[],`${name}: ${part} paints a field (${painted.join(', ')}) that select.css draws for every host, and wins or loses by sheet order. See UI-55 in docs/UI_RULES.md.`);
  }
  assert.ok(seen>=4,`only ${seen} text area and dropdown rules found outside select.css — the check stopped matching`);
  const output=parse(sheet('styles.css')).find(entry=>entry.parts.includes('.editable-output'));
  for(const [prop,token] of [['border','var(--control-border)'],['border-radius','var(--control-radius)'],['background','var(--control-surface)'],['color','var(--control-ink)']])
    assert.ok(value(output,prop)?.includes(token),`a generated result draws its ${prop} without ${token}, apart from the field that asked for it. See UI-55 in docs/UI_RULES.md.`);
  assert.equal(value(output,'padding'),value(find('.form-field > textarea'),'padding'),
    'a generated result sits at another inset from the field that asked for it. See UI-55 in docs/UI_RULES.md.');
  // Focus is the ring alone, and the pointer firms the edge alone, for every kind.
  const focus=find('.form-field textarea:focus-visible'),hover=find('.formatted-select .formatted-select-trigger:hover:not(:disabled)');
  assert.ok(focus&&hover,'the field focus or dropdown hover rule moved; point this check at it. See UI-55 in docs/UI_RULES.md.');
  assert.equal(value(focus,'border-color'),undefined,'a focused text area changes its edge where no other field does. See UI-55 in docs/UI_RULES.md.');
  // A generated result is no child of a field, so the states name it as well.
  assert.ok(focus.parts.includes('.editable-output:focus-visible')&&find('.form-field textarea:hover:not(:disabled)')?.parts.includes('.editable-output:hover:not(:disabled)'),
    'a generated result hovers or focuses unlike the box that asked for it. See UI-55 in docs/UI_RULES.md.');
  // It declares the field's own fill rather than none, so a host's rule for
  // its buttons cannot tint it either: the wallet's fills a button sage.
  assert.ok(hover.props.filter(([prop])=>/^background/.test(prop)).map(([,fill])=>fill).join()==='var(--control-surface)',
    'a dropdown fills under the pointer where a text box does not. See UI-55 in docs/UI_RULES.md.');
  // The touch size is set on the field itself, so a sheet that pins the
  // control tokens for its own buttons cannot leave its boxes shorter than its
  // dropdowns; the phone sizes both alike whatever the pointer reports; and no
  // other sheet sizes a field apart from the rest.
  for(const parts of [[':root','.form-field','.formatted-select'],['.unlocked-tools .form-field','.unlocked-tools .formatted-select']])
    assert.ok(family.some(entry=>parts.every(part=>entry.parts.includes(part))&&value(entry,'--control-height')==='44px'),
      `the touch size is not set on ${parts.join(', ')} together. See UI-55 in docs/UI_RULES.md.`);
  for(const [name,rules] of others)for(const entry of rules)for(const part of entry.parts)
    if(/^(?:\.form-field|\.formatted-select|\.find-field|input|textarea)(?![\w-])/.test(subject(part)))
      assert.ok(!entry.props.some(([prop])=>/^--control-(?:height|font|border)$/.test(prop)),`${name}: ${part} sizes a field apart from the rest of its family. See UI-55 in docs/UI_RULES.md.`);
  // The find field's Filter density is the one other named difference; the
  // test after this one holds it.
  // The switch is drawn once, in the sheet both hosts load.
  assert.ok(find('.toggle-field > input[type=checkbox]'),'the switch left select.css, the sheet both hosts load. See UI-55 in docs/UI_RULES.md.');
  for(const [name,rules] of others)for(const entry of rules)for(const part of entry.parts)
    if(/\.toggle-field\s*>?\s*input(?![\w-])/.test(part))
      assert.ok(!entry.props.some(([prop])=>PAINT.test(prop)),`${name}: ${part} draws the switch for one host only. See UI-55 in docs/UI_RULES.md.`);
  // A value box is a field: no component drops a label and its control loose
  // into a container, where no family rule reaches them.
  for(const name of readdirSync(COMPONENTS).filter(file=>file.endsWith('.js')&&file!=='ui.js'))
    assert.doesNotMatch(readFileSync(new URL(name,COMPONENTS),'utf8'),/(?:^|[^\w.]|\.\.\.)(?:UI\.)?Field\(/,
      `${name} builds a field outside FormField, where no family rule draws it. See UI-55 in docs/UI_RULES.md.`);
});

// Specificity as the cascade weighs it: ids, classes, types. :is(), :not() and
// :has() weigh what their heaviest argument weighs, and :where() nothing.
const heavier=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
const specificity=selector=>{
  const weight=[0,0,0];
  for(let i=0;i<selector.length;){
    const c=selector[i];
    if(c==='#'||c==='.'){weight[c==='#'?0:1]++;i++;while(i<selector.length&&/[\w-]/.test(selector[i]))i++;}
    else if(c==='['){weight[1]++;while(i<selector.length&&selector[i]!==']')i++;i++;}
    else if(c===':'){
      const pseudoElement=selector[i+1]===':';i+=pseudoElement?2:1;
      let name='';while(i<selector.length&&/[\w-]/.test(selector[i]))name+=selector[i++];
      if(selector[i]==='('){
        let depth=1,end=i+1;
        for(;end<selector.length&&depth;end++)depth+=selector[end]==='('?1:selector[end]===')'?-1:0;
        const inside=selector.slice(i+1,end-1);i=end;
        if(name==='where')continue;
        if(['is','not','has'].includes(name)){split(inside).map(specificity).sort(heavier).pop().forEach((n,at)=>weight[at]+=n);continue;}
      }
      weight[pseudoElement||['before','after'].includes(name)?2:1]++;
    }
    else if(/[a-z]/i.test(c)){weight[2]++;while(i<selector.length&&/[\w-]/.test(selector[i]))i++;}
    else i++;
  }
  return weight;
};

// UI-55, the find field. DESIGN.md holds the find-record field above a record
// list to the Filter density — 34px, 13px, the quiet line — and only Travel and
// Taxes drew it that way, from a copy of their own in travel.css that still set
// 13px under a finger, so iOS Safari zoomed the page whenever it was touched;
// Gifts, Sizes, Replacements, Rewards, Health and Personal drew theirs at the
// size of the fields it filters. One component draws it and one rule, in the
// sheet both hosts load, sizes it; a finger gets the family's touch size; and no
// other sheet in either host out-weighs the family on a text box, which is the
// weight a tool's own copy needs before it can take effect.
test('a find field is a filter: one component draws it, one rule sizes it, and a finger gets 16px',async()=>{
  // Nothing but FindField asks for a search box, and nothing named or labelled
  // for finding is built as an ordinary field, in either host.
  const walk=(root,dir='')=>readdirSync(new URL(dir,root),{withFileTypes:true}).flatMap(entry=>
    entry.isDirectory()?walk(root,`${dir}${entry.name}/`):entry.name.endsWith('.js')?[[new URL(dir+entry.name,root),dir+entry.name]]:[]);
  const code=[...walk(new URL('../src/',import.meta.url)),...walk(new URL('../../mobile-app/public/app/',import.meta.url))];
  assert.ok(code.length>50,'the sources moved; point this check at them');
  for(const [url,file] of code){
    const text=readFileSync(url,'utf8');
    if(file!=='components/ui.js')assert.doesNotMatch(text,/\b(?:kind|type)\s*:\s*['"`]search['"`]/,
      `${file} asks for a search box outside FindField. See UI-55 in docs/UI_RULES.md.`);
    for(const call of text.matchAll(/\b(?:FormField|Field)\(\{/g)){
      let depth=0,end=call.index+call[0].length-1;
      for(;end<text.length;end++)if('{(['.includes(text[end]))depth++;else if('})]'.includes(text[end])&&--depth===0)break;
      assert.doesNotMatch(text.slice(call.index,end),/\bid:\s*[`'"][^`'"]*-search[`'"]|\blabel:\s*[`'"](?:Find|Search)\b/,
        `${file} builds a find field as an ordinary field, at the size of the fields it filters. Use FindField. See UI-55 in docs/UI_RULES.md.`);
    }
  }
  const {parseHTML}=await import('linkedom');
  const {document}=parseHTML('<html><body></body></html>');
  const before=globalThis.document;globalThis.document=document;
  try{
    const {FormField}=await import('../src/components/ui.js');
    assert.equal(FormField({id:'plain',label:'Plain'}).querySelector('input').getAttribute('type'),'text',
      'a field with no kind is a search box, and would be drawn as a filter. See UI-55 in docs/UI_RULES.md.');
    // Every search box a tool's view draws is a FindField.
    const drawn=[];
    for(const name of readdirSync(COMPONENTS).filter(file=>file.endsWith('.js'))){
      for(const [key,build] of Object.entries(await import(new URL(name,COMPONENTS).href))){
        if(typeof build!=='function'||!/(?:View|Library)$/.test(key))continue;
        let view;try{view=build({});}catch{continue;}
        for(const node of [view].flat())for(const input of node?.querySelectorAll?.('input[type=search]')??[]){
          drawn.push(input.id);
          assert.ok(input.closest('.form-field.find-field'),
            `${name}: ${key} draws #${input.id} as a search box of its own rather than a FindField. See UI-55 in docs/UI_RULES.md.`);
        }
      }
    }
    for(const id of ['travel-search','taxes-search','gifts-search','sizes-search','replacements-search',
      'rewards-search','programs-search','health-search','personal-search','manual-search'])
      assert.ok(drawn.includes(id),`#${id} was not drawn — the check stopped reaching the tools' views`);
  }finally{globalThis.document=before;}
  // One rule sizes it: the family's tokens at the Filter density on the quiet
  // line, and after it the family's touch size, under a finger and on the phone.
  const family=parse(sheet('select.css'));
  const [filter,touch]=family.filter(entry=>entry.parts.includes('.form-field.find-field'));
  const phone=family.find(entry=>entry.parts.includes('.unlocked-tools .form-field.find-field'));
  assert.ok(filter,'select.css, the sheet both hosts load, no longer sizes the find field. See UI-55 in docs/UI_RULES.md.');
  assert.ok(touch&&phone,'under a finger the find field keeps the Filter density\'s 13px, and iOS Safari zooms the page into it. See UI-55 in docs/UI_RULES.md.');
  assert.equal(value(filter,'--control-height'),'34px','the find field is not at the Filter density\'s 34px. See DESIGN.md and UI-55.');
  assert.match(value(filter,'--control-font')??'',/^13px\//,'the find field is not set at the Filter density\'s 13px. See DESIGN.md and UI-55.');
  assert.equal(value(filter,'--control-border'),'var(--line)','the find field has left the quiet line. See DESIGN.md and UI-55.');
  for(const entry of [touch,phone]){
    assert.equal(value(entry,'--control-height'),'44px','under a finger the find field is shorter than a touch field. See UI-13 and UI-55.');
    assert.match(value(entry,'--control-font')??'',/^16px\//,
      'under a finger the find field is set below 16px, and iOS Safari zooms the page into it. See UI-55 in docs/UI_RULES.md.');
  }
  // Nothing else reaches into it, and no sheet out-weighs the family on a text
  // box: the travel.css copy had to, which is how it tied with the family and
  // was drawn by whichever sheet came last.
  const box=family.flatMap(entry=>entry.parts).find(part=>part.startsWith('.form-field > input:not('));
  assert.ok(box,'the family\'s text box rule moved; point this check at it. See UI-55 in docs/UI_RULES.md.');
  const SIZE=/^(?:min-height|height|max-height)$/;
  let boxes=0;
  for(const [name,rules] of [...sheets().filter(name=>name!=='select.css').map(name=>[name,parse(sheet(name))]),...mobile.map(([name,text])=>[name,parse(text)])])
    for(const entry of rules)for(const part of entry.parts){
      assert.doesNotMatch(part,/\.find-field(?![\w-])/,`${name}: ${part} reaches into the find field, which select.css draws for both hosts. See UI-55 in docs/UI_RULES.md.`);
      const drawn=subject(part);
      if(!/^input(?![\w-])/.test(drawn)||/type=(?:checkbox|radio)\]/.test(drawn.replace(/:not\([^)]*\)/g,'')))continue;
      if(!entry.props.some(([prop])=>PAINT.test(prop)||SIZE.test(prop)))continue;
      boxes++;
      assert.ok(heavier(specificity(part),specificity(box))<0,
        `${name}: ${part} sizes or paints a text box with the family's weight or more, so it is drawn by sheet order rather than by select.css. See UI-55 and UI-31 in docs/UI_RULES.md.`);
    }
  assert.ok(boxes>=5,`only ${boxes} text box rules found outside select.css — the check stopped matching`);
});

// UI-56. Disabled is half, wherever it shows. Every disabled control in both
// hosts was dimmed to .5 with the ordinary cursor, except a row's verbs: .4 on a
// finger, on an opened record's number line and on the ledger's page — and
// under a pointer a paused verb stood at full ink, because the rule revealing
// it out-weighed the plain disabled one. A verb that waits unseen for the
// pointer may wait at 0 while it is paused; wherever a rule reveals a control,
// a disabled twin of that rule dims it to half.
test('a disabled control is dimmed to half wherever it shows, in every sheet of both hosts',()=>{
  // Each rule with the @media it sits in, so what a finger sees is told from
  // what a pointer sees.
  const withMedia=text=>{
    const inside=[];let rest='';
    for(let at=0;at<text.length;){
      const start=text.indexOf('@media',at);
      if(start<0){rest+=text.slice(at);break;}
      rest+=text.slice(at,start);
      const open=text.indexOf('{',start);let depth=1,end=open+1;
      for(;end<text.length&&depth;end++)depth+=text[end]==='{'?1:text[end]==='}'?-1:0;
      const media=text.slice(start+'@media'.length,open).replace(/\s+/g,'');
      inside.push(...parse(text.slice(open+1,end-1)).map(entry=>({...entry,media})));
      at=end;
    }
    return [...parse(rest).map(entry=>({...entry,media:''})),...inside];
  };
  const all=[...sheets().map(name=>[name,withMedia(sheet(name))]),...mobile.map(([name,text])=>[name,withMedia(text)])];
  const rules=all.flatMap(([,entries])=>entries);
  const DISABLED=/:disabled|\[aria-disabled=true\]|\[disabled\]/,HALF=/^0?\.5$/;
  let dimmed=0,revealed=0;
  for(const [name,entries] of all)for(const entry of entries){
    const opacity=value(entry,'opacity');
    for(const part of entry.parts){
      if(DISABLED.test(part.replace(/:not\([^)]*\)/g,''))){
        const cursor=value(entry,'cursor');
        assert.ok(cursor===undefined||cursor==='default',`${name}: ${part} gives a disabled control a cursor of its own. See UI-56 in docs/UI_RULES.md.`);
        if(opacity===undefined)continue;
        dimmed++;
        const waiting=opacity==='0'&&/\.row-action/.test(subject(part))&&!/:hover|:focus-within/.test(part)&&!/hover:none/.test(entry.media);
        assert.ok(HALF.test(opacity)||waiting,`${name}: ${part} dims a disabled control to ${opacity} rather than half. See UI-56 in docs/UI_RULES.md.`);
      }else if(opacity==='1'&&/\.row-action|button/.test(subject(part))&&!/:focus-visible/.test(part)){
        revealed++;
        const twin=rules.find(rule=>rule.media===entry.media&&rule.parts.includes(`${part}:disabled`));
        assert.ok(twin&&HALF.test(value(twin,'opacity')??''),
          `${name}: ${part} shows a control with no disabled twin that dims it to half, so a paused one stands at full ink or near it. See UI-56 in docs/UI_RULES.md.`);
      }
    }
  }
  assert.ok(dimmed>=12&&revealed>=6,`only ${dimmed} disabled and ${revealed} revealing rules found — the check stopped matching`);
});
