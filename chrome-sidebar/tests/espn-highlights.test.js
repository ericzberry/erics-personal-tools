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
 decorate(document,[candidate]);assert.equal(document.querySelectorAll('.eric-recommended-row').length,1);assert.equal(document.querySelector('[data-eric-recommendation]'),null);
 assert.equal(document.body.textContent,before);assert.equal(document.querySelectorAll('button').length,3);
 decorate(document,[{...candidate,espnId:222}]);assert.equal(document.querySelectorAll('.eric-recommended-row').length,1);assert.equal(document.querySelectorAll('button[disabled]').length,1);
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

test('current-tier rows use a separate highlight and recommendations take precedence',()=>{
 const {document,decorate}=setup();const other={...candidate,espnId:111,tier:1};
 decorate(document,[candidate],[{...candidate,tier:1},other]);
 assert.equal(document.querySelectorAll('.eric-recommended-row').length,1);assert.equal(document.querySelectorAll('.eric-current-tier-row').length,1);
 assert.equal(document.querySelector('.eric-recommended-row').classList.contains('eric-current-tier-row'),false);
 assert.equal(document.querySelector('[data-eric-tier]'),null);
 decorate(document,[],[]);assert.equal(document.querySelectorAll('[data-eric-tier],.eric-current-tier-row,.eric-recommended-row').length,0);
});

test('player listing links work without pick-feed classes or native Draft buttons',()=>{
 const {document}=parseHTML('<html><body><table><tr><td><a href="/nfl/player/_/id/4429795/jahmyr-gibbs">Jahmyr Gibbs</a><span>DET</span><span>RB</span></td><td><div role="button">DRAFT</div></td></tr></table></body></html>');
 const context=vm.createContext({document});vm.runInContext(component,context);
 const result=context.EspnRecommendationHighlights.decorate(document,[candidate]);assert.equal(result.recommended,1);
 document.querySelector('a').removeAttribute('href');
 assert.equal(context.EspnRecommendationHighlights.decorate(document,[candidate]).recommended,1);
});
test('ARIA player rows support tier highlights and report matches',()=>{
 const {document}=parseHTML('<html><body><div role="row"><div role="cell"><a href="/nfl/player/_/id/4429795/jahmyr-gibbs">Jahmyr Gibbs</a></div></div></body></html>');
 const context=vm.createContext({document});vm.runInContext(component,context);
 const result=context.EspnRecommendationHighlights.decorate(document,[],[{...candidate,tier:1}]);assert.equal(result.currentTier,1);assert.equal(result.recommended,0);
});

test('virtual ESPN div rows paint cells without relying on an injected stylesheet',()=>{
 const {document}=parseHTML('<html><head></head><body><div class="Table__TR"><div class="Table__TD"><a class="player-column__athlete" href="/nfl/player/_/id/4429795/jahmyr-gibbs">Jahmyr Gibbs</a></div><div class="Table__TD">DRAFT</div></div></body></html>');
 const context=vm.createContext({document});vm.runInContext(component,context);
 const result=context.EspnRecommendationHighlights.decorate(document,[candidate]);assert.equal(result.recommended,1);
 assert.equal(document.querySelector('[data-eric-highlight-styles]'),null);
 assert.equal(document.querySelector('.Table__TD').style.backgroundColor,'#d5e6ff');
 context.EspnRecommendationHighlights.decorate(document,[]);
 assert.equal(document.querySelector('.Table__TD').style.backgroundColor,'');

});
test('page receives recommendations directly from draft capture without a sidebar message',()=>{
 const {document,context}=setup();Object.assign(context,{URL,location:{href:'https://fantasy.espn.com/football/draft?leagueId=123&seasonId=2026&teamId=8'},EspnDraftReader:{read:()=>({state:'drafting',onClock:7})},chrome:{runtime:{id:'ours',onMessage:{addListener:()=>{}}}},setInterval:()=>{}});
 vm.runInContext(controller,context);
 const response=context.EspnPageHighlights.receive({leagueId:123,seasonId:2026,teamId:8,onClock:7,candidates:[candidate],expiresAt:Date.now()+15000});
 assert.equal(response.recommended,1);assert.equal(document.querySelectorAll('.eric-recommended-row').length,1);
});

