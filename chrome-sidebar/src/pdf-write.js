// A PDF of text, written on the device with no library and no network. It is
// what the visit summary leaves the vault as: paragraphs in one of two faces,
// wrapped to the page, in a file any reader and any printer takes.
//
// Deliberately small. The fonts are the reader's own Helvetica, so nothing is
// embedded and nothing is fetched; text is written in WinAnsi, which covers
// Latin script, the curly quotes and dashes an owner types, and the bullet.
// A character outside that set — another script, an emoji — is written as a
// question mark rather than dropped, and `unwritable` counts how many were, so
// a caller can say so before the file leaves.
const WINANSI=new Map([['\u2018',0x91],['\u2019',0x92],['\u201c',0x93],['\u201d',0x94],['\u2022',0x95],['\u2013',0x96],['\u2014',0x97],['\u2026',0x85],['\u20ac',0x80],['\u2122',0x99],['\u2030',0x89],['\u0160',0x8a],['\u0161',0x9a],['\u0178',0x9f],['\u017d',0x8e],['\u017e',0x9e],['\u0152',0x8c],['\u0153',0x9c],['\u02c6',0x88],['\u02dc',0x98],['\u201a',0x82],['\u201e',0x84],['\u2020',0x86],['\u2021',0x87],['\u0192',0x83],['\u2039',0x8b],['\u203a',0x9b],['\u00a0',0x20]]);
export function encodeWinAnsi(text){
  const bytes=[];let unwritable=0;
  for(const char of String(text)){
    const code=char.codePointAt(0);
    if(code===0x09||code===0x0a||code===0x0d){bytes.push(0x20);continue;}
    if(code>=0x20&&code<=0x7e||code>=0xa0&&code<=0xff)bytes.push(code);
    else if(WINANSI.has(char))bytes.push(WINANSI.get(char));
    else{bytes.push(0x3f);unwritable++;}
  }
  return {bytes,unwritable};
}
// Helvetica's advance widths, in thousandths of the type size, for the
// characters that decide where a line breaks. Anything unlisted is taken at
// the face's average, which errs long, so a line is never wider than the page.
const WIDTHS={' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,'*':389,'+':584,',':278,'-':333,'.':278,'/':278,'0':556,'1':556,'2':556,'3':556,'4':556,'5':556,'6':556,'7':556,'8':556,'9':556,':':278,';':278,'<':584,'=':584,'>':584,'?':556,'@':1015,'A':667,'B':667,'C':722,'D':722,'E':667,'F':611,'G':778,'H':722,'I':278,'J':500,'K':667,'L':556,'M':833,'N':722,'O':778,'P':667,'Q':778,'R':722,'S':667,'T':611,'U':722,'V':667,'W':944,'X':667,'Y':667,'Z':611,'[':278,'\\':278,']':278,'^':469,'_':556,'`':333,'a':556,'b':556,'c':500,'d':556,'e':556,'f':278,'g':556,'h':556,'i':222,'j':222,'k':500,'l':222,'m':833,'n':556,'o':556,'p':556,'q':556,'r':333,'s':500,'t':278,'u':556,'v':500,'w':722,'x':500,'y':500,'z':500,'{':334,'|':260,'}':334,'~':584,'\u2019':222,'\u2018':222,'\u201c':333,'\u201d':333,'\u2013':556,'\u2014':1000,'\u2022':350,'\u2026':1000};
const width=(text,size,bold)=>[...text].reduce((sum,char)=>sum+(WIDTHS[char]??600)*(bold?1.06:1),0)*size/1000;
export function wrapLine(text,size,maxWidth,{bold=false}={}){
  const lines=[];
  for(const paragraph of String(text).split(/\r?\n/)){
    const words=paragraph.split(/\s+/).filter(Boolean);
    if(!words.length){lines.push('');continue;}
    let line='';
    for(const word of words){
      const candidate=line?`${line} ${word}`:word;
      if(width(candidate,size,bold)<=maxWidth||!line){line=candidate;continue;}
      lines.push(line);line=word;
    }
    // A single word wider than the page is broken by the character.
    while(width(line,size,bold)>maxWidth&&line.length>1){
      let cut=line.length;
      while(cut>1&&width(line.slice(0,cut),size,bold)>maxWidth)cut--;
      lines.push(line.slice(0,cut));line=line.slice(cut);
    }
    lines.push(line);
  }
  return lines;
}
const STYLES={title:{size:18,bold:true,before:0,after:8},heading:{size:12.5,bold:true,before:14,after:4},body:{size:11,bold:false,before:2,after:2},small:{size:9.5,bold:false,before:0,after:3}};
const escape=bytes=>{
  const out=[];
  for(const byte of bytes){
    if(byte===0x28||byte===0x29||byte===0x5c)out.push(0x5c);
    out.push(byte);
  }
  return out;
};
const ascii=text=>Array.from(text,char=>char.charCodeAt(0)&0xff);
// `lines` is a run of {style, text}; each is wrapped and set in its style, and
// a page ends where the next line would not fit.
export function writePdf(lines,{title='Document',pageWidth=612,pageHeight=792,margin=54}={}){
  const pages=[];let page=[],y=pageHeight-margin,unwritable=0;
  const newPage=()=>{if(page.length)pages.push(page);page=[];y=pageHeight-margin;};
  for(const line of lines){
    const style=STYLES[line.style]||STYLES.body;
    const wrapped=wrapLine(line.text||'',style.size,pageWidth-margin*2,{bold:style.bold});
    const lead=style.size*1.35;
    if(y-style.before-lead<margin)newPage();
    y-=style.before;
    for(const piece of wrapped){
      if(y-lead<margin)newPage();
      y-=lead;
      const encoded=encodeWinAnsi(piece);unwritable+=encoded.unwritable;
      page.push({x:margin,y,size:style.size,bold:style.bold,bytes:escape(encoded.bytes)});
    }
    y-=style.after;
  }
  newPage();
  // Objects: 1 catalog, 2 pages, 3 regular face, 4 bold face, then a page and
  // its content stream for each page.
  const objects=[];
  const add=body=>{objects.push(body);return objects.length;};
  add(ascii('<< /Type /Catalog /Pages 2 0 R >>'));
  const pagesIndex=add(null);
  add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  const pageIds=[];
  for(const content of pages){
    const stream=[];
    stream.push(...ascii('BT\n'));
    for(const item of content){
      stream.push(...ascii(`/F${item.bold?'2':'1'} ${item.size} Tf 1 0 0 1 ${item.x.toFixed(2)} ${item.y.toFixed(2)} Tm (`),...item.bytes,...ascii(') Tj\n'));
    }
    stream.push(...ascii('ET\n'));
    const streamId=add([...ascii(`<< /Length ${stream.length} >>\nstream\n`),...stream,...ascii('endstream')]);
    pageIds.push(add(ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`)));
  }
  objects[pagesIndex-1]=ascii(`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const info=add([...ascii('<< /Title ('),...escape(encodeWinAnsi(title).bytes),...ascii(') /Producer (Eric’s Tools) >>'.replace('’',"'"))]);
  const out=[...ascii('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')];
  const offsets=[];
  objects.forEach((body,index)=>{
    offsets.push(out.length);
    out.push(...ascii(`${index+1} 0 obj\n`),...body,...ascii('\nendobj\n'));
  });
  const xref=out.length;
  out.push(...ascii(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`));
  for(const offset of offsets)out.push(...ascii(`${String(offset).padStart(10,'0')} 00000 n \n`));
  out.push(...ascii(`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return {bytes:new Uint8Array(out),pages:pages.length,unwritable};
}
