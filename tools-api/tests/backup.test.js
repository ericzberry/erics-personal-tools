import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../src/index.js';
import {encryptSettings,decryptSettings} from '../src/ai-settings.js';
import {DRIVE_SCOPE} from '../src/drive.js';
import {sweepBackup,sweepHealthBackup,takeBackup,restoreBackup,backupRoutes,backupState,readTables,writeTables,BACKUP_FOLDER_ID,BACKUP_CRON,HEALTH_DAILY_KEEP} from '../src/backup.js';
import {buildBackup,verifyBackup,upgradeBackup,encodeCell,quarterOf,backupName,keyCheck,BACKUP_VERSION,BACKUP_FORMAT} from '../src/backup-format.js';

const token='synthetic-token-at-least-32-characters';
const KEY='12'.repeat(32);
const SCHEMAS=['schema.sql','drive-schema.sql','finance-schema.sql','reminders-schema.sql','release-schema.sql','backup-schema.sql','health-schema.sql'];

// D1 as far as this module uses it, over node:sqlite — including batch, which
// D1 runs as one transaction, and foreign keys, which D1 enforces.
function environment(extra={}){
  const sql=new DatabaseSync(':memory:');
  for(const schema of SCHEMAS)sql.exec(readFileSync(new URL(`../${schema}`,import.meta.url),'utf8'));
  // A table no schema file declares, as three in production are: a backup
  // must find it anyway. It holds text JSON would mangle if it were careless.
  sql.exec('CREATE TABLE legacy_notes (id TEXT PRIMARY KEY, body TEXT)');
  sql.prepare('INSERT INTO legacy_notes VALUES (?, ?)').run('n1','Crème brûlée — Eric’s “note” \u{1F4B0}');
  const prepare=query=>{
    const statement=sql.prepare(query);let args=[];
    const reads=/^\s*SELECT/i.test(query);
    return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
      async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};},
      execute(){return reads?{results:statement.all(...args)}:{results:[],meta:{changes:Number(statement.run(...args).changes)}};}};
  };
  const DB={prepare,async batch(statements){
    sql.exec('BEGIN');
    try{const out=statements.map(statement=>statement.execute());sql.exec('COMMIT');return out;}
    catch(error){sql.exec('ROLLBACK');throw error;}
  }};
  return {sql,env:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:KEY,GOOGLE_CLIENT_ID:'synthetic-client-id',GOOGLE_CLIENT_SECRET:'synthetic-client-secret',DB,...extra}};
}
const connectGoogle=async env=>env.DB
  .prepare('INSERT INTO drive_accounts (id, value, updated_at) VALUES (?, ?, ?)')
  .bind('google-drive',await encryptSettings({refreshToken:'synthetic-refresh-token',email:'owner@example.com',
    connectedAt:new Date().toISOString(),scopes:[DRIVE_SCOPE]},'google-drive',env),new Date().toISOString()).run();

