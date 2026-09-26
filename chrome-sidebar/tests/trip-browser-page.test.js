import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {tripBrowserPage} from '../src/trip-browser-page.js';
function page(html){const {document,window}=parseHTML(html);globalThis.document=document;globalThis.location={href:'https://example.com/search',pathname:'/search'};globalThis.getComputedStyle=()=>({visibility:'visible'});window.HTMLElement.prototype.getClientRects=()=>[{}];Object.defineProperty(window.HTMLElement.prototype,'innerText',{get(){return this.textContent;},configurable:true});return window;}
test('password pages pause without capturing text, controls or credentials',()=>{
  page('<html><body><p>Private account detail</p><input type="password" value="never-read-this"></body></html>');
  const result=tripBrowserPage();assert.ok(result.attention);assert.equal(result.text,'');assert.deepEqual(result.controls,[]);
});
test('a stale control and a purchase control cannot be clicked',()=>{
  page('<html><body><button>Search</button><button>Pay now</button></body></html>');
  const captured=tripBrowserPage();assert.throws(()=>tripBrowserPage({type:'click',control:captured.controls[1]}),/outside travel search/);
  document.querySelector('button').textContent='Confirm booking';assert.throws(()=>tripBrowserPage({type:'click',control:captured.controls[0]}),/page changed/);
});
test('open search dialogs remain readable after large hotel result lists',()=>{
  page(`<html><body>${'<button>Hotel details</button>'.repeat(110)}<div role="dialog"><label>Child age<select><option value="7">7</option></select></label><button>Done</button></div></body></html>`);
  const read=tripBrowserPage();assert.equal(read.controls.length,2);assert.equal(read.controls[0].tag,'select');assert.equal(read.controls[1].label,'Done');assert.equal(read.text.includes('Hotel details'),false);
});
