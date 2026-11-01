// A spreadsheet written on the device with no library and no network: the
// ledger leaves as an .xlsx any spreadsheet program opens. The vendored reader
// is not in Git and only reads, so this is the writer's own small zip.
//
// Deliberately small. One or more sheets of rows; a cell is a string, a number
// or null, and a column says how its numbers read — money, a date, a share —
// so a figure stays a number Excel can add rather than text that looks like
// one. Entries are stored rather than deflated: a ledger is kilobytes, and a
// stored zip is a few lines where a compressor is a library.
const encoder=new TextEncoder();
const CRC=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=bytes=>{let c=0xffffffff;for(const byte of bytes)c=CRC[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};

export function zipStored(files){
  const parts=[],central=[];let offset=0;
  for(const [name,text] of files){
    const path=encoder.encode(name),data=typeof text==='string'?encoder.encode(text):text,crc=crc32(data);
    const local=new DataView(new ArrayBuffer(30));
    local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint32(14,crc,true);
    local.setUint32(18,data.length,true);local.setUint32(22,data.length,true);local.setUint16(26,path.length,true);
    const entry=new DataView(new ArrayBuffer(46));
    entry.setUint32(0,0x02014b50,true);entry.setUint16(4,20,true);entry.setUint16(6,20,true);entry.setUint32(16,crc,true);
    entry.setUint32(20,data.length,true);entry.setUint32(24,data.length,true);entry.setUint16(28,path.length,true);
    entry.setUint32(42,offset,true);
    parts.push(new Uint8Array(local.buffer),path,data);
    central.push(new Uint8Array(entry.buffer),path);
    offset+=30+path.length+data.length;
  }
  const size=central.reduce((sum,part)=>sum+part.length,0);
  const end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);
  end.setUint32(12,size,true);end.setUint32(16,offset,true);
  const all=[...parts,...central,new Uint8Array(end.buffer)];
  const out=new Uint8Array(all.reduce((sum,part)=>sum+part.length,0));
  let at=0;for(const part of all){out.set(part,at);at+=part.length;}
  return out;
}

// XML 1.0 cannot carry most control characters at all, so they go rather than
// making a file Excel refuses to open.
const escape=value=>String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g,'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const columnName=index=>{let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
// Style indexes into the stylesheet below; a column's `format` picks one.
const STYLE={text:0,header:1,money:2,date:3,share:4,number:5};
// Days since Excel's epoch, which is what a date cell holds.
const serial=date=>Date.parse(`${date}T00:00:00Z`)/86400000+25569;

function sheetXml({columns,rows}){
  const cell=(value,column,ref)=>{
    if(value===null||value===undefined||value==='')return '';
    const format=column.format||'text';
    if(format==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return `<c r="${ref}" s="${STYLE.date}"><v>${serial(value)}</v></c>`;
    if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}" s="${STYLE[format]??STYLE.number}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
  };
  const head=`<row r="1">${columns.map((column,index)=>`<c r="${columnName(index)}1" t="inlineStr" s="${STYLE.header}"><is><t>${escape(column.label)}</t></is></c>`).join('')}</row>`;
  const body=rows.map((row,at)=>`<row r="${at+2}">${columns.map((column,index)=>cell(row[column.key],column,`${columnName(index)}${at+2}`)).join('')}</row>`).join('');
  const last=`${columnName(columns.length-1)}${rows.length+1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${columns.map((column,index)=>`<col min="${index+1}" max="${index+1}" width="${column.width||14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${head}${body}</sheetData>${rows.length?`<autoFilter ref="A1:${last}"/>`:''}</worksheet>`;
}

const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]\\(#,##0.00\\)"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.00%"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// `sheets` is [{name, columns:[{key,label,format,width}], rows:[{[key]:value}]}].
export function writeXlsx(sheets){
  const names=sheets.map((sheet,index)=>escape(String(sheet.name||`Sheet${index+1}`).replace(/[\\/?*[\]:]/g,' ').slice(0,31)));
  return zipStored([
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name,index)=>`<sheet name="${name}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',STYLES],
    ...sheets.map((sheet,index)=>[`xl/worksheets/sheet${index+1}.xml`,sheetXml(sheet)])
  ]);
}
