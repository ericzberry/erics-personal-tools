// Reconnect Gmail tabs that were already open when the extension was installed/updated.
export function gmailConnection(chromeApi){
  const pending=new Map(),lastAttempt=new Map();
  const send=id=>chromeApi.tabs.sendMessage(id,{type:'READ_CURRENT_EMAIL'});
  async function recover(id){
    const tab=await chromeApi.tabs.get(id);
    if(!tab?.url || new URL(tab.url).origin!=='https://mail.google.com')throw Error('Open a message in Gmail.');
    const now=Date.now();
    if(now-(lastAttempt.get(id)||0)<10000)throw Error('Gmail connection unavailable. Check the extension’s site access, then try Refresh.');
    lastAttempt.set(id,now);
    if(lastAttempt.size>50)lastAttempt.delete(lastAttempt.keys().next().value);
    await chromeApi.scripting.executeScript({target:{tabId:id},files:['src/gmail-reader.js','src/gmail-content.js']});
    return send(id);
  }
  return async id=>{
    try{return await send(id);}catch{
      if(!pending.has(id))pending.set(id,recover(id).finally(()=>pending.delete(id)));
      return pending.get(id);
    }
  };
}
