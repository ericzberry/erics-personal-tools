import {ReleaseBanner} from './components/ui.js';
import {newerVersion,RELEASE_CHECK_INTERVAL} from './release-check.js';
const banner=ReleaseBanner();document.getElementById('app').prepend(banner);
async function check(){
  if(!globalThis.chrome?.runtime?.sendMessage)return;
  try{
    const response=await chrome.runtime.sendMessage({type:'ERIC_SETTINGS',action:'release-check'});
    const current=chrome.runtime.getManifest().version;
    banner.hidden=!response?.ok||!newerVersion(response.version,current);
    if(!banner.hidden)banner.textContent=`Update available · v${response.version}. Reload the latest extension build.`;
  }catch{/* No disruptive warning for an offline version check. */}
}
check();const timer=setInterval(check,RELEASE_CHECK_INTERVAL);
addEventListener('pagehide',()=>clearInterval(timer),{once:true});