// Enough of Google Drive to take a backup and read one back: uploads are kept
// byte for byte, and Drive's checksum is computed over what arrived.
function fakeDrive({folder=BACKUP_FOLDER_ID,lie=false}={}){
  const files=new Map();let next=1;
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const fetcher=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    if(url.origin==='https://oauth2.googleapis.com')return reply({access_token:'synthetic-access',expires_in:3600});
    if(init.headers?.Authorization!=='Bearer synthetic-access')return reply({error:{message:'bad token'}},401);
    if(url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){
      const raw=Buffer.from(await new Response(init.body).arrayBuffer());
      const boundary=init.headers['Content-Type'].split('boundary=')[1];
      const parts=raw.toString('utf8').split(`--${boundary}`);
      const metadata=JSON.parse(parts[1].split('\r\n\r\n')[1]);
      const content=parts[2].slice(parts[2].indexOf('\r\n\r\n')+4,-2);
      if(!metadata.parents.includes(folder))return reply({error:{message:'File not found'}},404);
      const bytes=Buffer.from(content,'utf8');
      const file={id:`backup-file-${next++}`,...metadata,content,size:String(bytes.length),
        sha256Checksum:lie?'0'.repeat(64):createHash('sha256').update(bytes).digest('hex'),
        createdTime:new Date().toISOString(),webViewLink:'https://drive.google.com/file/d/x/view'};
      files.set(file.id,file);
      const {content:_,...shown}=file;
      return reply(shown);
    }
    if(url.pathname==='/drive/v3/files'){
      const parent=(url.searchParams.get('q').match(/'([^']+)' in parents/)||[])[1];
      return reply({files:[...files.values()].filter(file=>file.parents.includes(parent))
        .map(({content,...file})=>file).reverse()});
    }
    const id=decodeURIComponent(url.pathname.split('/').pop());
    const file=files.get(id);
    if(!file)return reply({error:{message:'File not found'}},404);
    if(init.method==='DELETE'){files.delete(id);return new Response(null,{status:204});}
    if(url.searchParams.get('alt')==='media')return new Response(file.content,{headers:{'Content-Type':'application/json'}});
    return reply({id:file.id,name:file.name,parents:file.parents,size:file.size,trashed:false});
  };
  return {fetcher,files};
}
const request=new Request('https://example.com/v1/backup');
const contents=(drive,id)=>JSON.parse(drive.files.get(id).content);

// A small ledger: two portfolios, their figures, a flow. Numbers only, as the
// real one stores them; the names are sealed like every portfolio's.
async function seedLedger(env){
  for(const [id,name] of [[1,'Synthetic Trust'],[2,'Synthetic IRA']])
    await env.DB.prepare('INSERT INTO finance_portfolios (id, value, revision) VALUES (?, ?, ?)')
      .bind(id,await encryptSettings({name,registration:1,currency:'USD'},`finance:p${id}`,env),`rev-${id}`).run();
  for(const [portfolio,firm,asOf,cents] of [[1,3,20260630,4300000000],[1,5,20260630,900000000],[2,3,20260630,125050],[2,3,20260331,120000]])
    await env.DB.prepare('INSERT INTO finance_marks (portfolio, class, firm, as_of, cents) VALUES (?, 1, ?, ?, ?)').bind(portfolio,firm,asOf,cents).run();
  await env.DB.prepare('INSERT INTO finance_flows (firm, as_of, cents) VALUES (3, 20260415, -50000000)').run();
}
const marks=sql=>sql.prepare('SELECT portfolio, class, firm, as_of, cents FROM finance_marks ORDER BY portfolio, firm, as_of').all().map(row=>({...row}));

