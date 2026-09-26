import {mountPeople} from '../src/people.js';
import {normalizePerson} from '../src/people-data.js';
let records=[{...normalizePerson({name:'Younger child',role:'Child',age:7,ageYear:2026}),id:'11111111-1111-4111-8111-111111111111',revision:'first'},{...normalizePerson({name:'A friend',role:'Other',location:'Example town'}),id:'22222222-2222-4222-8222-222222222222',revision:'first'}];
mountPeople(document.getElementById('preview'),{credentials:{get:async()=>'synthetic-token'},offline:{async request(t,p,o={}){if(o.method){records=records.filter(r=>r.id!==o.value.id);if(o.method==='PUT')records.push({...o.value,revision:'second'});}return {records};},async resolve(){return {records};}}});
