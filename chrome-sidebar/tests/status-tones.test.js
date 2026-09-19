import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {Notice,Spinner,ProgressBar,setProgress,setStatus,STATUS_TONES} from '../src/components/ui.js';
function setup(){const {document}=parseHTML('<html><body></body></html>');globalThis.document=document;return document;}

// One meaning, one look: the four tones are the whole vocabulary, and each one
// replaces the last rather than stacking on it.
test('a status line wears one tone at a time and loses it when it is cleared',()=>{
  setup();
  const line=Notice('',{id:'x'});
  assert.deepEqual(STATUS_TONES,['alert','error','progress','success']);
  setStatus(line,'Saving…','progress');
  assert.ok(line.classList.contains('notice--progress'));
  assert.equal(line.getAttribute('aria-busy'),'true');
  setStatus(line,'Saved.','success');
  assert.ok(line.classList.contains('notice--success'));
  assert.equal(line.classList.contains('notice--progress'),false);
  assert.equal(line.hasAttribute('aria-busy'),false);
  // Nothing to say is not a success; an emptied line carries no colour at all.
  setStatus(line,'','success');
  assert.equal([...line.classList].some(name=>name.startsWith('notice--')),false);
  assert.throws(()=>setStatus(line,'Something','warning'),/Unknown status tone/);
});

// An error has to interrupt; the rest can wait for a pause in the reading.
test('what failed is announced assertively and keeps the element role it was built with',()=>{
  setup();
  const line=Notice('',{role:'status'});
  setStatus(line,'That did not save.','error');
  assert.equal(line.getAttribute('role'),'status');
  assert.equal(line.getAttribute('aria-live'),'assertive');
  setStatus(line,'12 records loaded.','alert');
  assert.equal(line.getAttribute('aria-live'),'assertive');
  setStatus(line,'Loading…','progress');
  assert.equal(line.getAttribute('aria-live'),'polite');
  assert.equal(Notice('Working…',{tone:'progress'}).classList.contains('notice--progress'),true);
});

// Work in progress is shown as motion that lasts as long as the work, never as
// a colour alone and never as a message that appears once and sits there.
test('progress indicators are constant and say how far along they are when they can',()=>{
  setup();
  assert.ok(Spinner().classList.contains('spinner'));
  assert.equal(Spinner({label:'Reading the page…'}).getAttribute('aria-label'),'Reading the page…');
  const bar=ProgressBar();
  assert.equal(bar.getAttribute('role'),'progressbar');
  assert.ok(bar.classList.contains('progress-bar--indeterminate'));
  assert.equal(bar.hasAttribute('aria-valuenow'),false);
  setProgress(bar,40);
  assert.equal(bar.classList.contains('progress-bar--indeterminate'),false);
  assert.equal(bar.getAttribute('aria-valuenow'),'40');
  assert.equal(bar.firstChild.style.width,'40%');
  setProgress(bar,140);assert.equal(bar.getAttribute('aria-valuenow'),'100');
  setProgress(bar,null);assert.ok(bar.classList.contains('progress-bar--indeterminate'));
});

// Weight follows meaning: only an error is drawn with a surface, so a screen
// full of ordinary statuses is not a wall of colour blocks.
test('only an error takes a filled surface; the rest are a mark and a sentence',()=>{
  const css=readFileSync(new URL('../src/components/status.css',import.meta.url),'utf8');
  for(const tone of ['alert','progress','success'])
    assert.equal(new RegExp(`\\.notice--${tone}\\.notice--${tone} \\{[^}]*background:[^}]*(surface|#)`).test(css),false,`${tone} should not fill a surface`);
  assert.match(css,/\.notice--error\.notice--error \{[^}]*background: var\(--error-surface\)/);
});

// Every tone differs by more than its colour, and only progress moves.
test('each tone carries its own mark and the spinner is the only animation',()=>{
  const css=readFileSync(new URL('../src/components/status.css',import.meta.url),'utf8');
  for(const tone of STATUS_TONES)assert.match(css,new RegExp(`\\.notice--${tone}::before`),`${tone} has no mark`);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  for(const rule of ['--alert','--error','--progress','--success'])assert.match(css,new RegExp(`${rule}:`));
});

// A feature that colours its own status line is a second vocabulary, which is
// exactly what this system replaces.
test('no feature invents its own status colour or writes a status line directly',()=>{
  const dir=new URL('../src/',import.meta.url);
  const files=readdirSync(dir,{recursive:true}).filter(name=>String(name).endsWith('.js'));
  for(const name of files){
    const source=readFileSync(new URL(String(name),dir),'utf8');
    const direct=[...source.matchAll(/\$\('([a-z-]*status)'\)\.textContent\s*=/g)].map(match=>match[1]);
    assert.deepEqual(direct,[],`${name}: set ${direct.join(', ')} through setStatus instead`);
  }
});
