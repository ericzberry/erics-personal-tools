// Keep the native select as the controller/form data source; render one shared picker.
export function FormattedSelect(select, label='') {
  const doc=select.ownerDocument;
  const make=(tag,props={})=>{const node=doc.createElement(tag);for(const [key,value] of Object.entries(props))node.setAttribute(key,value);return node;};
  const root=make('div',{class:'formatted-select'});
  const trigger=make('button',{id:`${select.id}-trigger`,type:'button',class:'formatted-select-trigger',role:'combobox','aria-haspopup':'listbox','aria-expanded':'false','aria-controls':`${select.id}-list`});
  trigger.setAttribute('aria-label',label||'Choose an option');
  const value=make('span');trigger.append(value);
  const list=make('div',{id:`${select.id}-list`,class:'formatted-select-list',role:'listbox',popover:'manual','aria-label':label||'Options'});
  select.hidden=true;select.setAttribute('aria-hidden','true');select.tabIndex=-1;
  root.append(select,trigger,list);list.hidden=true;
  let active=-1,opened=false,search='',lastKey=0,removalObserver=null;
  const options=()=>Array.from(select.options);
  const enabled=()=>options().map((o,i)=>!o.disabled&&!o.parentElement?.disabled?i:-1).filter(i=>i>=0);
  const selected=()=>options().findIndex(o=>o.selected);
  function sync(){
    const entries=options();value.textContent=entries[selected()]?.textContent||'Choose an option';
    trigger.disabled=select.disabled||!enabled().length;
    for(const name of ['aria-describedby','aria-invalid','aria-required']){const attribute=select.getAttribute(name);if(attribute!==null)trigger.setAttribute(name,attribute);else trigger.removeAttribute(name);}
    if(trigger.disabled)close();
    if(opened){if(!enabled().includes(active))active=enabled()[0]??-1;render();}
  }
  function render(){
    list.replaceChildren(...options().map((option,i)=>{
      const row=make('div',{id:`${select.id}-option-${i}`,role:'option','aria-selected':String(i===selected()),'aria-disabled':String(!enabled().includes(i)),class:`formatted-select-option${i===active?' is-active':''}`});
      row.textContent=option.textContent;
      row.addEventListener('pointerdown',event=>event.preventDefault());
      row.addEventListener('click',()=>commit(i));return row;
    }));
    if(active>=0){trigger.setAttribute('aria-activedescendant',`${select.id}-option-${active}`);list.children[active]?.scrollIntoView?.({block:'nearest'});}
  }
  function position(){
    if(!opened||!list.showPopover)return;
    const box=trigger.getBoundingClientRect(),height=doc.defaultView.innerHeight;
    const below=height-box.bottom-8,above=box.top-8,up=below<180&&above>below;
    Object.assign(list.style,{left:`${Math.max(8,box.left)}px`,width:`${Math.min(box.width,doc.defaultView.innerWidth-16)}px`,maxHeight:`${Math.max(44,Math.min(280,up?above:below))}px`,top:up?'auto':`${box.bottom+4}px`,bottom:up?`${height-box.top+4}px`:'auto'});
  }
  function outside(event){if(!root.contains(event.target))close();}
  function close(){
    if(!opened)return;opened=false;search='';
    if(list.hidePopover&&list.matches(':popover-open'))list.hidePopover();
    list.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');
    removalObserver?.disconnect();removalObserver=null;
    doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('scroll',position,true);doc.defaultView.removeEventListener('resize',position);
  }
  function open(){
    if(trigger.disabled||opened)return;opened=true;active=enabled().includes(selected())?selected():enabled()[0]??-1;
    list.hidden=false;trigger.setAttribute('aria-expanded','true');render();list.showPopover?.();position();
    if(doc.defaultView.MutationObserver&&root.isConnected){removalObserver=new doc.defaultView.MutationObserver(()=>{if(!root.isConnected)close();});removalObserver.observe(doc.documentElement,{childList:true,subtree:true});}
    doc.addEventListener('pointerdown',outside,true);doc.addEventListener('scroll',position,true);doc.defaultView.addEventListener('resize',position);
  }
  function commit(index){
    if(!enabled().includes(index))return;
    const changed=selected()!==index;select.value=options()[index].value;close();sync();trigger.focus();
    if(changed)for(const type of ['input','change'])select.dispatchEvent(new doc.defaultView.Event(type,{bubbles:true}));
  }
  trigger.addEventListener('click',()=>opened?close():open());
  trigger.addEventListener('blur',close);
  trigger.addEventListener('keydown',event=>{
    const {key}=event,indices=enabled();
    if(key==='Tab'){close();return;}
    if(key==='Escape'){if(opened){event.preventDefault();close();}return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(key)){
      event.preventDefault();const wasOpen=opened;open();
      if(key==='Home')active=indices[0];else if(key==='End')active=indices.at(-1);else if(wasOpen)active=indices[Math.max(0,Math.min(indices.length-1,indices.indexOf(active)+(key==='ArrowDown'?1:-1)))];
      render();return;
    }
    if(key==='Enter'||key===' '){event.preventDefault();if(opened)commit(active);else open();return;}
    if(key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();if(Date.now()-lastKey>700)search='';lastKey=Date.now();search+=key.toLowerCase();open();
      const match=indices.find(i=>options()[i].textContent.trim().toLowerCase().startsWith(search));if(match!==undefined){active=match;render();}
    }
  });
  // Controllers assign values and replace options without dispatching change events.
  for(const key of ['value','selectedIndex','disabled']){
    let proto=Object.getPrototypeOf(select),descriptor;
    while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,key);proto=Object.getPrototypeOf(proto);}
    if(descriptor?.set&&descriptor?.get)Object.defineProperty(select,key,{configurable:true,get(){return descriptor.get.call(this);},set(next){descriptor.set.call(this,next);sync();}});
  }
  const Observer=doc.defaultView.MutationObserver;
  if(Observer)new Observer(sync).observe(select,{childList:true,subtree:true,attributes:true,characterData:true});
  select.addEventListener('change',sync);
  sync();return root;
}

