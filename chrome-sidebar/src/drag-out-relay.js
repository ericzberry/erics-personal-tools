// The page half of handing a document out of the side panel; drag-out.js is
// the other half and says why there are two.
//
// Put into the page beside the panel each time a drag starts there. It lets
// the page accept that drag anywhere, catches the drop, asks the panel for the
// document the drag stands for, and drops it again where the pointer let go —
// this time as a real file, which is what the page's upload box is waiting for.
// A classic script: it is injected, not imported.
(()=>{
  // A relay left from before the extension was reloaded can no longer reach
  // the panel, so each injection replaces the last rather than deferring to it.
  globalThis.ericsToolsDragOut?.();
  const TYPE='application/x-erics-tools-file';
  const REQUEST='erics-tools/drag-out',RESULT='erics-tools/drag-out-result';
  const ours=event=>[...(event.dataTransfer?.types||[])].includes(TYPE);

  // Many pages take only a drag that carries files, and this one carries an id
  // until it lands. So it is allowed here, first, and again last, after the
  // page's own handlers have had their say.
  const allow=event=>{
    if(!ours(event))return;
    event.preventDefault();
    try{event.dataTransfer.dropEffect='copy';}catch{}
  };
  const bytes=data=>{
    const text=atob(data),out=new Uint8Array(text.length);
    for(let at=0;at<text.length;at++)out[at]=text.charCodeAt(at);
    return out;
  };
  // A page's upload field nearest to where the drop landed.
  const fieldNear=node=>{
    for(let at=node;at&&at!==document.documentElement;at=at.parentElement){
      const field=at.matches('input[type=file]:not([disabled])')?at:at.querySelector('input[type=file]:not([disabled])');
      if(field)return field;
    }
    return null;
  };
  // The drop the page would have had from the desktop. A page that handles it
  // cancels it, as every real drop handler must or the browser would open the
  // file in its place; a spot with no handler but an upload field near it is
  // given the file through the field, the way choosing it would.
  const deliver=(target,file,at)=>{
    const transfer=new DataTransfer();
    transfer.items.add(file);
    const fire=type=>target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,composed:true,dataTransfer:transfer,...at}));
    fire('dragenter');fire('dragover');
    if(!fire('drop'))return true;
    const field=fieldNear(target);
    if(!field)return false;
    field.files=transfer.files;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  };
  const tell=message=>{try{return chrome.runtime.sendMessage(message);}catch(error){return Promise.reject(error);}};
  const drop=async event=>{
    if(!ours(event))return;
    // The page never sees this drop: it holds no file, only the id.
    event.preventDefault();event.stopImmediatePropagation();
    const id=event.dataTransfer.getData(TYPE);
    const target=(event.composedPath?.()||[event.target]).find(node=>node instanceof Element)||document.body;
    const at={clientX:event.clientX,clientY:event.clientY,screenX:event.screenX,screenY:event.screenY};
    const root=document.documentElement,cursor=root.style.cursor;
    root.style.cursor='progress';
    let accepted=false,error='';
    try{
      const reply=await tell({type:REQUEST,id});
      if(!reply?.ok)throw Error(reply?.error||'The side panel did not hand the document over.');
      accepted=deliver(target,new File([bytes(reply.data)],reply.name,{type:reply.type}),at);
    }catch(failure){error=failure?.message||String(failure);}
    finally{root.style.cursor=cursor;}
    tell({type:RESULT,id,accepted,error}).catch(()=>{});
  };

  const listeners=[['dragenter',allow,true],['dragenter',allow,false],['dragover',allow,true],['dragover',allow,false],['drop',drop,true]];
  for(const [type,handler,capture] of listeners)addEventListener(type,handler,capture);
  globalThis.ericsToolsDragOut=()=>{for(const [type,handler,capture] of listeners)removeEventListener(type,handler,capture);};
})();