test('ESPN highlights change only backgrounds and remove obsolete badge styling',()=>{
 const {document,decorate}=setup();const before=document.body.textContent;
 const old=document.createElement('style');old.setAttribute('data-eric-highlight-styles','true');old.textContent='[data-eric-tier]::after{content:attr(data-eric-tier);padding:8px}';document.head.append(old);
 document.querySelector('a').setAttribute('data-eric-tier','Tier 1');
 decorate(document,[candidate]);
 assert.equal(document.body.textContent,before);assert.equal(document.querySelectorAll('[data-eric-tier],[data-eric-recommendation]').length,0);
 assert.equal(document.querySelector('[data-eric-highlight-styles]'),null);
 for(const element of document.querySelectorAll('[style]'))assert.match(element.getAttribute('style'),/^background-color:/);
});

test('clearing highlights restores preexisting row colors and preserves geometry styles',()=>{
 const {document,decorate}=setup();const row=document.querySelector('tr');
 row.style.setProperty('height','48px');row.style.setProperty('background-color','red');
 decorate(document,[candidate]);assert.equal(row.style.backgroundColor,'#d5e6ff');
 decorate(document,[]);assert.equal(row.style.backgroundColor,'red');assert.equal(row.style.height,'48px');
});

test('diagnostics report page version, advice and row structure without modifying content',()=>{
 const {document,context}=setup();let listener;
 Object.assign(context,{URL,location:{href:'https://fantasy.espn.com/football/draft?leagueId=123&seasonId=2026&teamId=8'},EspnDraftReader:{read:()=>({state:'drafting',onClock:7})},chrome:{runtime:{id:'ours',getManifest:()=>({version:'0.6.12'}),onMessage:{addListener:fn=>listener=fn}}},setInterval:()=>{}});
 vm.runInContext(controller,context);const before=document.body.textContent;let result;
 listener({type:'ESPN_HIGHLIGHT_DIAGNOSTICS'},{id:'other'},value=>result=value);assert.equal(result,undefined);
 listener({type:'ESPN_HIGHLIGHT_DIAGNOSTICS'},{id:'ours'},value=>result=value);
 assert.equal(result.version,'0.6.12');assert.equal(result.rows[0].node.text,'Jahmyr Gibbs');assert.equal(result.rows[0].ancestors[0].tag,'TD');assert.equal(document.body.textContent,before);
});

test('ESPN fixedDataTable paints nested cell layers across frozen and scrolling columns',()=>{
 const {document}=parseHTML(`<html><body><div class="public_fixedDataTableRow_main"><div><div class="fixedDataTableCellGroupLayout_cellGroup"><div class="public_fixedDataTableCell_main" style="background-color:white"><div class="fixedDataTableCellLayout_wrap3 public_fixedDataTableCell_wrap3"><div class="public_fixedDataTableCell_cellContent"><div class="player-column"><div class="player-details"><span class="playerinfo__playername"><a>Jahmyr Gibbs</a></span><span class="playerinfo__playerteam">DET</span><span class="playerinfo__playerpos">RB</span></div></div></div></div></div></div><div class="fixedDataTableCellGroupLayout_cellGroup"><div class="public_fixedDataTableCell_main" style="background-color:white">335.1</div></div></div></div></body></html>`);
 const context=vm.createContext({document});vm.runInContext(component,context);const api=context.EspnRecommendationHighlights;
 const before=document.body.textContent;assert.equal(api.decorate(document,[candidate]).recommended,1);
 for(const cell of document.querySelectorAll('[class*="fixedDataTableCell"]'))assert.equal(cell.style.backgroundColor,'#d5e6ff');
 assert.equal(document.body.textContent,before);api.decorate(document,[],[candidate]);
 assert.equal(document.querySelector('.public_fixedDataTableCell_main').style.backgroundColor,'#fff0bc');
 api.decorate(document,[]);assert.equal(document.querySelector('.public_fixedDataTableCell_main').style.backgroundColor,'white');
 assert.equal(document.querySelector('.public_fixedDataTableCell_cellContent').style.backgroundColor,'');
});
