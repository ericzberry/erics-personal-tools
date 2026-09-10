// A whole-section passkey gate, built on the same device vault that seals card
// numbers. Sections that use it render nothing — not even a record name —
// until the passkey answers, and close again after the shared idle window.
//
// The key is the vault's, not this gate's: one passkey opens every protected
// section, and each sealed value stays bound to its own record.
//
// Arriving at a locked section asks for the passkey by itself. A panel that
// only reports being locked makes the reader do the work of noticing it and
// pressing a button; the passkey check is what they came to do. One attempt
// per arrival, so a dismissed prompt leaves a button and never a loop.
import {sharedVault} from './secret-vault.js';
import {autoUnlock} from './auto-unlock.js';
import {VaultGateView} from './components/vault.js';
import {Button,ActionGroup,MaskedValue} from './components/ui.js';

export const vaultReason=error=>error?.name==='NotAllowedError'||error?.name==='AbortError'
  ?'Passkey verification was canceled or timed out.'
  :error?.message||'This section could not be unlocked.';

export function mountVaultGate(root,{
  id='vault',title='Locked',
  lockedDetail='Sealed with your passkey. Without it or your recovery code, these records cannot be recovered.',
  vault=sharedVault(),onChange=()=>{},automatic:auto=true
}={}){
  root.replaceChildren(VaultGateView({id,title,detail:lockedDetail}));
  const $=name=>root.querySelector(`#${id}-${name}`);
  const page=root.ownerDocument;
  let busy=false,message='',open=vault.unlocked(),deliberate=false;
  const action=(label,handler,variant='secondary')=>{
    const button=Button(label,{variant,size:'compact',disabled:busy});
    button.addEventListener('click',handler);
    return button;
  };
  // Asking for a passkey behind a hidden tool or a backgrounded tab would put a
  // system prompt in front of something the reader is not looking at. Mobile
  // mounts every tool at once and shows one, so the section's own visibility is
  // what decides, not the mount.
  function onScreen(){
    if(page?.hidden)return false;
    for(let node=root;node;node=node.parentElement)if(node.hidden)return false;
    return true;
  }
  const attempt=autoUnlock({
    eligible:()=>auto&&!busy&&!vault.unlocked()&&vault.available()&&onScreen(),
    unlock:()=>run(()=>vault.key())
  });
  // Arriving again — a shown section, a foregrounded tab — is a fresh arrival,
  // so a prompt dismissed last time is offered once more.
  const arrive=()=>{attempt.background();attempt.request();};
  function render(){
    const unlocked=vault.unlocked(),available=vault.available();
    $('panel').dataset.state=unlocked?'unlocked':'locked';
    // While locked the gate is the page, so it carries the heading. Unlocked, it
    // steps aside and the tool's own heading leads.
    $('title').hidden=unlocked;
    $('status').textContent=message||(unlocked
      ?`Unlocked · closes after ${Math.round(vault.idleMs/60000)} minutes without activity`
      :busy?'Waiting for your passkey…'
      :available?'Locked'
      :'Locked · This browser cannot use passkeys. Use your recovery code.');
    $('detail').hidden=unlocked;
    $('content').hidden=!unlocked;
    // The actions stay put while the passkey sheet is up — disabled, not
    // removed — so a dismissed sheet returns to the same panel it left.
    $('actions').replaceChildren(...(unlocked
      ?[action('Lock now',lock,'subtle'),action('Recovery code',showRecovery,'subtle')]
      :[...(available?[action('Unlock',unlock,'primary')]:[]),action('Use recovery code',()=>{$('recovery').hidden=false;$('recovery-code').focus();})]));
  }
  function announce(){
    const unlocked=vault.unlocked();
    if(unlocked===open)return;
    open=unlocked;
    if(!unlocked)$('code').replaceChildren();
    render();
    onChange(unlocked);
    // An idle window that runs out in front of the reader re-asks rather than
    // leaving a locked panel where the tool was. Lock now means locked.
    if(!unlocked&&!deliberate)arrive();
    deliberate=false;
  }
  async function run(operation){
    if(busy)return false;
    busy=true;message='';render();
    try{await operation();return true;}
    catch(error){message=vaultReason(error);return false;}
    finally{busy=false;render();announce();}
  }
  const unlock=()=>{attempt.suppress();return run(()=>vault.key());};
  function lock(){
    deliberate=true;
    attempt.suppress();
    vault.lock();
    message='';
    $('code').replaceChildren();
    render();announce();
  }
  function showRecovery(){
    try{
      const code=vault.recoveryCode();
      $('code').replaceChildren(MaskedValue(code),ActionGroup([action('Hide recovery code',()=>$('code').replaceChildren())],{compact:true}));
    }catch(error){message=vaultReason(error);render();}
  }
  $('recovery-cancel').addEventListener('click',()=>{$('recovery-code').value='';$('recovery').hidden=true;});
  $('recovery-submit').addEventListener('click',()=>{
    attempt.suppress();
    run(async()=>{
      await vault.unlockWithRecoveryCode($('recovery-code').value);
      $('recovery-code').value='';$('recovery').hidden=true;
    });
  });
  for(const type of ['pointerdown','keydown'])root.addEventListener(type,event=>{if(event.isTrusted&&vault.unlocked())vault.touch();},{capture:true,passive:true});
  const returned=()=>{if(page?.hidden)attempt.background();else arrive();};
  page?.addEventListener?.('visibilitychange',returned);
  // Mobile switches tools by hiding and showing these sections in place, so the
  // section's own `hidden` attribute is the navigation event this gate gets.
  const Observer=page?.defaultView?.MutationObserver||globalThis.MutationObserver;
  const shown=Observer?new Observer(()=>{onScreen()?arrive():attempt.background();}):null;
  shown?.observe(root,{attributes:true,attributeFilter:['hidden']});
  // The vault expires on its own schedule. Reflect an idle lock promptly rather
  // than leaving protected content on screen until the next interaction. The
  // same beat carries the arrival check, so a host that hides a section by some
  // other means than the two events above still gets its prompt.
  const watch=setInterval(()=>{announce();onScreen()?attempt.request():attempt.background();},1000);
  watch?.unref?.();
  render();
  // A session another page already opened is adopted before deciding to ask, so
  // arriving inside the idle window costs no passkey check at all.
  Promise.resolve(vault.ready).then(()=>{announce();render();attempt.request();});
  return {
    content:$('content'),vault,
    unlocked:()=>vault.unlocked(),
    key:()=>vault.key(),
    open:(id,envelope)=>vault.open(id,envelope),
    lock,
    // Lets a section report its own failure through the gate's status line.
    status(text){message=text||'';render();},
    stop(){clearInterval(watch);shown?.disconnect();page?.removeEventListener?.('visibilitychange',returned);}
  };
}
