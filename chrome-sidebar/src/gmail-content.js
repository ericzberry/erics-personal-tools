// Re-injection replaces the listener rather than accumulating message handlers.
if(globalThis.ericsGmailListener)chrome.runtime.onMessage.removeListener(globalThis.ericsGmailListener);
globalThis.ericsGmailListener=(message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || message?.type!=='READ_CURRENT_EMAIL')return;
  try{respond({email:GmailReader.read(document,location.href)});}
  catch{respond({error:'Could not read this message. Expand it and try Refresh.'});}
};
chrome.runtime.onMessage.addListener(globalThis.ericsGmailListener);
