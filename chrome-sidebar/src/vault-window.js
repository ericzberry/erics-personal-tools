// The passkey check for the side panel, run in a small window of this
// extension's own. Chrome sends a WebAuthn request from the side panel and never
// shows the sheet, so a locked section there waits on a prompt nobody can see;
// an ordinary extension window raises it. The unlocked session belongs to the
// browser (`vaultSessionStore()`), so the panel simply adopts what the window
// opened, and the window closes itself either way.
export const UNLOCK_PAGE='unlock.html';
export const UNLOCK_MESSAGE='vault-unlock-result';
// The passkey request itself gives up after a minute; this only guards against
// a window that never answers at all.
const WAIT_MS=90000;
const canceled=message=>Object.assign(Error(message),{name:'NotAllowedError'});

export function unlockInWindow({windows=globalThis.chrome?.windows,runtime=globalThis.chrome?.runtime,width=360,height=220,waitMs=WAIT_MS}={}){
  if(!windows?.create||!runtime?.onMessage)return null;
  return async()=>{
    const request=crypto.randomUUID();
    // Centred over the browser window the panel belongs to, where the reader is
    // already looking.
    const around=await Promise.resolve(windows.getCurrent?.()).catch(()=>null);
    const placement=around?.width?{left:Math.round(around.left+(around.width-width)/2),top:Math.round(around.top+(around.height-height)/3)}:{};
    return new Promise((resolve,reject)=>{
      let id=null,settled=false;
      const finish=error=>{
        if(settled)return;
        settled=true;clearTimeout(timer);
        runtime.onMessage.removeListener(heard);windows.onRemoved?.removeListener(closed);
        error?reject(error):resolve();
      };
      const heard=message=>{
        if(message?.type!==UNLOCK_MESSAGE||message.request!==request)return;
        finish(message.error?Object.assign(Error(message.error.message||'This section could not be unlocked.'),{name:message.error.name||'Error'}):null);
      };
      const closed=windowId=>{if(windowId===id)finish(canceled('Passkey verification was canceled.'));};
      const timer=setTimeout(()=>{
        finish(canceled('Passkey verification timed out.'));
        if(id!==null)Promise.resolve(windows.remove?.(id)).catch(()=>{});
      },waitMs);
      runtime.onMessage.addListener(heard);windows.onRemoved?.addListener(closed);
      Promise.resolve(windows.create({url:runtime.getURL(`${UNLOCK_PAGE}?request=${request}`),type:'popup',focused:true,width,height,...placement}))
        .then(created=>{id=created?.id??null;},error=>finish(error));
    });
  };
}
