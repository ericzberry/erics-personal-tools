import {FinanceView,PortfolioGroup,BreakdownList,TrendTable,FoldReview,CapitalReview,PagePanel,Figure,money,AttachmentCard,positionDetail} from './components/finance.js';
import {RecordRow,Button,RowAction,EDIT_GLYPH,DELETE_GLYPH,HISTORY_GLYPH,Note,Stack,ActionGroup,Option,setStatus} from './components/ui.js';
import {attachFileDrop} from './components/file-drop.js';
import {readStatement,trimForReading,ACCEPTED,MAX_BYTES,MAX_SEND} from './statement-text.js';
import {MAX_PAGE_TEXT} from './finance-page-read.js';
import {normalizeFinance,financeSummary,financeCurrencies,netWorthSeries,groupFinanceRecords,parseFinanceUpdates,foldReadings,portfoliosOf,markRef,portfolioRef,classLabel,registrationLabel,classById,institutionName,signed,foldCapital,holdingsOf,holdingRef,capitalRef,vehicleLabel,vehicleShort,SITE_CLASSES,REGISTRATIONS,VEHICLES} from './finance-data.js';
import {mountVaultGate,vaultReason} from './vault-gate.js';
const today=()=>new Date().toISOString().slice(0,10);

// `readPage` is the host's ability to read the tab the owner is looking at.
// The sidebar sits beside that tab and supplies it; a full tab and the phone
// have no such page, so they pass nothing and the action never appears.
export function mountFinance(root,{credentials,offline,remote,readPage=null,onSettings=()=>{},onChanged=()=>{},vault,quiet:hushed=false}){
  const gate=mountVaultGate(root,{
    id:'finance-vault',title:'Finance',
    // A tool built because the tab beside the panel is a finance page raises no
    // passkey sheet of its own. The mode is settled here rather than a moment
    // after mounting, so the prompt cannot get out first.
    automatic:!hushed,
    ...(vault?{vault}:{}),
    onChange:unlocked=>{unlocked?refresh():clear();}
  });
  gate.content.replaceChildren(FinanceView());
  const $=id=>gate.content.querySelector(`#finance-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0,currency='USD',connection='';
  // What was read, before any of it is saved. A reading is a proposal: the
  // amounts stay editable, and nothing is written by reading. The site panel
  // and a dropped statement produce the same thing — figures already folded
  // into one amount per portfolio and asset class — so they are reviewed the
  // same way and saved by the same path.
  let site=null,snapshot=null,snapshotEditing=false,fold=null,foldEditing=false;
  // Capital account statements read out of the same file, reviewed on their
  // own. A statement is not a figure — it carries a commitment, what has been
  // called against it and what has come back — so it gets a review that shows
  // all four rather than being squeezed into a one-amount row. `investing` is
  // the investment currently open in the second form.
  // A capital account is reviewed in the block the reading came from, so what
  // is under review is beside the thing it was read out of.
  let capital=null,capitalEditing=false,capitalSource='file',investing=null;
  // Arriving because the tab is a finance page is not the owner asking to see
  // what they are worth. Such an arrival is quiet: the intake is ready for what
  // the page in front of them can put into the ledger, and the ledger's own
  // figures are not there to be read over a shoulder until one press asks for
  // them. Asking is remembered for the sitting, and forgotten when the section
  // locks, so the answer is not given again on every bank page.
  let quiet=hushed,engaged=false;
  // A picture has no text to show, so it is held here and described instead.
  // Text out of a dropped file is carried on the attachment and described by
  // its card. An open page is not copied anywhere: it is already in front of
  // the owner.
  let attachment=null;
  const status=(text,target='status',tone='')=>setStatus($(target),text,tone);
  const action=(label,handler,variant='secondary')=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||!loaded});
    button.addEventListener('click',handler);
    return button;
  };
  // A figure's own verbs, named for the figure they would act on: a list of
  // portfolios is read down, and "Edit" repeated under every line is not.
  const rowAction=(glyph,label,handler,danger=false)=>
    RowAction(glyph,label,handler,{danger,disabled:busy||!loaded});
  const toolAction=(label,handler)=>{
    const button=Button(label,{variant:'secondary',size:'compact',disabled:busy});
    button.addEventListener('click',handler);
    return button;
  };
  const portfolios=()=>portfoliosOf(records);
  const portfolioOf=number=>portfolios().find(entry=>entry.number===number)||null;
  const nextPortfolio=()=>Math.max(0,...portfolios().map(entry=>entry.number))+1;
  const holdings=()=>holdingsOf(records);
  const holdingOf=number=>holdings().find(entry=>entry.number===number)||null;
  const nextHolding=()=>Math.max(0,...holdings().map(entry=>entry.number))+1;
  const portfolioChoices=()=>portfolios().map(entry=>({text:`${entry.name} · ${registrationLabel(entry.kind)}`,value:portfolioRef(entry.number)}));

  // The form does two jobs, because they are the same job at two sizes: name a
  // portfolio, or file a figure into one. Which fields are shown says which.
  // The portfolio list is the ledger's own, so the choices are rebuilt from it
  // rather than written out anywhere. The shared formatted select watches its
  // native select for exactly this and re-renders itself.
  function fillPortfolioChoices(selected=''){
    const options=[...portfolios().map(entry=>({text:`${entry.name} · ${registrationLabel(entry.kind)}`,value:portfolioRef(entry.number)})),{text:'Add a portfolio…',value:'new'}];
    $('portfolio').replaceChildren(...options.map(option=>Option(option.text,option.value)));
    $('portfolio').value=options.some(option=>option.value===selected)?selected:options[0].value;
    syncForm();
  }
  function syncForm(){
    const fresh=$('portfolio').value==='new';
    $('portfolio-fields').hidden=!fresh&&editing?.row!=='portfolio';
    $('figure-fields').hidden=editing?.row==='portfolio';
  }
  function clearForm(){
    editing=null;
    fillPortfolioChoices();
    $('name').value='';$('kind').value=String(REGISTRATIONS[0].code);$('currency').value=currency;
    $('class').value=String(classById('cash').code);$('amount').value='';$('asOf').value=today();
    $('editor-title').textContent='New figure';
    syncForm();status('','form-status');
  }
  function fillFigure(mark){
    editing={row:'mark',id:mark.id,revision:mark.revision};
    fillPortfolioChoices(portfolioRef(mark.portfolio));
    $('class').value=String(mark.class);$('amount').value=String(mark.amount);$('asOf').value=mark.asOf;
    $('editor-title').textContent=`Editing ${portfolioOf(mark.portfolio)?.name||''} · ${classLabel(mark.class)}`;
    syncForm();$('editor').open=true;$('amount').focus();
  }
  function fillPortfolio(portfolio){
    editing={row:'portfolio',id:portfolio.id,revision:portfolio.revision,number:portfolio.number};
    fillPortfolioChoices(portfolio.id);
    $('name').value=portfolio.name;$('kind').value=String(portfolio.kind);$('currency').value=portfolio.currency;
    $('editor-title').textContent=`Renaming ${portfolio.name}`;
    syncForm();$('editor').open=true;$('name').focus();
  }

  // The second form: an investment, and the capital account statement that
  // says where it stands. Its portfolio choices are the ledger's own, and it
  // offers no way to invent one — an investment belongs to a portfolio that
  // already exists, and the reading path is what proposes new ones.
  function fillInvestmentPortfolios(selected=''){
    const options=portfolioChoices();
    $('inv-portfolio').replaceChildren(...options.map(option=>Option(option.text,option.value)));
    $('inv-portfolio').value=options.some(option=>option.value===selected)?selected:(options[0]?.value||'');
  }
  function clearInvestmentForm(){
    investing=null;
    fillInvestmentPortfolios();
    $('inv-name').value='';$('inv-vehicle').value=String(VEHICLES[0].code);$('inv-class').value=String(classById('pe').code);
    for(const key of ['inv-commitment','inv-value','inv-funded','inv-returned'])$(key).value='';
    $('inv-asOf').value=today();
    $('inv-title').textContent='New investment';
    status('','inv-status');
  }
  function fillInvestment(position){
    const holding=position.holding,current=position.current;
    investing={number:holding.number,id:holding.id,revision:holding.revision,
      capitalId:current?.id||'',capitalRevision:current?.revision??null};
    fillInvestmentPortfolios(portfolioRef(holding.portfolio));
    $('inv-name').value=holding.name;$('inv-vehicle').value=String(holding.vehicle);$('inv-class').value=String(holding.class);
    $('inv-commitment').value=current?String(current.commitment):'';
    $('inv-value').value=current?String(current.value):'';
    $('inv-funded').value=current?String(current.contributed):'';
    $('inv-returned').value=current?String(current.distributed):'';
    $('inv-asOf').value=current?current.asOf:'';
    $('inv-title').textContent=`Editing ${holding.name}`;
    $('investment').open=true;$('inv-name').focus();
  }

  function renderPosition(){
    const currencies=financeCurrencies(records);
    if(currencies.length&&!currencies.some(entry=>entry.currency===currency))currency=currencies[0].currency;
    $('currency-switch').hidden=currencies.length<2;
    $('currency-switch').replaceChildren(...(currencies.length<2?[]:currencies.map(entry=>{
      const button=Button(`${entry.currency} (${entry.count})`,{variant:entry.currency===currency?'primary':'secondary',size:'compact','aria-pressed':String(entry.currency===currency)});
      button.addEventListener('click',()=>{currency=entry.currency;renderPosition();});
      return button;
    })));
    const summary=financeSummary(records,{currency});
    $('totals').replaceChildren(
      Figure({label:'Net',value:money(summary.net,currency),tone:summary.net<0?'negative':''}),
      Figure({label:'Assets',value:money(summary.assets,currency)}),
      ...(summary.liabilities?[Figure({label:'Liabilities',value:money(summary.liabilities,currency)})]:[]),
      // What is still owed on a commitment is money already spoken for, and it
      // appears only when there is some. It is not a liability — nobody can
      // demand all of it today — so it sits beside the totals rather than in
      // them.
      ...(summary.positions.unfunded?[Figure({label:'Unfunded',value:money(summary.positions.unfunded,currency)})]:[])
    );
    $('stale').hidden=!summary.stale.length;
    $('stale').textContent=summary.stale.length?`${summary.stale.length} portfolio${summary.stale.length===1?'':'s'} not updated in over 90 days — the oldest is ${summary.stale[0].name}${summary.stale[0].asOf?` from ${summary.stale[0].asOf}`:''}. Totals still count ${summary.stale.length===1?'it':'them'} at ${summary.stale.length===1?'its':'their'} last known figure.`:'';
    $('breakdown').replaceChildren(
      // Liquid against illiquid first: it is the question the class list cannot
      // answer on its own, and the one the classes underneath it explain.
      BreakdownList('By liquidity',summary.byGroup,currency),
      BreakdownList('By asset class',summary.byClass,currency),
      BreakdownList('By portfolio',summary.byPortfolio,currency),
      BreakdownList('By registration',summary.byRegistration,currency),
      ...(summary.positions.count?[BreakdownList('Private investments',[
        {label:'Committed',total:summary.positions.committed},
        {label:'Funded',total:summary.positions.contributed},
        {label:'Returned',total:summary.positions.distributed},
        {label:'Unfunded',total:summary.positions.unfunded},
        {label:'Value',total:summary.positions.value}
      ],currency)]:[])
    );
    $('trend').replaceChildren(TrendTable(netWorthSeries(records,{currency}),currency));
    // Currencies are never added together, so say what a total covers.
    $('breakdown-panel').querySelector('summary').textContent=currencies.length>1?`Breakdown · ${currency} only`:'Breakdown';
  }

  function renderAttachment(){
    $('attachment').hidden=!attachment;
    $('attachment').replaceChildren(...(attachment?[AttachmentCard({
      label:attachment.label,detail:attachment.detail,note:attachment.note,
      tone:attachment.tone,onRemove:()=>{attachment=null;renderAttachment();render();}
    })]:[]));
  }
  async function receive(file){
    const result=await readStatement(file);
    if(result.kind==='image'){
      attachment={kind:'image',image:result.image,label:file.name,
        detail:`Image · ${result.image.width}×${result.image.height} · ${Math.round(result.image.bytes/1000)} KB after downscaling on this device`,
        note:'',tone:''};
      renderAttachment();render();
      return 'Ready to read.';
    }
    if(!result.text.trim()){
      attachment=null;renderAttachment();render();
      throw Error(result.note||'Nothing readable came out of that file.');
    }
    const {text,trimmed}=trimForReading(result.text);
    attachment={kind:'text',text,label:file.name,
      detail:`Text pulled out on this device · ${text.length.toLocaleString('en-US')} characters${result.pages?` · ${result.pages} section${result.pages===1?'':'s'}`:''}`,
      note:[result.note,trimmed?`${trimmed.toLocaleString('en-US')} characters past the ${MAX_SEND.toLocaleString('en-US')}-character limit were left out.`:''].filter(Boolean).join(' '),
      tone:result.confidence==='good'?'':'warning'};
    renderAttachment();render();
    return result.confidence==='good'?'Ready to read.':'The text came out unevenly — check the figures carefully before saving them.';
  }

  // Reading is one errand wherever it starts: send what was read, fold what
  // comes back into figures this ledger can hold, and show them. The fold is
  // the device's own arithmetic — AI labels a figure and never adds two
  // together — and it is what keeps a page's dozens of lines from becoming
  // dozens of stored rows.
  async function readInto(token,input,{institution='',siteKind=''}={}){
    const id=await connectionId(token);
    const result=await remote(token,`/v1/ai-connections/${id}/finance-intake`,{method:'POST',value:{today:today(),...input},timeoutMs:130000});
    const parsed=parseFinanceUpdates(result);
    const folded=foldReadings(parsed.readings,portfolios(),{institution,
      defaultClass:classById(SITE_CLASSES[siteKind]||'')?.code??null});
    // A dropped file is one errand, whatever kind of document it turns out to
    // be. The owner should not have to say "this one is a capital account
    // statement" — the reading says which of the two it found, and each is
    // folded by the part of the device that knows how.
    return {...folded,capital:foldCapital(parsed.capital||[],records,{today:today()}),
      unread:parsed.unread,read:parsed.readings.length};
  }
  function renderFold(){
    $('drafts').replaceChildren(...(fold?.rows.length?[FoldReview({
      rows:fold.rows,editing:foldEditing,disabled:busy||!loaded,
      onSave:()=>saveReview('fold'),
      onEdit:()=>{foldEditing=true;renderFold();},
      onDiscard:()=>{fold=null;foldEditing=false;renderFold();status('','intake-status');},
      onAmount:(index,value)=>{fold.rows[index].amount=value;}
    })]:[]));
  }
  function renderCapital(){
    const proposed=capital?.rows.filter(row=>row.portfolioIsNew)
      .map(row=>({text:`${row.portfolioName} · new`,value:String(row.portfolio)}))||[];
    const choices=[...portfolios().map(entry=>({text:`${entry.name} · ${registrationLabel(entry.kind)}`,value:String(entry.number)})),...proposed];
    const into=capitalSource==='page'?'capital-page':'capital-drafts';
    $(capitalSource==='page'?'capital-drafts':'capital-page').replaceChildren();
    $(into).replaceChildren(...(capital?.rows.length?[CapitalReview({
      rows:capital.rows,notes:capital.notes,portfolios:choices,
      editing:capitalEditing,disabled:busy||!loaded,
      onSave:saveCapitalReview,
      onEdit:()=>{capitalEditing=true;renderCapital();},
      onDiscard:()=>{const from=capitalSource;capital=null;capitalEditing=false;renderCapital();status('',from==='page'?'snapshot-status':'intake-status');},
      onField:(index,key,value)=>{
        const row=capital.rows[index];
        // Moving a statement to a portfolio that already exists drops the
        // proposal with it: what was going to be created no longer is.
        if(key==='portfolio'){
          const number=Number(value),existing=portfolios().find(entry=>entry.number===number);
          Object.assign(row,existing
            ?{portfolio:number,portfolioName:existing.name,portfolioKind:existing.kind,portfolioIsNew:false,currency:existing.currency||'USD'}
            :{portfolio:number});
          return;
        }
        row[key]=['vehicle','class'].includes(key)?Number(value):value;
      }
    })]:[]));
  }
  // Whether a reading found anything. It used to say how much — "19 figures
  // read, folded into 3" — under a panel already showing the three, which is
  // the count of what was thrown away dressed up as news. A reading that found
  // something says so by showing it; only one that found nothing needs a line.
  const found=result=>!!(result.marks.length||result.capital.rows.length);
  // Whichever block the reading happened in keeps the review: one statement is
  // under review at a time, and it belongs beside where it came from.
  function showCapital(result,source){
    capital=result.capital.rows.length?{rows:result.capital.rows,notes:result.capital.notes}:null;
    capitalEditing=false;capitalSource=source;renderCapital();
  }
  function showRead(result,target,{none,where='',extra=''}={}){
    fold={rows:result.marks,notes:result.notes};foldEditing=false;renderFold();
    showCapital(result,'file');
    const any=found(result);
    // Anything the reading could not turn into a figure is still worth saying:
    // it is a fact about this page, not an explanation of the panel.
    const say=[any?'':none,extra,result.unread].filter(Boolean).join(' ');
    status(say,target,say?'alert':'');
    return any;
  }
  async function read(){
    const text=attachment?.kind==='text'?attachment.text.trim():'';
    const images=attachment?.kind==='image'?[attachment.image.dataUrl]:[];
    if(!text&&!images.length){status('Drop a statement or read the open page first.','intake-status','alert');return;}
    await run(async token=>{
      status(images.length?'Reading the image…':'Reading…','intake-status','progress');
      const result=await readInto(token,{text,...(images.length?{images}:{})});
      showRead(result,'intake-status',{none:'No figures were found.'});
    },'intake-status');
  }
  // Rebuilt only when the reading itself changes, so editing an amount is not
  // interrupted by an unrelated render. `syncReadings` keeps the controls in
  // step with a busy or disconnected tool without replacing them.
  function renderSnapshot(){
    // The block exists wherever there is a page beside the panel, recognized or
    // not, and its heading is the scope: the site when one is known, the page
    // otherwise. A host with no page beside it — a full tab, the phone — has no
    // such block at all.
    $('page-block').hidden=!readPage;
    if(!readPage){$('snapshot-body').replaceChildren();return;}
    const label=site?.label||'This page';
    $('page-block').querySelector('.settings-group-title').textContent=label;
    $('page-block').setAttribute('aria-label',label);
    $('snapshot-body').replaceChildren(PagePanel({
      site,rows:snapshot?.rows||[],editing:snapshotEditing,disabled:busy||!loaded,
      onRead:readOpenPage,onSave:()=>saveReview('snapshot'),
      onEdit:()=>{snapshotEditing=true;renderSnapshot();},
      onDiscard:()=>{snapshot=null;snapshotEditing=false;renderSnapshot();status('','snapshot-status');},
      onAmount:(index,value)=>{snapshot.rows[index].amount=value;}
    }));
  }
  function syncReadings(){
    for(const node of [...$('page-block').querySelectorAll('button,input,select'),...$('drafts').querySelectorAll('button,input'),
      ...$('capital-drafts').querySelectorAll('button,input,select'),...$('capital-page').querySelectorAll('button,input,select')])node.disabled=busy||!loaded;
  }
  // One press does the whole errand. The page is not copied into a box on the
  // way through: it is open beside the panel, where the owner can see it better
  // than any transcript of it, and what comes back is the readout worth looking
  // at — one figure per portfolio and class, saved only when applied. A
  // recognized site adds what it alone settles; an unrecognized page is read
  // the same way with nothing assumed about it.
  async function readOpenPage(){
    if(!readPage)return;
    await run(async token=>{
      status(site?`Reading your ${site.label} accounts…`:'Reading the accounts on this page…','snapshot-status','progress');
      const page=await readPage();
      // What the site itself settles is settled before folding: the institution
      // decides which portfolio a figure is titled to, and what an account
      // total is made of when the page never says.
      const known=site?{institution:institutionName(site.institution)}:{};
      const result=await readInto(token,{text:page.text,live:true,...known},{...known,siteKind:site?.kind||''});
      snapshot={rows:result.marks,notes:result.notes};snapshotEditing=false;renderSnapshot();
      showCapital(result,'page');
      const any=found(result);
      const say=[any?'':`No account figures were found on ${page.host}.`,
        page.trimmed?`The page was longer than the ${MAX_PAGE_TEXT.toLocaleString('en-US')}-character limit, so the end of it was left out.`:'',
        result.unread].filter(Boolean).join(' ');
      status(say,'snapshot-status',say?'alert':'');
    },'snapshot-status');
  }

  // Saved one row at a time through the same validator and queue as a figure
  // typed by hand: nothing about an AI reading bypasses a check. A portfolio
  // the reading invented is made first, because a figure cannot be filed into
  // one that does not exist. A row that fails leaves itself and the rest in
  // place to be corrected.
  async function saveReview(which){
    const review=which==='snapshot'?snapshot:fold,target=which==='snapshot'?'snapshot-status':'intake-status';
    if(!review?.rows.length)return;
    const made=new Map();
    let saved=0;
    while(review.rows.length){
      const row=review.rows[0];
      if(row.isNew&&!made.has(row.portfolio)){
        const number=made.size?nextPortfolio():row.portfolio;
        if(!await savePortfolio({number,name:row.name,kind:row.kind??1,currency:row.currency||currency},target))break;
        made.set(row.portfolio,number);
      }
      const portfolio=made.get(row.portfolio)??row.portfolio;
      if(!await saveMark({...row,portfolio},target))break;
      review.rows.shift();saved++;
    }
    if(which==='snapshot'){snapshot=review.rows.length?review:null;renderSnapshot();}
    else{fold=review.rows.length?review:null;renderFold();}
    if(!review.rows.length){
      onChanged();
      status(`Saved ${saved} figure${saved===1?'':'s'}.`,target,'success');
    }
  }
  // A capital account statement is saved the same way everything else is:
  // through the same validator and the same offline queue as a figure typed by
  // hand. The portfolio comes first, then the investment, then the statement —
  // a row cannot be filed into something that does not exist yet — and a row
  // that fails leaves itself and the rest in place to be corrected.
  async function saveCapitalReview(){
    if(!capital?.rows.length)return;
    // Reported where the review is, not where capital reviews usually are.
    const target=capitalSource==='page'?'snapshot-status':'intake-status';
    const madePortfolios=new Map(),madeHoldings=new Map();
    let saved=0;
    while(capital.rows.length){
      const row=capital.rows[0];
      let portfolio=row.portfolio;
      if(row.portfolioIsNew){
        if(madePortfolios.has(row.portfolio))portfolio=madePortfolios.get(row.portfolio);
        else{
          portfolio=nextPortfolio();
          if(!await savePortfolio({number:portfolio,name:row.portfolioName,kind:row.portfolioKind??1,currency:row.currency||currency},target))break;
          madePortfolios.set(row.portfolio,portfolio);
        }
      }
      let holding=row.holding;
      if(row.isNew){
        if(madeHoldings.has(row.holding))holding=madeHoldings.get(row.holding);
        else{
          holding=nextHolding();
          if(!await saveHolding({number:holding,portfolio,name:row.name,vehicle:row.vehicle,class:row.class,stated:row.stated},target))break;
          madeHoldings.set(row.holding,holding);
        }
      }
      if(!await saveCapital({holding,asOf:row.asOf,value:row.value,contributed:row.contributed,
        distributed:row.distributed,commitment:row.commitment},target))break;
      capital.rows.shift();saved++;
    }
    if(!capital.rows.length){
      capital=null;capitalEditing=false;onChanged();
      status(`Saved ${saved} capital account${saved===1?'':'s'}.`,target,'success');
    }
    renderCapital();
  }
  function saveHolding(holding,target='inv-status'){
    const id=holdingRef(holding.number),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',
      value:normalizeAndStamp({row:'holding',number:holding.number,portfolio:holding.portfolio,name:holding.name,
        vehicle:holding.vehicle,class:holding.class,stated:holding.stated??0},id,existing)}),target);
  }
  function saveCapital(entry,target='inv-status'){
    const value={row:'capital',holding:entry.holding,asOf:entry.asOf,value:entry.value,
      contributed:entry.contributed,distributed:entry.distributed,commitment:entry.commitment};
    const id=capitalRef(value),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',value:normalizeAndStamp(value,id,existing)}),target);
  }
  function savePortfolio(portfolio,target='form-status'){
    const id=portfolioRef(portfolio.number),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',
      value:normalizeAndStamp({row:'portfolio',number:portfolio.number,name:portfolio.name,kind:portfolio.kind,currency:portfolio.currency},id,existing)}),target);
  }
  function saveMark(mark,target='form-status'){
    const value={row:'mark',portfolio:mark.portfolio,class:mark.class,asOf:mark.asOf,amount:mark.amount};
    const id=markRef(value),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',value:normalizeAndStamp(value,id,existing)}),target);
  }
  const normalizeAndStamp=(value,id,existing)=>({...normalizeFinance(value,existing||{}),id,revision:existing?.revision??null});
  function remove(record,target='status'){
    return run(token=>offline.request(token,`/v1/finance/${record.id}`,{method:'DELETE',value:record}),target);
  }

  // The totals and the ledger, built only when they have been asked for.
  function renderLedger(){
    const groups=groupFinanceRecords(records).filter(group=>(group.portfolio.currency||'USD')===currency);
    const figure=(portfolio,row)=>{
      const mark=row.current;
      const confirm=Stack([Note(`Delete the ${row.label} figure for ${portfolio.name} as of ${mark.asOf}?`),ActionGroup([
        action('Delete from all devices',async()=>{if(await remove(mark))onChanged();},'danger'),
        action('Keep it',()=>{confirm.hidden=true;})
      ],{compact:true})],{hidden:true});
      const past=Stack(row.history.slice(0,8).map(entry=>Note(`${entry.asOf} · ${money(signed(entry),portfolio.currency)}`)),{hidden:true});
      const named=`${row.label} in ${portfolio.name}`;
      const actions=[
        rowAction(EDIT_GLYPH,`Edit ${named}`,()=>fillFigure(mark)),
        ...(row.history.length>1?[rowAction(HISTORY_GLYPH,`Earlier figures for ${named}`,()=>{past.hidden=!past.hidden;})]:[]),
        rowAction(DELETE_GLYPH,`Delete ${named}`,()=>{confirm.hidden=false;},true)
      ];
      // A conflict is a question, not a row verb: it stays in words under the
      // figure that raised it until one of the two answers is chosen.
      const decide=mark.conflict
        ?[ActionGroup(['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(mark.id,choice))),{compact:true})]
        :[];
      // A liability is shown as what it does to the total. Without the sign a
      // mortgage reads like another asset, and only the portfolio's own figure
      // further down would say otherwise.
      const detail=[money(signed(mark),portfolio.currency),row.side==='liability'?'liability':'',`as of ${mark.asOf}`,
        mark.pending?(mark.conflict?'Conflict':mark.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · ');
      return RecordRow({title:row.label,detail,actions,extra:[past,...decide,confirm]});
    };
    // A position reads as what it is: a name, what kind of vehicle it is, what
    // it is worth, and underneath, the three flows the value alone cannot
    // explain. Where the paperwork and the ledger disagree about the kind, the
    // row says so instead of choosing.
    const investment=(portfolio,position)=>{
      const holding=position.holding,current=position.current;
      const confirm=Stack([Note(`Permanently delete “${holding.name}” and every capital account filed for it, from all devices?`),ActionGroup([
        action('Delete investment',async()=>{if(await remove(holding))onChanged();},'danger'),
        action('Keep it',()=>{confirm.hidden=true;})
      ],{compact:true})],{hidden:true});
      const past=Stack(position.history.slice(0,8).map(entry=>Note(
        `${entry.asOf} · ${money(entry.value,portfolio.currency)} · funded ${money(entry.contributed,portfolio.currency)} · returned ${money(entry.distributed,portfolio.currency)}`
      )),{hidden:true});
      const actions=[
        rowAction(EDIT_GLYPH,`Edit ${holding.name}`,()=>fillInvestment(position)),
        ...(position.history.length>1?[rowAction(HISTORY_GLYPH,`Earlier figures for ${holding.name}`,()=>{past.hidden=!past.hidden;})]:[]),
        rowAction(DELETE_GLYPH,`Delete ${holding.name}`,()=>{confirm.hidden=false;},true)
      ];
      const detail=[money(position.value,portfolio.currency),
        current?`as of ${current.asOf}`:'no statement yet',
        holding.pending?'Waiting to sync':''].filter(Boolean).join(' · ');
      // The row's own title already says how it is filed, so the claim gets a
      // line of its own saying only the part the title cannot: what the
      // paperwork calls it. Run into the figures it reads as one of them.
      const notes=[positionDetail(position,portfolio.currency),
        position.disputed?`The statement calls this a ${vehicleLabel(holding.stated)}.`:''];
      return RecordRow({title:`${holding.name} · ${vehicleShort(holding.vehicle)}`,detail,notes,actions,extra:[past,confirm]});
    };
    $('list').replaceChildren(...(groups.length?groups.map(group=>{
      const portfolio=group.portfolio;
      const confirm=Stack([Note(`Permanently delete “${portfolio.name}” and every figure in it, from all devices?`),ActionGroup([
        action('Delete portfolio',async()=>{if(await remove(portfolio))onChanged();},'danger'),
        action('Keep it',()=>{confirm.hidden=true;})
      ],{compact:true})],{hidden:true});
      return PortfolioGroup({
        name:portfolio.name,currency:portfolio.currency,total:group.total,
        meta:[registrationLabel(portfolio.kind),portfolio.pending?(portfolio.conflict?'Conflict':'Waiting to sync'):''].filter(Boolean).join(' · '),
        actions:[rowAction(EDIT_GLYPH,`Rename ${portfolio.name}`,()=>fillPortfolio(portfolio)),
          rowAction(DELETE_GLYPH,`Delete ${portfolio.name}`,()=>{confirm.hidden=false;},true)],
        rows:[...group.rows.map(row=>figure(portfolio,row)),
          ...group.positions.map(position=>investment(portfolio,position)),confirm]
      });
    }):[Note(!loaded?'Connect in Settings to load your ledger.':'No figures yet. Read an account page, drop a statement, or enter one below.')]));
    renderPosition();
  }
  // Not hidden figures: figures that were never put on the page.
  function sealLedger(){
    for(const id of ['currency-switch','totals','breakdown','trend','list'])$(id).replaceChildren();
    $('currency-switch').hidden=true;$('stale').hidden=true;
  }
  function render(){
    // What the ledger holds — the totals and the saved figures — waits to be
    // asked for. Putting a figure in does not: the site reading, the statement,
    // the page reading and a figure typed by hand are all ready.
    $('ledger').hidden=quiet;
    if(quiet)sealLedger();else renderLedger();
    for(const key of ['portfolio','name','kind','currency','class','amount','asOf'])$(key).disabled=busy||!loaded;
    for(const key of ['inv-portfolio','inv-name','inv-vehicle','inv-class','inv-commitment','inv-value','inv-funded','inv-returned','inv-asOf'])$(key).disabled=busy||!loaded;
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;
    $('inv-save').disabled=busy||!loaded;$('inv-cancel').disabled=busy;
    $('read').disabled=busy||!loaded||globalThis.navigator?.onLine===false;
    $('drop').disabled=busy||!loaded;
    // Beside the title, only what applies: a quiet arrival can be asked for the
    // ledger, a loaded one can be refreshed, and one that never loaded needs
    // the connection rather than a dead Refresh.
    //
    // The action is named for the section it opens. "Show position" named
    // neither what it would show nor how much of it, and position already means
    // something narrower here — one investment's capital account, on a row that
    // says Position — so the one button on a quiet arrival read as an offer to
    // open a single holding.
    $('actions').replaceChildren(quiet?toolAction('Show everything you hold',showPosition)
      :loaded?toolAction('Refresh',refresh):toolAction('Connection settings',onSettings));
    syncReadings();
  }

  async function run(operation,target='status'){
    if(busy)return false;
    busy=true;const current=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh before editing.');}
      activeToken=token;
      const result=await operation(token);
      if(current!==generation)return false;
      if(result?.records){records=result.records;loaded=true;status(result.syncMessage||'','status','alert');}
      return true;
    }catch(error){
      if(current!==generation)return false;
      status(vaultReason(error),target,'error');
      return false;
    }finally{busy=false;render();}
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    if(!gate.unlocked())return;
    status('Loading your ledger…','status','progress');
    // The choices are rebuilt from the ledger that just arrived. A selection
    // the owner made while the editor is open is kept; a closed editor goes
    // back to the default, because the placeholder the form starts on — before
    // there are any portfolios to offer — must not become the standing answer
    // once there are.
    if(await run(token=>offline.request(token,'/v1/finance'))){
      fillPortfolioChoices($('editor').open?$('portfolio').value:'');
      fillInvestmentPortfolios($('investment').open?$('inv-portfolio').value:'');
      connectionNote();
    }
  }
  function clear(){
    generation++;records=[];loaded=false;activeToken='';connection='';attachment=null;
    fold=null;foldEditing=false;snapshot=null;snapshotEditing=false;engaged=false;
    capital=null;capitalEditing=false;capitalSource='file';
    clearForm();clearInvestmentForm();renderFold();renderCapital();renderAttachment();renderSnapshot();
    status('','snapshot-status');
    status('Unlock this section with your passkey.','status','alert');
    render();
  }

  // Which saved connection does the reading is not a decision worth putting in
  // front of the owner: connections are managed in Settings, and this tool
  // uses whichever one can answer. The note says only when there is none.
  const usableConnections=async token=>(await remote(token,'/v1/ai-connections')).connections.filter(entry=>entry.hasApiKey);
  async function connectionId(token){
    if(connection)return connection;
    const usable=await usableConnections(token);
    if(!usable.length)throw Error('Save an AI connection in Settings to read a statement or an account page.');
    return connection=usable[0].id;
  }
  async function connectionNote(){
    if(!activeToken||globalThis.navigator?.onLine===false){status('Offline · Add and edit figures by hand; reading a statement or a page needs the internet.','ai-status','alert');return;}
    try{
      const usable=await usableConnections(activeToken);
      connection=usable.find(entry=>entry.id===connection)?.id||usable[0]?.id||'';
      status(usable.length?'':'Save an AI connection in Settings to read a statement or an account page.','ai-status','alert');
    }catch(error){status(error.message,'ai-status','error');}
  }

  $('read').addEventListener('click',read);
  $('intake-clear').addEventListener('click',()=>{fold=null;foldEditing=false;capital=null;capitalEditing=false;capitalSource='file';attachment=null;renderAttachment();renderFold();renderCapital();render();status('','intake-status');status('','file-status');});
  attachFileDrop({zone:$('drop'),input:$('file'),status:$('file-status'),onFile:receive,accept:ACCEPTED,maxBytes:MAX_BYTES});
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('portfolio').addEventListener('change',syncForm);
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      // Renaming a portfolio is the form's other job and saves nothing else.
      if(editing?.row==='portfolio'){
        if(await savePortfolio({number:editing.number,name:$('name').value,kind:Number($('kind').value),currency:$('currency').value})){clearForm();$('editor').open=false;onChanged();}
        return;
      }
      const fresh=$('portfolio').value==='new';
      const number=fresh?nextPortfolio():Number($('portfolio').value.slice(1));
      if(fresh&&!await savePortfolio({number,name:$('name').value,kind:Number($('kind').value),currency:$('currency').value}))return;
      const mark={portfolio:number,class:Number($('class').value),asOf:$('asOf').value,amount:$('amount').value};
      if(!await saveMark(mark))return;
      // A figure moved to another portfolio, class or date is a different row.
      // The one it came from is removed, so an edit cannot leave two.
      const moved=editing&&editing.id!==markRef(normalizeFinance({row:'mark',...mark}));
      if(moved)await remove(records.find(record=>record.id===editing.id)||{id:editing.id,revision:editing.revision});
      clearForm();$('editor').open=false;onChanged();
    }catch(error){status(vaultReason(error),'form-status','error');}
  });
  $('inv-cancel').addEventListener('click',()=>{clearInvestmentForm();$('investment').open=false;});
  $('inv-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const chosen=$('inv-portfolio').value;
      if(!chosen){status('Add a portfolio before recording an investment in it.','inv-status','alert');return;}
      const portfolio=Number(chosen.slice(1));
      const number=investing?.number??nextHolding();
      // A commitment signed this morning has no statement behind it yet, and
      // that is a whole record: the investment is registered and counts as
      // nothing until a figure says otherwise. Figures without the date they
      // are as of are not a record at all — and that is settled before
      // anything is written, so a refused statement does not leave an
      // investment saved behind it.
      const asOf=$('inv-asOf').value.trim();
      const figures=['inv-value','inv-commitment','inv-funded','inv-returned'].map(key=>$(key).value.trim());
      if(!asOf&&figures.some(Boolean)){status('Give the date these figures are as of, or clear them.','inv-status','alert');return;}
      if(!await saveHolding({number,portfolio,name:$('inv-name').value,vehicle:Number($('inv-vehicle').value),
        class:Number($('inv-class').value),stated:holdingOf(number)?.stated??0}))return;
      if(asOf&&!await saveCapital({holding:number,asOf,value:$('inv-value').value||0,
        contributed:$('inv-funded').value||0,distributed:$('inv-returned').value||0,commitment:$('inv-commitment').value||0}))return;
      // A statement moved to another date is a different row. The one it came
      // from is removed, so an edit cannot leave two.
      const moved=investing?.capitalId&&asOf&&investing.capitalId!==capitalRef({holding:number,asOf});
      if(moved)await remove(records.find(record=>record.id===investing.capitalId)||{id:investing.capitalId,revision:investing.capitalRevision},'inv-status');
      clearInvestmentForm();$('investment').open=false;onChanged();
    }catch(error){status(vaultReason(error),'inv-status','error');}
  });
  clearForm();clearInvestmentForm();clear();
  if(gate.unlocked())refresh();
  const reload=()=>{if(gate.unlocked()&&!$('editor').open&&!$('investment').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();if(gate.unlocked())refresh();});
  // One press, and the ledger is the tool it always was. Asking counts as
  // arriving at the section, so a locked vault may raise its prompt again.
  function showPosition(){
    engaged=true;
    if(!quiet)return;
    quiet=false;gate.automatic(true);
    if(loaded)render();else refresh();
  }
  // The host says how the tool was arrived at: quietly, because the tab beside
  // the panel is a finance page, or because the owner chose Finance. Choosing it
  // is the asking, so it reveals; and once revealed, a later finance page does
  // not cover the ledger up again in the same sitting.
  function arrival(hushed){
    if(!hushed){showPosition();return;}
    if(engaged||quiet)return;
    quiet=true;gate.automatic(false);render();
  }
  // The host watches the tab beside the panel and says which account site is
  // open, or passes nothing when the owner has moved on.
  function detected(next){
    if(!readPage||next?.id===site?.id)return;
    site=next||null;snapshot=null;snapshotEditing=false;
    status('','snapshot-status');renderSnapshot();render();
  }
  return {refresh,clear,site:detected,quiet:arrival,stop(){gate.stop();}};
}
