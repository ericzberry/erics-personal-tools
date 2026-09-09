import {mountLibrary} from './data-library.js';
const kind=new URL(location.href).searchParams.get('capability')==='rankings'?'rankings':'rules';
const filename=kind==='rules'?'espn-league-2026.json':'rankings-2026.json';
await mountLibrary(document.getElementById('data-root'),{kind,load:async()=>({value:await (await fetch(`config/${filename}`)).json()})}).refresh();
