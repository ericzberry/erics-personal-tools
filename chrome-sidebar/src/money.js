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
