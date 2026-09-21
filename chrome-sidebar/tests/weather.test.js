import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyWeather,locateDevice,WEATHER_RESOURCE} from '../src/weather.js';

const memory=()=>{
  const values=new Map();
  return {values,
    async read(resource,token){return values.get(`${resource}:${token}`)??null;},
    async write(resource,token,value){values.set(`${resource}:${token}`,structuredClone(value));},
    async remove(resource,token){values.delete(`${resource}:${token}`);}};
};
const forecast={date:'2026-09-21',place:'Synthetic Heights',hour:7,low:48,high:61,
  hours:Array.from({length:24},(unused,hour)=>({hour,temperature:55,feelsLike:55,chance:hour===15?80:0,snow:false}))};

test('the day is worked out once, from where the device is, and read back after that',async()=>{
  const store=memory(),asked=[];let located=0;
  const weather=dailyWeather({store,remote:async(token,path)=>{asked.push(path);return forecast;},
    locate:async()=>{located++;return {lat:40.71,lon:-74.01};}});
  const first=await weather.today('token','2026-09-21');
  assert.equal(first.dress,'Bring a light jacket');
  assert.equal(first.rain,'3–4 PM');
  assert.equal(first.place,'Synthetic Heights');
  assert.deepEqual(asked,['/v1/weather?lat=40.71&lon=-74.01']);
  // Every later look that day is the saved copy: no location, no request.
  assert.deepEqual(await weather.today('token','2026-09-21'),first);
  assert.deepEqual(await weather.saved('token','2026-09-21'),first);
  assert.equal(located,1);
  assert.equal(asked.length,1);
  // Tomorrow is worked out again.
  assert.equal(await weather.saved('token','2026-09-22'),null);
  await weather.today('token','2026-09-22');
  assert.equal(located,2);
  assert.equal(asked.length,2);
});

test('with no location the Worker is asked without one',async()=>{
  const asked=[];
  const weather=dailyWeather({store:memory(),remote:async(token,path)=>{asked.push(path);return forecast;},locate:async()=>null});
  await weather.today('token','2026-09-21');
  assert.deepEqual(asked,['/v1/weather']);
});

test('a failed attempt keeps nothing, and two looks at once share one attempt',async()=>{
  const store=memory();let calls=0,fail=true;
  const weather=dailyWeather({store,locate:async()=>null,remote:async()=>{
    calls++;await new Promise(resolve=>setTimeout(resolve,5));
    if(fail)throw Error('The forecast is unavailable.');return forecast;}});
  await assert.rejects(Promise.all([weather.today('token','2026-09-21'),weather.today('token','2026-09-21')]));
  assert.equal(calls,1);
  assert.equal(store.values.size,0);
  fail=false;
  await weather.today('token','2026-09-21');
  assert.equal(calls,2);
  // Disconnecting clears the copy that names where the device was.
  await weather.forget('token');
  assert.equal(await store.read(WEATHER_RESOURCE,'token'),null);
});

test('the device’s position is rounded, and any refusal is simply no position',async()=>{
  const at=(latitude,longitude)=>({getCurrentPosition(done){done({coords:{latitude,longitude}});}});
  assert.deepEqual(await locateDevice({geolocation:at(40.712776,-74.005974)}),{lat:40.71,lon:-74.01});
  assert.equal(await locateDevice({geolocation:{getCurrentPosition(done,fail){fail({code:1});}}}),null);
  assert.equal(await locateDevice({geolocation:undefined}),null);
  let asked=false;
  assert.equal(await locateDevice({geolocation:{getCurrentPosition(){asked=true;}},
    permissions:{query:async()=>({state:'denied'})}}),null);
  assert.equal(asked,false,'a refused permission is not asked again');
  // A prompt nobody answers ends the wait rather than holding the screen.
  assert.equal(await locateDevice({geolocation:{getCurrentPosition(){}},promptMs:5}),null);
});
