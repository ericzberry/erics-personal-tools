let currentTool='football',settingsOpen=false;
function render(){
  for(const key of ['football','gmail','home'])document.getElementById(`${key}-tool`).hidden=settingsOpen||key!==currentTool;
  document.getElementById('settings-tool').hidden=!settingsOpen;
  document.getElementById('current-function').textContent=settingsOpen?'Settings':{football:'Draft advisor',gmail:'Gmail',home:'Personal tools'}[currentTool];
  document.getElementById('open-settings').setAttribute('aria-expanded',String(settingsOpen));
}
export function showTool(tool){currentTool=tool;render();}
export function showSettings(open){settingsOpen=open;render();}
