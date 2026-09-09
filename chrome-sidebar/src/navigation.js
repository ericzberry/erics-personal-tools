let currentTool='football',settingsOpen=false,selectedTool='';
function render(){
  for(const key of ['football','gmail','home','travel'])document.getElementById(`${key}-tool`).hidden=settingsOpen||key!==(selectedTool||currentTool);
  document.getElementById('settings-tool').hidden=!settingsOpen;
  document.getElementById('current-function').textContent=settingsOpen?'Settings':{football:'Draft advisor',gmail:'Gmail',home:'Personal tools',travel:'Travel wallet'}[selectedTool||currentTool];
  document.getElementById('open-settings').setAttribute('aria-expanded',String(settingsOpen));
}
export function showTool(tool){currentTool=tool;render();}
export function showSettings(open){settingsOpen=open;render();}

export function selectTool(tool){selectedTool=tool;settingsOpen=false;render();}
