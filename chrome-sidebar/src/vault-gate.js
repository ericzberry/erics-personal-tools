// A whole-section passkey gate, built on the same device vault that seals card
// numbers. Sections that use it render nothing — not even a record name —
// until the passkey answers, and close again after the shared idle window.
//
// The key is the vault's, not this gate's: one passkey opens every protected
// section, and each sealed value stays bound to its own record.
import {sharedVault} from './secret-vault.js';
import {VaultGateView} from './components/vault.js';
import {Button,ActionGroup,MaskedValue} from './components/ui.js';

export const vaultReason=error=>error?.name==='NotAllowedError'||error?.name==='AbortError'
  ?'Passkey verification was canceled or timed out.'
  :error?.message||'This section could not be unlocked.';

export function mountVaultGate(root,{
  id='vault',title='Locked',
  lockedDetail='Sealed with your passkey. Without it or your recovery code, these records cannot be recovered.',
  vault=sharedVault(),onChange=()=>{}
}={}){
  root.replaceChildren(VaultGateView({id,title,detail:lockedDetail}));
  const $=name=>root.querySelector(`#${id}-${name}`);
  let busy=false,message='',open=vault.unlocked();
  const action=(label,handler,variant='secondary')=>{
    const button=Button(label,{variant,size:'compact',disabled:busy});
    button.addEventListener('click',handler);
    return button;
  };
  function render(){
    const unlocked=vault.unlocked(),available=vault.available();
    $('panel').dataset.state=unlocked?'unlocked':'locked';
    // While locked the gate is the page, so it carries the heading. Unlocked, it
    // steps aside and the tool's own heading leads.
    $('title').hidden=unlocked;
    $('status').textContent=message||(unlocked
      ?`Unlocked · closes after ${Math.round(vault.idleMs/60000)} minutes without activity`
      :available?'Locked'
      :'Locked · This browser cannot use passkeys. Use your recovery code.');
    $('detail').hidden=unlocked;
    $('content').hidden=!unlocked;
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
  }
  async function run(operation){
    if(busy)return false;
    busy=true;message='';render();
    try{await operation();return true;}
    catch(error){message=vaultReason(error);return false;}
    finally{busy=false;render();announce();}
  }
  const unlock=()=>run(()=>vault.key());
  function lock(){
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
  $('recovery-submit').addEventListener('click',()=>run(async()=>{
    await vault.unlockWithRecoveryCode($('recovery-code').value);
    $('recovery-code').value='';$('recovery').hidden=true;
  }));
  for(const type of ['pointerdown','keydown'])root.addEventListener(type,event=>{if(event.isTrusted&&vault.unlocked())vault.touch();},{capture:true,passive:true});
  // The vault expires on its own schedule. Reflect an idle lock promptly rather
  // than leaving protected content on screen until the next interaction.
  const watch=setInterval(announce,1000);
  watch?.unref?.();
  render();
  return {
    content:$('content'),vault,
    unlocked:()=>vault.unlocked(),
    key:()=>vault.key(),
    lock,
    // Lets a section report its own failure through the gate's status line.
    status(text){message=text||'';render();},
    stop(){clearInterval(watch);}
  };
}
