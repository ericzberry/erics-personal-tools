// Handing a document from the side panel to the page beside it — a filed K-1
// dragged onto an accountant's upload box.
//
// A file dragged out of an extension page cannot arrive in another page as a
// file. Chrome carries only files that exist on disk from one renderer to the
// next, and a document read from Drive exists only in memory here. So the drag
// carries a one-time id instead, and `drag-out-relay.js`, put into the page
// beside the panel as the drag starts, catches the drop, asks this page for
// the document the id stands for, and drops it again where the pointer let go —
// as a real file, the way one dragged from the desktop arrives.
//
// The document is fetched the moment the drag starts, so it is usually here
// before the pointer reaches the page. It is handed over once, to the page it
// was dropped on, and then forgotten.
//
// The relay is a classic script with no imports, so it spells these three
// names itself; drag-out.test.js holds the two copies together.
export const DRAG_OUT_TYPE='application/x-erics-tools-file';
export const DRAG_OUT_REQUEST='erics-tools/drag-out';
export const DRAG_OUT_RESULT='erics-tools/drag-out-result';
export const DRAG_OUT_RELAY='src/drag-out-relay.js';
// Long enough for a slow drop across two windows, short enough that a drag
// that went nowhere does not keep a document in memory.
const KEEP_MS=120000;

// Extension messaging carries JSON, so the bytes travel as base64. Built in
// slices: one String.fromCharCode over a whole document overflows the stack.
export async function toBase64(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  let text='';
  for(let at=0;at<bytes.length;at+=0x8000)text+=String.fromCharCode(...bytes.subarray(at,at+0x8000));
  return btoa(text);
}

// Returns the dragstart handler, or null where there is no page beside this
// one to hand anything to.
export function dragOut(chromeApi=globalThis.chrome){
  const {scripting,runtime,tabs}=chromeApi||{};
  if(!scripting?.executeScript||!runtime?.onMessage||!tabs?.query)return null;
  const pending=new Map();
  const forget=id=>{clearTimeout(pending.get(id)?.timer);pending.delete(id);};

  runtime.onMessage.addListener((message,sender,respond)=>{
    const entry=message?.id?pending.get(message.id):null;
    // Only a drag this page started, answered only to a page's relay.
    if(!entry||!sender?.tab)return;
    if(message.type===DRAG_OUT_REQUEST){
      if(entry.taken){respond({ok:false,error:'That document was already handed over.'});return;}
      entry.taken=true;
      entry.file.then(async file=>respond({ok:true,name:file.name,type:file.type,data:await toBase64(file)}))
        .catch(error=>respond({ok:false,error:error.message}));
      return true;
    }
    if(message.type===DRAG_OUT_RESULT){
      forget(message.id);
      entry.onResult?.({accepted:!!message.accepted,error:String(message.error||'')});
    }
  });

  const arm=tabId=>Promise.resolve(scripting.executeScript({target:{tabId,allFrames:true},files:[DRAG_OUT_RELAY]}))
    .then(()=>true,()=>false);

  return (event,{read,onResult})=>{
    const transfer=event?.dataTransfer;
    if(!transfer)return;
    const id=crypto.randomUUID();
    // Only the id: a link row would otherwise carry its Drive address, which
    // a page that is not listening opens in place of itself.
    transfer.clearData();
    transfer.setData(DRAG_OUT_TYPE,id);
    transfer.effectAllowed='copy';
    // The row itself under the pointer, rather than Chrome's picture of a link.
    const row=event.currentTarget||event.target;
    if(row?.nodeType===1)transfer.setDragImage?.(row,event.offsetX||0,event.offsetY||0);
    const file=Promise.resolve().then(read);
    file.catch(()=>{}); // reported to the page that asks for it, not before
    const entry={file,onResult,taken:false,timer:setTimeout(()=>forget(id),KEEP_MS)};
    pending.set(id,entry);
    // The page beside the panel, and any tab the drag is carried to across the
    // tab strip, since hovering a tab brings it forward mid-drag.
    const armed=Promise.resolve(tabs.query({active:true,currentWindow:true}))
      .then(([tab]=[])=>tab?arm(tab.id):false).catch(()=>false);
    const brought=({tabId})=>{arm(tabId);};
    tabs.onActivated?.addListener(brought);
    event.target?.addEventListener?.('dragend',async ended=>{
      tabs.onActivated?.removeListener(brought);
      if(ended.dataTransfer?.dropEffect!=='none'||entry.taken)return;
      // Dropped nowhere that took it. On a page the relay could not reach — the
      // Web Store, a browser page — that is worth saying; anywhere else it was
      // a drag the owner let go of.
      forget(id);
      if(!await armed)onResult?.({accepted:false,error:'This page can’t take files from the side panel.'});
    },{once:true});
  };
}
