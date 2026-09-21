import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastFrom,weatherDay,rangeLabel,spanLabel,LAYERS} from '../src/weather-data.js';

// A synthetic day, hour by hour: every hour feels like `felt` unless `feel`
// says otherwise, and rain is likely only in the hours `wet` names.
const day=({felt=65,feel={},wet={},snow=[],hour=6,low=58,high=72,place='Synthetic Heights'}={})=>({
  date:'2026-09-21',place,hour,low,high,
  hours:Array.from({length:24},(unused,h)=>({hour:h,temperature:feel[h]??felt,feelsLike:feel[h]??felt,chance:wet[h]??5,snow:snow.includes(h)}))
});
const wetHours=(...hours)=>Object.fromEntries(hours.map(hour=>[hour,70]));

test('the coldest waking hour decides the layer, set for someone who runs cold',()=>{
  const layer=felt=>weatherDay(day({felt})).dress;
  assert.equal(layer(40),'Bring a heavy jacket');
  assert.equal(layer(49),'Bring a heavy jacket');
  assert.equal(layer(50),'Bring a light jacket');
  assert.equal(layer(61),'Bring a light jacket');
  assert.equal(layer(62),'Wear a sweater, no jacket');
  assert.equal(layer(69),'Wear a sweater, no jacket');
  assert.equal(layer(70),'No jacket or sweater');
  // Each step sits about five degrees above a general chart's.
  assert.deepEqual(LAYERS.map(step=>step.below),[50,62,70]);
});

test('a cold hour before seven or after ten dresses nobody',()=>{
  const early=weatherDay(day({felt:66,feel:{5:40,6:44,23:41}}));
  assert.equal(early.dress,'Wear a sweater, no jacket');
  assert.equal(early.coldest,66);
  // The evening still counts: a mild afternoon that turns cold at nine is a
  // jacket to carry.
  assert.equal(weatherDay(day({felt:66,feel:{21:48}})).dress,'Bring a heavy jacket');
});

test('worked out after the morning, the day is the hours still ahead',()=>{
  const cold={felt:66,feel:{8:45,9:47}};
  assert.equal(weatherDay(day({...cold,hour:7})).dress,'Bring a heavy jacket');
  assert.equal(weatherDay(day({...cold,hour:15})).dress,'Wear a sweater, no jacket');
  // Past ten at night there are no waking hours left, so it reads the rest of
  // the day rather than nothing.
  assert.equal(weatherDay(day({felt:66,feel:{23:55},hour:23})).dress,'Bring a light jacket');
});

test('rain is given the hours it is likely in',()=>{
  const rain=(wet,extra={})=>weatherDay(day({wet,...extra})).rain;
  assert.equal(rain(wetHours(14,15,16)),'2–5 PM');
  assert.equal(rain(wetHours(11,12)),'11 AM–1 PM');
  assert.equal(rain(wetHours(12)),'12–1 PM');
  // A single dry hour between two wet ones is one stretch of rain.
  assert.equal(rain(wetHours(9,11)),'9 AM–12 PM');
  assert.equal(rain(wetHours(8,9,16,17)),'8–10 AM and 4–6 PM');
  // Past two stretches it is the span they cover.
  assert.equal(rain(wetHours(8,12,16,20)),'8 AM–9 PM');
  assert.equal(rain(wetHours(...Array.from({length:15},(unused,index)=>7+index))),'all day');
  // Likely means more likely than not, and only while the owner is up.
  assert.equal(rain({14:49,15:30}),'');
  assert.equal(rain(wetHours(2,3,22,23)),'');
  assert.equal(weatherDay(day({wet:wetHours(14)})).snow,'');
});

test('snow is said as snow and takes no umbrella',()=>{
  const snowy=weatherDay(day({felt:28,wet:wetHours(14,15,16),snow:[14,15,16]}));
  assert.equal(snowy.snow,'2–5 PM');
  assert.equal(snowy.rain,'');
  assert.equal(snowy.dress,'Bring a heavy jacket');
});

test('the range is the day’s, with the feel only where it decided the advice',()=>{
  assert.equal(rangeLabel(weatherDay(day({felt:65,low:59,high:70}))),'59–70°');
  // A windy day feels colder than any temperature it reaches.
  assert.equal(rangeLabel(weatherDay(day({felt:60,feel:{9:45},low:52,high:70}))),'52–70° · feels like 45°');
  assert.equal(rangeLabel({low:null,high:null}),'');
  assert.equal(spanLabel([23,24]),'11 PM–12 AM');
});

// Open-Meteo's own shape: precipitation describes the hour ending at its
// timestamp, and the times are the place's own clock.
test('a forecast is cut down to the day it is for, each hour where it starts',()=>{
  const times=Array.from({length:24},(unused,h)=>`2026-09-21T${String(h).padStart(2,'0')}:00`);
  const data={utc_offset_seconds:-4*3600,
    hourly:{time:times,temperature_2m:times.map((unused,h)=>50+h),apparent_temperature:times.map((unused,h)=>48+h),
      precipitation_probability:times.map((unused,h)=>h===15?80:0),rain:times.map((unused,h)=>h===15?1.2:0),
      showers:times.map(()=>0),snowfall:times.map(()=>0)},
    daily:{time:['2026-09-21'],temperature_2m_min:[49.6],temperature_2m_max:[73.4]}};
  // 15:30 UTC is 11:30 in New York.
  const forecast=forecastFrom(data,{place:'  Synthetic Heights  ',now:Date.parse('2026-09-21T15:30:00Z')});
  assert.equal(forecast.hour,11);
  assert.equal(forecast.low,50);
  assert.equal(forecast.high,73);
  assert.equal(forecast.place,'Synthetic Heights');
  assert.equal(forecast.hours.length,24);
  assert.equal(forecast.hours.find(entry=>entry.hour===14).chance,80,'the 3 PM reading is the rain from 2 to 3');
  assert.equal(forecast.hours.find(entry=>entry.hour===15).chance,0);
  assert.equal(weatherDay(forecast).rain,'2–3 PM');
  assert.throws(()=>forecastFrom({hourly:{time:[]},daily:{time:[]}}),/without today/);
});
