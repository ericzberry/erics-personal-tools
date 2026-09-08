import {playerKey, positionKey} from './player-identity.js';
import {currentTierPlayers} from './draft-presentation.js';
const offense=['QB','RB','WR','TE'];
export const defaults={rankWindow:15,rankFitWeight:8,rankWaitWeight:5,benchWeight:0.15,waitWeight:0.35};
const round=n=>Math.round(n*10)/10;
const count=(players,pos)=>players.filter(p=>p.position===pos).length;
function requirements(config){return Object.fromEntries(config.roster.positions.filter(p=>p.slots>0&&p.code!=='BE'&&p.code!=='IR').map(p=>[p.code,p.slots]));}
function fit(roster,req){
  const needed={};for(const pos of ['QB','RB','WR','TE','D/ST','K'])needed[pos]=Math.max(0,(req[pos]||0)-count(roster,pos));
  const flexUsed=['RB','WR','TE'].reduce((n,p)=>n+Math.max(0,count(roster,p)-(req[p]||0)),0);
  needed.FLEX=Math.max(0,(req.FLEX||0)-flexUsed);return needed;
}
// Infer a snake slot only from an actual own pick or ESPN's displayed upcoming own picks.
export function turns(session,teamCount){
  const own=session?.manualMode?null:session?.picks?.find(p=>p.teamId===session.teamId&&Number.isInteger(p.overall));
  const evidence=own?.overall || session?.upcomingOwnPicks?.[0];
  if(!evidence || !session?.onClock)return {slot:null,nextPick:null,followingPick:null};
  const r=Math.ceil(evidence/teamCount), local=(evidence-1)%teamCount+1;
  const slot=r%2?local:teamCount+1-local;
  const upcoming=[];
  for(let i=1;i<=(session.rounds||16);i++){const p=(i-1)*teamCount+(i%2?slot:teamCount+1-slot);if(p>=session.onClock)upcoming.push(p);}
  return {slot,nextPick:upcoming[0]??null,followingPick:upcoming[1]??null};
}
// Ten complete starting rosters; allocate the league's FLEX slots to highest-ranked leftovers.
// The next player at each position is a starter-replacement benchmark, not a waiver forecast.
export function replacementLevels(players,req,teamCount){
  const sorted=Object.fromEntries(offense.map(pos=>[pos,players.filter(p=>p.position===pos).sort((a,b)=>b.value-a.value)]));
  const demand=Object.fromEntries(offense.map(pos=>[pos,(req[pos]||0)*teamCount]));
  const flex=['RB','WR','TE'].flatMap(pos=>sorted[pos].slice(demand[pos])).sort((a,b)=>b.value-a.value).slice(0,(req.FLEX||0)*teamCount);
  for(const p of flex)demand[p.position]++;
  const levels={};for(const pos of offense){const replacement=sorted[pos][demand[pos]];levels[pos]=replacement?{value:replacement.value,name:replacement.name,positionRank:demand[pos]+1}:null;}
  return levels;
}
export function lineupValue(roster,req,levels){
  let total=0;const leftovers=[];
  for(const pos of offense){const candidates=roster.filter(p=>p.position===pos).map(p=>p.value);const base=levels[pos].value;
    candidates.push(...Array((req[pos]||0)+(req.FLEX||0)).fill(base));candidates.sort((a,b)=>b-a);
    total+=candidates.slice(0,req[pos]||0).reduce((a,b)=>a+b,0);
    if(pos!=='QB')leftovers.push(...candidates.slice(req[pos]||0));
  }
  return total+leftovers.sort((a,b)=>b-a).slice(0,req.FLEX||0).reduce((a,b)=>a+b,0);
}
// Forecast by the remaining market queue, not absolute ADP. Already-taken players
// are removed first. The uncertainty band is a heuristic, not a calibrated probability.
export function availabilityAt(available, onClock, targetPick, ownPicksBefore=0) {
  const outlook=new Map();
  const ordered=[...available].sort((a,b)=>(a.adp ?? a.rank)-(b.adp ?? b.rank)||a.rank-b.rank);
  const known=Number.isInteger(onClock)&&Number.isInteger(targetPick)&&targetPick>=onClock;
  const opponents=known?Math.max(0,targetPick-onClock-ownPicksBefore):null;
  const band=known?Math.max(1,Math.ceil(opponents*0.2)):0;
  ordered.forEach((p,index)=>outlook.set(p.key??playerKey(p),!known?'unknown':opponents===0?'available':index<opponents-band?'unlikely':index<opponents+band?'uncertain':'likely'));
  return outlook;
}
// Scarcity is actionable only when a starter is due and just 1–2 options remain.
// RB targets follow the existing round-2/4 plan; WR targets allow rounds 3/5.
export function rosterTierAlerts({players,available,eligible,roster,req,replacement,session,turn}) {
  if(session?.state!=='drafting'||!turn.nextPick||!roster.length)return [];
  const roundNumber=Math.ceil(turn.nextPick/session.teams.length);
  if(roundNumber<2)return [];
  const tier=currentTierPlayers(players,session)[0]?.tier;
  if(!tier)return [];
  const next=availabilityAt(available,session.onClock,turn.nextPick);
  const following=availabilityAt(available,session.onClock,turn.followingPick,1);
  const alerts=['RB','WR'].flatMap(position=>{
    const deadlines=position==='RB'?[2,4]:[3,5];
    const target=Math.min(req[position]||0,deadlines.filter(r=>roundNumber>=r).length);
    const quality=p=>p.position===position&&!p.identityUnverified&&Number.isInteger(p.tier)&&
      (replacement[position]?p.value>replacement[position].value:p.tier<=tier);
    const owned=roster.filter(quality).length;
    if(owned>=target)return [];
    const options=eligible.filter(p=>p.tier===tier&&quality(p));
    // Empty tiers are no longer actionable; broad tiers are ordinary draft choices.
    if(!options.length||options.length>2||options.some(p=>!Number.isFinite(p.adp)))return [];
    let stage,pick;
    if(options.every(p=>next.get(p.key)==='unlikely')){stage='next';pick=turn.nextPick;}
    else if(turn.followingPick&&options.every(p=>following.get(p.key)==='unlikely')){stage='following';pick=turn.followingPick;}
    else return [];
    const message=`${position} getting thin: ${owned} quality ${owned===1?'starter':'starters'}; ${options.length} left in Tier ${tier} may go before #${pick}.`;
    return [{position,tier,owned,target,stage,pick,message,playerKeys:options.map(p=>p.key)}];
  });
  // One concise warning, favoring the earliest loss and largest overdue need.
  return alerts.sort((a,b)=>a.pick-b.pick||(b.target-b.owned)-(a.target-a.owned)).slice(0,1);
}
// Roster targets are preferences, not league eligibility rules. RB deadlines take
// precedence; TE can cross at most one tier to avoid a large early-round reach.
export function earlyRosterPriority(roster,roundNumber,player,bestTier){
  const rb=count(roster,'RB'),te=count(roster,'TE');
  if(roundNumber>4)return {priority:0,bonus:0,reason:''};
  const rbDue=(roundNumber>=2&&rb<1)||(roundNumber>=3&&rb===0)||(roundNumber>=4&&rb<2);
  if(rbDue&&player.position==='RB')return {priority:2,bonus:0,reason:rb<1?'Secure your first RB by round 2.':'Secure your second RB by round 4.'};
  const slotsToFourth=5-roundNumber,missing=Math.max(0,2-rb)+(te<1?1:0);
  const planDue=missing>=slotsToFourth;
  if(planDue&&rb<2&&player.position==='RB')return {priority:1,bonus:0,reason:'Take an RB now to leave room for two RBs and a TE by round 4.'};
  if(te===0&&player.position==='TE'&&(roundNumber>=4||planDue)&&player.tier<=bestTier+1)
    return {priority:1,bonus:0,reason:'Fill TE by round 4 while a nearby-tier option remains.'};
  if(player.position==='RB'&&rb<(roundNumber<=2?1:2))return {priority:0,bonus:4,reason:roundNumber<=2?'Build toward your first RB by round 2.':'Build toward your second RB by round 4.'};
  if(player.position==='TE'&&te===0&&roundNumber>=3)return {priority:0,bonus:3,reason:'Build toward a TE by round 4.'};
  return {priority:0,bonus:0,reason:''};
}
export function recommend({rankings,config,session=null,now=Date.now(),weights={}}){
  const w={...defaults,...weights},req=requirements(config);
  const players=rankings.players.map(p=>({...p,position:positionKey(p.position),key:playerKey(p)}));
  const index=new Map(players.map(p=>[p.key,p]));const picks=session?.picks||[];
  const drafted=new Set(picks.map(playerKey));
  const roster=picks.filter(p=>p.teamId===session?.teamId).map(p=>index.get(playerKey(p))||{...p,name:p.player,position:positionKey(p.position),key:playerKey(p)});
  const result={mode:'rank-proxy',warnings:[],candidates:[],rosterAlerts:[],turn:turns(session,config.league.teamCount),roster:roster.map(p=>({name:p.name,position:p.position})),replacement:{},throughPick:Math.max(0,...picks.map(p=>p.overall||0))};
  if(session && (session.mode==='league'&&session.leagueId!==config.leagueId || session.seasonId!==config.seasonId || session.teams.length!==config.league.teamCount))return {...result,blocked:'This draft does not match the configured season and 10-team league.'};
  if(session?.identityIssues)return {...result,blocked:'A captured player could not be matched to ESPN. Refresh the player list before using advice.'};
  if(session?.state==='complete')return {...result,blocked:'Draft complete.'};
  if(session?.state==='unknown')return {...result,blocked:'ESPN draft status is unavailable. Wait for a readable draft feed.'};
  if(session && !session.manualMode && (!session.connected||now-session.lastSeenAt>15000))return {...result,blocked:'Draft paused · reload ESPN to reconnect.'};
  if(session?.missing?.length||session?.rejected)return {...result,blocked:'Draft history is incomplete. Recover missing picks before using a recommendation.'};
  if(session&&!session.teamId)return {...result,blocked:'Your team could not be identified in the draft.'};
  if(roster.length>=config.roster.size)return {...result,blocked:'Your roster is full.'};
  if(!session)result.warnings.push('Pre-draft baseline. Draft position and player availability are not connected.');
  const unmatched=picks.filter(p=>!index.has(playerKey(p)));
  if(unmatched.length)result.warnings.push(`${unmatched.length} drafted player(s) are outside your overall ranking list; their positions still count toward roster needs.`);
  const needed=fit(roster,req);
  const draftPicksLeft=result.turn.nextPick&&session?.rounds?session.rounds-Math.ceil(result.turn.nextPick/config.league.teamCount)+1:Infinity;
  const slotsLeft=Math.min(config.roster.size-roster.length,draftPicksLeft);
  const specialists=['D/ST','K'];
  const specialistsLeft=specialists.reduce((n,pos)=>n+needed[pos],0);
  const specialistsDue=specialistsLeft>0&&slotsLeft<=specialistsLeft;
  const startersLeft=Object.values(needed).reduce((a,b)=>a+b,0);
  const isStarter=pos=>needed[pos]>0||(['RB','WR','TE'].includes(pos)&&needed.FLEX>0);
  const maxima=Object.fromEntries(config.roster.positions.filter(p=>typeof p.maximum==='number').map(p=>[p.code,p.maximum]));
  const available=players.filter(p=>!drafted.has(p.key));
  const eligible=available.filter(p=>!p.identityUnverified&&(!maxima[p.position]||count(roster,p.position)<maxima[p.position])&&
    (!specialists.includes(p.position)||needed[p.position]>0)&&
    (!specialistsDue||(specialists.includes(p.position)&&needed[p.position]>0))&&
    (slotsLeft>startersLeft||isStarter(p.position)));
  if(!eligible.length)return {...result,blocked:'No eligible players remain in the imported rankings.'};
  const rankCeiling = Math.max(...players.map(p=>p.rank))+1;
  // Linear rank-slot values are ordinal proxies, never projected fantasy points.
  for (const p of players) p.value = rankCeiling-p.rank;
  result.replacement=replacementLevels(players,req,config.league.teamCount);
  result.rosterAlerts=rosterTierAlerts({players,available,eligible,roster,req,replacement:result.replacement,session,turn:result.turn});
  const completeBenchmarks=offense.every(pos=>result.replacement[pos]);
  const ownValued=roster.filter(p=>offense.includes(p.position)).map(p=>({...p,value:p.value ?? result.replacement[p.position]?.value ?? 0}));
  const base=completeBenchmarks?lineupValue(ownValued,req,result.replacement):0;
  // Compare only near the best eligible overall rank, except when filling mandatory starters.
  const nextOutlook=availabilityAt(available,session?.onClock,result.turn.nextPick);
  const plausible=eligible.filter(p=>nextOutlook.get(p.key)!=='unlikely');
  // If every legal choice is at risk, still show a conditional option rather than no advice.
  const pool=plausible.length?plausible:eligible;
  const baseline=Math.min(...pool.map(p=>p.rank));
  const bestTier=Math.min(...pool.map(p=>p.tier??Infinity));
  const roundNumber=session?Math.ceil((result.turn.nextPick||session.onClock||((roster.length)*config.league.teamCount+1))/config.league.teamCount):1;
  const priorities=new Map(pool.map(p=>[p.key,specialistsDue?
    {priority:3,bonus:0,reason:`Use ${slotsLeft===1?'your last pick':`one of your final ${slotsLeft} picks`} for your starting ${p.position==='D/ST'?'defense':'kicker'}.`}:
    earlyRosterPriority(roster,roundNumber,p,bestTier)]));
  const shortlist=pool.filter(p=>p.rank<=baseline+w.rankWindow||p.tier===bestTier||priorities.get(p.key).priority>0);
  result.targetRound=roundNumber;
  const horizon=result.turn.followingPick;
  const followingOutlook=availabilityAt(available,session?.onClock,horizon,1);
  result.candidates=shortlist.map(p=>{
    const starter=isStarter(p.position),benchDepth=Math.max(0,count(roster,p.position)-(req[p.position]||0));
    const fitFactor=starter?1:({RB:0.55,WR:0.4,TE:0.2,QB:0.1,'D/ST':0,K:0}[p.position]||0)/(1+benchDepth);
    // ADP is a market heuristic, not a calibrated survival probability.
    // Compare passing on this player until the turn after next. One intervening
    // selection is ours; all others consume the remaining ADP/rank queue.
    const nextAvailability=nextOutlook.get(p.key), followingAvailability=followingOutlook.get(p.key);
    const later=horizon?available.filter(a=>a.position===p.position&&a.key!==p.key&&['likely','available'].includes(followingOutlook.get(a.key))).sort((a,b)=>a.rank-b.rank)[0]:null;
    const atRisk=!!horizon&&['unlikely','uncertain'].includes(followingAvailability);
    let par=null,gain=null,waitCost=null,bonus=w.rankFitWeight*fitFactor;
    if(completeBenchmarks&&offense.includes(p.position)){
      const value=p.value;par=value-result.replacement[p.position].value;
      gain=Math.max(0,lineupValue([...ownValued,{...p,value}],req,result.replacement)-base);
      const laterGain=later?Math.max(0,lineupValue([...ownValued,{...later,value:later.value}],req,result.replacement)-base):0;
      waitCost=atRisk?Math.max(0,gain-laterGain):0;
      // Bounded rank adjustment preserves the user's board as the primary priority.
      bonus=Math.min(10,gain/20)+Math.min(2,Math.max(0,par)*w.benchWeight/(20*(1+benchDepth)))+Math.min(4,waitCost*w.waitWeight/20);
    }else if(atRisk&&later){bonus+=Math.min(w.rankWaitWeight,Math.max(0,later.rank-p.rank)/10)*fitFactor;}
    const samePos=available.filter(a=>a.position===p.position&&a.rank>=p.rank&&a.rank<=p.rank+w.rankWindow).length;
    const reasons=[`Your overall rank #${p.rank}${p.adp!==null?`; ADP ${p.adp}`:'; ADP unavailable'}.`,starter?`Can fill an open ${needed[p.position]>0?p.position:'FLEX'} starting slot.`:`Adds ${p.position} depth; its starting slots are already covered.`];
    if(par!==null)reasons.push(`${round(par)} rank slots above ${result.replacement[p.position].name} (${p.position} starter-replacement #${result.replacement[p.position].positionRank}); ${round(gain)} rank slots of lineup improvement.`);
    else reasons.push(`${samePos} available ${p.position} option(s) within the next ${w.rankWindow} ranks of this player; this measures ranking depth, not a value gap.`);
    if(atRisk)reasons.push(`Remaining ADP order suggests waiting until #${horizon} risks losing this player${later?`; later ${p.position} comparison: ${later.name} (#${later.rank})`:''}. Availability is an estimate.`);
    if(!horizon)reasons.push('Next-turn availability is unknown until the actual draft order is visible.');
    const fitWhy=starter?`fills your open ${needed[p.position]>0?p.position:'FLEX'} slot`:`adds ${p.position} depth`;
    const scarcity=par>0?`; ${round(par)} rank slots above replacement`:'';
    const target=priorities.get(p.key);
    if(target.reason)reasons.push(target.reason);
    if(p.tier)reasons.push(`Spreadsheet tier ${p.tier}; prefer higher tiers before moving down.`);
    const shortWhy=`${p.tier?`Tier ${p.tier} · `:''}#${p.rank}; ${fitWhy}${scarcity}.${target.reason?` ${target.reason}`:''}`;
    const nextText=nextAvailability==='available'?'Available now':nextAvailability==='likely'?`Likely there at #${result.turn.nextPick}`:nextAvailability==='uncertain'?`Could go before #${result.turn.nextPick}`:nextAvailability==='unlikely'?`If still there at #${result.turn.nextPick}`:'Your draft position is not known yet';
    const followingText=!horizon?'':atRisk?` May not last to #${horizon}.${later?` ${later.name} may be a later ${p.position} option.`:''}`:` May last to #${horizon}.`;
    const outlook=nextText+'.'+followingText;
    return {...p,shortWhy,outlook,nextAvailability,followingAvailability,laterOption:later?.name??null,targetPriority:target.priority,score:round(-p.rank+bonus+target.bonus),rankAdvantage:par===null?null:round(par),lineupRankGain:gain===null?null:round(gain),waitCost:waitCost===null?null:round(waitCost),starter,alternativesAtPosition:samePos,reasons};
  }).sort((a,b)=>b.targetPriority-a.targetPriority||(a.tier??0)-(b.tier??0)||b.score-a.score||a.rank-b.rank).slice(0,2);
  if(result.candidates[0]?.rank!==baseline)result.candidates[0].reasons.push(`Moves ahead of your highest eligible available rank (#${baseline}) because of tier, roster targets, and the roster/waiting adjustments above.`);
  return result;
}
