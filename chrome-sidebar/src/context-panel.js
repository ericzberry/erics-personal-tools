import {gmailConnection} from './gmail-connection.js';
import {summarizeEmail} from './email-cloud.js';
import {showTool} from './navigation.js';
import {generateEmailText} from './email-ai.js';
import {accountSiteWatcher} from './account-sites.js';
import {openFinanceTool,mountedFinanceTool} from './capability-links.js';
import {mountPageStrip} from './page-strip.js';
const $ = id => document.getElementById(id);
const extension = !!globalThis.chrome?.tabs;
const readCurrentEmail=extension?gmailConnection(chrome):null;
const detectAccountSite=extension?accountSiteWatcher():null;
// One strip for the whole panel, under the header: it outlives every tool,
// because the point of it is to be there when the owner is somewhere else.
const strip=extension?mountPageStrip($('page-offers')):null;
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
// An account page the owner is already signed in to is the one thing that
// opens Finance on its own, because reading it is only possible from beside
// that tab. Leaving the page tells the tool so, but never builds it: a sidebar
// that has not opened Finance keeps its passkey prompt to itself.
async function announceAccountSite(site) {
  try {
    const tool = site ? openFinanceTool() : mountedFinanceTool();
    if (tool) (await tool)?.site(site);
  } catch {/* A tool that will not mount is not a Gmail failure, and must not be reported as one. */}
}
async function refresh() {
  if (!extension || polling) return;
  polling = true;
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const url = new URL(tab?.url || 'https://invalid.local');
    const gmail = url.hostname === 'mail.google.com';
    const site = gmail ? null : await detectAccountSite(tab);
    await announceAccountSite(site);
    strip?.update({url:tab?.url||'',site});
    // The draft board follows the draft room, not the whole of ESPN fantasy:
    // outside a draft it is a tool for something that is not happening.
    const draft = url.hostname === 'fantasy.espn.com' && /^\/football\/draft/i.test(url.pathname);
    const tool = gmail ? 'gmail' : site ? 'finance' : draft ? 'football' : 'home';
    showTool(tool);
    if (activeTab !== tab?.id) {clearEmail();activeTab = tab?.id;}
    if (!gmail) {clearEmail();renderEmail();return;}
    const response = await readCurrentEmail(tab.id);
    const [current] = await chrome.tabs.query({active:true,currentWindow:true});
    if (current?.id !== tab.id || current?.url !== tab.url) {clearEmail();return;}
    const data = response?.email;
    clearEmail(data?.text ? data : null);
    $('email-read-status').textContent = response?.error || data?.error || (email ? 'Latest expanded message · Summaries via OpenAI' : 'Open a message, then expand it.');
    renderEmail();
  } catch {
    clearEmail(); renderEmail(); $('email-read-status').textContent = 'Could not connect to Gmail. Check extension site access, then click Refresh.';
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
    const fresh = tab && await readCurrentEmail(tab.id);
    if (token !== generation || JSON.stringify(fresh?.email) !== JSON.stringify(source)) {clearEmail();await refresh();return;}
    const text = await (action==='summary'?summarizeEmail:generateEmailText)({email:source,action,signal:controller.signal,onProgress:message=>{if(token===generation)$('email-action-status').textContent=message;}});
    const [afterTab] = await chrome.tabs.query({active:true,currentWindow:true});
    const after = afterTab?.id === tab.id && await readCurrentEmail(tab.id);
    if (JSON.stringify(after?.email) !== JSON.stringify(source)) {clearEmail();await refresh();return;}
    if (token !== generation) return;
    $('email-result-title').textContent = action === 'reply' ? 'Reply draft' : 'Summary';
    $('email-output').value = text; $('email-result').hidden = false;
    $('email-output').dispatchEvent(new Event('output-updated'));
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
else {const previewTool=new URL(location.href).searchParams.get('tool');showTool(['gmail','home'].includes(previewTool)?previewTool:'football');$('email-read-status').textContent='Preview · open the extension on Gmail to read a message.';renderEmail();}
