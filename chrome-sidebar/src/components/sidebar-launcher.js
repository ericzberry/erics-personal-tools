// Shared native Chrome launcher, independent of per-computer shortcuts or IDs.
export function registerSidebarLauncher(browser) {
  const id='open-erics-personal-tools';
  browser.runtime.onInstalled.addListener(()=>{
    browser.contextMenus.removeAll(()=>{
      if(browser.runtime.lastError){console.error(browser.runtime.lastError.message);return;}
      browser.contextMenus.create({id,title:"Open Eric’s Personal Tools",contexts:['all']},()=>{
        if(browser.runtime.lastError)console.error(browser.runtime.lastError.message);
      });
    });
  });
  browser.contextMenus.onClicked.addListener((info,tab)=>{
    if(info.menuItemId!==id||!Number.isInteger(tab?.windowId))return;
    // Call directly during the click event so Chrome retains the user gesture.
    browser.sidePanel.open({windowId:tab.windowId}).catch(console.error);
  });
}
