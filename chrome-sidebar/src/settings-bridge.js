import {travelOffline} from './travel-offline.js';
import {releaseChecker} from './release-check.js';
const releaseChecks=new WeakMap();
import {migrateCredentials} from './credential-migration.js';
import {cloudRequest, CONNECTION_KEY} from './cloud-storage.js';
export function isSettingsPage(sender, chromeApi) {
  return sender?.id === chromeApi.runtime.id && ['settings.html','sidepanel.html'].some(path=>sender.url === chromeApi.runtime.getURL(path));
}
export async function settingsAction(message, chromeApi, request = cloudRequest) {
  const storage = chromeApi.storage.local;
  await storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  if(message.action==='release-check'){
    if(!releaseChecks.has(storage))releaseChecks.set(storage,releaseChecker(storage));
    return releaseChecks.get(storage)();
  }
  if (message.action === 'disconnect') {
    const token=(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token;
    if(token&&globalThis.indexedDB)await travelOffline().disconnect(token);
    await storage.remove(CONNECTION_KEY); return {connected:false};
  }
  const saved = (await storage.get(CONNECTION_KEY))[CONNECTION_KEY];
  const token = saved?.token || '';
  if (message.action === 'status') return {connected:!!token};
  if (message.action === 'connect') {
    const next = typeof message.token === 'string' ? message.token.trim() : token;
    const health = await request(next, '/health');
    if (!health.ok || health.service !== 'erics-tools-api' || health.version !== 2) throw Error('Update the cloud settings service before connecting.');
    await request(next, '/v1/ai-connections');
    if(token&&token!==next&&globalThis.indexedDB)await travelOffline().disconnect(token);
    await storage.set({[CONNECTION_KEY]:{token:next}});
    return {connected:true};
  }
  if (message.action === 'migrate') return migrateCredentials(storage,token,request);
  if (message.action === 'list') return request(token, '/v1/ai-connections');
  if (!['save', 'remove','models','test','generate'].includes(message.action) || !/^[a-f0-9-]{36}$/.test(message.id || '')) throw Error('Unknown settings action.');
  if(message.action==='models')return request(token,`/v1/ai-connections/${message.id}/models`);
  if(message.action==='test')return request(token,`/v1/ai-connections/${message.id}/test`,{method:'POST',value:{model:message.model}});
  if(message.action==='generate')return request(token,`/v1/ai-connections/${message.id}/generate`,{method:'POST',value:{model:message.model,messages:message.messages,maxTokens:message.maxTokens}});
  if (message.action === 'remove') return request(token, `/v1/ai-connections/${message.id}`, {method:'DELETE', value:{revision:message.revision}});
  const data = message.connection;
  if (!data || typeof data !== 'object') throw Error('Connection settings are required.');
  // Never allow callers to turn this into a general network or storage proxy.
  const value = {name:data.name, provider:data.provider, model:data.model, baseUrl:data.baseUrl, apiFormat:data.apiFormat, revision:data.revision};
  if (typeof data.apiKey === 'string') value.apiKey = data.apiKey;
  return request(token, `/v1/ai-connections/${message.id}`, {method:'PUT', value});
}
export function registerSettingsBridge(chromeApi) {
  chromeApi.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'ERIC_SETTINGS') return;
    if (!isSettingsPage(sender, chromeApi)) {respond({ok:false, error:'Settings page access required.'}); return;}
    settingsAction(message, chromeApi).then(value => respond({ok:true, ...value})).catch(error => respond({ok:false, error:error.name === 'TimeoutError' ? 'The connection timed out. Try again.' : error.message}));
    return true;
  });
  chromeApi.omnibox.setDefaultSuggestion({description:'Open Eric’s personal settings'});
  chromeApi.omnibox.onInputEntered.addListener((_text, disposition) => {
    const url = chromeApi.runtime.getURL('settings.html');
    if (disposition === 'currentTab') chromeApi.tabs.update({url});
    else chromeApi.tabs.create({url, active:disposition !== 'newBackgroundTab'});
  });
}
