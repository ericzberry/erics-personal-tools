// Shared file picker/drop behavior. Parsing and persistence belong to the caller.
export function attachFileDrop({zone,input,status,onFile,accept=['.xlsx','.json'],maxBytes=5000000}) {
  let busy=false;
  async function receive(files) {
    if(busy)return;
    try {
      if(files.length!==1)throw Error('Drop one file at a time.');
      const file=files[0];
      if(!accept.some(ext=>file.name.toLowerCase().endsWith(ext)))throw Error(`Use ${accept.join(' or ')}.`);
      if(file.size>maxBytes)throw Error('File is too large (5 MB maximum).');
      busy=true;zone.setAttribute('aria-busy','true');status.textContent='Reading file…';status.dataset.state='';
      const message=await onFile(file);status.textContent=message||'Imported.';status.dataset.state='success';
    } catch(error) {status.textContent=error.message;status.dataset.state='error';}
    finally {busy=false;zone.removeAttribute('aria-busy');input.value='';}
  }
  zone.addEventListener('click',()=>{if(!busy)input.click();});
  input.addEventListener('change',()=>{if(input.files.length)receive([...input.files]);});
  zone.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';zone.classList.add('dragging');});
  zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('dragging');});
  zone.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('dragging');receive([...e.dataTransfer.files]);});
  return {receive};
}
