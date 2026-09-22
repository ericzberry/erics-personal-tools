import {mountExtensionTravel} from './travel-page.js';
let mounted=false;
// Settings shows the wallet's connection panel, so Settings mounts it too.
export function mountTravelTool(){
  const root=document.getElementById('travel-tool');
  if(root&&!mounted){mountExtensionTravel(root);mounted=true;}
}
document.getElementById('navigate-travel')?.addEventListener('click',mountTravelTool);

// Finance opens in the sidebar, beside the account page it reads. The tool is
// built on first use so a sidebar that never opens it pays nothing for it.
//
// How it was arrived at is the tool's to know: choosing Finance is the owner
// asking for their position, while the panel turning to it beside a finance page
// is not, and opens it quiet.
let finance=null;
export function openFinanceTool({quiet=false}={}){
  const root=document.getElementById('finance-tool');
  if(!root)return null;
  finance??=(async()=>{
    const [{mountExtensionFinance,openFinanceDetails},{readOpenAccountPage}]=await Promise.all([import('./finance-page.js'),import('./finance-page-read.js')]);
    // The panel keeps what it all comes to and the ways a figure gets in; the
    // ledger itself, entity by entity, is read on its own page.
    return mountExtensionFinance(root,{quiet,layout:'panel',openDetails:()=>openFinanceDetails(),
      readPage:()=>readOpenAccountPage(),onSettings:()=>document.getElementById('open-settings')?.click()});
  })();
  finance.then(tool=>tool.quiet(quiet)).catch(()=>{/* A tool that will not mount reports itself through its own caller. */});
  return finance;
}
// Whoever is already mounted, without building the tool to ask. A tab that has
// stopped being a finance page has nothing to tell a panel that never opened
// Finance, and building one to hear it would be the sidebar arriving at a
// protected section on its own account.
export const mountedFinanceTool=()=>finance;
document.getElementById('navigate-finance')?.addEventListener('click',()=>openFinanceTool());

// Taxes opens in the panel beside the mail a document arrives in, so a K-1 can
// go from the message straight into the drop zone without a tab in between.
let taxes=null;
export function openTaxesTool(){
  const root=document.getElementById('taxes-tool');
  if(!root)return null;
  taxes??=import('./taxes-page.js').then(({mountExtensionTaxes})=>
    mountExtensionTaxes(root,{onSettings:()=>document.getElementById('open-settings')?.click()}));
  return taxes;
}
document.getElementById('navigate-taxes')?.addEventListener('click',openTaxesTool);

// A panel tool reached from anywhere other than its own menu row — the strip
// under the header — has to be built the same way its row would build it.
let attention=null,subscriptions=null;
export function openSubscriptionsTool(){
  const root=document.getElementById('subscriptions-tool');
  if(!root)return null;
  subscriptions??=import('./subscriptions-page.js').then(({mountExtensionSubscriptions})=>mountExtensionSubscriptions(root,{onSettings:()=>document.getElementById('open-settings')?.click()}));
  return subscriptions;
}
export function openAttentionTool(){
  const root=document.getElementById('attention-tool');
  if(!root)return null;
  attention??=import('./attention-page.js').then(({mountExtensionAttention})=>mountExtensionAttention(root,{onSettings:()=>document.getElementById('open-settings')?.click(),onOpen:async id=>{
    // Everything attention can point at lives in the panel, so going there is
    // selecting it here rather than opening a tab beside the page it is about.
    const item=CAPABILITIES.find(c=>c.id===id);
    if(PANEL_TOOLS[id]||item&&!item.href){
      const {selectCapability}=await import('./navigation.js');selectCapability(id);await openPanelTool(id);
    }else if(globalThis.chrome?.tabs?.create)chrome.tabs.create({url:chrome.runtime.getURL(item.href)});
    else location.assign(item.href);
  }}));
  attention.then(tool=>tool.refresh());
  return attention;
}
document.getElementById('navigate-attention')?.addEventListener('click',openAttentionTool);
document.getElementById('navigate-subscriptions')?.addEventListener('click',openSubscriptionsTool);
// The rest of the panel tools, each built on first use and each mounted into
// the section the panel already holds for it. One shape, because the only thing
// that differs between them is which module does the mounting.
const settings=()=>document.getElementById('open-settings')?.click();
const panelTool=(id,load)=>{
  let tool=null;
  const open=()=>{
    const root=document.getElementById(`${id}-tool`);
    if(!root)return null;
    tool??=load(root,{onSettings:settings});
    return tool;
  };
  document.getElementById(`navigate-${id}`)?.addEventListener('click',open);
  return open;
};
export const openGiftsTool=panelTool('gifts',(root,options)=>import('./gifts-page.js').then(({mountExtensionGifts})=>mountExtensionGifts(root,options)));
export const openSizesTool=panelTool('sizes',(root,options)=>import('./sizes-page.js').then(({mountExtensionSizes})=>mountExtensionSizes(root,options)));
export const openReplacementsTool=panelTool('replacements',(root,options)=>import('./replacements-page.js').then(({mountExtensionReplacements})=>mountExtensionReplacements(root,options)));
export const openRemindersTool=panelTool('reminders',(root,options)=>import('./reminders-page.js').then(({mountExtensionReminders})=>mountExtensionReminders(root,options)));
export const openCardsTool=panelTool('cards',(root,options)=>import('./cards-page.js').then(({mountExtensionCards})=>mountExtensionCards(root,options)));
export const openAdvisorTool=panelTool('advisor',(root,options)=>import('./advisor-page.js').then(({mountExtensionAdvisor})=>mountExtensionAdvisor(root,options)));
export const openPersonalTool=panelTool('personal',(root,options)=>import('./personal-page.js').then(({mountExtensionPersonal})=>mountExtensionPersonal(root,options)));
export const openHealthTool=panelTool('health',(root,options)=>import('./health-page.js').then(({mountExtensionHealth})=>mountExtensionHealth(root,options)));

const PANEL_TOOLS={attention:openAttentionTool,subscriptions:openSubscriptionsTool,travel:mountTravelTool,finance:openFinanceTool,taxes:openTaxesTool,
  gifts:openGiftsTool,sizes:openSizesTool,replacements:openReplacementsTool,reminders:openRemindersTool,cards:openCardsTool,advisor:openAdvisorTool,personal:openPersonalTool,health:openHealthTool};
export const openPanelTool=id=>PANEL_TOOLS[id]?.()??null;

// Standalone settings/data pages use the same data registry in the shared formatted picker.
const {CAPABILITIES}=await import('./capabilities.js');
const picker=document.getElementById('capability-picker');
picker?.addEventListener('change',()=>{
  const capability=CAPABILITIES.find(c=>c.id===picker.value);
  if(capability){
    if(globalThis.chrome?.tabs?.create&&location.protocol==='chrome-extension:')chrome.tabs.create({url:chrome.runtime.getURL(capability.href)});
    else location.assign(capability.href);
  }
  picker.value='';
});
