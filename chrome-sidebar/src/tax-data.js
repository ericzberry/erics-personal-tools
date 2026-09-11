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

// Drive accepts almost any name, so the limits here are the owner's: a name
// that reads as a filename on every device and cannot be mistaken for a path.
const UNSAFE=/["*:<>?\\|/]/g;
const CONTROL=/\p{Cc}/gu;
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const MAX_ISSUER=80;
export const MAX_DOCUMENT_BYTES=20000000;
export const cleanName=text=>String(text??'').replace(CONTROL,' ').replace(UNSAFE,' ').replace(/\s+/g,' ').trim().replace(/[.\s]+$/,'');
export const extensionOf=name=>(String(name??'').toLowerCase().match(/\.[a-z0-9]{1,8}$/)||[''])[0];

// "Form 1099 - Schwab.pdf". A type with no prefix is named by its issuer alone,
// and a missing issuer leaves the prefix standing on its own rather than a name
// that trails a separator.
export function taxFileName({type,issuer,extension=''}){
  const prefix=cleanName(taxTypeFor(type)?.prefix??'');
  const name=cleanName(issuer);
  const base=[prefix,name].filter(Boolean).join(' - ');
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
export function normalizeTaxFiling(input={},{today=new Date()}={}){
  const type=String(input.type??'').trim();
  if(!taxTypeFor(type))fail('Choose a document type.');
  const issuer=cleanName(input.issuer);
  if(!issuer)fail('Say what this document is, such as the firm or fund that issued it.');
  if(issuer.length>MAX_ISSUER)fail(`Keep the name under ${MAX_ISSUER} characters.`);
  const year=String(input.year??'').trim();
  if(!taxYears(today).includes(year))fail(`Choose a tax year: ${taxYears(today).join(', ')}.`);
  const extension=extensionOf(input.fileName);
  return {type,issuer,year,name:taxFileName({type,issuer,extension})};
}

// What the reading is allowed to come back with. A proposal nobody has looked
// at yet is not a filing, so anything unusable here becomes a blank field
// rather than an error: the form is still there to be filled in by hand.
export function parseTaxReading(value={}){
  const type=taxTypeFor(String(value.type??'').trim())?.id||'';
  const issuer=cleanName(value.issuer).slice(0,MAX_ISSUER);
  const year=/^\d{4}$/.test(String(value.year??'').trim())?String(value.year).trim():'';
  const confidence=['high','medium','low'].includes(value.confidence)?value.confidence:'low';
  const reason=typeof value.reason==='string'?value.reason.slice(0,400):'';
  return {type,issuer,year,confidence,reason};
}
