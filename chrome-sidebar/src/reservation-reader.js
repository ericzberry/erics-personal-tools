// Runs in an isolated content-script world. Reads rendered booking content only.
// Never clicks a slot, submits a form, reads cookies, or reads application state.
// Every control says which region of the page it sits in, because a time
// printed outside the reservation widget — opening hours, a time-of-day
// search selector — is not a table (docs/RESTAURANT_SEARCH_SPEC.md §7.1).
export function readReservationPage() {
  const visible=el=>!!el && !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden';
  const clean=value=>String(value||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email removed]').replace(/\s+/g,' ').trim();
  const root=document.querySelector('main,[role="main"]')||document.body;
  const boundary=[...root.querySelectorAll('h2,h3')].find(el=>/^(Need to Know|You Might Also Like|Similar restaurants|Recommended restaurants|Nearby restaurants|More restaurants)$/i.test(clean(el.textContent)));
  // The reservation region: the nearest ancestor that names itself as the
  // booking widget, its time list, or a form holding a date and party control.
  const RESERVATION=/reserv|booking|book-|availab|timeslot|time-slot|slot|shift-|seating|experience-list|find-a-time|ReservationList|BookingCalendar|DateSelector|TimeList/i;
  const regionOf=el=>{
    for(let node=el;node&&node!==root;node=node.parentElement){
      const marks=`${node.id||''} ${node.className&&typeof node.className==='string'?node.className:''} ${node.getAttribute('data-testid')||''} ${node.getAttribute('aria-label')||''} ${node.getAttribute('role')||''}`;
      if(RESERVATION.test(marks))return 'reservation';
      if(node.tagName==='FORM'&&node.querySelector('select,input[type="date"],[aria-label*="date" i],[aria-label*="guest" i],[aria-label*="party" i]'))return 'reservation';
      if(/^(NAV|HEADER|FOOTER|ASIDE)$/.test(node.tagName)||/nav|header|footer|menu-|hours|about|reviews|similar|recommend/i.test(node.id||'')&&!RESERVATION.test(node.id||''))return 'other';
    }
    return 'page';
  };
  const ordered=[...root.querySelectorAll('h2,h3,button,a[href],[role="button"],[role="option"],[role="radio"],select,input[type="date"],input[type="time"],input[type="number"],[aria-selected="true"]')];
  const boundaryIndex=ordered.indexOf(boundary);
  const controls=(boundaryIndex<0?ordered:ordered.slice(0,boundaryIndex)).filter(el=>!/^H[23]$/.test(el.tagName)&&visible(el)).slice(0,90).map(el=>{
    const selected=el.tagName==='SELECT'?el.options[el.selectedIndex]:null;
    const caption=el.labels?.[0],label=el.getAttribute('aria-label')||caption?.querySelector('p')?.textContent||caption?.textContent?.replace(el.textContent,'');
    const href=el.tagName==='A'?(()=>{try{const u=new URL(el.href,location.href);return u.protocol==='https:'&&!u.username&&!u.password?u.href.slice(0,400):'';}catch{return '';}})():'';
    return {tag:el.tagName.toLowerCase(),role:el.getAttribute('role')||'',label:clean(label).slice(0,100),name:clean(el.getAttribute('aria-label')||el.getAttribute('title')||'').slice(0,100),text:clean(selected?.textContent||el.innerText||el.textContent).slice(0,160),value:selected?String(selected.value).slice(0,40):['date','time','number'].includes(el.type)?String(el.value):'',href,disabled:!!el.disabled||el.getAttribute('aria-disabled')==='true',selected:el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-pressed')==='true'||el.getAttribute('aria-checked')==='true',region:regionOf(el)};
  });
  while(JSON.stringify(controls).length>20000)controls.pop();
  let text=root.innerText||'';
  if(boundary)text=text.split(boundary.innerText)[0];
  return {url:location.href,title:clean(document.title),heading:clean(root.querySelector('h1')?.textContent),text:clean(text).slice(0,10000),controls,
    loading:!!root.querySelector('[aria-busy="true"],[role="progressbar"]'),capturedAt:new Date().toISOString()};
}
