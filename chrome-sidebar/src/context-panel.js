import {showTool} from './navigation.js';
import {generateEmailText} from './email-ai.js';
const $ = id => document.getElementById(id);
const extension = !!globalThis.chrome?.tabs;
let email = null, identity = '', generation = 0, controller, activeTab, polling = false, working = false;
function clearEmail(next = null) {
  const nextIdentity = next ? JSON.stringify(next) : '';
  if (identity === nextIdentity) return;
  identity = nextIdentity; email = next; generation++; controller?.abort(); working = false;
  $('email-result').hidden = true; $('email-output').value = ''; $('email-action-status').textContent = '';
}
function renderEmail() {
  $('email-subject').textContent = email?.subject || 'Open an email in Gmail';
  $('email-from').textContent = email ? `${email.name || email.from} · ${email.from}` : '';
  $('email-preview').textContent = email?.text || '';
  $('email-source').hidden = !email;
  for (const id of ['summarize-email','reply-email']) $(id).disabled = !email || working;
}
async function refresh() {
  if (!extension || polling) return;
  polling = true;
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const url = new URL(tab?.url || 'https://invalid.local');
    const gmail = url.hostname === 'mail.google.com';
    const tool = gmail ? 'gmail' : url.hostname === 'fantasy.espn.com' ? 'football' : 'home';
    showTool(tool);
    if (activeTab !== tab?.id) {clearEmail();activeTab = tab?.id;}
    if (!gmail) {clearEmail();renderEmail();return;}
    const response = await chrome.tabs.sendMessage(tab.id, {type:'READ_CURRENT_EMAIL'});
    const [current] = await chrome.tabs.query({active:true,currentWindow:true});
    if (current?.id !== tab.id || current?.url !== tab.url) {clearEmail();return;}
    const data = response?.email;
    clearEmail(data?.text ? data : null);
    $('email-read-status').textContent = response?.error || data?.error || (email ? 'Latest expanded message · processed on this device' : 'Open a message, then expand it.');
    renderEmail();
  } catch {
    clearEmail(); renderEmail(); $('email-read-status').textContent = 'Reload Gmail to connect the extension.';
  } finally {polling = false;}
}
for (const [id, action] of [['summarize-email','summary'],['reply-email','reply']]) $(id).addEventListener('click', async () => {
  if (!email || working) return;
  const token = ++generation, source = email;
  controller?.abort(); controller = new AbortController(); working = true; renderEmail();
  $('email-result').hidden = true; $('email-action-status').textContent = 'Working…';
  try {
    // Re-read at click time so an email navigation cannot use stale sidebar content.
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const fresh = tab && await chrome.tabs.sendMessage(tab.id,{type:'READ_CURRENT_EMAIL'});
    if (token !== generation || JSON.stringify(fresh?.email) !== JSON.stringify(source)) {clearEmail();await refresh();return;}
    const text = await generateEmailText({email:source,action,signal:controller.signal,onProgress:message=>{if(token===generation)$('email-action-status').textContent=message;}});
    const [afterTab] = await chrome.tabs.query({active:true,currentWindow:true});
    const after = afterTab?.id === tab.id && await chrome.tabs.sendMessage(tab.id,{type:'READ_CURRENT_EMAIL'});
    if (JSON.stringify(after?.email) !== JSON.stringify(source)) {clearEmail();await refresh();return;}
    if (token !== generation) return;
    $('email-result-title').textContent = action === 'reply' ? 'Reply draft' : 'Summary';
    $('email-output').value = text; $('email-result').hidden = false;
    $('email-action-status').textContent = action === 'reply' ? 'Review and edit before using.' : '';
  } catch (error) {if(token===generation)$('email-action-status').textContent=error.message;}
  finally {if(token===generation){working=false;renderEmail();}}
});
$('copy-email-output').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText($('email-output').value);$('email-action-status').textContent='Copied.';}
  catch {$('email-action-status').textContent='Select the text and copy it manually.';}
});
$('refresh-email').addEventListener('click',refresh);
if (extension) {refresh();setInterval(refresh,1500);chrome.tabs.onActivated.addListener(refresh);chrome.tabs.onUpdated.addListener(refresh);}
else {showTool(new URL(location.href).searchParams.get('tool')==='gmail'?'gmail':'football');$('email-read-status').textContent='Preview · open the extension on Gmail to read a message.';renderEmail();}
