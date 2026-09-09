import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
import {CapabilitiesView,DataLibrary} from '../src/components/capabilities.js';
import {referenceRows} from '../src/data-library.js';
import {readFileSync} from 'node:fs';
test('shared capabilities replace special travel links and use unique accessible fields',()=>{
  const {document}=parseHTML('<html><body><main id="app"></main></body></html>');globalThis.document=document;
  mountApp(document.getElementById('app'));
  assert.equal(document.querySelectorAll('#navigate-travel').length,1);
  assert.equal([...document.querySelectorAll('a')].some(a=>a.textContent.includes('travel wallet')),false);
  document.getElementById('app').replaceChildren(CapabilitiesView());
  for(const kind of ['rules','rankings','ai'])document.getElementById(`capability-${kind}`).append(DataLibrary({id:kind,title:kind,description:'Saved data'}));
  const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
  for(const label of document.querySelectorAll('label'))assert.ok(document.getElementById(label.htmlFor||label.getAttribute('for')));
  const rules=JSON.parse(readFileSync(new URL('../config/espn-league-2026.json',import.meta.url)));
  assert.ok(referenceRows('rules',rules).some(row=>row.lines.some(line=>line.includes('No limit'))));
});
