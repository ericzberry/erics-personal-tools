import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const component=readFileSync(new URL('../src/components/espn-highlights.js',import.meta.url),'utf8');
const controller=readFileSync(new URL('../src/espn-highlights-content.js',import.meta.url),'utf8');
const row=(name,id,team='DET',disabled=false)=>`<tr><td><a class="playerinfo__playername" href="https://www.espn.com/nfl/player/_/id/${id}">${name}</a><span class="playerinfo__playerteam">${team}</span><span class="playerinfo__playerpos">RB</span></td><td><button ${disabled?'disabled':''}>DRAFT</button></td></tr>`;
const candidate={name:'Jahmyr Gibbs',espnId:4429795,position:'RB',nflTeam:'DET'};
function setup(){const {document}=parseHTML(`<html><body><table><tbody>${row('Jahmyr Gibbs',4429795)}${row('Jahmyr Gibbs',111)}${row('Unavailable',222,'DET',true)}</tbody></table></body></html>`);const context=vm.createContext({document});vm.runInContext(component,context);return {document,context,decorate:context.EspnRecommendationHighlights.decorate};}
test('ESPN decoration uses exact IDs, adds no draft actions, and clears old recommendations',()=>{
 const {document,decorate}=setup();const before=document.body.textContent;
 decorate(document,[candidate]);assert.equal(document.querySelectorAll('.eric-recommended-row').length,1);assert.equal(document.querySelector('[data-eric-recommendation]').getAttribute('data-eric-recommendation'),'Eric’s pick 1');
 assert.equal(document.body.textContent,before);assert.equal(document.querySelectorAll('button').length,3);
 decorate(document,[{...candidate,espnId:222}]);assert.equal(document.querySelectorAll('.eric-recommended-row').length,0);
 decorate(document,[candidate]);decorate(document,[]);assert.equal(document.querySelectorAll('[data-eric-recommendation]').length,0);
});
test('ESPN fallback requires name, position AND team when no ID link is visible',()=>{
 const {document,decorate}=setup();const link=document.querySelector('a');link.removeAttribute('href');
 decorate(document,[{...candidate,nflTeam:'NYJ'}]);assert.equal(document.querySelectorAll('.eric-recommended-row').length,0);
 decorate(document,[candidate]);assert.equal(document.querySelectorAll('.eric-recommended-row').length,1);
});
test('ESPN content expires advice and rejects other sessions, senders and changed draft clocks',()=>{
 const {document,context}=setup();let listener,tick;let snapshot={state:'drafting',onClock:7};
 Object.assign(context,{URL,location:{href:'https://fantasy.espn.com/football/draft?leagueId=123&seasonId=2026&teamId=8'},EspnDraftReader:{read:()=>snapshot},chrome:{runtime:{id:'ours',onMessage:{addListener:fn=>listener=fn}}},setInterval:fn=>tick=fn});
 vm.runInContext(controller,context);
 const message={type:'DRAFT_RECOMMENDATIONS',leagueId:123,seasonId:2026,teamId:8,onClock:7,candidates:[candidate],expiresAt:Date.now()+12000};
 listener(message,{id:'other'});assert.equal(document.querySelectorAll('.eric-recommended-row').length,0);
 listener(message,{id:'ours'});assert.equal(document.querySelectorAll('.eric-recommended-row').length,1);
 snapshot={state:'drafting',onClock:8};tick();assert.equal(document.querySelectorAll('.eric-recommended-row').length,0);
 snapshot={state:'drafting',onClock:7};listener({...message,leagueId:456},{id:'ours'});assert.equal(document.querySelectorAll('.eric-recommended-row').length,0);
 listener({...message,expiresAt:Date.now()-1},{id:'ours'});assert.equal(document.querySelectorAll('.eric-recommended-row').length,0);
 listener(message,{id:'ours'});listener({type:'DRAFT_RECOMMENDATIONS',clear:true},{id:'ours'});assert.equal(document.querySelectorAll('.eric-recommended-row').length,0);
});
