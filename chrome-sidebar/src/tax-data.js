// Filing tax documents: the document types, the years that can be filed into,
// and the name a document takes once it is in Drive. The tool, the reading and
// the upload route all answer to this module, so the name shown before filing
// is exactly the name the file is given.

// The owner's top-level tax folder in Google Drive. It holds one subfolder per
// tax year, named by the four-digit year; a year that has no folder yet gets
// one on first use. It lives here rather than in a record because it is the one
// fixed destination this capability exists to reach.
export const TAX_ROOT_FOLDER_ID='16kSurMc_G_wTBH-hUnoNFYPBUwkKROZN';
export const TAX_ROOT_FOLDER_URL=`https://drive.google.com/drive/folders/${TAX_ROOT_FOLDER_ID}`;

// `prefix` is what the filed name starts with. "Other document" has none: its
// name is whatever the owner calls it, because the point of that entry is a
// document none of the named forms describes.
export const TAX_DOCUMENT_TYPES=[
  {id:'k1',label:'Schedule K-1',prefix:'K-1'},
  {id:'1099',label:'Form 1099',prefix:'Form 1099'},
  {id:'w2',label:'Form W-2',prefix:'Form W-2'},
  {id:'1098',label:'Form 1098',prefix:'Form 1098'},
  {id:'5498',label:'Form 5498',prefix:'Form 5498'},
  {id:'1095',label:'Form 1095',prefix:'Form 1095'},
  {id:'year-end-statement',label:'Year-end statement',prefix:'Year-end statement'},
  {id:'property-tax',label:'Property tax',prefix:'Property tax'},
  {id:'charitable',label:'Charitable receipt',prefix:'Charitable receipt'},
  {id:'estimated-payment',label:'Estimated payment',prefix:'Estimated payment'},
  {id:'payment-proof',label:'Proof of payment',prefix:'Proof of payment'},
  {id:'return',label:'Filed return',prefix:'Return'},
  {id:'other',label:'Other document',prefix:''}
];
export const taxTypeFor=id=>TAX_DOCUMENT_TYPES.find(type=>type.id===id)||null;
export const taxTypeLabel=id=>taxTypeFor(id)?.label||id;

// Documents arrive after the year they belong to, so the year being filed is
// almost always the one just ended. The two neighbours cover an early arrival
// and a late one; anything older is a different errand than this tool's.
export const TAX_YEAR_SPAN=3;
export function taxYears(today=new Date()){
  const current=today.getFullYear();
  return Array.from({length:TAX_YEAR_SPAN},(_,index)=>String(current-index));
}
export const defaultTaxYear=(today=new Date())=>String(today.getFullYear()-1);


// Who the document belongs to. One household return and four trusts, each of
// which files its own return and pays its own estimates, so "whose is this?"
// is a question with a fixed list of answers rather than something to type.
// The label is both what the filed name carries and what the year's subfolder
// is called, so a trust is spelled one way everywhere.
export const TAX_TAXPAYERS=[
  {id:'berry',label:'Eric & Ariana Berry'},
  {id:'descendants-2020',label:'Berry 2020 Descendants’ Irrevocable Trust'},
  {id:'family-2020',label:'Berry 2020 Irrevocable Family Trust'},
  {id:'ae-2021',label:'Berry AE 2021 Irrevocable Family Trust'},
  {id:'ea-2024',label:'Berry EA 2024 Family Trust'}
];
export const DEFAULT_TAXPAYER='berry';
export const taxpayerFor=id=>TAX_TAXPAYERS.find(who=>who.id===id)||null;
export const taxpayerLabel=id=>taxpayerFor(id)?.label||'';

// Estimates and returns are paid and filed to a government, and to two of them.
export const TAX_JURISDICTIONS=[{id:'federal',label:'Federal'},{id:'ny',label:'New York'}];
export const jurisdictionFor=id=>TAX_JURISDICTIONS.find(place=>place.id===id)||null;
export const jurisdictionLabel=id=>jurisdictionFor(id)?.label||'';

// Four instalments a year, each with its own voucher and its own receipt.
export const TAX_QUARTERS=[{id:'q1',label:'Q1'},{id:'q2',label:'Q2'},{id:'q3',label:'Q3'},{id:'q4',label:'Q4'}];
export const quarterFor=id=>TAX_QUARTERS.find(quarter=>quarter.id===id)||null;
export const quarterLabel=id=>quarterFor(id)?.label||'';

// What a document is for, which is how a taxpayer's year is divided: what was
// sent to a tax authority, what was paid, and everything that backs the two up.
// Every document has one, and the type it is almost always settles it — so it
// is proposed from the type and stays a field, because a notice, an extension
// or anything filed under "Other document" is only the owner's to place.
export const TAX_CATEGORIES=[
  {id:'supporting',label:'Supporting Documents'},
  {id:'payments',label:'Payments'},
  {id:'filings',label:'Filings'}
];
export const categoryFor=id=>TAX_CATEGORIES.find(category=>category.id===id)||null;
export const categoryLabel=id=>categoryFor(id)?.label||'';
const CATEGORY_BY_TYPE={'return':'filings','estimated-payment':'payments','payment-proof':'payments'};
export const defaultCategoryFor=type=>CATEGORY_BY_TYPE[type]||'supporting';

