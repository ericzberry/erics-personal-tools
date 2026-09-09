import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const {version}=JSON.parse(await readFile(new URL('../../chrome-sidebar/manifest.json',import.meta.url),'utf8'));
if(!/^\d+(\.\d+){0,3}$/.test(version))throw Error('Invalid release version');
const temp=await mkdtemp(join(tmpdir(),'erics-release-'));
try{
 const schema=await readFile(new URL('release-schema.sql',root),'utf8');
 const path=join(temp,'release.sql');
 await writeFile(path,`${schema}\nINSERT INTO app_releases(app,version,published_at) VALUES('chrome-sidebar','${version}',datetime('now')) ON CONFLICT(app) DO UPDATE SET version=excluded.version,published_at=excluded.published_at;`);
 execFileSync('npx',['wrangler','d1','execute','erics-personal-tools','--remote','--file',path],{cwd:fileURLToPath(root),stdio:'inherit'});
}finally{await rm(temp,{recursive:true,force:true});}
