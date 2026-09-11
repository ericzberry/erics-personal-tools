#!/usr/bin/env node
// One command for a whole release: verify the checkout, run the checks, build
// and package the extension, build mobile, deploy the Worker, publish both
// versions to D1, and confirm what the cloud now reports. Every step is one
// this repository already required; the point is that none of them gets
// forgotten or run out of order.
import {readFile,access,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const cwd=fileURLToPath(root);
// The clients' own constant, so a move of the API is one edit in one file and
// the release cannot end up confirming a host the apps no longer call.
const {CLOUD_URL:API}=await import(new URL('chrome-sidebar/src/cloud-storage.js',root));
const flags=new Set(process.argv.slice(2));
const take=name=>flags.delete(name);
const open=take('--open'),skipTests=take('--skip-tests'),repackage=take('--repackage');
if(flags.size){console.error(`Unknown option: ${[...flags].join(' ')}`);process.exit(2);}
const run=(command,args,options={})=>execFileSync(command,args,{cwd,stdio:'inherit',...options});
const read=(command,args)=>execFileSync(command,args,{cwd,encoding:'utf8'}).trim();
const step=text=>console.log(`\n\x1b[1m▸ ${text}\x1b[0m`);
const stop=(...lines)=>{console.error(`\n\x1b[31m✗ ${lines.join('\n  ')}\x1b[0m`);process.exit(1);};
const versionOf=async path=>JSON.parse(await readFile(new URL(path,root),'utf8')).version;
const extension=await versionOf('chrome-sidebar/manifest.json');
const mobile=await versionOf('mobile-app/public/app/manifest.webmanifest');

// Nothing unfinished may ship. Tracked edits are unambiguous; an untracked file
// inside a directory the builds copy is the subtler trap, because the bundle
// picks it up while Git has never seen it.
step('Checking the working tree');
const changes=read('git',['status','--porcelain=v1']).split('\n').filter(Boolean);
const tracked=changes.filter(line=>!line.startsWith('??'));
const stray=changes.filter(line=>line.startsWith('??')).map(line=>line.slice(3))
  .filter(path=>/^(chrome-sidebar\/(src|config|icons|vendor)|mobile-app\/public|tools-api\/src)\//.test(path));
if(tracked.length)stop('Uncommitted changes would ship unreviewed. Commit or set them aside first:',...tracked);
if(stray.length)stop('Untracked source files would ship without ever being committed:',...stray);
console.log('Clean.');

// A release must already exist on origin. The comparison is local, so an
// unreachable GitHub costs nothing when there is nothing left to push — which
// is where `git push && deploy` used to abort a release that was already ready.
step('Checking origin');
let behind=0,ahead=0;
try{[behind,ahead]=read('git',['rev-list','--left-right','--count','@{u}...HEAD']).split(/\s+/).map(Number);}
catch{stop('This branch has no upstream. Set one with: git push -u origin <branch>');}
if(behind)stop(`origin has ${behind} commit(s) this checkout does not. Reconcile with git pull first.`);
if(ahead){
  console.log(`Pushing ${ahead} commit(s)…`);
  try{run('git',['push']);}
  catch{stop('Push failed, so these commits are not on origin yet.','Nothing was deployed or published. Restore access to GitHub and run this again.');}
}else console.log('Already on origin.');

if(skipTests)console.log('\nSkipping tests (--skip-tests).');
else{
  step('Running tests');
  for(const project of ['chrome-sidebar','mobile-app','tools-api'])run('npm',['--prefix',project,'test']);
}

step(`Building the extension · v${extension}`);
run('npm',['--prefix','chrome-sidebar','run','build']);

step(`Packaging erics-sidebar-${extension}.zip`);
const archive=new URL(`chrome-sidebar/release/erics-sidebar-${extension}.zip`,root);
const packaged=await access(archive).then(()=>true,()=>false);
if(packaged&&!repackage)console.log('Already packaged for this version. Pass --repackage to rebuild it.');
else{
  if(packaged)await rm(archive);
  run('zip',['-r','-q',fileURLToPath(archive),'.'],{cwd:fileURLToPath(new URL('chrome-sidebar/dist/',root))});
  console.log(fileURLToPath(archive));
}

// The Worker serves mobile's build output as its own assets, so mobile is built
// before the deploy rather than by it; wrangler is called directly to avoid
// building it a second time.
step(`Building mobile · v${mobile}`);
run('npm',['--prefix','mobile-app','run','build']);

step('Deploying the Worker');
run('npx',['wrangler','deploy'],{cwd:fileURLToPath(new URL('tools-api/',root))});

step('Publishing versions to D1');
for(const app of ['chrome-sidebar','mobile-app'])run('node',['tools-api/scripts/publish-release.js',app]);

// Published is not the same as live. Ask the endpoint the apps actually read.
step('Verifying what the cloud reports');
for(const [label,query,expected] of [['Extension','',extension],['Mobile','?app=mobile-app',mobile]]){
  let reported;
  try{reported=(await (await fetch(`${API}/v1/releases/latest${query}`,{cache:'no-store'})).json()).version;}
  catch(error){stop(`Could not read the ${label.toLowerCase()} release version: ${error.message}`,'The deploy and D1 write may still have succeeded. Check before releasing again.');}
  if(reported!==expected)stop(`${label} reports ${reported}, but this release is ${expected}.`);
  console.log(`${label} ${reported}`);
}

console.log(`\n\x1b[32m✓ Released · extension ${extension} · mobile ${mobile}\x1b[0m`);
console.log(`Reload chrome-sidebar/dist on chrome://extensions to pick up ${extension}.`);
if(open)run('open',['-a','Google Chrome','chrome://extensions']);
