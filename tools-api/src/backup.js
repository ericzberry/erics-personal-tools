// The quarterly backup: every table in the database, once a quarter, as one
// file in a Google Drive folder the owner chose — and the way back from one.
//
// The Worker writes it because the Worker is where both halves already are: the
// D1 binding and the Google refresh token, which no page ever sees. It runs on
// a daily trigger of its own and writes one file per calendar quarter, so a day
// Google is unavailable costs a day, not a quarter. The file format, and the
// rules for reading an older or newer one, are in backup-format.js.
//
// Nothing here deletes a backup or replaces one. Drive keeps every file ever
// written; a restore writes a fresh backup of what it is about to replace
// before it replaces anything, so a restore is itself undoable.
import {driveFetch,multipartBody,storedAccount,UPLOAD} from './drive.js';
import {notifyDevices} from './push.js';
import {BACKUP_VERSION,buildBackup,verifyBackup,upgradeBackup,backupName,quarterOf,skippedTable,encodeCell,plainCell,keyCheck,sha256} from './backup-format.js';

const fail=(status,message)=>{throw {status,message};};
// The folder the owner named for backups. The connected Google account must be
// able to add files to it.
export const BACKUP_FOLDER_ID='1b6icdt5lQyTLjvy9dx_tvG6wiEudIrBw';
export const BACKUP_FOLDER_URL=`https://drive.google.com/drive/folders/${BACKUP_FOLDER_ID}`;
const FOLDER_GONE='The backup folder is not reachable with the connected Google account. Share it with that account, or connect the account that owns it.';
// Daily at 08:00 UTC — the small hours in the United States — on a trigger of
// its own rather than the hourly one. A backup reads every table, and D1 counts
// each statement toward a per-invocation limit, so sharing an invocation with
// the morning notifications would let one starve the other.
export const BACKUP_CRON='0 8 * * *';
const DATABASE='erics-personal-tools';
const STATE_ID='backup';
// Drive's one-request upload takes at most 5 MB. The whole database is a few
// hundred kilobytes; past this the upload has to become a resumable one, and
// the failure says so rather than sending a file Drive would cut short.
const MAX_UPLOAD_BYTES=5*1024*1024;
// The Workers Free plan allows 50 D1 queries per invocation and counts every
// statement inside a batch. Everything here plans against a few short of that.
const queryBudget=env=>env.CLOUDFLARE_PLAN==='paid'?900:45;
// Rows go back in as one JSON parameter per INSERT, chunked well under D1's
// 2 MB limit on a single string.
const CHUNK_BYTES=900*1024;
const quoted=name=>`"${String(name).replace(/"/g,'""')}"`;
const errorText=error=>String(error?.message||error||'unknown').slice(0,300);