// Editable model IDs keep free text while suggestions use the same formatted menu.
export function FormattedSuggestions(input,sourceId,label){
  const doc=input.ownerDocument,root=doc.createElement('div'),list=doc.createElement('div');
  root.className='formatted-select';list.className='formatted-select-list';list.id=`${input.id}-suggestions`;
  list.setAttribute('role','listbox');list.setAttribute('aria-label',`${label} suggestions`);list.setAttribute('popover','manual');list.hidden=true;
  input.removeAttribute('list');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',list.id);input.setAttribute('autocomplete','off');
  root.append(input,list);let active=-1,entries=[];
  function outside(event){if(!root.contains(event.target))close();}
  function scrolled(event){if(!list.contains(event.target))close();}
  function close(){if(list.hidePopover&&list.matches(':popover-open'))list.hidePopover();list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('scroll',scrolled,true);doc.defaultView.removeEventListener('resize',close);}
  function choose(index){if(!entries[index])return;input.value=entries[index].value;close();for(const type of ['input','change'])input.dispatchEvent(new doc.defaultView.Event(type,{bubbles:true}));close();input.focus();}
  function render(){
    entries=Array.from(doc.getElementById(sourceId)?.querySelectorAll('option')||[]).filter(option=>!option.disabled&&option.value.toLowerCase().includes(input.value.toLowerCase()));
    if(!entries.length||input.disabled){close();return;}
    if(active>=entries.length)active=-1;
    list.replaceChildren(...entries.map((option,index)=>{const row=doc.createElement('div');row.className=`formatted-select-option${index===active?' is-active':''}`;row.id=`${list.id}-${index}`;row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.value===input.value));row.textContent=option.label||option.value;row.addEventListener('pointerdown',event=>event.preventDefault());row.addEventListener('click',()=>choose(index));return row;}));
    list.hidden=false;doc.addEventListener('pointerdown',outside,true);doc.addEventListener('scroll',scrolled,true);doc.defaultView.addEventListener('resize',close);input.setAttribute('aria-expanded','true');if(list.showPopover&&!list.matches(':popover-open'))list.showPopover();
    if(list.showPopover){const box=input.getBoundingClientRect(),height=doc.defaultView.innerHeight,below=height-box.bottom-8,up=below<180&&box.top>below;Object.assign(list.style,{left:`${Math.max(8,box.left)}px`,width:`${Math.min(box.width,doc.defaultView.innerWidth-16)}px`,maxHeight:`${Math.max(44,Math.min(280,up?box.top-8:below))}px`,top:up?'auto':`${box.bottom+4}px`,bottom:up?`${height-box.top+4}px`:'auto'});}
    if(active>=0){input.setAttribute('aria-activedescendant',`${list.id}-${active}`);list.children[active]?.scrollIntoView?.({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  input.addEventListener('input',()=>{active=-1;render();});input.addEventListener('click',()=>{active=-1;render();});input.addEventListener('blur',close);
  input.addEventListener('keydown',event=>{
    if((event.key==='Home'||event.key==='End')&&!list.hidden){event.preventDefault();active=event.key==='Home'?0:entries.length-1;render();}
    else if(event.key==='Escape'){if(!list.hidden)event.preventDefault();close();}
    else if(event.key==='Tab')close();
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();render();active=Math.max(0,Math.min(entries.length-1,active+(event.key==='ArrowDown'?1:-1)));render();}
    else if(event.key==='Enter'&&!list.hidden&&active>=0){event.preventDefault();choose(active);}
  });
  return root;
}
