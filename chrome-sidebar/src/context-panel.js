import {gmailConnection} from './gmail-connection.js';
import {setStatus} from './components/ui.js';
import {summarizeEmail,draftReply} from './email-cloud.js';
import {showTool,selectCapability} from './navigation.js';
import {accountSiteWatcher,financeSite} from './account-sites.js';
import {loyaltySite} from './loyalty-sites.js';
import {rewardsTool} from './rewards.js';
import {openFinanceTool,mountedFinanceTool,openPanelTool} from './capability-links.js';
import {mountPageStrip} from './page-strip.js';
import {mountWritingVoice} from './writing-voice.js';
const $ = id => document.getElementById(id);
const extension = !!globalThis.chrome?.tabs;
const readCurrentEmail=extension?gmailConnection(chrome):null;
const detectAccountSite=extension?accountSiteWatcher():null;
// One strip for the whole panel, under the header: it outlives every tool,
// because the point of it is to be there when the owner is somewhere else.
// Going somewhere from it builds the tool the way its own menu row would.
function goTo(capability){
  openPanelTool(capability);
  selectCapability(capability);
}
const strip=extension?mountPageStrip($('page-offers'),{select:goTo}):null;
let email = null, identity = '', generation = 0, controller, activeTab, polling = false, working = false;
// The two things this screen does, each owning its own status, result and Copy.
const JOBS = {
  reply: {button:'reply-email', status:'reply-status', result:'reply-result', output:'reply-output', copy:'copy-reply'},
  summary: {button:'summarize-email', status:'summary-status', result:'summary-result', output:'summary-output', copy:'copy-summary'}
};
function clearOutput(job) {
  const nodes = JOBS[job];
  $(nodes.result).hidden = true; $(nodes.output).value = ''; $(nodes.copy).hidden = true; setStatus($(nodes.status),'');
}
function showOutput(job, text) {
  const nodes = JOBS[job];
  $(nodes.output).value = text; $(nodes.result).hidden = false; $(nodes.copy).hidden = false;
  $(nodes.output).dispatchEvent(new Event('output-updated'));
}
function clearEmail(next = null) {
  const nextIdentity = next ? JSON.stringify(next) : '';
  if (identity === nextIdentity) return;
  identity = nextIdentity; email = next; generation++; controller?.abort(); working = false;
  // What the reply was to say belonged to the message that was open. A new
  // message is a new errand, and carrying the old instruction into it would be
  // worse than asking for it again.
  $('reply-intent').value = '';
  for (const job of Object.keys(JOBS)) clearOutput(job);
}
function renderEmail() {
  $('email-subject').textContent = email?.subject || 'Open an email in Gmail';
  $('email-from').textContent = email ? `${email.name || email.from} · ${email.from}` : '';
  for (const job of Object.values(JOBS)) $(job.button).disabled = !email || working;
}
// A finance page opens Finance on its own: it is where the figures on that page
// would go, and on the sites that can be read it is the only place from which
// they can be. Opening it that way is quiet — the intake is ready, the ledger's
// own figures are not shown — and it raises no passkey prompt, because visiting
// a bank is not the same as asking for a section. Leaving the page tells the
// tool so, but never builds it: a sidebar that has not opened Finance keeps its
// prompt to itself.
async function announceFinancePage(place, site) {
  try {
    const tool = place ? openFinanceTool({quiet:true}) : mountedFinanceTool();
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
    // Two questions about the same tab: is this page about the owner's money,
    // which costs a URL comparison, and — only on the sites a snapshot can be
    // read from — are they signed in to it, which costs asking the page.
    const place = gmail ? null : financeSite(tab?.url);
    const site = place?.read ? await detectAccountSite(tab) : null;
    await announceFinancePage(place, site);
    // The wallet is told which program's site is in front, and nothing more: it
    // is already mounted, it reads no page until the owner presses for it, and
    // a tab that is not a program's takes the offer away again.
    rewardsTool.site(gmail ? null : loyaltySite(tab?.url));
    strip?.update({url:tab?.url||'',site});
    // The draft board follows the draft room, not the whole of ESPN fantasy:
    // outside a draft it is a tool for something that is not happening.
    const draft = url.hostname === 'fantasy.espn.com' && /^\/football\/draft/i.test(url.pathname);
    const tool = gmail ? 'gmail' : place ? 'finance' : draft ? 'football' : 'home';
    showTool(tool);
    if (activeTab !== tab?.id) {clearEmail();activeTab = tab?.id;}
    if (!gmail) {clearEmail();renderEmail();return;}
    const response = await readCurrentEmail(tab.id);
    const [current] = await chrome.tabs.query({active:true,currentWindow:true});
    if (current?.id !== tab.id || current?.url !== tab.url) {clearEmail();return;}
    const data = response?.email;
    clearEmail(data?.text ? data : null);
    const trouble = response?.error || data?.error;
    setStatus($('email-read-status'), trouble || (email ? 'Latest expanded message' : 'Open a message, then expand it.'), trouble ? 'error' : email ? '' : 'alert');
    renderEmail();
  } catch {
    clearEmail(); renderEmail(); setStatus($('email-read-status'),'Could not connect to Gmail. Check extension site access, then click Refresh.','error');
  } finally {polling = false;}
}
for (const [job, nodes] of Object.entries(JOBS)) $(nodes.button).addEventListener('click', async () => {
  if (!email || working) return;
  const token = ++generation, source = email;
  controller?.abort(); controller = new AbortController(); working = true; renderEmail();
  clearOutput(job); setStatus($(nodes.status),'Working…','progress');
  try {
    // Re-read at click time so an email navigation cannot use stale sidebar content.
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const fresh = tab && await readCurrentEmail(tab.id);
    if (token !== generation || JSON.stringify(fresh?.email) !== JSON.stringify(source)) {clearEmail();await refresh();return;}
    const options={email:source,signal:controller.signal,onProgress:message=>{if(token===generation)setStatus($(nodes.status),message,'progress');}};
    const text = await (job==='reply'?draftReply({...options,instruction:$('reply-intent').value}):summarizeEmail(options));
    const [afterTab] = await chrome.tabs.query({active:true,currentWindow:true});
    const after = afterTab?.id === tab.id && await readCurrentEmail(tab.id);
    if (JSON.stringify(after?.email) !== JSON.stringify(source)) {clearEmail();await refresh();return;}
    if (token !== generation) return;
    showOutput(job, text);
    setStatus($(nodes.status), job === 'reply' ? 'Review and edit before using.' : '', 'success');
  } catch (error) {if(token===generation)setStatus($(nodes.status),error.message,'error');}
  finally {if(token===generation){working=false;renderEmail();}}
});
for (const nodes of Object.values(JOBS)) $(nodes.copy).addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText($(nodes.output).value);setStatus($(nodes.status),'Copied.','success');}
  catch {setStatus($(nodes.status),'Select the text and copy it manually.','alert');}
});
$('refresh-email').addEventListener('click',refresh);

// The voice replies are written in. It asks the Worker nothing until the
// section is opened, because a panel that is only summarizing an email has no
// use for it.
const voice=mountWritingVoice({
  nodes:{status:$('voice-status'),actions:$('voice-actions'),list:$('voice-list'),editor:$('voice-editor'),prompt:$('voice-prompt')},
  request:async(action,data={})=>{
    const result=await chrome.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});
    if(!result?.ok)throw Error(result?.error||'Could not reach the extension service. Reload the extension and try again.');
    return result;
  },
  openExternal:url=>{chrome.tabs.create({url});return true;}
});
if(extension)$('email-voice').addEventListener('toggle',()=>{if($('email-voice').open)voice.load();});

if (extension) {refresh();setInterval(refresh,1500);chrome.tabs.onActivated.addListener(refresh);chrome.tabs.onUpdated.addListener(refresh);}
else {const previewTool=new URL(location.href).searchParams.get('tool');showTool(['gmail','home'].includes(previewTool)?previewTool:'football');setStatus($('email-read-status'),'Preview · open the extension on Gmail to read a message.','alert');renderEmail();}