// --- What the backup last did. One row of operational state: Drive file ids,
// dates and error messages, nothing personal, so it is not encrypted.
export async function backupState(env){
  const row=await env.DB.prepare('SELECT value FROM backup_state WHERE id = ?').bind(STATE_ID).first();
  if(!row)return {};
  try{return JSON.parse(row.value)||{};}catch{return {};}
}
const saveState=(env,value)=>env.DB.prepare('INSERT INTO backup_state (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
  .bind(STATE_ID,JSON.stringify(value),new Date().toISOString()).run();

// --- Reading the database.
//
// The tables are discovered rather than listed, so a table added next year is
// in the next backup without anyone remembering to add it here — including
// the ones no schema file declares any more but that still hold rows.
export async function tableList(env){
  const {results}=await env.DB.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
  return results.filter(row=>!skippedTable(row.name));
}
// One batch, and D1 runs a batch as one transaction, so every table is read at
// the same moment: a figure is never in the file without the portfolio it
// belongs to because the two were read a write apart.
export async function readTables(env,tables){
  if(!tables.length)return [];
  const results=await env.DB.batch(tables.map(table=>env.DB.prepare(`SELECT * FROM ${quoted(table.name)}`)));
  return tables.map((table,index)=>{
    const rows=results[index]?.results||[];
    // An empty table has no row to name its columns, and needs none: restoring
    // it means emptying it. Its CREATE TABLE is kept either way.
    const columns=rows.length?Object.keys(rows[0]):[];
    return {name:table.name,schema:table.sql||'',columns,rows:rows.map(row=>columns.map(column=>encodeCell(row[column])))};
  });
}
// Which app versions were published when the backup was taken, read out of
// the release table the backup already holds rather than asked for again.
function appsIn(tables){
  const releases=tables.find(table=>table.name==='app_releases');
  const app=releases?.columns.indexOf('app')??-1,version=releases?.columns.indexOf('version')??-1;
  if(app<0||version<0)return {};
  return Object.fromEntries(releases.rows.map(row=>[row[app],row[version]]));
}

// --- Writing one to Drive.
async function upload(env,request,fetcher,{file,kind,when}){
  const text=JSON.stringify(file);
  // The file is read back before it is sent: one that does not verify here
  // must never be the thing sitting in Drive looking like a backup.
  const check=await verifyBackup(JSON.parse(text));
  if(check.problems.length)fail(500,`The backup did not verify before upload: ${check.problems[0]}`);
  const bytes=new TextEncoder().encode(text);
  if(bytes.byteLength>MAX_UPLOAD_BYTES)
    fail(507,`The backup is ${(bytes.byteLength/1048576).toFixed(1)} MB, more than the 5 MB one Drive upload takes. The upload needs to become a resumable one.`);
  const name=backupName(when,kind);
  const metadata={name,parents:[BACKUP_FOLDER_ID],mimeType:'application/json',
    description:`Eric's Tools backup, format ${file.version}, ${kind}, ${file.quarter}: ${file.tables.length} tables. Check or restore it with tools-api/scripts/backup.mjs.`,
    // How a listing tells a backup from anything else put in the folder, and
    // which format it is, without opening it.
    appProperties:{ericsToolsBackup:String(file.version),backupKind:kind,backupQuarter:file.quarter}};
  const {body,contentType}=multipartBody({metadata,bytes,mimeType:'application/json'});
  const stored=await driveFetch(env,request,fetcher,
    `${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size,sha256Checksum,webViewLink`,
    {method:'POST',headers:{'Content-Type':contentType},body},{notFound:FOLDER_GONE});
  // Drive's own checksum of what it kept, against the bytes that left here. A
  // mismatch leaves the file where it is — nothing here deletes — and fails, so
  // the next day's run writes a good one.
  const sent=await sha256(bytes);
  if(stored.sha256Checksum?stored.sha256Checksum!==sent:Number(stored.size)!==bytes.byteLength)
    fail(502,`Drive kept different bytes from the ones sent, so ${stored.name||name} is not a good backup.`);
  return {id:stored.id,name:stored.name||name,link:stored.webViewLink||'',bytes:bytes.byteLength,checked:stored.sha256Checksum?'sha256':'size'};
}

// A backup of the whole database, or — before a restore — of the tables about
// to be replaced, already read by the caller.
export async function takeBackup(env,{request,fetcher=fetch,kind='manual',now:when=new Date(),tables:captured}={}){
  let tables=captured;
  if(!tables){
    const list=await tableList(env);
    if(list.length+3>queryBudget(env))
      fail(507,`The database has ${list.length} tables, more than one backup can read under the Workers Free plan's limit of 50 queries. It needs to be read in parts now.`);
    tables=await readTables(env,list);
  }
  const file=await buildBackup({kind,createdAt:when.toISOString(),database:DATABASE,scope:captured?'partial':'full',
    apps:appsIn(tables),key:env.SETTINGS_ENCRYPTION_KEY,tables});
  const stored=await upload(env,request,fetcher,{file,kind,when});
  return {...stored,kind,version:file.version,quarter:file.quarter,createdAt:file.createdAt,
    tables:file.tables.length,rows:file.tables.reduce((sum,table)=>sum+table.count,0)};
}

// --- The daily trigger. One backup per calendar quarter: the first day of a
// quarter writes it, and a failed day is tried again the next. A backup that
// silently stops is the failure that matters, so a quarter still without one
// after a second failed day is said out loud, once, on every subscribed device.
export async function sweepBackup(env,{fetcher=fetch,now:when=new Date(),log=()=>{},notify=notifyDevices}={}){
  let state;
  try{state=await backupState(env);}
  catch(error){log(`backup state unreadable: ${errorText(error)}`);return {failed:errorText(error)};}
  const quarter=quarterOf(when);
  if(state.quarterly?.quarter===quarter)return {skipped:'done'};
  try{
    // No request arrives on a cron; the token renewal reads its configuration
    // off one, so it is handed a stand-in, as the calendar sweep does.
    const result=await takeBackup(env,{request:new Request('https://tools.invalid/v1/backup'),fetcher,kind:'quarterly',now:when});
    await saveState(env,{...state,last:result,quarterly:result,failure:null});
    log(`backup ${result.name}: ${result.tables} tables, ${result.rows} rows, ${result.bytes} bytes, checked by ${result.checked}`);
    return {backedUp:true,...result};
  }catch(error){
    const earlier=state.failure?.quarter===quarter?state.failure:null;
    const failure={quarter,days:(earlier?.days||0)+1,error:errorText(error),at:when.toISOString(),notified:!!earlier?.notified};
    if(failure.days>=2&&!failure.notified){
      try{
        await notify(env,{title:`No backup yet for ${quarter}`,body:`${failure.error} It tries again tomorrow.`,tag:'backup'},{fetcher,log});
        failure.notified=true;
      }catch(problem){log(`backup notification failed: ${errorText(problem)}`);}
    }
    try{await saveState(env,{...state,failure});}catch(problem){log(`backup state not saved: ${errorText(problem)}`);}
    log(`backup failed: ${failure.error}`);
    return {failed:failure.error,days:failure.days};
  }
}

// --- Restoring.
//
// Table by table, because corruption is rarely everywhere: the ledger can be
// put back without rewinding a reminder written since. `finance` names every
// finance_ table in the file at once, which is the unit that makes sense for
// the ledger — its figures point at its portfolios.
const FINANCE=/^finance_/;
function expand(asked,backup){
  const list=Array.isArray(asked)?asked:typeof asked==='string'?[asked]:[];
  const names=list.flatMap(name=>String(name)==='finance'
    ?backup.tables.filter(table=>FINANCE.test(table.name)).map(table=>table.name):[String(name)]);
  if(!names.length)fail(400,'Name the tables to restore, or "finance" for the whole ledger.');
  return [...new Set(names)];
}
const rowKey=row=>JSON.stringify(row);
// What a restore would do to one table, by whole rows: how many are already
// exactly as the backup has them, how many the backup would put back, and how
// many present now it would take away.
function compare(saved,current,live){
  const index=new Map(current.columns.map((column,at)=>[column,at]));
  const now=current.rows.map(row=>saved.columns.map(column=>index.has(column)?row[index.get(column)]:null));
  const left=new Map();
  for(const row of now)left.set(rowKey(row),(left.get(rowKey(row))||0)+1);
  let unchanged=0;
  for(const row of saved.rows){
    const count=left.get(rowKey(row));
    if(count){unchanged++;left.set(rowKey(row),count-1);}
  }
  return {table:saved.name,backupRows:saved.rows.length,currentRows:current.rows.length,unchanged,
    restored:saved.rows.length-unchanged,removed:current.rows.length-unchanged,
    // A table whose CREATE TABLE has changed since the backup is restored by
    // column name. Columns the backup lacks take their defaults; a column the
    // backup has and the table no longer does stops the restore in SQLite
    // itself, and the batch is rolled back whole.
    schemaChanged:(live?.sql||'')!==saved.schema,
    columnsGone:current.rows.length?saved.columns.filter(column=>!index.has(column)):[],
    columnsNew:saved.rows.length?current.columns.filter(column=>!saved.columns.includes(column)):[]};
}
function chunks(rows){
  const out=[];let chunk=[],size=2;
  for(const row of rows){
    const bytes=rowKey(row).length+1;
    if(chunk.length&&size+bytes>CHUNK_BYTES){out.push(chunk);chunk=[];size=2;}
    chunk.push(row);size+=bytes;
  }
  if(chunk.length)out.push(chunk);
  return out;
}
// Each row travels as a JSON array and is taken apart by SQLite, which keeps
// every value's type: an integer comes back an integer, a sealed record's text
// comes back text.
const extracted=columns=>columns.map((_,index)=>`json_extract(value, '$[${index}]')`).join(', ');
const insertSql=table=>`INSERT INTO ${quoted(table.name)} (${table.columns.map(quoted).join(', ')}) SELECT ${extracted(table.columns)} FROM json_each(?)`;

// A statement that fails unless every table is still exactly as it was read:
// the same rows, each as many times, value for value, type for type, and byte
// for byte even in a column that ignores case. It fails by asking json() to
// read text that is not JSON, only when something differs, because SQLite has
// no statement that raises an error at will. Nothing else in a restore batch
// can fail that way — every insert reads JSON this file wrote — so the error
// says which failure it was.
const CHANGED=/malformed JSON/i;
function unchangedCheck(env,read){
  const params=[];
  const differences=read.map(table=>{
    // Read empty: it must still be empty.
    if(!table.rows.length)return `(SELECT count(*) FROM ${quoted(table.name)})`;
    const groups=table.columns.map((_,index)=>index+1).join(', ');
    const now=`SELECT ${table.columns.map(column=>`${quoted(column)} COLLATE BINARY`).join(', ')}, count(*) FROM ${quoted(table.name)} GROUP BY ${groups}`;
    const then=`SELECT ${extracted(table.columns)}, count(*) FROM (${chunks(table.rows)
      .map(rows=>`SELECT value FROM json_each(?${params.push(JSON.stringify(rows))})`).join(' UNION ALL ')}) GROUP BY ${groups}`;
    return `(SELECT count(*) FROM (SELECT * FROM (${now}) EXCEPT SELECT * FROM (${then})))`
      +` + (SELECT count(*) FROM (SELECT * FROM (${then}) EXCEPT SELECT * FROM (${now})))`;
  });
  return env.DB.prepare(`SELECT json('{' || changed) FROM (SELECT ${differences.join(' + ')} AS changed) WHERE changed > 0`).bind(...params);
}

// Replaces each table's rows with the ones given, in one transaction: every
// table goes back, or — a foreign key left dangling, a column that no longer
// exists, a table no longer as `read` found it — none does. Foreign keys are
// checked at the end rather than per statement, so the order the tables are
// emptied and filled in cannot matter.
//
// `read` is what the caller saved before replacing it. Between that read and
// this batch a device can sync an edit; replaced, the edit would be in neither
// the saved copy nor the restored tables. So the batch opens by checking the
// tables are still what was saved, inside the same transaction as the
// replacement, and refuses rather than lose anything. Only the tables being
// replaced are compared: an edit anywhere else does not stop a restore.
export async function writeTables(env,tables,read){
  const statements=[env.DB.prepare('PRAGMA defer_foreign_keys = on'),unchangedCheck(env,read)];
  for(const table of tables)statements.push(env.DB.prepare(`DELETE FROM ${quoted(table.name)}`));
  for(const table of tables)
    for(const rows of chunks(table.rows))statements.push(env.DB.prepare(insertSql(table)).bind(JSON.stringify(rows)));
  try{await env.DB.batch(statements);}
  catch(error){
    if(CHANGED.test(errorText(error)))
      fail(409,'Nothing was restored: a table changed while its before-restore backup was being saved, so that backup would have missed the change. Run the restore again.');
    fail(409,`Nothing was restored: the database refused it (${errorText(error)}).`);
  }
}

export async function restoreBackup(env,{request,fetcher=fetch,fileId,tables:asked,confirm=false,now:when=new Date()}){
  if(!/^[A-Za-z0-9_-]{10,200}$/.test(String(fileId||'')))fail(400,'Name the backup by its Drive file id.');
  const gone='That backup is not in Drive, or the connected account cannot see it.';
  const meta=await driveFetch(env,request,fetcher,`/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,parents,size,trashed`,{},{notFound:gone});
  // Only a file in the backup folder, so this route cannot be pointed at any
  // other JSON the account can read and told to write it into the database.
  if(meta.trashed||!(meta.parents||[]).includes(BACKUP_FOLDER_ID))fail(400,'Restore only from a backup in the backup folder.');
  if(Number(meta.size)>2*MAX_UPLOAD_BYTES)fail(413,`${meta.name} is larger than any backup this Worker writes.`);
  const written=await driveFetch(env,request,fetcher,`/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,{},{notFound:gone});
  const check=await verifyBackup(written);
  if(!check.readable)fail(409,check.problems[0]);
  if(!check.whole)fail(409,`${meta.name} is damaged: ${check.problems[0]} Choose another backup.`);
  const backup=upgradeBackup(written);
  // Rows sealed under another key would restore as text nothing can open.
  if(backup.encryption?.keyCheck!==await keyCheck(env.SETTINGS_ENCRYPTION_KEY))
    fail(409,`${meta.name} was sealed with a different SETTINGS_ENCRYPTION_KEY from the one this Worker holds, so its records would not open here.`);

  const names=expand(asked,backup);
  const saved=new Map(backup.tables.map(table=>[table.name,table]));
  const live=new Map((await tableList(env)).map(table=>[table.name,table]));
  for(const name of names){
    if(skippedTable(name))fail(400,`${name} is never restored from a backup.`);
    if(!saved.has(name))fail(400,`${meta.name} holds no table ${name}.`);
    if(!check.tables.find(table=>table.name===name)?.whole)fail(409,`Table ${name} in ${meta.name} is damaged, so it cannot be restored from this file.`);
    if(!live.has(name))fail(409,`The database has no table ${name} now. Apply its schema first.`);
    if(!saved.get(name).rows.every(row=>row.every(plainCell)))fail(409,`${name} holds values this version cannot write back.`);
  }
  const inserts=names.reduce((sum,name)=>sum+chunks(saved.get(name).rows).length,0);
  // Reading the tables now, the restore batch and the check that opens it,
  // reading them again, and the state.
  const needed=5+names.length*3+inserts;
  if(needed>queryBudget(env))
    fail(400,`Restoring ${names.length} tables at once needs ${needed} database queries, more than one request may make on the Workers Free plan. Restore fewer tables at a time.`);

  const current=await readTables(env,names.map(name=>live.get(name)));
  // The check that nothing changed while the safety backup was saved compares
  // through JSON, as the restore writes.
  const opaque=current.find(table=>!table.rows.every(row=>row.every(plainCell)));
  if(opaque)fail(409,`${opaque.name} holds values this version cannot check for changes before replacing them.`);
  const plan=names.map((name,index)=>compare(saved.get(name),current[index],live.get(name)));
  const file={id:meta.id,name:meta.name,createdAt:backup.createdAt,quarter:backup.quarter,kind:backup.kind,version:written.version};
  const damaged=check.tables.filter(table=>!table.whole).map(table=>table.name);
  if(!confirm)return {file,tables:plan,damaged,confirmed:false};
  if(plan.every(table=>!table.restored&&!table.removed&&!table.columnsNew.length))
    return {file,tables:plan,damaged,confirmed:true,restored:false,note:'The database already matches this backup.'};

  // Undo first: what is about to be replaced goes to Drive before anything is
  // touched, and a restore that cannot save it does not happen. A write landing
  // while it uploads would be in neither, so the batch below refuses to replace
  // a table that is no longer what was saved.
  const safety=await takeBackup(env,{request,fetcher,kind:'before-restore',now:when,tables:current});
  await writeTables(env,names.map(name=>saved.get(name)),current);
  const after=await readTables(env,names.map(name=>live.get(name)));
  const verified=names.every((name,index)=>{
    const result=compare(saved.get(name),after[index],live.get(name));
    return !result.restored&&!result.removed;
  });
  const record={at:when.toISOString(),file,tables:names,safety:{id:safety.id,name:safety.name,link:safety.link},verified};
  try{await saveState(env,{...await backupState(env),restore:record});}catch{}
  return {file,tables:plan,damaged,confirmed:true,restored:true,verified,safety};
}

// --- The routes.
export async function backupRoutes(request,env,readValue,json,fetcher=fetch){
  const path=new URL(request.url).pathname,method=request.method;

  // What the last runs did, without asking Google anything.
  if(path==='/v1/backup'&&method==='GET'){
    const state=await backupState(env);
    const account=await storedAccount(env);
    return json({version:BACKUP_VERSION,quarter:quarterOf(new Date()),folder:{id:BACKUP_FOLDER_ID,url:BACKUP_FOLDER_URL},
      google:{connected:!!account?.refreshToken,account:account?.email||''},
      quarterly:state.quarterly||null,last:state.last||null,failure:state.failure||null,restore:state.restore||null});
  }

  // Every backup in the folder, newest first, told apart from anything else
  // kept there by the properties each one was written with.
  if(path==='/v1/backup/files'&&method==='GET'){
    const found=await driveFetch(env,request,fetcher,`/files?${new URLSearchParams({
      q:`'${BACKUP_FOLDER_ID}' in parents and trashed = false`,
      fields:'files(id,name,size,createdTime,webViewLink,appProperties)',orderBy:'createdTime desc',pageSize:'200',
      supportsAllDrives:'true',includeItemsFromAllDrives:'true'})}`,{},{notFound:FOLDER_GONE});
    return json({folder:{id:BACKUP_FOLDER_ID,url:BACKUP_FOLDER_URL},files:(found.files||[])
      .filter(file=>file.appProperties?.ericsToolsBackup)
      .map(file=>({id:file.id,name:file.name,bytes:Number(file.size)||0,createdTime:file.createdTime,link:file.webViewLink||'',
        version:Number(file.appProperties.ericsToolsBackup),kind:file.appProperties.backupKind||'',quarter:file.appProperties.backupQuarter||''}))});
  }

  // One now, outside the schedule. It does not stand in for the quarter's own.
  if(path==='/v1/backup/run'&&method==='POST'){
    const result=await takeBackup(env,{request,fetcher,kind:'manual'});
    await saveState(env,{...await backupState(env),last:result});
    return json({backup:result});
  }

  // A preview unless `confirm` is exactly true.
  if(path==='/v1/backup/restore'&&method==='POST'){
    const input=JSON.parse(await readValue(request));
    return json(await restoreBackup(env,{request,fetcher,fileId:input.fileId,tables:input.tables,confirm:input.confirm===true}));
  }

  fail(404,'Unknown backup request.');
}
