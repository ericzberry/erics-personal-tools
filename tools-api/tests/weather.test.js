import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {weather} from '../src/weather.js';

const json=(value,status=200)=>Response.json(value,{status});
const times=Array.from({length:24},(unused,h)=>`2026-09-21T${String(h).padStart(2,'0')}:00`);
const openMeteo={utc_offset_seconds:-4*3600,
  hourly:{time:times,temperature_2m:times.map(()=>60),apparent_temperature:times.map(()=>58),
    precipitation_probability:times.map((unused,h)=>h===16?70:0),rain:times.map(()=>0),showers:times.map(()=>0),snowfall:times.map(()=>0)},
  daily:{time:['2026-09-21'],temperature_2m_min:[55.2],temperature_2m_max:[66.8]}};
// Open-Meteo and Nominatim as they answer, and a record of what each was asked.
const services=({forecast=openMeteo,place={name:'Synthetic Heights'},calls=[]}={})=>async(url,options)=>{
  calls.push({url:String(url),agent:options?.headers?.['User-Agent']});
  if(String(url).startsWith('https://api.open-meteo.com/'))return forecast?Response.json(forecast):new Response('busy',{status:503});
  if(String(url).startsWith('https://nominatim.openstreetmap.org/'))return place?Response.json(place):new Response('busy',{status:503});
  throw Error(`Unexpected request to ${url}`);
};
const now=()=>Date.parse('2026-09-21T15:30:00Z');
const ask=(query='',cf)=>Object.assign(new Request(`https://tools.example/v1/weather${query}`),cf?{cf}:{});

test('the device’s position is rounded before it leaves, and the place is named',async()=>{
  const calls=[];
  const response=await weather(ask('?lat=40.712776&lon=-74.005974'),{},json,{fetcher:services({calls}),now});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.place,'Synthetic Heights');
  assert.equal(body.date,'2026-09-21');
  assert.equal(body.hour,11);
  assert.deepEqual([body.low,body.high],[55,67]);
  assert.equal(body.hours.find(entry=>entry.hour===15).chance,70);
  assert.equal(calls.length,2);
  for(const call of calls){
    assert.match(call.url,/(latitude|lat)=40\.71&(longitude|lon)=-74\.01/);
    assert.doesNotMatch(call.url,/40\.7127|74\.0059/,'nothing closer than a kilometre leaves the Worker');
    assert.match(call.agent,/erics-personal-tools/);
  }
  assert.match(calls.find(call=>call.url.includes('open-meteo')).url,/temperature_unit=fahrenheit/);
});

test('with no position from the device, the connection’s city stands in',async()=>{
  const calls=[];
  const response=await weather(ask('',{latitude:'40.73',longitude:'-73.99',city:'New York'}),{},json,{fetcher:services({calls}),now});
  assert.equal((await response.json()).place,'New York');
  assert.equal(calls.length,1,'Cloudflare already named the city');
  assert.match(calls[0].url,/latitude=40\.73&longitude=-73\.99/);
  // A position out of range is no position.
  const odd=await weather(ask('?lat=200&lon=-74',{latitude:'40.73',longitude:'-73.99',city:'New York'}),{},json,{fetcher:services(),now});
  assert.equal((await odd.json()).place,'New York');
  const nowhere=await weather(ask(),{},json,{fetcher:services(),now});
  assert.equal(nowhere.status,422);
});

test('a place that cannot be named is left off; a forecast that cannot be had fails',async()=>{
  const unnamed=await weather(ask('?lat=40.71&lon=-74.01'),{},json,{fetcher:services({place:null}),now});
  assert.equal(unnamed.status,200);
  assert.equal((await unnamed.json()).place,'');
  // Cloudflare's city stands in when it is plainly the same place, and not otherwise.
  const near=await weather(ask('?lat=40.71&lon=-74.01',{latitude:'40.73',longitude:'-73.99',city:'New York'}),{},json,{fetcher:services({place:null}),now});
  assert.equal((await near.json()).place,'New York');
  const far=await weather(ask('?lat=40.71&lon=-74.01',{latitude:'41.88',longitude:'-87.63',city:'Chicago'}),{},json,{fetcher:services({place:null}),now});
  assert.equal((await far.json()).place,'');
  const down=await weather(ask('?lat=40.71&lon=-74.01'),{},json,{fetcher:services({forecast:null}),now});
  assert.equal(down.status,502);
  assert.match((await down.json()).error,/forecast is unavailable/);
  const post=await weather(new Request('https://tools.example/v1/weather',{method:'POST'}),{},json,{fetcher:services(),now});
  assert.equal(post.status,405);
});

test('the route sits behind the bearer token like every other',async()=>{
  const response=await worker.fetch(new Request('https://tools.example/v1/weather?lat=40.71&lon=-74.01'),{API_TOKEN:'test-token-with-at-least-32-characters'});
  assert.equal(response.status,401);
});
