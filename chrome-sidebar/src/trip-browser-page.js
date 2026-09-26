// Runs only in a tab opened by Travel planning. No credentials or input values
// are read. Actions name one observed control and must still match on execution.
export function tripBrowserPage(action=null){
  const visible=e=>!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';
  const forbidden=/password|passcode|verification|one.time|security.code|credit.card|card.number|payment|email|user.?name/i;
  const nodes=[...document.querySelectorAll('a[href],button,input,select,[role="button"],[role="option"],[role="tab"],[role="combobox"],[role="spinbutton"]')].filter(visible).slice(0,100);
  const describe=(e,index)=>({index,tag:e.tagName.toLowerCase(),role:e.getAttribute('role')||'',type:e.type||'',label:(e.getAttribute('aria-label')||e.labels?.[0]?.innerText||e.innerText||e.placeholder||e.name||'').trim().slice(0,180),href:e.tagName==='A'?e.href:'',disabled:!!e.disabled,options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,label:o.text})).slice(0,40):undefined});
  const controls=nodes.map(describe).filter(c=>!forbidden.test(`${c.type} ${c.label}`));
  const formControls=[...document.querySelectorAll('input')].filter(visible);
  const locked=formControls.some(e=>e.type==='password')||/verify you are human|unusual traffic|complete the captcha/i.test(document.body?.innerText||'');
  const checkout=formControls.some(e=>/cc-number|cc-csc/.test(e.autocomplete||''))||/\/checkout|\/payment|\/purchase|\/confirmation/i.test(location.pathname);
  if(action){
    if(locked||checkout)throw Error('This page needs your attention.');
    const e=nodes[action.control?.index],actual=e?describe(e,action.control.index):null;
    if(!actual||JSON.stringify(actual)!==JSON.stringify(action.control)||actual.disabled)throw Error('The page changed. Read it again before acting.');
    if(forbidden.test(`${actual.type} ${actual.label}`))throw Error('Sign-in requires browser autofill.');
    const bad=/confirm|pay\b|purchase|reserv|book(?:ing)?\b|buy\b|order|checkout|complete|submit|cancel.*(?:trip|booking)|delete|sign.?out|log.?out|subscribe/i;
    if(action.type==='fill'){
      if(!['input','select'].includes(actual.tag)||!(/search|destination|where|city|location|check.?in|check.?out|arrival|departure|adult|child|age|guest|room|date|flight|from|to|return|promo/i.test(actual.label)||['search','date','number'].includes(actual.type)))throw Error('This is not a travel search field.');
      if(typeof action.value!=='string'||action.value.length>500)throw Error('Invalid search value.');
      if(actual.tag==='select'){
        if(!actual.options.some(o=>o.value===action.value))throw Error('Choose an observed option.');
        e.value=action.value;
      }else{
        if(!['text','search','date','number',''].includes(actual.type))throw Error('Unsupported search field.');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,action.value);
      }
      e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
    }else if(action.type==='click'){
      if(actual.tag==='a')throw Error('Links must be opened by the browser adapter.');
      if(bad.test(actual.label)||!(actual.role==='option'||/destination|where|hotel|flight|search|find|check availability|show|apply|filter|guest|room|adult|child|date|calendar|next|previous|done|close|accept.*cookie|reject|^\d{1,2}$|^(mon|tue|wed|thu|fri|sat|sun)|january|february|march|april|may|june|july|august|september|october|november|december|^[+−-]$/i.test(actual.label)))throw Error('This control is outside travel search.');
      e.click();
    }else throw Error('Unsupported browser action.');
    return {acted:true};
  }
  if(locked||checkout)return {url:location.href,title:document.title,text:'',controls:[],attentionKind:checkout?'blocked':'login',attention:locked?'Complete sign-in or verification in this tab. If Apple Passwords is locked, unlock it on your Mac.':'Review the checkout yourself; research stops before booking.'};
  while(JSON.stringify(controls).length>14000)controls.pop();
  return {url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,10000),controls};
}
