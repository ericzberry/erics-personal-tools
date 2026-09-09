import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudRequest,CLOUD_URL} from '../src/cloud-storage.js';
import {isSettingsPage,settingsAction,registerSettingsBridge} from '../src/settings-bridge.js';
const token='a'.repeat(32),id='a5bb73f0-738b-4cf6-9862-41c6468cf40a';
function api(){let data={cloudConnection:{token}};return {runtime:{id:'extension',getURL:path=>`chrome-extension://extension/${path}`},storage:{local:{setAccessLevel:async()=>{},get:async()=>structuredClone(data),set:async value=>{data={...data,...value};},remove:async key=>{delete data[key];}}}};}
test('cloud requests use the fixed host, omit cookies and reject redirects',async()=>{
 const result=await cloudRequest(token,'/health',{fetcher:async(url,options)=>{assert.equal(url,`${CLOUD_URL}/health`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return Response.json({ok:true});}});assert.equal(result.ok,true);
});
test('only installed sidebar and settings pages can access the bridge',()=>{
 const chrome=api();
 assert.equal(isSettingsPage({id:'extension',url:chrome.runtime.getURL('settings.html')},chrome),true);
 assert.equal(isSettingsPage({id:'extension',url:chrome.runtime.getURL('sidepanel.html')},chrome),true);
 for(const sender of [{id:'extension',url:'https://example.com'},{id:'other',url:chrome.runtime.getURL('settings.html')},{url:chrome.runtime.getURL('settings.html')}])assert.equal(isSettingsPage(sender,chrome),false);
 let listener,open;chrome.runtime.onMessage={addListener:fn=>{listener=fn;}};chrome.omnibox={setDefaultSuggestion:()=>{},onInputEntered:{addListener:fn=>{open=fn;}}};chrome.tabs={update:value=>assert.equal(value.url,chrome.runtime.getURL('settings.html'))};registerSettingsBridge(chrome);
 let result;listener({type:'ERIC_SETTINGS',action:'list'},{id:'extension',url:'https://mail.google.com/'},value=>{result=value;});assert.equal(result.ok,false);open('', 'currentTab');
});
test('bridge keeps token private and restricts operations to AI settings',async()=>{
 const chrome=api();assert.deepEqual(await settingsAction({action:'status'},chrome),{connected:true});
 let calls=[];const request=async(key,path,options)=>{assert.equal(key,token);calls.push({path,options});return path==='/health'?{ok:true,service:'erics-tools-api',version:2}:{connections:[]};};
 await settingsAction({action:'save',id,connection:{name:'AI',provider:'openai',apiKey:'key',draftSessions:{secret:'draft'},url:'https://evil.example'}},chrome,request);
 assert.equal(calls[0].path,`/v1/ai-connections/${id}`);assert.equal(calls[0].options.value.draftSessions,undefined);assert.equal(calls[0].options.value.url,undefined);
 await assert.rejects(settingsAction({action:'fetch',id},chrome,request),/Unknown/);
 await settingsAction({action:'generate',id,model:'test',messages:[{role:'user',content:'hello'}],maxTokens:512,apiKey:'injected',url:'https://evil.example'},chrome,request);
 const generation=calls.at(-1);assert.equal(generation.path,`/v1/ai-connections/${id}/generate`);assert.equal(generation.options.value.apiKey,undefined);assert.equal(generation.options.value.url,undefined);
 await settingsAction({action:'disconnect'},chrome);assert.deepEqual(await settingsAction({action:'status'},chrome),{connected:false});
});
test('cloud requests report setup and conflict failures and reject oversized payloads before sending',async()=>{
 await assert.rejects(cloudRequest(token,'/health',{fetcher:async()=>new Response('Hello World')}),/not been deployed/);
 await assert.rejects(cloudRequest(token,'/health',{fetcher:async()=>new Response('',{status:401})}),/rejected/);
 await assert.rejects(cloudRequest(token,'/v1/ai-connections',{fetcher:async()=>Response.json({error:'Changed elsewhere'},{status:409})}),/Changed elsewhere/);
 await assert.rejects(cloudRequest('', '/health'),/private access token/);
 await assert.rejects(cloudRequest(token,'/v1/ai-connections',{value:{text:'x'.repeat(66000)},fetcher:()=>assert.fail('Must not fetch')}),/64 KB/);
});