// What a filed document is, read back from its name. The years before the tool
// named things hold names typed by hand — "1099-INT - Popular.pdf", "Eric Berry
// & Ariana Q2 Vouchers.pdf" — so the name is all there is to go on. The first
// pattern that matches wins, which is why a K-1 is asked about before an
// estimate: "Estimated K1 - Vista" is a K-1, not an instalment. A name nothing
// here recognises is an other document, and still listed.
const NAME_TYPES=[
  ['k1',/\bK-?1\b/i],
  ['return',/\breturn\b|\bForm (1040|1041|1065|1120S?)\b(?!-ES)|\bIT-20[1345]\b/i],
  ['estimated-payment',/voucher|estimated (tax )?payment|\b1040-?ES\b|\bIT-2105\b/i],
  ['payment-proof',/proof of payment|payment confirmation/i],
  ['1099',/\b1099/i],['w2',/\bW-?2\b/i],['1098',/\b1098/i],['5498',/\b5498/i],['1095',/\b1095/i],
  ['charitable',/charit|donation/i],
  ['property-tax',/property tax/i],
  ['year-end-statement',/year[- ]end/i]
];
export const taxTypeFromName=(name='')=>NAME_TYPES.find(([,pattern])=>pattern.test(name))?.[0]||'other';
const TYPE_ORDER=new Map(TAX_DOCUMENT_TYPES.map((type,index)=>[type.id,index]));
const byName=(a,b)=>a.name.localeCompare(b.name,'en',{numeric:true,sensitivity:'base'});
// Filed documents in the order the document types are listed, and by name
// within a type.
export const sortFiled=files=>files.map(file=>({file,type:taxTypeFromName(file.name)}))
  .sort((a,b)=>TYPE_ORDER.get(a.type)-TYPE_ORDER.get(b.type)||byName(a.file,b.file)).map(entry=>entry.file);
// A year's loose documents under what they are for — the same three categories
// a divided year keeps as folders — and inside each, by type. Empty categories
// and types are left out.
export function groupFiled(files=[]){
  return TAX_CATEGORIES.map(category=>{
    const types=TAX_DOCUMENT_TYPES.filter(type=>defaultCategoryFor(type.id)===category.id)
      .map(type=>({id:type.id,label:type.id==='other'?'Other':type.label,
        files:files.filter(file=>taxTypeFromName(file.name)===type.id).sort(byName)}))
      .filter(type=>type.files.length);
    return {id:category.id,label:category.label,types};
  }).filter(category=>category.types.length);
}

// Three kinds of document the household produces rather than receives: the
// return itself, the voucher that goes with an instalment, and the receipt
// proving the instalment was paid. They are named from who filed them and
// where, so they never ask for an issuer — there isn't one.
const OWN_FILING=new Set(['return','estimated-payment','payment-proof']);
const QUARTERLY=new Set(['estimated-payment','payment-proof']);
export const needsIssuer=type=>!OWN_FILING.has(type);
export const needsJurisdiction=type=>OWN_FILING.has(type);
export const needsQuarter=type=>QUARTERLY.has(type);

// Everything arriving for 2025 and earlier was filed straight into the year's
// folder, and that is where those years' documents stay. From 2026 the year is
// divided by taxpayer, because five entities filing five returns into one
// folder is the year that stops being readable.
export const TAX_SUBFOLDER_FROM_YEAR=2026;
export const filesIntoSubfolder=year=>Number(year)>=TAX_SUBFOLDER_FROM_YEAR;
// The folders a filing lands in, outermost first, under the tax root: the year,
// then — from 2026 — whose it is and what it is for. The Worker walks this,
// making each one it does not find and reusing each one it does, so a subfolder
// made by hand is used rather than duplicated.
export function taxFolderPath({year,taxpayer,category}={}){
  const path=[String(year)];
  if(filesIntoSubfolder(year)){
    const who=taxpayerLabel(taxpayer||DEFAULT_TAXPAYER);
    const what=categoryLabel(categoryFor(category)?category:'supporting');
    if(who)path.push(who);
    if(who&&what)path.push(what);
  }
  return path;
}

