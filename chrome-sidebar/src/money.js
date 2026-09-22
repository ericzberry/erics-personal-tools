// How money is written, in one place. No DOM: the Worker validates records
// through the data modules, and a data module must not pull the component
// library in behind it.
//
// Accounting notation, so what is owed reads as ($15,835) rather than
// -$15,835: a minus sign in front of a currency symbol is a typographic hyphen
// a reader's eye skips, and the figure then passes for an asset. Whole dollars
// above a thousand, because cents on a seven-figure balance are noise.
export function money(value,currency='USD'){
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency,currencySign:'accounting',
    maximumFractionDigits:Math.abs(value)>=1000?0:2}).format(value);}
  catch{return `${value.toLocaleString('en-US',{maximumFractionDigits:2})} ${currency}`;}
}

// The same notation at a glance: an axis tick or a figure beside a bar, where
// $82,410,337 is eleven characters nobody reads and $82.4M is the answer.
// Never a figure the owner might copy or compare to the cent — that is money().
export function moneyShort(value,currency='USD'){
  // Below a thousand there is nothing to shorten.
  if(!(Math.abs(value)>=1000))return money(value,currency);
  try{
    // Compact notation drops the accounting sign, so the parentheses are put
    // back by hand: what is owed never reads as a hyphen here either.
    const text=new Intl.NumberFormat('en-US',{style:'currency',currency,notation:'compact',
      maximumFractionDigits:Math.abs(value)>=1e9?2:1}).format(Math.abs(value));
    return value<0?`(${text})`:text;
  }
  catch{return money(value,currency);}
}

// A figure as it is typed: thousands grouped the way the ledger will print it,
// so 4384000 in a box reads 4,384,000 before anyone has to count the zeros.
// Only the digits, one point and a leading sign are kept. A pasted "$" goes,
// and a minus or an opening parenthesis in front stays as a minus, so a check
// that refuses a negative says so rather than this quietly turning it positive.
// A figure filled in from a record shows its cents as cents: 1234.5 is
// 1,234.50, while one being typed is left exactly as far as it has got.
export function typedAmount(value,{filled=false}={}){
  const text=String(value??'').trim();
  const negative=/^[-(−]/.test(text);
  const kept=text.replace(/[^\d.]/g,'');
  const point=kept.indexOf('.');
  const whole=(point<0?kept:kept.slice(0,point)).replace(/^0+(?=\d)/,'');
  let cents=point<0?'':kept.slice(point+1).replace(/\./g,'');
  if(filled&&cents.length===1)cents+='0';
  const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return `${negative?'-':''}${grouped}${point<0?'':`.${cents}`}`;
}
// The same figure as the plain number every record reads: "4384000".
export const plainAmount=value=>typedAmount(value).replace(/,/g,'');
