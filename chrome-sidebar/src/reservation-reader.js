// Runs in an isolated content-script world. Reads rendered booking content only.
// Never clicks a slot, submits a form, reads cookies, or reads application state.
export function readReservationPage() {
  const visible=el=>!!el && !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden';
  const clean=value=>String(value||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email removed]').replace(/\s+/g,' ').trim();
  const root=document.querySelector('main,[role="main"]')||document.body;
  const boundary=[...root.querySelectorAll('h2,h3')].find(el=>/^(Need to Know|You Might Also Like|Similar restaurants|Recommended restaurants)$/i.test(clean(el.textContent)));
  const ordered=[...root.querySelectorAll('h2,h3,button,a[href],[role="button"],select,input[type="date"],input[type="time"],input[type="number"],[aria-selected="true"]')];
  const boundaryIndex=ordered.indexOf(boundary);
  const controls=(boundaryIndex<0?ordered:ordered.slice(0,boundaryIndex)).filter(el=>!/^H[23]$/.test(el.tagName)&&visible(el)).slice(0,70).map(el=>{
    const selected=el.tagName==='SELECT'?el.options[el.selectedIndex]:null;
    const caption=el.labels?.[0],label=el.getAttribute('aria-label')||caption?.querySelector('p')?.textContent||caption?.textContent?.replace(el.textContent,'');
    return {tag:el.tagName.toLowerCase(),label:clean(label).slice(0,100),text:clean(selected?.textContent||el.innerText||el.textContent).slice(0,160),value:selected?String(selected.value).slice(0,40):['date','time','number'].includes(el.type)?String(el.value):'',disabled:!!el.disabled||el.getAttribute('aria-disabled')==='true',selected:el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-pressed')==='true'};
  });
  while(JSON.stringify(controls).length>16000)controls.pop();
  let text=root.innerText||'';
  if(boundary)text=text.split(boundary.innerText)[0];
  return {url:location.href,title:clean(document.title),heading:clean(root.querySelector('h1')?.textContent),text:clean(text).slice(0,10000),controls,
    loading:!!root.querySelector('[aria-busy="true"],[role="progressbar"]'),capturedAt:new Date().toISOString()};
}