// Drive accepts almost any name, so the limits here are the owner's: a name
// that reads as a filename on every device and cannot be mistaken for a path.
const UNSAFE=/["*:<>?\\|/]/g;
const CONTROL=/\p{Cc}/gu;
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const MAX_ISSUER=80;
export const MAX_DOCUMENT_BYTES=20000000;
export const cleanName=text=>String(text??'').replace(CONTROL,' ').replace(UNSAFE,' ').replace(/\s+/g,' ').trim().replace(/[.\s]+$/,'');
export const extensionOf=name=>(String(name??'').toLowerCase().match(/\.[a-z0-9]{1,8}$/)||[''])[0];

// "Form 1099 - Schwab.pdf" for something that arrived; for something the
// household filed or paid, the middle says which instalment and which
// government and the end says who: "Estimated payment - Q3 Federal - Eric &
// Ariana Berry.pdf", "Return - New York - Berry EA 2024 Family Trust.pdf". The
// taxpayer is in the name as well as in the folder, so a return downloaded on
// its own still says whose it is. A type with no prefix is named by its issuer
// alone, and a missing issuer leaves the prefix standing on its own rather
// than a name that trails a separator.
export function taxFileName({type,issuer,taxpayer,jurisdiction,quarter,extension=''}){
  const prefix=cleanName(taxTypeFor(type)?.prefix??'');
  const parts=needsIssuer(type)
    ? [cleanName(issuer)]
    : [[needsQuarter(type)?quarterLabel(quarter):'',jurisdictionLabel(jurisdiction)].filter(Boolean).join(' '),
       cleanName(taxpayerLabel(taxpayer))];
  const base=[prefix,...parts].filter(Boolean).join(' - ');
  if(!base)fail('Say what this document is.');
  return `${base}${extension}`;
}

// "Form 1099 - Schwab (2).pdf" - used only when the owner has chosen to keep
// both copies. Nothing here renames anything on its own.
export function availableName(name,taken=[]){
  const existing=new Set(taken.map(entry=>String(entry).toLowerCase()));
  if(!existing.has(name.toLowerCase()))return name;
  const extension=extensionOf(name),base=name.slice(0,name.length-extension.length);
  for(let suffix=2;suffix<100;suffix++){
    const candidate=`${base} (${suffix})${extension}`;
    if(!existing.has(candidate.toLowerCase()))return candidate;
  }
  fail('Too many copies of that name are already filed.');
}

// One validator for the tool and the Worker. It answers the question both have
// to ask: is this a filing that can be given a name and a destination?
//
// A filing that names no taxpayer is the household's own, and one that names no
// category is whatever its type is usually for — so an extension still on a
// previous version files where that version meant it to.
export function normalizeTaxFiling(input={},{today=new Date()}={}){
  const type=String(input.type??'').trim();
  if(!taxTypeFor(type))fail('Choose a document type.');
  const taxpayer=String(input.taxpayer??'').trim()||DEFAULT_TAXPAYER;
  if(!taxpayerFor(taxpayer))fail('Choose whose document this is.');
  const category=String(input.category??'').trim()||defaultCategoryFor(type);
  if(!categoryFor(category))fail('Choose what this document is for.');
  const issuer=needsIssuer(type)?cleanName(input.issuer):'';
  if(needsIssuer(type)&&!issuer)fail('Say what this document is, such as the firm or fund that issued it.');
  if(issuer.length>MAX_ISSUER)fail(`Keep the name under ${MAX_ISSUER} characters.`);
  const jurisdiction=needsJurisdiction(type)?String(input.jurisdiction??'').trim():'';
  if(needsJurisdiction(type)&&!jurisdictionFor(jurisdiction))fail('Choose Federal or New York.');
  const quarter=needsQuarter(type)?String(input.quarter??'').trim():'';
  if(needsQuarter(type)&&!quarterFor(quarter))fail('Choose which quarter this is.');
  const year=String(input.year??'').trim();
  if(!taxYears(today).includes(year))fail(`Choose a tax year: ${taxYears(today).join(', ')}.`);
  const extension=extensionOf(input.fileName);
  return {type,issuer,taxpayer,category,jurisdiction,quarter,year,
    path:taxFolderPath({year,taxpayer,category}),
    name:taxFileName({type,issuer,taxpayer,jurisdiction,quarter,extension})};
}

// What the reading is allowed to come back with. A proposal nobody has looked
// at yet is not a filing, so anything unusable here becomes a blank field
// rather than an error: the form is still there to be filled in by hand.
export function parseTaxReading(value={}){
  const type=taxTypeFor(String(value.type??'').trim())?.id||'';
  const issuer=cleanName(value.issuer).slice(0,MAX_ISSUER);
  const year=/^\d{4}$/.test(String(value.year??'').trim())?String(value.year).trim():'';
  const taxpayer=taxpayerFor(String(value.taxpayer??'').trim())?.id||'';
  const jurisdiction=jurisdictionFor(String(value.jurisdiction??'').trim())?.id||'';
  const quarter=quarterFor(String(value.quarter??'').trim().toLowerCase())?.id||'';
  const confidence=['high','medium','low'].includes(value.confidence)?value.confidence:'low';
  const reason=typeof value.reason==='string'?value.reason.slice(0,400):'';
  return {type,issuer,year,taxpayer,jurisdiction,quarter,confidence,reason};
}
