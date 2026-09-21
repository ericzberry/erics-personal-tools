import {FinanceView,PortfolioGroup,BreakdownList,TrendTable,FoldReview,CapitalReview,PagePanel,Figure,money,AttachmentCard,positionFigures,FigureList,propertyDetail} from './components/finance.js';
import {RecordRow,Button,RowAction,Amount,EDIT_GLYPH,DELETE_GLYPH,HISTORY_GLYPH,SHOW_GLYPH,REFRESH_GLYPH,Note,Stack,ActionGroup,Option,setStatus} from './components/ui.js';
import {attachFileDrop} from './components/file-drop.js';
import {readStatement,trimForReading,ACCEPTED,MAX_BYTES,MAX_SEND} from './statement-text.js';
import {MAX_PAGE_TEXT} from './finance-page-read.js';
import {normalizeFinance,financeSummary,financeCurrencies,netWorthSeries,groupFinanceRecords,parseFinanceUpdates,foldReadings,portfoliosOf,markRef,portfolioRef,classLabel,registrationLabel,classById,institutionName,signed,firmCode,foldCapital,holdingsOf,holdingRef,capitalRef,vehicleLabel,vehicleOf,vehicleFigures,propertiesOf,propertiesOn,propertyRef,valuationRef,valueSourceById,zillowHome,PROPERTY_CLASS,PROPERTY_DEBT_CLASS,SITE_CLASSES,REGISTRATIONS,VEHICLES,VALUE_SOURCES,WHOLE_SHARE,shareText} from './finance-data.js';
import {firmLabel} from './account-sites.js';
import {mountVaultGate,vaultReason} from './vault-gate.js';
import {firmQuarters} from './firm-history.js';
import {FirmQuarters} from './components/firms.js';
const today=()=>new Date().toISOString().slice(0,10);

