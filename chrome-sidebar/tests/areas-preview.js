// Production shell and Info controller with synthetic stores and a mock vault.
import {mountApp} from '../src/components/views.js';
import {initializeNavigation,selectCapability} from '../src/navigation.js';
import {mountInfo} from '../src/info.js';
import {INFO_SOURCES} from '../src/info-data.js';
mountApp(document.getElementById('app'));initializeNavigation();
const data={people:[{id:'p',name:'Alex',role:'Partner',location:'Brooklyn'}],travel:[{id:'t',name:'Synthetic airline with a longer membership name',category:'Airline',traveler:'Test traveler',number:'000123456'}],sizes:[{id:'s',item:'Sweaters',brand:'Loro Piana',size:'S'}],gifts:[{id:'g',person:'Alex',idea:'Telescope with a folding tripod',status:'Idea'}],replacements:[{id:'r',item:'Bedroom paint',variant:'Benjamin Moore Hale Navy HC-154, eggshell'}]};
const stores=Object.fromEntries(INFO_SOURCES.map(name=>[name,{request:async()=>({records:data[name]||[]})}]));
const info=mountInfo(document.getElementById('info-tool'),{credentials:{get:async()=>'synthetic'},stores,remote:async()=>({connections:[]}),vault:{unlocked:()=>true,available:()=>true,borrowed:()=>true,touch(){}}});
selectCapability('info');info.refresh();
