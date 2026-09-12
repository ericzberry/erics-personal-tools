// Shared file picker/drop behavior. Parsing and persistence belong to the caller.

// A file dragged out of a mail message is usually not a file yet. Gmail and
// others hand over Chrome's `DownloadURL` instead — a type, a name and a URL,
// which only becomes bytes if something fetches it. Without this, dropping an
// attachment straight from an open message looks like dropping nothing at all.
//
// The fetch carries the session's cookies, because an attachment URL resolves
// only for the signed-in reader. The URL comes from the page the drag started
// in, so this runs on a deliberate drag by the owner and never on its own.
async function promisedFile(spec, maxBytes, fetcher = globalThis.fetch) {
  const [type, name, ...rest] = String(spec).split(':');
  const url = rest.join(':');
  const unreadable = Error('That attachment could not be read from the message. Save it to your computer first, then drop the file.');
  if (!/^https:\/\//i.test(url)) throw unreadable;
  let response;
  try { response = await fetcher(url, {credentials: 'include', cache: 'no-store', redirect: 'follow'}); }
  catch { throw unreadable; }
  if (!response.ok) throw unreadable;
  const declared = Number(response.headers?.get?.('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw Error(`That attachment is ${(declared / 1000000).toFixed(1)} MB. The limit is ${maxBytes / 1000000} MB.`);
  const blob = await response.blob();
  return new File([blob], name || 'attachment', {type: blob.type || type || 'application/octet-stream'});
}

export function attachFileDrop({zone,input,status,onFile,accept=['.xlsx','.json'],maxBytes=5000000,fetcher=globalThis.fetch}) {
  let busy=false;
  async function receive(dropped) {
    if(busy)return;
    try {
      busy=true;zone.setAttribute('aria-busy','true');status.dataset.state='';
      // A promised attachment has to be fetched before anything can be checked
      // about it, so say what is happening rather than appearing to stall.
      let files=dropped;
      if(typeof dropped==='string'){
        status.textContent='Getting the attachment…';
        files=[await promisedFile(dropped,maxBytes,fetcher)];
      }
      if(files.length!==1)throw Error('Drop one file at a time.');
      const file=files[0];
      if(!accept.some(ext=>file.name.toLowerCase().endsWith(ext)))throw Error(`Use ${accept.join(' or ')}.`);
      if(file.size>maxBytes)throw Error(`File is too large (${maxBytes/1000000} MB maximum).`);
      status.textContent='Reading file…';
      const message=await onFile(file);status.textContent=message||'Imported.';status.dataset.state='success';
    } catch(error) {status.textContent=error.message;status.dataset.state='error';}
    finally {busy=false;zone.removeAttribute('aria-busy');input.value='';}
  }
  zone.addEventListener('click',()=>{if(!busy)input.click();});
  input.addEventListener('change',()=>{if(input.files.length)receive([...input.files]);});
  zone.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';zone.classList.add('dragging');});
  zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('dragging');});
  zone.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();zone.classList.remove('dragging');
    const files=[...(e.dataTransfer?.files||[])];
    if(files.length)return receive(files);
    // Read synchronously: the transfer is emptied the moment this handler returns.
    const promised=e.dataTransfer?.getData?.('DownloadURL')||'';
    receive(promised?promised:files);
  });
  return {receive};
}