// `readPage` is the host's ability to read the tab the owner is looking at.
// The sidebar sits beside that tab and supplies it; a full tab and the phone
// have no such page, so they pass nothing and the action never appears.
//
// `readZestimate` is the other half of that: the host's ability to open a
// property's own page and read what it publishes the house is worth. The
// extension can, the phone cannot, and where it is missing a property is worth
// whatever was typed against it.
export function mountFinance(root,{credentials,offline,remote,readPage=null,readZestimate=null,onSettings=()=>{},onChanged=()=>{},vault,quiet:hushed=false}){
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
  let site=null,snapshot=null,snapshotEditing=false,pageSource=null,fold=null,foldEditing=false;
  // Capital account statements read out of the same file, reviewed on their
  // own. A statement is not a figure — it carries a commitment, what has been
  // called against it and what has come back — so it gets a review that shows
  // all four rather than being squeezed into a one-amount row. `investing` is
  // the investment currently open in the second form.
  // A capital account is reviewed in the block the reading came from, so what
  // is under review is beside the thing it was read out of.
  // `housing` is the property currently open in the third form. A house is an
  // address and a dated pair of numbers, so editing one edits both rows.
  let capital=null,capitalEditing=false,capitalSource='file',investing=null,housing=null;
  // Which of the three records the one drawer is currently offering to enter.
  let entering='figure';
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
  const openPortfolios=new Set();
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
  // The form's own title, which now says only what the switch above it cannot.
  // "New figure" under a pressed Figure button is the same word twice; what it
  // is worth saying is that this form is open on a record that already exists,
  // and which one. The other tools keep their "New …" line because they have no
  // switch naming the record for them.
  const formTitle=(id,text='')=>{const node=$(id);node.textContent=text;node.hidden=!text;};
  const portfolios=()=>portfoliosOf(records);
  const portfolioOf=number=>portfolios().find(entry=>entry.number===number)||null;
  const nextPortfolio=()=>Math.max(0,...portfolios().map(entry=>entry.number))+1;
  const holdings=()=>holdingsOf(records);
  const holdingOf=number=>holdings().find(entry=>entry.number===number)||null;
  const nextHolding=()=>Math.max(0,...holdings().map(entry=>entry.number))+1;
  const properties=()=>propertiesOf(records);
  const nextProperty=()=>Math.max(0,...properties().map(entry=>entry.number))+1;
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
    formTitle('editor-title');
    syncForm();status('','form-status');
  }
  function fillFigure(mark){
    // The firm rides along unedited. Where a figure was read is a fact about
    // the reading, not a field anybody should retype — and the form offering a
    // firm would invite moving one firm's money to another by choosing from a
    // menu. Correcting an amount keeps the figure it is correcting.
    editing={row:'mark',id:mark.id,revision:mark.revision,firm:mark.firm||0};
    fillPortfolioChoices(portfolioRef(mark.portfolio));
    $('class').value=String(mark.class);$('amount').value=String(mark.amount);$('asOf').value=mark.asOf;
    // Named where there is one, because a trust holding securities at two firms
    // has two of these and the title is what says which is open.
    formTitle('editor-title',[`Editing ${portfolioOf(mark.portfolio)?.name||''}`,classLabel(mark.class),
      firmLabel(mark.firm)].filter(Boolean).join(' · '));
    syncForm();showEntry('figure');$('amount').focus();
  }
  function fillPortfolio(portfolio){
    editing={row:'portfolio',id:portfolio.id,revision:portfolio.revision,number:portfolio.number};
    fillPortfolioChoices(portfolio.id);
    $('name').value=portfolio.name;$('kind').value=String(portfolio.kind);$('currency').value=portfolio.currency;
    formTitle('editor-title',`Renaming ${portfolio.name}`);
    syncForm();showEntry('figure');$('name').focus();
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
  // The investments whose statements another position could take. Only ones
  // that hold their own — a follower of a follower is a chain nobody can read
  // back — and never the position being edited. The list is empty until the
  // ledger holds a vehicle, which is why the field is not there to begin with:
  // a choice with one option is not a choice.
  function fillInvestmentSources(selected=''){
    const sources=holdings().filter(entry=>!entry.follows&&entry.number!==investing?.number)
      .map(entry=>({text:`${entry.name} · ${portfolioOf(entry.portfolio)?.name||''}`,value:String(entry.number)}));
    // A vehicle others already follow cannot itself start following one.
    const followed=holdings().some(entry=>entry.follows===investing?.number);
    const options=[{text:'Its own statements',value:'0'},...sources];
    $('inv-follows').replaceChildren(...options.map(option=>Option(option.text,option.value)));
    $('inv-follows').value=options.some(option=>option.value===selected)?selected:'0';
    $('inv-follows-field').hidden=!sources.length||followed;
    syncInvestmentForm();
  }
  // A position that takes its figures from another states none of its own, so
  // the boxes that would ask for them are not shown. They are the vehicle's
  // figures, filed once, and a second copy of them here is the thing this
  // whole mapping exists to avoid.
  function syncInvestmentForm(){
    $('inv-figures').hidden=$('inv-follows').value!=='0';
    // The boxes are the statement a kind of investment has: shares bought in
    // a company have no commitment, and what was put in and what it is worth
    // are called what the owner calls them rather than a fund's words.
    const figures=vehicleFigures($('inv-vehicle').value);
    for(const key of ['inv-commitment','inv-unfunded'])$(key).closest('.form-field').hidden=!figures.committed;
    for(const [key,figure] of [['inv-value','value'],['inv-funded','contributed'],['inv-returned','distributed']])
      gate.content.querySelector(`label[for="finance-${key}"]`).textContent=figures[figure];
  }
  // A new investment is filed under the class its kind usually is. One the
  // owner already chose, or one being edited, is left where it is.
  function syncInvestmentClass(previous){
    if(investing)return;
    const before=classById(vehicleOf(previous)?.holds||'funds')?.code;
    const after=classById(vehicleOf($('inv-vehicle').value)?.holds||'funds')?.code;
    if(before&&after&&$('inv-class').value===String(before))$('inv-class').value=String(after);
  }
  function clearInvestmentForm(){
    investing=null;
    fillInvestmentPortfolios();
    fillInvestmentSources();
    $('inv-name').value='';$('inv-vehicle').value=String(VEHICLES[0].code);$('inv-class').value=String(classById('funds').code);
    // Left empty rather than filled in with 100: almost every investment is the
    // whole of its vehicle, and a field nobody has to touch says so best by
    // being blank under a placeholder.
    for(const key of ['inv-commitment','inv-value','inv-funded','inv-returned','inv-unfunded','inv-share'])$(key).value='';
    $('inv-asOf').value=today();
    syncInvestmentForm();
    formTitle('inv-title');
    status('','inv-status');
  }
  function fillInvestment(position){
    const holding=position.holding,current=position.current;
    // The statement on screen belongs to this position only when it is filed
    // against it. A follower shows the vehicle's, which another portfolio owns,
    // so this form holds no claim on it: saving must not move or delete it.
    const own=!holding.follows&&current;
    investing={number:holding.number,id:holding.id,revision:holding.revision,
      capitalId:own?current.id:'',capitalRevision:own?current.revision:null};
    fillInvestmentPortfolios(portfolioRef(holding.portfolio));
    fillInvestmentSources(String(holding.follows||0));
    $('inv-name').value=holding.name;$('inv-vehicle').value=String(holding.vehicle);$('inv-class').value=String(holding.class);
    $('inv-share').value=(holding.share??WHOLE_SHARE)===WHOLE_SHARE?'':shareText(holding.share).replace('%','');
    // The statement, not the position: these boxes hold what the vehicle
    // reported, and the share above says how much of it is this portfolio's.
    $('inv-commitment').value=current?String(current.commitment):'';
    // Empty is the ordinary answer and means the subtraction, so a statement
    // that stated nothing about it leaves the box empty rather than filling in
    // the figure the device worked out and turning it into a typed one.
    $('inv-unfunded').value=current?.unfunded??'';
    $('inv-value').value=current?String(current.value):'';
    $('inv-funded').value=current?String(current.contributed):'';
    $('inv-returned').value=current?String(current.distributed):'';
    $('inv-asOf').value=current?current.asOf:'';
    syncInvestmentForm();
    formTitle('inv-title',`Editing ${holding.name}`);
    showEntry('investment');$('inv-name').focus();
  }

  // The third form: a property, and the dated reading that says what it is
  // worth and what is owed on it. Its portfolio choices are the ledger's own
  // and it invents none — a house belongs to a portfolio that already exists.
  function fillPropertyPortfolios(selected=''){
    const options=portfolioChoices();
    $('prop-portfolio').replaceChildren(...options.map(option=>Option(option.text,option.value)));
    $('prop-portfolio').value=options.some(option=>option.value===selected)?selected:(options[0]?.value||'');
  }
  function clearPropertyForm(){
    housing=null;
    fillPropertyPortfolios();
    for(const key of ['prop-name','prop-link','prop-value','prop-debt'])$(key).value='';
    $('prop-source').value=String(VALUE_SOURCES[0].code);
    $('prop-asOf').value=today();
    formTitle('prop-title');
    status('','prop-status');
  }
  function fillProperty(entry){
    const property=entry.property,current=entry.current;
    housing={number:property.number,id:property.id,revision:property.revision,
      valuationId:current?.id||'',valuationRevision:current?.revision??null};
    fillPropertyPortfolios(portfolioRef(property.portfolio));
    $('prop-name').value=property.name;$('prop-link').value=property.link||'';
    $('prop-value').value=current?String(current.value):'';
    $('prop-debt').value=current?String(current.debt):'';
    $('prop-source').value=String(current?.source||VALUE_SOURCES[0].code);
    $('prop-asOf').value=current?current.asOf:'';
    formTitle('prop-title',`Editing ${property.name}`);
    showEntry('property');$('prop-name').focus();
  }

  // Which record is being entered, chosen where it applies. The three forms
  // live in one drawer and one of them is shown; the switch is the currency
  // switch's pattern, because it is the same kind of choice — which of several
  // things this block is currently about.
  const ENTRY_KINDS=[['figure','Figure','form'],['investment','Private investment','inv-form'],['property','Property','prop-form']];
  function renderEntrySwitch(){
    $('entry-switch').replaceChildren(...ENTRY_KINDS.map(([kind,label])=>{
      const chosen=kind===entering;
      const button=Button(label,{variant:chosen?'primary':'secondary',size:'compact',
        'aria-pressed':String(chosen),disabled:busy||!loaded});
      button.addEventListener('click',()=>showEntry(kind));
      return button;
    }));
  }
  // Switching away from a form abandons nothing: each keeps what was typed into
  // it until it is saved or cancelled, so a half-filled property is still there
  // after a glance at the figure form.
  function showEntry(kind){
    entering=kind;
    for(const [,,form] of ENTRY_KINDS)$(form).hidden=form!==ENTRY_KINDS.find(entry=>entry[0]===kind)[2];
    // The forms live under Figures and the records are read under Net worth, so
    // opening a record for editing has to bring the reader to the form as well
    // as fill it. Without this, pressing Edit on a position filled a form on a
    // tab nobody was looking at and the screen did not change at all.
    $('tabs').select('add');
    $('entry').open=true;
    renderEntrySwitch();
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
    const series=netWorthSeries(records,{currency});
    // How current all of this is, stated once at the top where the totals it
    // qualifies are. Every line underneath then carries a date only when it
    // disagrees with this one.
    const newest=series.at(-1)?.asOf||'';
    $('totals').replaceChildren(
      // What it comes to, and the day it stands at, on the first line. On the
      // second, what is held and what is owed against it, each under its own
      // name in the column above it — assets and their liability are read as a
      // pair, not two rows apart.
      Figure({label:'Net',value:money(summary.net,currency),tone:summary.net<0?'negative':''}),
      ...(newest?[Figure({label:'As of',value:newest,tone:'date'})]:[]),
      // Assets on their own are news only when something is owed against them.
      // With no liabilities they are the net worth again, and the pair read as
      // one number printed twice under two names.
      //
      // What is still owed on a commitment is not a total of the ledger —
      // nobody can demand all of it today, and it is neither held nor owed —
      // so it is read in the Private investments breakdown, beside the
      // commitment it belongs to, and not up here among the four that are.
      ...(summary.liabilities?[
        Figure({label:'Assets',value:money(summary.assets,currency)}),
        Figure({label:'Liabilities',value:money(-summary.liabilities,currency),tone:'negative'})
      ]:[])
    );
    $('stale').hidden=!summary.stale.length;
    $('stale').textContent=summary.stale.length?`${summary.stale.length} portfolio${summary.stale.length===1?'':'s'} not updated in over 90 days — the oldest is ${summary.stale[0].name}${summary.stale[0].asOf?` from ${summary.stale[0].asOf}`:''}. Totals still count ${summary.stale.length===1?'it':'them'} at ${summary.stale.length===1?'its':'their'} last known figure.`:'';
    // A ledger with nothing in it needs one line saying so, not the same line
    // under four headings that break down nothing.
    $('breakdown').replaceChildren(...summary.figures?[
      // Liquid against illiquid first: it is the question the class list cannot
      // answer on its own, and the one the classes underneath it explain.
      BreakdownList('By liquidity',summary.byGroup,currency),
      BreakdownList('By asset class',summary.byClass,currency),
      BreakdownList('By portfolio',summary.byPortfolio,currency),
      // "By registration" is the paperwork's word for it. What the owner is
      // being told apart here is what kind of account each figure sits in, and
      // that is what the tag on every portfolio underneath says too.
      BreakdownList('By account type',summary.byRegistration,currency),
      // A house nobody has valued yet is a property and not yet a figure: the
      // heading over it would have nothing under it but the line saying so,
      // which is a breakdown of nothing under a title.
      ...(summary.properties.value||summary.properties.debt?[BreakdownList('Real estate',[
        {label:'Value',total:summary.properties.value},
        // What is owed and what is left appear only when something is owed. A
        // house with no mortgage has equity equal to its value, and two more
        // lines saying so would say nothing.
        ...(summary.properties.debt?[{label:'Owed',total:summary.properties.debt},
          {label:'Equity',total:summary.properties.equity}]:[])
      ],currency,{shares:false})]:[]),
      ...(summary.positions.count?[BreakdownList('Private investments',[
        {label:'Committed',total:summary.positions.committed},
        {label:'Funded',total:summary.positions.contributed},
        {label:'Returned',total:summary.positions.distributed},
        {label:'Unfunded',total:summary.positions.unfunded},
        {label:'Value',total:summary.positions.value}
      ],currency,{shares:false})]:[])
    ]:[Note('Nothing recorded yet.')]);
    $('trend').replaceChildren(TrendTable(series,currency));
    // Each firm's own quarters. The panel is absent rather than empty until a
    // firm has been read at least once, because a heading over nothing is a
    // question the tool cannot yet answer.
    const firms=firmQuarters(records,{currency});
    $('firms-panel').hidden=!firms.length;
    $('firms').replaceChildren(FirmQuarters(firms,currency));
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
  // `firm` is the site this reading was taken at, and it stays on every figure
  // the fold produces. A dropped file passes none: nothing in a statement says
  // which firm's page it came off, and a guessed firm would be worse than no
  // firm — it would file one place's money under another's name.
  async function readInto(token,input,{institution='',firm=0,siteKind=''}={}){
    const id=await connectionId(token);
    const result=await remote(token,`/v1/ai-connections/${id}/finance-intake`,{method:'POST',value:{today:today(),...input},timeoutMs:130000});
    const parsed=parseFinanceUpdates(result);
    const folded=foldReadings(parsed.readings,portfolios(),{institution,firm,
      defaultClass:classById(SITE_CLASSES[siteKind]||'')?.code??null});
    // A dropped file is one errand, whatever kind of document it turns out to
    // be. The owner should not have to say "this one is a capital account
    // statement" — the reading says which of the two it found, and each is
    // folded by the part of the device that knows how.
    // The institution reaches the capital fold too: it is what says whose
    // portfolio a statement read off a page belongs to, and a dropped file that
    // names no site simply passes nothing.
    // A fund read off a page joins the capital accounts rather than the class
    // figures, because that is what it is: one investment, kept apart from the
    // next one, instead of a number added into Fund investments where the two
    // become indistinguishable.
    return {...folded,capital:foldCapital([...(parsed.capital||[]),...folded.positions],records,{institution,today:today()}),
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
        // A percentage on the way in, basis points in the row. An entry that is
        // not yet a usable share — an empty box, a lone decimal point — leaves
        // the last one standing rather than snapping the figures to the whole
        // vehicle while somebody is still typing.
        if(key==='share'){
          const points=Math.round(Number(String(value).trim())*100);
          if(Number.isFinite(points)&&points>=1&&points<=WHOLE_SHARE)row.share=points;
          return;
        }
        row[key]=['vehicle','class'].includes(key)?Number(value):value;
        // The kind decides which figures the row asks for.
        if(key==='vehicle')renderCapital();
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
    // it is a fact about this page, not an explanation of the panel. So is
    // anything the fold refused — a total over accounts, a second balance for
    // one account, money behind this password that is not the owner's —
    // because the only other evidence of it is a figure that is not there.
    const say=[any?'':none,extra,...result.notes,result.unread].filter(Boolean).join(' ');
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
    // The tab exists wherever there is a page beside the panel, recognized or
    // not, and its label is the scope: the site when one is known, the page
    // otherwise. A host with no page beside it — a full tab, the phone — has no
    // such tab at all.
    $('tabs').show('page',!!readPage);
    if(!readPage){$('snapshot-body').replaceChildren();pageSource=null;return;}
    $('tabs').rename('page',site?.label||'This page');
    $('snapshot-body').replaceChildren(PagePanel({
      site,rows:snapshot?.rows||[],editing:snapshotEditing,disabled:busy||!loaded,source:pageSource,
      onRead:readOpenPage,onSave:()=>saveReview('snapshot'),
      onEdit:()=>{snapshotEditing=true;renderSnapshot();},
      onDiscard:()=>{snapshot=null;snapshotEditing=false;pageSource=null;renderSnapshot();status('','snapshot-status');},
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
      // Kept whatever the reading comes to, and shown before it is attempted:
      // a reading that fails outright is the case this evidence exists for, and
      // waiting for it to succeed would withhold it exactly then.
      pageSource={text:page.text,shape:page.shape,trimmed:page.trimmed};renderSnapshot();
      // What the site itself settles is settled before folding: the institution
      // decides which portfolio a figure is titled to, and what an account
      // total is made of when the page never says.
      // The institution travels to the reading as words, because the model is
      // being told what page it is looking at; the firm travels to the fold as
      // a code, because that is what a figure stores.
      const known=site?{institution:institutionName(site.institution)}:{};
      const result=await readInto(token,{text:page.text,live:true,...known},
        {...known,firm:firmCode(site?.id||''),siteKind:site?.kind||''});
      snapshot={rows:result.marks,notes:result.notes};snapshotEditing=false;renderSnapshot();
      showCapital(result,'page');
      const any=found(result);
      // When a reading finds nothing, what the page gave it is the whole of the
      // diagnosis and the owner is the only one who can see both. A page that
      // states its accounts in a grid and a page that is holding them behind a
      // disclosure look identical from here and are not the same problem: one
      // is a reader to fix, the other is a section to open. So the line that
      // says nothing was found says what arrived — how many account tables, how
      // many lines — and it is said only then, because a reading that worked
      // has the figures on the screen to speak for it.
      const gave=any?'':`The page gave ${page.tables} account table${page.tables===1?'':'s'} and ${page.text.split('\n').filter(Boolean).length} lines.`;
      const say=[any?'':`No account figures were found on ${page.host}.`,gave,
        page.trimmed?`The page was longer than the ${MAX_PAGE_TEXT.toLocaleString('en-US')}-character limit, so the end of it was left out.`:'',
        ...result.notes,result.unread].filter(Boolean).join(' ');
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
          if(!await saveHolding({number:holding,portfolio,name:row.name,vehicle:row.vehicle,class:row.class,
            stated:row.stated,share:row.share,follows:row.follows},target))break;
          madeHoldings.set(row.holding,holding);
        }
      }
      else{
        // A share changed on the row is a change to the investment rather than
        // to the statement, and it is written first: a statement saved against
        // the old share would be counted at it until the next render.
        const current=holdingOf(holding);
        if(current&&(current.share??WHOLE_SHARE)!==(row.share??WHOLE_SHARE)
          &&!await saveHolding({...current,share:row.share},target))break;
      }
      // One vehicle, one capital account: a statement for a position that
      // follows another is filed against the one that holds it, where every
      // holder of that vehicle reads it.
      if(!await saveCapital({holding:row.follows||row.filed||holding,asOf:row.asOf,value:row.value,
        contributed:row.contributed,distributed:row.distributed,commitment:row.commitment,
        unfunded:row.unfunded??null},target))break;
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
        vehicle:holding.vehicle,class:holding.class,stated:holding.stated??0,
        share:holding.share??WHOLE_SHARE,follows:holding.follows??0},id,existing)}),target);
  }
  function saveCapital(entry,target='inv-status'){
    const value={row:'capital',holding:entry.holding,asOf:entry.asOf,value:entry.value,
      contributed:entry.contributed,distributed:entry.distributed,commitment:entry.commitment,unfunded:entry.unfunded??null};
    const id=capitalRef(value),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',value:normalizeAndStamp(value,id,existing)}),target);
  }
  function saveProperty(property,target='prop-status'){
    const id=propertyRef(property.number),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',
      value:normalizeAndStamp({row:'property',number:property.number,portfolio:property.portfolio,
        name:property.name,link:property.link??''},id,existing)}),target);
  }
  function saveValuation(entry,target='prop-status'){
    const value={row:'valuation',property:entry.property,asOf:entry.asOf,value:entry.value,debt:entry.debt,source:entry.source};
    const id=valuationRef(value),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',value:normalizeAndStamp(value,id,existing)}),target);
  }
  // What a house is worth is published rather than held, so the ledger goes and
  // reads it instead of asking for it. The address and the page are the record;
  // the figure under them is a reading the tool can take itself, and a property
  // saved with a Zillow page and no figure is a question the owner has already
  // answered by saving the page.
  //
  // What is owed is not published anywhere, so it comes forward from the last
  // reading rather than being filed as zero: filing zero would pay off a
  // mortgage silently, and nothing afterwards would show that it had.
  const ZESTIMATE=valueSourceById('zestimate').code;
  // One reading per property per sitting. A page that would not give up a
  // figure must not be asked again on every refresh, and a Zestimate does not
  // move between two glances at it.
  const looked=new Set();
  async function fileZestimate(entry,target='status'){
    const property=entry.property;
    if(!readZestimate||!zillowHome(property.link))return false;
    looked.add(property.number);
    status(`Reading the Zestimate for ${property.name}…`,target,'progress');
    let reading;
    try{reading=await readZestimate(property.link,property.name);}
    catch(error){status(error.message,target,'alert');return false;}
    const saved=await saveValuation({property:property.number,asOf:today(),
      value:reading.value,debt:entry.current?.debt||0,source:ZESTIMATE},target);
    if(saved)onChanged();
    return saved;
  }
  async function readMissingValues(){
    if(!readZestimate||!loaded)return;
    for(const entry of propertiesOn(records)){
      if(entry.value||looked.has(entry.property.number)||!zillowHome(entry.property.link))continue;
      await fileZestimate(entry);
    }
  }
  function savePortfolio(portfolio,target='form-status'){
    const id=portfolioRef(portfolio.number),existing=records.find(record=>record.id===id);
    return run(token=>offline.request(token,`/v1/finance/${id}`,{method:'PUT',
      value:normalizeAndStamp({row:'portfolio',number:portfolio.number,name:portfolio.name,kind:portfolio.kind,currency:portfolio.currency},id,existing)}),target);
  }
  function saveMark(mark,target='form-status'){
    // The firm is part of what is saved and part of what addresses it. Dropping
    // it here would send every read figure to the id a hand-typed one occupies,
    // which is the collision this whole change exists to end.
    const value={row:'mark',portfolio:mark.portfolio,class:mark.class,firm:mark.firm||0,asOf:mark.asOf,amount:mark.amount};
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
    // The date cascades instead of repeating. The ledger's newest date is
    // stated once above the totals; a portfolio says its own only when it is
    // behind that, and a line inside it only when it is behind the portfolio.
    // A date printed on every line was one fact written six times, and it was
    // what made the list unreadable.
    const newest=netWorthSeries(records,{currency}).at(-1)?.asOf||'';
    // On a line, the date alone: the middot says it qualifies the name it
    // follows, "AS OF" above the totals has already said what a date beside a
    // figure means, and the two extra words were what pushed it into breaking
    // at its own hyphens in a narrow panel. Under a heading it has a line to
    // itself and reads as the fragment it is.
    //
    // A marked balance is exempt: a class line is a figure, not a document,
    // and cash a day behind the securities beside it was carrying a date that
    // meant nothing to read. Its date is still on the form that edits it and
    // in the history behind it. A position and a property keep theirs, because
    // there the date is the statement's or the valuation's own.
    const dated=(asOf,against)=>asOf&&asOf!==against?asOf:'';
    const since=(asOf,against)=>dated(asOf,against)?`as of ${asOf}`:'';
    const figure=(portfolio,row)=>{
      const mark=row.current;
      // The firm is named only where this portfolio holds the same class at
      // more than one of them, exactly as the date is printed only where a line
      // disagrees with the heading above it. One firm's securities need no word
      // saying they are the only securities; two need one, or the list shows
      // the same heading twice over two different numbers.
      const where=row.shared?firmLabel(row.firm):'';
      const spoken=[row.label,where].filter(Boolean).join(' · ');
      const confirm=Stack([Note(`Delete the ${spoken} figure for ${portfolio.name} as of ${mark.asOf}?`),ActionGroup([
        action('Delete from all devices',async()=>{if(await remove(mark))onChanged();},'danger'),
        action('Keep it',()=>{confirm.hidden=true;})
      ],{compact:true})],{hidden:true});
      const past=Stack(row.history.slice(0,8).map(entry=>Note(`${entry.asOf} · ${money(signed(entry),portfolio.currency)}`)),{hidden:true});
      const named=`${spoken} in ${portfolio.name}`;
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
      // further down would say otherwise — so the word rides beside it as well,
      // because a minus sign is a shape and some readers will not see it.
      // The firm rides in the meta rather than in the name, so it is separated
      // by the same rule every other record in the app follows — the middot
      // belongs to the name it qualifies, and a narrow panel ends the line
      // "Liquid securities ·" rather than opening the next one on a dot. It
      // leads the meta because it is what tells two otherwise identical lines
      // apart; liability and sync state qualify the class either way.
      const meta=[where,row.side==='liability'?'liability':'',
        mark.pending?(mark.conflict?'Conflict':mark.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · ');
      return RecordRow({title:row.label,figure:Amount(signed(mark),portfolio.currency),meta,
        actions,extra:[past,...decide,confirm]});
    };
    // A position reads as what it is: a name, what kind of vehicle it is, what
    // it is worth, and underneath, the three flows the value alone cannot
    // explain. Where the paperwork and the ledger disagree about the kind, the
    // row says so instead of choosing.
    const investment=(portfolio,position,against)=>{
      const holding=position.holding,current=position.current;
      const followers=holdings().filter(entry=>entry.follows===holding.number);
      const confirm=Stack([Note([`Permanently delete “${holding.name}” and every capital account filed for it, from all devices?`,
        followers.length?`${followers.length} other position${followers.length===1?'':'s'} in this vehicle read${followers.length===1?'s':''} those figures and will have none.`:''].filter(Boolean).join(' ')),ActionGroup([
        action('Delete investment',async()=>{if(await remove(holding))onChanged();},'danger'),
        action('Keep it',()=>{confirm.hidden=true;})
      ],{compact:true})],{hidden:true});
      const flows=vehicleFigures(holding.vehicle).committed?['funded','returned']:['invested','proceeds'];
      const past=Stack(position.history.slice(0,8).map(entry=>Note(
        `${entry.asOf} · ${money(entry.value,portfolio.currency)} · ${flows[0]} ${money(entry.contributed,portfolio.currency)} · ${flows[1]} ${money(entry.distributed,portfolio.currency)}`
      )),{hidden:true});
      const actions=[
        rowAction(EDIT_GLYPH,`Edit ${holding.name}`,()=>fillInvestment(position)),
        ...(position.history.length>1?[rowAction(HISTORY_GLYPH,`Earlier figures for ${holding.name}`,()=>{past.hidden=!past.hidden;})]:[]),
        rowAction(DELETE_GLYPH,`Delete ${holding.name}`,()=>{confirm.hidden=false;},true)
      ];
      const meta=holding.pending?'Waiting to sync':'';
      // Its figures read down, one to a line, with the date they are as of at
      // the head of them — never run onto the name, where after a legal name
      // that wraps it hung as "L.P. ·" with the date alone under it. What the
      // paperwork calls it gets a line of its own after them; run into the
      // figures it read as one of them.
      const asOf=current?dated(current.asOf,against):'';
      const figures=FigureList([...(asOf?[['As of',asOf]]:[]),...positionFigures(position,portfolio.currency)]);
      const notes=[current?'':'No statement yet',
        position.disputed?`The statement calls this a ${vehicleLabel(holding.stated)}.`:''];
      // The name alone. What kind of vehicle it is was run onto the name, and
      // a fund's long legal name then wrapped into "… L.P. · Fund ·" with the
      // date stranded under it; the line it opens from already says what these
      // are, and Funded against Invested says which kind.
      return RecordRow({title:holding.name,
        figure:Amount(position.value,portfolio.currency),meta,actions,
        extra:[figures,...notes.filter(Boolean).map(line=>Note(line)),past,confirm]});
    };
    // Every private position in one portfolio, as one line of the ledger — the
    // same shape as Real estate, for the same reason. A portfolio is read down
    // its asset classes, and one fund set among them, with its legal name
    // wrapping over three lines and four figures hung under it, stopped the
    // column dead and was the loudest thing on the card. The line says what
    // the positions come to; the positions, their flows and their verbs are
    // behind it for whoever wants them.
    const privateInvestments=(portfolio,held,against)=>{
      const value=held.reduce((total,position)=>total+position.value,0);
      const inside=Stack(held.map(position=>investment(portfolio,position,against)),{className:'estate-detail position-detail',hidden:true});
      const asOf=held.map(position=>position.current?.asOf||'').filter(Boolean).sort().at(-1)||'';
      const meta=[asOf?dated(asOf,against):'no statement yet',
        held.some(position=>position.holding.pending)?'Waiting to sync':''].filter(Boolean).join(' · ');
      return RecordRow({title:'Private investments',figure:Amount(value,portfolio.currency),meta,
        actions:[rowAction(SHOW_GLYPH,`Show the private investments in ${portfolio.name}`,()=>{inside.hidden=!inside.hidden;})],
        extra:[inside]});
    };
    // A property reads as what it is: an address, what it is worth, and
    // underneath, the two things the value alone cannot say — where the number
    // came from and what is still owed against it.
    const estate=(portfolio,entry,against,{unvalued=false}={})=>{
      const property=entry.property,current=entry.current;
      const confirm=Stack([Note(`Permanently delete “${property.name}” and every valuation filed for it, from all devices?`),ActionGroup([
        action('Delete property',async()=>{if(await remove(property))onChanged();},'danger'),
        action('Keep it',()=>{confirm.hidden=true;})
      ],{compact:true})],{hidden:true});
      const past=Stack(entry.history.slice(0,8).map(reading=>Note(
        [`${reading.asOf} · ${money(reading.value,portfolio.currency)}`,
          reading.debt?`owed ${money(reading.debt,portfolio.currency)}`:''].filter(Boolean).join(' · ')
      )),{hidden:true});
      const actions=[
        // Only where there is a page to read it off. A Zestimate is published
        // and stands until it is looked up again, which is a verb no other row
        // in this list has.
        ...(readZestimate&&zillowHome(property.link)
          ?[rowAction(REFRESH_GLYPH,`Read the Zestimate for ${property.name}`,()=>fileZestimate(entry))]:[]),
        rowAction(EDIT_GLYPH,`Edit ${property.name}`,()=>fillProperty(entry)),
        ...(entry.history.length>1?[rowAction(HISTORY_GLYPH,`Earlier valuations for ${property.name}`,()=>{past.hidden=!past.hidden;})]:[]),
        rowAction(DELETE_GLYPH,`Delete ${property.name}`,()=>{confirm.hidden=false;},true)
      ];
      // The line above may already have said that none of these have been
      // valued, and a house repeating it under it is one fact written twice.
      const meta=[current?dated(current.asOf,against):(unvalued?'':'not valued yet'),
        property.pending?'Waiting to sync':''].filter(Boolean).join(' · ');
      return RecordRow({title:property.name,figure:Amount(entry.value,portfolio.currency),meta,
        notes:[propertyDetail(entry,portfolio.currency)],actions,extra:[past,confirm]});
    };
    // Every house in one portfolio, as one line of the ledger. A portfolio is
    // read down its asset classes — cash, securities, crypto — and an address
    // set among them is a different kind of thing in the same column: it names
    // one holding where its neighbours name a whole class of them, and a second
    // house makes the portfolio's list longer rather than its real estate
    // bigger. So the line says Real estate and what the houses come to, the way
    // the class lines do, and the addresses are behind it for whoever wants
    // them — which is where a property's own verbs live too, since they act on
    // a house and not on the class.
    const realEstate=(portfolio,owned,against)=>{
      const value=owned.reduce((total,entry)=>total+entry.value,0);
      const debt=owned.reduce((total,entry)=>total+entry.debt,0);
      // Nothing valued at all is the line's own news. One house of three
      // waiting for a figure is that house's, and it says so on its own row.
      const unvalued=owned.every(entry=>!entry.current);
      const houses=Stack(owned.map(entry=>estate(portfolio,entry,against,{unvalued})),{className:'estate-detail',hidden:true});
      const asOf=owned.map(entry=>entry.current?.asOf||'').filter(Boolean).sort().at(-1)||'';
      const meta=[unvalued?'not valued yet':dated(asOf,against),
        owned.some(entry=>entry.property.pending)?'Waiting to sync':''].filter(Boolean).join(' · ');
      // A line and nothing under it. A portfolio is read down one column of
      // names and one of amounts, and a sentence hung beneath one of them —
      // how many houses, what is owed, what is left — stops the column at that
      // row and is the loudest thing on the card. How many houses there are is
      // answered by opening them; what is owed is a figure, so it is a line.
      // What is owed against them, under the class its figure counts in and in
      // the shape every liability on this card has. Without it a portfolio
      // holding the equity would show a house at its full value and a total
      // that is smaller, with nothing on the card saying why.
      const owing=debt?[RecordRow({title:classLabel(PROPERTY_DEBT_CLASS),
        figure:Amount(-debt,portfolio.currency),meta:'liability'})]:[];
      // The addresses open under the block rather than inside it, so a debt
      // line is never separated from the value it is against.
      (owing[0]||null)?.append(houses);
      return [
        RecordRow({title:classLabel(PROPERTY_CLASS),figure:Amount(value,portfolio.currency),meta,
          actions:[rowAction(SHOW_GLYPH,`Show the properties in ${portfolio.name}`,()=>{houses.hidden=!houses.hidden;})],
          extra:debt?[]:[houses]}),
        ...owing
      ];
    };
    $('list').replaceChildren(...(groups.length?groups.map(group=>{
      const portfolio=group.portfolio;
      const confirm=Stack([Note(`Permanently delete “${portfolio.name}” and every figure in it, from all devices?`),ActionGroup([
        action('Delete portfolio',async()=>{if(await remove(portfolio))onChanged();},'danger'),
        action('Keep it',()=>{confirm.hidden=true;})
      ],{compact:true})],{hidden:true});
      // A figure that comes to nothing is not a holding. The ledger never
      // deletes one — a reading corrected later is superseded by a zero under
      // the same portfolio, class and date — so a zeroed class is the mark of
      // a figure no longer held, and it belongs in the history behind the
      // class it was corrected into, not in the list of what is held. The
      // zeros stand where there is nothing else, so a portfolio is never shown
      // as empty when it holds rows.
      const held=group.rows.filter(row=>Math.round(row.current.amount*100)!==0);
      const rows=held.length||group.positions.length||group.properties.length?held:group.rows;
      const asOf=[...rows.map(row=>row.current.asOf),
        ...group.positions.map(position=>position.current?.asOf||''),
        ...group.properties.map(entry=>entry.current?.asOf||'')].filter(Boolean).sort().at(-1)||'';
      return PortfolioGroup({
        name:portfolio.name,currency:portfolio.currency,total:group.total,
        open:openPortfolios.has(portfolio.id),
        onToggle:isOpen=>{if(isOpen)openPortfolios.add(portfolio.id);else openPortfolios.delete(portfolio.id);},
        // What kind of account this is, as a tag on the name. Under it, only
        // what the line above cannot say: a date behind the rest of the
        // ledger, and a portfolio still waiting to reach the cloud.
        kind:registrationLabel(portfolio.kind),
        meta:[since(asOf,newest),portfolio.pending?(portfolio.conflict?'Conflict':'Waiting to sync'):''].filter(Boolean).join(' · '),
        actions:[rowAction(EDIT_GLYPH,`Rename ${portfolio.name}`,()=>fillPortfolio(portfolio)),
          rowAction(DELETE_GLYPH,`Delete ${portfolio.name}`,()=>{confirm.hidden=false;},true)],
        rows:[...rows.map(row=>figure(portfolio,row)),
          ...(group.positions.length?[privateInvestments(portfolio,group.positions,asOf)]:[]),
          ...(group.properties.length?realEstate(portfolio,group.properties,asOf):[]),confirm]
      });
    }):[Note(!loaded?'Connect in Settings to load your ledger.':'No figures yet. Read an account page, drop a statement, or enter one by hand.')]));
    renderPosition();
  }
  // Not hidden figures: figures that were never put on the page.
  function sealLedger(){
    for(const id of ['currency-switch','totals','breakdown','trend','firms','list'])$(id).replaceChildren();
    $('currency-switch').hidden=true;$('stale').hidden=true;$('firms-panel').hidden=true;
  }
  function render(){
    // What the ledger holds — the totals and the saved figures — waits to be
    // asked for. Putting a figure in does not: the site reading, the statement,
    // the page reading and a figure typed by hand are all ready.
    // Until it has been asked for, the ledger is not a tab standing there empty:
    // it is not in the row at all. Nor is it one while it holds nothing — a
    // ledger with no figures in it is not a second view to switch to, the tool
    // is simply the ways of putting a figure in, and a row of one tab is a row
    // that should not be drawn. A device that has not loaded keeps the tab,
    // because what that panel has to say is how to connect.
    $('tabs').show('ledger',!quiet&&(!loaded||records.length>0));
    if(quiet)sealLedger();else renderLedger();
    for(const key of ['portfolio','name','kind','currency','class','amount','asOf'])$(key).disabled=busy||!loaded;
    for(const key of ['inv-portfolio','inv-name','inv-vehicle','inv-class','inv-commitment','inv-value','inv-funded','inv-returned','inv-unfunded','inv-asOf'])$(key).disabled=busy||!loaded;
    for(const key of ['prop-portfolio','prop-name','prop-link','prop-value','prop-source','prop-debt','prop-asOf'])$(key).disabled=busy||!loaded;
    renderEntrySwitch();
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;
    $('inv-save').disabled=busy||!loaded;$('inv-cancel').disabled=busy;
    $('prop-save').disabled=busy||!loaded;$('prop-cancel').disabled=busy;
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
    $('actions').replaceChildren(quiet?toolAction('Show net worth',showPosition)
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
      // A selection made while the drawer is open is kept; a closed drawer
      // goes back to the default, because the placeholder the form starts on —
      // before there are any portfolios to offer — must not become the standing
      // answer once there are.
      const open=$('entry').open;
      fillPortfolioChoices(open?$('portfolio').value:'');
      fillInvestmentPortfolios(open?$('inv-portfolio').value:'');
      // The vehicles a position could be mapped onto are the ledger's own, so
      // the field appears with the first investment in it rather than only
      // after the form is next cleared.
      fillInvestmentSources(open?$('inv-follows').value:'');
      fillPropertyPortfolios(open?$('prop-portfolio').value:'');
      connectionNote();
      // A house whose page is saved and whose figure is not is not waiting for
      // the owner to type anything: it is waiting to be looked up. Not awaited,
      // because the ledger is already on the screen and the reading arrives in
      // it when it arrives.
      readMissingValues();
    }
  }
  function clear(){
    generation++;records=[];loaded=false;activeToken='';connection='';attachment=null;
    fold=null;foldEditing=false;snapshot=null;snapshotEditing=false;pageSource=null;engaged=false;
    capital=null;capitalEditing=false;capitalSource='file';
    clearForm();clearInvestmentForm();clearPropertyForm();renderFold();renderCapital();renderAttachment();renderSnapshot();
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
  $('cancel').addEventListener('click',()=>{clearForm();$('entry').open=false;});
  $('portfolio').addEventListener('change',syncForm);
  $('inv-follows').addEventListener('change',syncInvestmentForm);
  let vehicleBefore=$('inv-vehicle').value;
  $('inv-vehicle').addEventListener('change',()=>{syncInvestmentClass(vehicleBefore);vehicleBefore=$('inv-vehicle').value;syncInvestmentForm();});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      // Renaming a portfolio is the form's other job and saves nothing else.
      if(editing?.row==='portfolio'){
        if(await savePortfolio({number:editing.number,name:$('name').value,kind:Number($('kind').value),currency:$('currency').value})){clearForm();$('entry').open=false;onChanged();}
        return;
      }
      const fresh=$('portfolio').value==='new';
      const number=fresh?nextPortfolio():Number($('portfolio').value.slice(1));
      if(fresh&&!await savePortfolio({number,name:$('name').value,kind:Number($('kind').value),currency:$('currency').value}))return;
      // A figure typed here belongs to no firm; one opened from the ledger
      // keeps the firm it was read at.
      const mark={portfolio:number,class:Number($('class').value),firm:editing?.row==='mark'?editing.firm||0:0,
        asOf:$('asOf').value,amount:$('amount').value};
      if(!await saveMark(mark))return;
      // A figure moved to another portfolio, class or date is a different row.
      // The one it came from is removed, so an edit cannot leave two.
      const moved=editing&&editing.id!==markRef(normalizeFinance({row:'mark',...mark}));
      if(moved)await remove(records.find(record=>record.id===editing.id)||{id:editing.id,revision:editing.revision});
      clearForm();$('entry').open=false;onChanged();
    }catch(error){status(vaultReason(error),'form-status','error');}
  });
  $('inv-cancel').addEventListener('click',()=>{clearInvestmentForm();$('entry').open=false;});
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
      // A position that follows another states no figures of its own, so the
      // date and the boxes under it are not read at all.
      const asOf=$('inv-follows').value!=='0'?'':$('inv-asOf').value.trim();
      const figures=$('inv-follows').value!=='0'?[]:['inv-value','inv-commitment','inv-funded','inv-returned'].map(key=>$(key).value.trim());
      if(!asOf&&figures.some(Boolean)){status('Give the date these figures are as of, or clear them.','inv-status','alert');return;}
      // A blank share is the whole vehicle. Anything else is a percentage,
      // kept as basis points so twelve and a half per cent is a whole number.
      const typed=$('inv-share').value.trim();
      const follows=Number($('inv-follows').value||0);
      // A box hidden by the kind still holds whatever was typed before the
      // kind changed, and a kind with no commitment saves none.
      const committed=vehicleFigures($('inv-vehicle').value).committed;
      if(!await saveHolding({number,portfolio,name:$('inv-name').value,vehicle:Number($('inv-vehicle').value),
        class:Number($('inv-class').value),stated:holdingOf(number)?.stated??0,
        share:typed===''?WHOLE_SHARE:Math.round(Number(typed)*100),follows}))return;
      if(asOf&&!await saveCapital({holding:number,asOf,value:$('inv-value').value||0,
        contributed:$('inv-funded').value||0,distributed:$('inv-returned').value||0,commitment:committed?$('inv-commitment').value||0:0,
        unfunded:committed?$('inv-unfunded').value.trim()||null:null}))return;
      // A statement moved to another date is a different row. The one it came
      // from is removed, so an edit cannot leave two.
      const moved=investing?.capitalId&&asOf&&investing.capitalId!==capitalRef({holding:number,asOf});
      if(moved)await remove(records.find(record=>record.id===investing.capitalId)||{id:investing.capitalId,revision:investing.capitalRevision},'inv-status');
      clearInvestmentForm();$('entry').open=false;onChanged();
    }catch(error){status(vaultReason(error),'inv-status','error');}
  });
  $('prop-cancel').addEventListener('click',()=>{clearPropertyForm();$('entry').open=false;});
  $('prop-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const chosen=$('prop-portfolio').value;
      if(!chosen){status('Add a portfolio before recording a property in it.','prop-status','alert');return;}
      const portfolio=Number(chosen.slice(1));
      const number=housing?.number??nextProperty();
      // A house bought this morning has no valuation behind it yet, and that is
      // a whole record: the address is recorded and counts as nothing until a
      // figure says otherwise. Figures without the date they are as of are not
      // a record at all — settled before anything is written, so a refused
      // valuation does not leave a property saved behind it.
      let asOf=$('prop-asOf').value.trim();
      const figures=['prop-value','prop-debt'].map(key=>$(key).value.trim());
      if(!asOf&&figures.some(Boolean)){status('Give the date these figures are as of, or clear them.','prop-status','alert');return;}
      // What the house is worth is published on the page being saved with it,
      // so a market value left at nothing beside a Zillow page is read off that
      // page rather than filed as a house worth nothing. A figure typed by hand
      // is the owner overriding the Zestimate, which is the whole reason the
      // source is a choice, so nothing is read over it.
      const link=$('prop-link').value,name=$('prop-name').value;
      let value=$('prop-value').value||0,source=Number($('prop-source').value),unread='';
      if(readZestimate&&zillowHome(link)&&!Number(value)){
        status(`Reading the Zestimate for ${name.trim()}…`,'prop-status','progress');
        try{
          const reading=await readZestimate(link,name);
          value=reading.value;source=ZESTIMATE;asOf||=today();looked.add(number);
        }catch(error){
          // Said where the ledger's own status is, because the drawer this was
          // typed in closes behind the save.
          unread=error.message;
        }
      }
      if(!await saveProperty({number,portfolio,name,link}))return;
      if(asOf&&!await saveValuation({property:number,asOf,value,
        debt:$('prop-debt').value||0,source}))return;
      // A valuation moved to another date is a different row. The one it came
      // from is removed, so an edit cannot leave two.
      const moved=housing?.valuationId&&asOf&&housing.valuationId!==valuationRef({property:number,asOf});
      if(moved)await remove(records.find(record=>record.id===housing.valuationId)||{id:housing.valuationId,revision:housing.valuationRevision},'prop-status');
      clearPropertyForm();$('entry').open=false;onChanged();
      if(unread)status(unread,'status','alert');
    }catch(error){status(vaultReason(error),'prop-status','error');}
  });
  clearForm();clearInvestmentForm();clearPropertyForm();renderEntrySwitch();clear();
  if(gate.unlocked())refresh();
  const reload=()=>{if(gate.unlocked()&&!$('entry').open)refresh();};
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
    // The press was the asking, so the ledger is what comes up — not the tab
    // the owner happened to be on when they asked.
    $('tabs').select('ledger');
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
