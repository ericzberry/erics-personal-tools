import {showSettings} from './navigation.js';
import {mountTravelTool} from './capability-links.js';
import {sharedVault} from './secret-vault.js';
import {vaultReason} from './vault-gate.js';
import {MaskedValue,setStatus} from './components/ui.js';
const $=id=>document.getElementById(id);
// Settings holds the one cloud connection, which the travel wallet owns, so
// arriving at Settings builds the wallet however the screen was opened.
$('open-settings').addEventListener('click',()=>{mountTravelTool();showSettings(true);$('close-settings').focus();});
$('close-settings').addEventListener('click',()=>{showSettings(false);$('navigation-toggle').focus();});

// The recovery code lives here rather than above every protected tool. Reading
// it needs the key itself, so a locked vault is unlocked first — the same
// window the gated sections ask through.
const recovery=$('show-recovery-code');
let showing=false;
recovery?.addEventListener('click',async()=>{
  if(showing){
    showing=false;
    $('recovery-code-output').replaceChildren();
    recovery.textContent='Show recovery code';
    return;
  }
  recovery.disabled=true;
  try{
    const vault=sharedVault();
    await vault.key();
    $('recovery-code-output').replaceChildren(MaskedValue(vault.recoveryCode()));
    setStatus($('recovery-code-status'),'');
    showing=true;
    recovery.textContent='Hide recovery code';
  }catch(error){setStatus($('recovery-code-status'),vaultReason(error),'error');}
  finally{recovery.disabled=false;}
});