test('a backup file proves itself whole, table by table, and refuses a format it does not know',async()=>{
  const tables=[{name:'finance_marks',schema:'CREATE TABLE finance_marks (x)',columns:['portfolio','cents'],rows:[[1,4300000000],[2,125050]]},
    {name:'empty_one',schema:'CREATE TABLE empty_one (x)',columns:[],rows:[]}];
  const file=await buildBackup({kind:'quarterly',createdAt:'2026-10-01T08:00:00Z',database:'db',key:KEY,tables});
  assert.equal(file.format,BACKUP_FORMAT);
  assert.equal(file.version,BACKUP_VERSION);
  assert.equal(file.quarter,'2026-Q4');
  assert.equal(file.encryption.keyCheck,await keyCheck(KEY));
  assert.doesNotMatch(JSON.stringify(file),new RegExp(KEY),'the key itself is never written');
  const good=await verifyBackup(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(good.problems,[]);
  assert.equal(good.whole,true);

  // A figure changed inside a table: that table is damaged, the rest are not.
  const altered=JSON.parse(JSON.stringify(file));
  altered.tables[0].rows[0][1]=1;
  const damaged=await verifyBackup(altered);
  assert.equal(damaged.whole,true);
  assert.deepEqual(damaged.tables.map(table=>table.whole),[false,true]);

  // The header is covered too.
  const moved=JSON.parse(JSON.stringify(file));
  moved.quarter='2026-Q3';
  assert.equal((await verifyBackup(moved)).whole,false);

  // A file from a later version is refused rather than guessed at.
  const later=await verifyBackup({...file,version:BACKUP_VERSION+1});
  assert.equal(later.readable,false);
  assert.equal(later.newer,true);
  assert.match(later.problems[0],/newer copy of tools-api/);
  assert.equal((await verifyBackup({format:'something-else'})).readable,false);
  assert.equal(upgradeBackup(file),file);
});

test('a cell JSON cannot carry is encoded rather than lost',()=>{
  assert.equal(encodeCell(null),null);
  assert.equal(encodeCell(4300000000),4300000000);
  assert.equal(encodeCell('text'),'text');
  assert.deepEqual(encodeCell(new Uint8Array([0,255,10])),{base64:'AP8K'});
  assert.deepEqual(encodeCell([0,255,10]),{base64:'AP8K'});
  assert.deepEqual(encodeCell(Infinity),{real:'Infinity'});
  assert.equal(quarterOf(new Date('2026-12-31T23:59:59Z')),'2026-Q4');
  assert.equal(quarterOf(new Date('2027-01-01T00:00:00Z')),'2027-Q1');
  assert.equal(backupName(new Date('2026-10-01T08:00:12Z'),'quarterly'),'erics-tools-backup-2026-10-01-0800Z-quarterly.json');
});

test('the daily trigger writes one verified backup of every table per quarter into the backup folder',async()=>{
  const {env}=environment();
  await connectGoogle(env);await seedLedger(env);
  await env.DB.prepare("INSERT INTO app_releases (app, version, published_at) VALUES ('chrome-sidebar', '0.6.261', 'now')").run();
  await env.DB.prepare("INSERT INTO drive_tickets (id, kind, value, created_at) VALUES ('t', 'auth', 'x', 'now')").run();
  const drive=fakeDrive();
  const logs=[];
  const first=await sweepBackup(env,{fetcher:drive.fetcher,now:new Date('2026-10-01T08:00:00Z'),log:line=>logs.push(line)});
  assert.equal(first.backedUp,true,first.failed);
  assert.equal(first.checked,'sha256');
  const stored=drive.files.get(first.id);
  assert.deepEqual(stored.parents,[BACKUP_FOLDER_ID]);
  assert.equal(stored.name,'erics-tools-backup-2026-10-01-0800Z-quarterly.json');
  assert.deepEqual(stored.appProperties,{ericsToolsBackup:String(BACKUP_VERSION),backupKind:'quarterly',backupQuarter:'2026-Q4'});

  const file=contents(drive,first.id);
  assert.deepEqual((await verifyBackup(file)).problems,[]);
  const names=file.tables.map(table=>table.name);
  for(const name of ['finance_portfolios','finance_marks','finance_flows','drive_accounts','legacy_notes','backup_state'])
    assert.ok(names.includes(name),`${name} is in the backup`);
  assert.ok(!names.includes('drive_tickets'),'expired tickets are left out');
  assert.equal(file.scope,'full');
  assert.deepEqual(file.apps,{'chrome-sidebar':'0.6.261'});
  // The ledger's figures are there as numbers, exactly.
  const figures=file.tables.find(table=>table.name==='finance_marks');
  assert.deepEqual(figures.columns,['portfolio','class','firm','as_of','cents','import_id']);
  assert.ok(figures.rows.some(row=>row[4]===4300000000));
  // Sealed rows stay sealed, and still open with the Worker's key.
  const portfolios=file.tables.find(table=>table.name==='finance_portfolios');
  assert.doesNotMatch(JSON.stringify(portfolios),/Synthetic Trust/);
  assert.equal((await decryptSettings(portfolios.rows[0][1],'finance:p1',env)).name,'Synthetic Trust');
  // Text outside the ASCII range reaches Drive intact.
  assert.equal(file.tables.find(table=>table.name==='legacy_notes').rows[0][1],'Crème brûlée — Eric’s “note” \u{1F4B0}');

  const state=await backupState(env);
  assert.equal(state.quarterly.quarter,'2026-Q4');
  assert.equal(state.quarterly.id,first.id);
  assert.match(logs[0],/backup erics-tools-backup-2026-10-01-0800Z-quarterly\.json/);

  // The rest of the quarter, nothing more.
  assert.deepEqual(await sweepBackup(env,{fetcher:drive.fetcher,now:new Date('2026-12-31T08:00:00Z')}),{skipped:'done'});
  assert.equal(drive.files.size,1);
  // The next quarter, the next one.
  assert.equal((await sweepBackup(env,{fetcher:drive.fetcher,now:new Date('2027-01-01T08:00:00Z')})).backedUp,true);
  assert.equal(drive.files.size,2);
});

test('a quarter without a backup is said out loud once, after a second failed day',async()=>{
  const {env}=environment();
  const drive=fakeDrive();
  const told=[];
  const notify=async(_,message)=>{told.push(message);return {sent:1};};
  const day=date=>sweepBackup(env,{fetcher:drive.fetcher,now:new Date(`${date}T08:00:00Z`),notify});
  // No Google connection at all.
  assert.match((await day('2026-10-01')).failed,/Connect Google Drive first/);
  assert.equal(told.length,0,'one bad day is not news');
  assert.equal((await day('2026-10-02')).days,2);
  assert.equal(told.length,1);
  assert.equal(told[0].title,'No backup yet for 2026-Q4');
  assert.match(told[0].body,/Connect Google Drive first\. It tries again tomorrow\./);
  await day('2026-10-03');
  assert.equal(told.length,1,'told once a quarter, not every day');
  await connectGoogle(env);
  assert.equal((await day('2026-10-04')).backedUp,true);
  assert.equal((await backupState(env)).failure,null);
});

test('a backup Drive did not keep byte for byte is a failure, and so is a folder out of reach',async()=>{
  const {env}=environment();
  await connectGoogle(env);
  const lying=await sweepBackup(env,{fetcher:fakeDrive({lie:true}).fetcher,now:new Date('2026-10-01T08:00:00Z'),notify:async()=>{}});
  assert.match(lying.failed,/Drive kept different bytes/);
  assert.equal((await backupState(env)).quarterly,undefined);
  const elsewhere=await sweepBackup(env,{fetcher:fakeDrive({folder:'another-folder'}).fetcher,now:new Date('2026-10-02T08:00:00Z'),notify:async()=>{}});
  assert.match(elsewhere.failed,/backup folder is not reachable/);
});

test('the ledger is restored from a backup exactly, after a preview and a safety backup, leaving everything else alone',async()=>{
  const {env,sql}=environment();
  await connectGoogle(env);await seedLedger(env);
  const drive=fakeDrive();
  const backup=await takeBackup(env,{request,fetcher:drive.fetcher,kind:'quarterly',now:new Date('2026-10-01T08:00:00Z')});
  const good=marks(sql);

  // The kind of damage that has happened before: a figure overwritten, one
  // lost, and one that should not be there.
  sql.prepare('UPDATE finance_marks SET cents = 1 WHERE portfolio = 1 AND firm = 5').run();
  sql.prepare('DELETE FROM finance_marks WHERE portfolio = 2 AND as_of = 20260331').run();
  sql.prepare('INSERT INTO finance_marks (portfolio, class, firm, as_of, cents) VALUES (2, 1, 3, 20260901, 777)').run();
  // Written after the backup, and nothing to do with the ledger.
  sql.prepare("INSERT INTO reminder_records (id, value, revision, updated_at) VALUES ('r1', 'sealed', 'rev', 'now')").run();
  const damaged=marks(sql);

  const preview=await restoreBackup(env,{request,fetcher:drive.fetcher,fileId:backup.id,tables:'finance'});
  assert.equal(preview.confirmed,false);
  const figures=preview.tables.find(table=>table.table==='finance_marks');
  assert.deepEqual({restored:figures.restored,removed:figures.removed,unchanged:figures.unchanged},{restored:2,removed:2,unchanged:2});
  assert.ok(preview.tables.find(table=>table.table==='finance_portfolios').unchanged===2);
  assert.deepEqual(marks(sql),damaged,'a preview changes nothing');
  assert.equal(drive.files.size,1,'and writes nothing');

  const done=await restoreBackup(env,{request,fetcher:drive.fetcher,fileId:backup.id,tables:['finance'],confirm:true,now:new Date('2026-10-05T12:00:00Z')});
  assert.equal(done.restored,true);
  assert.equal(done.verified,true);
  assert.deepEqual(marks(sql),good);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM reminder_records').get().n,1,'other tables are not rewound');

  // The damaged ledger went to Drive first, so the restore can be undone.
  const safety=contents(drive,done.safety.id);
  assert.equal(safety.kind,'before-restore');
  assert.equal(safety.scope,'partial');
  assert.ok(safety.tables.every(table=>table.name.startsWith('finance_')));
  assert.ok(safety.tables.find(table=>table.name==='finance_marks').rows.some(row=>row[4]===777));
  assert.equal((await backupState(env)).restore.safety.id,done.safety.id);

  // Asked again, there is nothing to do.
  const again=await restoreBackup(env,{request,fetcher:drive.fetcher,fileId:backup.id,tables:'finance',confirm:true});
  assert.equal(again.restored,false);
});

test('an edit synced while the safety backup uploads stops the restore rather than being lost',async()=>{
  const {env,sql}=environment();
  await connectGoogle(env);await seedLedger(env);
  const drive=fakeDrive();
  const backup=await takeBackup(env,{request,fetcher:drive.fetcher,kind:'quarterly',now:new Date('2026-10-01T08:00:00Z')});
  const good=marks(sql);
  sql.prepare('UPDATE finance_marks SET cents = 1 WHERE portfolio = 1 AND firm = 5').run();
  // A device syncs something while the before-restore file is on its way to
  // Drive: after the tables were read for it, before they are replaced.
  const whileUploading=edit=>async(input,init={})=>{
    if(new URL(typeof input==='string'?input:input.url).pathname==='/upload/drive/v3/files')edit();
    return drive.fetcher(input,init);
  };
  const restore=fetcher=>restoreBackup(env,{request,fetcher,fileId:backup.id,tables:'finance',confirm:true});

  await assert.rejects(restore(whileUploading(()=>sql.prepare('INSERT INTO finance_marks (portfolio, class, firm, as_of, cents) VALUES (2, 1, 3, 20260930, 130000)').run())),
    error=>{assert.match(error.message,/Nothing was restored: a table changed while its before-restore backup was being saved/);return true;});
  const synced=marks(sql);
  assert.ok(synced.some(row=>row.cents===130000),'the synced figure is still there');
  assert.ok(synced.some(row=>row.cents===1),'and nothing was restored');
  const missed=[...drive.files.values()].find(file=>file.appProperties.backupKind==='before-restore');
  assert.ok(!JSON.parse(missed.content).tables.find(table=>table.name==='finance_marks').rows.some(row=>row[4]===130000),
    'the file already in Drive does not hold it, which is why the restore stopped');
  assert.equal((await backupState(env)).restore,undefined);

  // An edit to a table the restore is not replacing does not stop it, and
  // running it again saves the figure the first attempt would have lost.
  const done=await restore(whileUploading(()=>sql.prepare("INSERT INTO reminder_records (id, value, revision, updated_at) VALUES ('r1', 'sealed', 'rev', 'now')").run()));
  assert.equal(done.restored,true);
  assert.equal(done.verified,true);
  assert.deepEqual(marks(sql),good);
  assert.ok(contents(drive,done.safety.id).tables.find(table=>table.name==='finance_marks').rows.some(row=>row[4]===130000));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM reminder_records').get().n,1);
});

test('a table counts as changed for any difference at all, and as unchanged only when it is the same',async()=>{
  const {env,sql}=environment();
  // No key, so a row can repeat; a column that ignores case; an empty table.
  sql.exec('CREATE TABLE notes (n, body TEXT COLLATE NOCASE); CREATE TABLE blank (id INTEGER)');
  const reset=()=>sql.exec("DELETE FROM notes; DELETE FROM blank; INSERT INTO notes VALUES (1, 'note'), (1, 'note'), (2, 'Other')");
  const list=[{name:'notes',sql:''},{name:'blank',sql:''}];
  const replacement=[{name:'notes',columns:['n','body'],rows:[[9,'restored']]},{name:'blank',columns:[],rows:[]}];
  const cases=[
    ['a row repeated differently',"DELETE FROM notes WHERE rowid = (SELECT min(rowid) FROM notes WHERE n = 1); INSERT INTO notes VALUES (2, 'Other')"],
    ['a change of case only',"UPDATE notes SET body = 'other' WHERE n = 2"],
    ['a number now text',"UPDATE notes SET n = '2' WHERE n = 2"],
    ['a row in a table read empty','INSERT INTO blank VALUES (1)']
  ];
  for(const [what,edit] of cases){
    reset();
    const read=await readTables(env,list);
    sql.exec(edit);
    const changed=await readTables(env,list);
    assert.notDeepEqual(changed,read,`${what}: the edit is real`);
    await assert.rejects(writeTables(env,replacement,read),error=>/a table changed while/.test(error.message),what);
    assert.deepEqual(await readTables(env,list),changed,`${what}: nothing was replaced`);
  }
  reset();
  await writeTables(env,replacement,await readTables(env,list));
  assert.deepEqual(sql.prepare('SELECT n, body FROM notes').all().map(row=>({...row})),[{n:9,body:'restored'}]);
});

test('a restore refuses what it cannot put back faithfully, and changes nothing when it does',async()=>{
  const {env,sql}=environment();
  await connectGoogle(env);await seedLedger(env);
  const drive=fakeDrive();
  const backup=await takeBackup(env,{request,fetcher:drive.fetcher,now:new Date('2026-10-01T08:00:00Z')});
  const attempt=input=>restoreBackup(env,{request,fetcher:drive.fetcher,fileId:backup.id,tables:'finance',...input});
  const refused=async(input,pattern)=>assert.rejects(attempt(input),error=>{assert.match(error.message,pattern);return true;});

  await refused({tables:[]},/Name the tables to restore/);
  await refused({tables:['no_such_table']},/holds no table no_such_table/);
  await refused({tables:['drive_tickets']},/never restored/);
  await refused({fileId:'../../etc'},/Drive file id/);

  // Into a Worker holding another key, its records would not open.
  const {env:rekeyed}=environment({SETTINGS_ENCRYPTION_KEY:'34'.repeat(32)});
  await connectGoogle(rekeyed);
  await assert.rejects(restoreBackup(rekeyed,{request,fetcher:drive.fetcher,fileId:backup.id,tables:'finance'}),
    error=>/different SETTINGS_ENCRYPTION_KEY/.test(error.message));

  // A file somewhere other than the backup folder.
  const stray=drive.files.get(backup.id);
  drive.files.set('stray-file-01',{...stray,id:'stray-file-01',parents:['elsewhere']});
  await refused({fileId:'stray-file-01'},/backup in the backup folder/);

  // A damaged table in the file cannot be restored from it.
  const file=JSON.parse(stray.content);
  file.tables.find(table=>table.name==='finance_marks').rows[0][4]=5;
  drive.files.set('damaged-file-1',{...stray,id:'damaged-file-1',content:JSON.stringify(file)});
  await refused({fileId:'damaged-file-1'},/finance_marks .* is damaged/);

  // A file from a newer format.
  drive.files.set('newer-file-01',{...stray,id:'newer-file-01',content:JSON.stringify({...JSON.parse(stray.content),version:BACKUP_VERSION+1})});
  await refused({fileId:'newer-file-01'},/format 2; this code reads up to format 1/);

  // Portfolios alone, from a backup that lacks one the current figures point
  // at: the whole batch is rolled back rather than leave figures orphaned.
  const before=marks(sql);
  await env.DB.prepare('INSERT INTO finance_portfolios (id, value, revision) VALUES (3, ?, ?)').bind('sealed','rev-3').run();
  await env.DB.prepare('INSERT INTO finance_marks (portfolio, class, firm, as_of, cents) VALUES (3, 1, 0, 20260901, 5)').run();
  await refused({tables:['finance_portfolios'],confirm:true},/Nothing was restored/);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM finance_portfolios').get().n,3);
  assert.equal(marks(sql).length,before.length+1);

  // More tables than one request may query on the Free plan.
  const everything=JSON.parse(stray.content).tables.map(table=>table.name).filter(name=>name!=='drive_accounts');
  await refused({tables:everything},/Restore fewer tables at a time/);
});

test('the backup has its own daily trigger, and the routes sit behind the bearer token',async()=>{
  // The trigger that runs it must be in the template the real config is made from.
  const template=readFileSync(new URL('../wrangler.example.jsonc',import.meta.url),'utf8');
  assert.ok(template.includes(`"${BACKUP_CRON}"`),'wrangler.example.jsonc schedules the backup');

  const {env}=environment();
  const pending=[];
  const ctx={waitUntil:promise=>pending.push(promise)};
  await worker.scheduled({cron:BACKUP_CRON},env,ctx);
  assert.equal(pending.length,1,'the backup runs alone in its trigger');
  await Promise.all(pending);
  assert.match((await backupState(env)).failure.error,/Connect Google Drive first/);

  const unauthorized=await worker.fetch(new Request('https://example.com/v1/backup'),env);
  assert.equal(unauthorized.status,401);
  const status=await (await worker.fetch(new Request('https://example.com/v1/backup',{headers:{Authorization:`Bearer ${token}`}}),env)).json();
  assert.equal(status.folder.id,BACKUP_FOLDER_ID);
  assert.equal(status.version,BACKUP_VERSION);
  assert.equal(status.google.connected,false);
  assert.equal(status.failure.days,1);

  await connectGoogle(env);
  const drive=fakeDrive();
  const json=(value,code=200)=>Response.json(value,{status:code});
  const readValue=async incoming=>JSON.stringify(await incoming.json());
  const run=await (await backupRoutes(new Request('https://example.com/v1/backup/run',{method:'POST'}),env,readValue,json,drive.fetcher)).json();
  assert.equal(run.backup.kind,'manual');
  const listed=await (await backupRoutes(new Request('https://example.com/v1/backup/files'),env,readValue,json,drive.fetcher)).json();
  assert.deepEqual(listed.files.map(file=>[file.id,file.kind,file.version]),[[run.backup.id,'manual',BACKUP_VERSION]]);
  // A manual backup does not stand in for the quarter's own.
  assert.equal((await backupState(env)).quarterly,undefined);
});

// The health notebook is written to daily, so a day it changed gets a file of
// its own tables — sealed twice, as they sit in D1 — and only those files are
// ever pruned, to the newest thirty.
test('the health tables are backed up on a day they changed, and only the daily health files are pruned to thirty',async()=>{
  const {env}=environment();
  await connectGoogle(env);
  const drive=fakeDrive();
  const logs=[];
  const day=n=>new Date(Date.UTC(2026,9,1+n,8));
  const seal=async(id,text)=>encryptSettings({v:1,secret:JSON.stringify({v:1,iv:'aa',ciphertext:Buffer.from(text).toString('base64url')})},`health:${id}`,env);
  const write=async(id,text,at)=>env.DB.prepare('INSERT INTO health_records (id, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, revision = excluded.revision, updated_at = excluded.updated_at')
    .bind(id,await seal(id,text),crypto.randomUUID(),at).run();
  // Nothing saved yet: the empty table is still a state worth one file.
  const first=await sweepHealthBackup(env,{fetcher:drive.fetcher,now:day(0),log:line=>logs.push(line)});
  assert.equal(first.backedUp,true,first.failed);
  const stored=drive.files.get(first.id);
  assert.equal(stored.name,'erics-tools-backup-2026-10-01-0800Z-daily-health.json');
  assert.equal(stored.appProperties.backupKind,'daily-health');
  const file=contents(drive,first.id);
  assert.deepEqual(file.tables.map(table=>table.name),['health_records'],'only the health tables');
  assert.equal(file.scope,'partial');
  assert.deepEqual((await verifyBackup(file)).problems,[]);
  // An unchanged day writes nothing.
  assert.deepEqual(await sweepHealthBackup(env,{fetcher:drive.fetcher,now:day(1)}),{skipped:'unchanged'});
  assert.equal(drive.files.size,1);
  // A changed day writes one, and the sealed row is in it sealed.
  await write('11111111-1111-4111-8111-111111111111','My dad had Parkinson’s',day(1).toISOString());
  const second=await sweepHealthBackup(env,{fetcher:drive.fetcher,now:day(2)});
  assert.equal(second.backedUp,true,second.failed);
  const saved=contents(drive,second.id).tables[0];
  assert.equal(saved.rows.length,1);
  assert.doesNotMatch(JSON.stringify(saved),/Parkinson/);
  assert.equal((await decryptSettings(saved.rows[0][1],'health:11111111-1111-4111-8111-111111111111',env)).v,1);
  assert.deepEqual(await sweepHealthBackup(env,{fetcher:drive.fetcher,now:day(3)}),{skipped:'unchanged'});
  // A quarterly file in the same folder is never touched by the pruning.
  const quarterly=await sweepBackup(env,{fetcher:drive.fetcher,now:day(3)});
  assert.equal(quarterly.backedUp,true,quarterly.failed);
  for(let n=0;n<HEALTH_DAILY_KEEP+4;n++){
    await write('11111111-1111-4111-8111-111111111111',`edit ${n}`,day(4+n).toISOString());
    const result=await sweepHealthBackup(env,{fetcher:drive.fetcher,now:day(5+n)});
    assert.equal(result.backedUp,true,result.failed);
  }
  const kinds=[...drive.files.values()].map(file=>file.appProperties.backupKind);
  assert.equal(kinds.filter(kind=>kind==='daily-health').length,HEALTH_DAILY_KEEP,'the newest thirty daily health files remain');
  assert.equal(kinds.filter(kind=>kind==='quarterly').length,1);
  const remaining=[...drive.files.values()].filter(file=>file.appProperties.backupKind==='daily-health').map(file=>file.name).sort();
  assert.ok(remaining[0]>'erics-tools-backup-2026-10-05','the oldest daily files are the ones removed');
  const state=await backupState(env);
  assert.equal(state.health.last.kind,'daily-health');
  assert.equal(state.quarterly.quarter,'2026-Q4');
  // The restore alias names the notebook's tables.
  const json=(value,code=200)=>Response.json(value,{status:code});
  const readValue=async incoming=>JSON.stringify(await incoming.json());
  const newest=[...drive.files.values()].filter(file=>file.appProperties.backupKind==='daily-health').sort((a,b)=>b.name.localeCompare(a.name))[0];
  const preview=await (await backupRoutes(new Request('https://example.com/v1/backup/restore',{method:'POST',body:JSON.stringify({fileId:newest.id,tables:'health'})}),env,readValue,json,drive.fetcher)).json();
  assert.deepEqual(preview.tables.map(table=>table.table),['health_records']);
  assert.equal(preview.confirmed,false);
});
