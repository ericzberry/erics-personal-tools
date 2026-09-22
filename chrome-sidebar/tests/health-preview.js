// Local synthetic fixture for the health notebook. Not copied into release
// builds. The controller, components and styles are the real modules; the
// vault is a synthetic key that never asks for a passkey, and the records are
// invented. Query `?state=` narrows to one state: populated, first, locked.
import {mountHealth} from '../src/health.js';
import {sealSecret,openSecret} from '../src/secret-vault.js';
import {validateHealthRecord,validateRelative,applyMedicationChange,markReviewed} from '../src/health-data.js';
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
function syntheticVault(open=true){
  let key=null,unlocked=open;
  return {idleMs:900000,available:()=>true,unlocked:()=>unlocked,touch(){},lock(){unlocked=false;},
    async key(){unlocked=true;key??=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(3),'AES-GCM',false,['encrypt','decrypt']);return key;},
    async open(recordId,envelope){return openSecret(await this.key(),recordId,envelope);},
    async unlockWithRecoveryCode(){return this.key();},recoveryCode:()=>'EV1-SYNTHETIC'};
}
const at='2026-09-20T15:00:00.000Z';
const dad=[validateRelative({label:'Dad',side:'Unspecified',aliases:['Father']}),id(2)];
const grandmother=[validateRelative({label:'Maternal grandmother',side:'Maternal'}),id(3)];
const mary=[validateRelative({label:'Aunt Mary'}),id(4)];
let cetirizine=validateHealthRecord({note:'Cetirizine for seasonal allergies',type:'Medication',directions:'10 mg each morning',status:'Taking',createdAt:'2026-03-01T00:00:00Z'});
cetirizine=applyMedicationChange({...cetirizine,id:id(10)},{kind:'directions',to:'5 mg each morning',effective:'2026-06-01',at});
const records=[
  [validateHealthRecord({note:'Penicillin — hives within an hour, 1998. Told to avoid all penicillins.',type:'Allergy or reaction',when:'1998',createdAt:'2026-03-01T00:00:00Z'}),id(11)],
  [markReviewed(cetirizine,at),id(10)],
  [validateHealthRecord({note:'Vitamin D',type:'Medication',createdAt:'2026-09-01T00:00:00Z'}),id(12)],
  [validateHealthRecord({note:'Asthma, mild; albuterol inhaler as needed. Worse in cold air.',type:'Condition',status:'Ongoing',when:'as a child',createdAt:'2026-03-01T00:00:00Z'}),id(13)],
  [validateHealthRecord({note:'Appendix removed around 2012; no complications. Dr. Patel, Riverside.',type:'Procedure',when:'around 2012',summary:'include',createdAt:'2026-03-02T00:00:00Z'}),id(14)],
  [validateHealthRecord({note:'Possible migraine, never diagnosed. Aura before the headache, twice this spring.',createdAt:'2026-05-10T00:00:00Z'}),id(15)],
  [validateHealthRecord({note:'Broke left wrist skiing',type:'Condition',status:'Past',when:'2024-02-11',createdAt:'2026-03-01T00:00:00Z'}),id(16)],
  [validateHealthRecord({note:'Cholesterol 212, LDL 140. Told to recheck in a year.',type:'Test or result',when:'2026-04',createdAt:'2026-04-20T00:00:00Z'}),id(17)],
  [validateHealthRecord({note:'My dad had Parkinson’s, diagnosed in his late 60s.',relative:id(2),summary:'include',createdAt:'2026-03-03T00:00:00Z'}),id(18)],
  [validateHealthRecord({note:'My dad did not have diabetes, according to my mother.',relative:id(2),createdAt:'2026-03-03T00:00:00Z'}),id(19)],
  [validateHealthRecord({note:'My maternal grandmother had breast cancer at 52 and lived to 88.',relative:id(3),when:'age 52',createdAt:'2026-03-04T00:00:00Z'}),id(20)],
  [validateHealthRecord({note:'My aunt Mary had glaucoma.',relative:id(4),createdAt:'2026-03-05T00:00:00Z'}),id(21)]
];
function store(vault,seed,{conflictOn=null}={}){
  const rows=new Map();let n=0;
  const ready=(async()=>{
    for(const [payload,recordId] of seed)rows.set(recordId,{id:recordId,revision:'first',secret:await sealSecret(await vault.key(),`health:${recordId}`,payload)});
    if(conflictOn){
      const row=rows.get(conflictOn);
      const cloud={...row,revision:'cloud',secret:await sealSecret(await vault.key(),`health:${conflictOn}`,validateHealthRecord({note:'Cetirizine for seasonal allergies — switched to loratadine in August',type:'Medication',directions:'10 mg each evening',status:'Taking',createdAt:'2026-03-01T00:00:00Z'}))};
      rows.set(conflictOn,{...row,pending:true,conflict:true,cloud});
    }
  })();
  const list=()=>[...rows.values()];
  return {
    async request(token,url,options={}){
      await ready;
      const recordId=url.slice('/v1/health/'.length);
      if(!options.method||options.method==='GET')return {records:list(),syncMessage:conflictOn?'1 conflicting change. Review the marked records; your local changes are safe.':''};
      if(options.method==='DELETE'){rows.delete(recordId);return {records:list()};}
      const saved={id:recordId,secret:options.value.secret,revision:`r${++n}`};
      rows.set(recordId,saved);return {record:saved,records:list()};
    },
    async resolve(token,recordId){const row=rows.get(recordId);if(row){delete row.conflict;delete row.pending;delete row.cloud;}return {records:list()};}
  };
}
const drafts=()=>{let kept=null;return {read:async()=>kept,write:async(token,sealed,when)=>{kept={sealed,when};},remove:async()=>{kept=null;}};};
const wanted=new URLSearchParams(location.search).get('state');
const states=[
  ['Populated · allergies, medications, a conflict, three relatives',()=>{const vault=syntheticVault();return {vault,offline:store(vault,[dad,grandmother,mary,...records],{conflictOn:id(10)})};}],
  ['First use · nothing saved',()=>{const vault=syntheticVault();return {vault,offline:store(vault,[])};}],
  ['Locked',()=>{const vault=syntheticVault(false);return {vault,offline:store(vault,[])};}],
  ['Not connected',()=>{const vault=syntheticVault();return {vault,offline:store(vault,[]),credentials:{get:async()=>''}};}]
];
const root=document.getElementById('health-states');
for(const [label,make] of states){
  if(wanted&&!label.toLowerCase().startsWith(wanted))continue;
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const {vault,offline,credentials={get:async()=>'synthetic-preview-token-at-least-32-characters'}}=make();
  mountHealth(host,{vault,offline,credentials,drafts:drafts(),now:()=>'2026-09-22T12:00:00.000Z'});
}
