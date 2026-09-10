import {mountLibrary} from './data-library.js';
await mountLibrary(document.getElementById('data-root'),{kind:'rankings',load:async()=>({value:await (await fetch('config/rankings-2026.json')).json()})}).refresh();
