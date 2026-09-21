// Today's weather where the owner is, and what to wear for it. No DOM and no
// network: the Worker shapes a forecast with `forecastFrom`, and the home
// screen turns it into advice with `weatherDay`, so the rule is tested hour by
// hour in one place and both hosts say the same thing.

// The hours a day is dressed for. A forecast low at five in the morning dresses
// nobody, and neither does rain at three.
export const WAKING={from:7,to:22};

// What to wear, by the coldest the waking day will feel (°F, apparent
// temperature, so wind and humidity count). The owner runs a little cold, so
// each step comes about five degrees sooner than a general chart puts it.
// Above the last step nothing extra is needed.
export const LAYERS=[
  {below:50,layer:'heavy',say:'Bring a heavy jacket'},
  {below:62,layer:'light',say:'Bring a light jacket'},
  {below:70,layer:'sweater',say:'Wear a sweater, no jacket'}
];
export const NO_LAYER='No jacket or sweater';
// Rain is worth an umbrella once it is more likely than not in some hour.
export const LIKELY=50;

const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;

// Open-Meteo's answer for one day, cut down to what the advice reads. Its
// hourly precipitation fields describe the hour that ends at the timestamp, so
// each is moved onto the hour it starts at: `wet` at hour 14 means 2–3 PM.
// `hour` is the local hour at the place the forecast is for, taken from the
// forecast's own offset, so a device whose clock is somewhere else still gets
// the right part of the day.
export function forecastFrom(data,{place='',now=Date.now()}={}){
  const hourly=data?.hourly,daily=data?.daily,date=daily?.time?.[0];
  if(!hourly?.time?.length||typeof date!=='string')throw Error('The forecast came back without today in it.');
  const at=index=>field=>number(hourly[field]?.[index]);
  const byHour=new Map();
  hourly.time.forEach((time,index)=>{
    if(!String(time).startsWith(date))return;
    const value=at(index),hour=Number(String(time).slice(11,13));
    byHour.set(hour,{...byHour.get(hour),hour,temperature:value('temperature_2m'),feelsLike:value('apparent_temperature'),code:value('weather_code')});
    // The precipitation fields describe the hour before the timestamp.
    if(hour>0){
      const rain=(value('rain')??0)+(value('showers')??0),snow=value('snowfall')??0;
      byHour.set(hour-1,{...byHour.get(hour-1),hour:hour-1,chance:value('precipitation_probability')??0,
        // Snowfall is centimetres and rain millimetres; a centimetre of snow is
        // about a millimetre of water. With neither modelled, the thermometer decides.
        snow:snow||rain?snow>rain:(value('temperature_2m')??99)<=32});
    }
  });
  const local=new Date(now+(number(data.utc_offset_seconds)??0)*1000);
  const low=number(daily.temperature_2m_min?.[0]),high=number(daily.temperature_2m_max?.[0]);
  return {date,place:typeof place==='string'?place.trim().slice(0,60):'',hour:local.getUTCHours(),
    low:low===null?null:Math.round(low),high:high===null?null:Math.round(high),
    hours:[...byHour.values()].sort((a,b)=>a.hour-b.hour)};
}

// Hours from `start` up to `end`, run together where they touch. A single dry
// hour between two wet ones is not a break worth planning around.
function spans(hours){
  const runs=[];
  for(const hour of hours){
    const last=runs.at(-1);
    if(last&&hour-last[1]<=1)last[1]=hour+1;else runs.push([hour,hour+1]);
  }
  return runs;
}
const clock=hour=>`${hour%12||12} ${hour%24<12?'AM':'PM'}`;
export function spanLabel([from,to]){
  const [a,b]=[clock(from),clock(to)];
  return a.slice(-2)===b.slice(-2)?`${a.slice(0,-3)}–${b}`:`${a}–${b}`;
}

// What the sky does, from the WMO codes Open-Meteo gives each hour. Rain and
// snow are not read off the codes: they come from the chance of them, the same
// reading the umbrella does, so the picture never promises rain the advice
// does not. A drizzle code in an hour that is probably dry is a grey sky.
const SKY_OF=code=>code===null||code===undefined?null:code<=1?'clear':code===2?'partly':code===45||code===48?'fog':'cloudy';
const SKY_ORDER=['clear','partly','cloudy','fog'];
function skyOf(waking,{wet,snow}){
  if(wet.length)return snow?'snow':wet.some(entry=>entry.code>=95)?'storm':'rain';
  const counts=new Map();
  for(const entry of waking){const sky=SKY_OF(entry.code);if(sky)counts.set(sky,(counts.get(sky)||0)+1);}
  // The commonest sky over the waking hours; a tie goes to the greyer one.
  return [...counts].sort((a,b)=>b[1]-a[1]||SKY_ORDER.indexOf(b[0])-SKY_ORDER.indexOf(a[0]))[0]?.[0]||null;
}

// The day as the home screen says it, worked out once from a forecast. The
// window is the waking hours still ahead when it is worked out, so a first
// look at three in the afternoon dresses for the afternoon and evening.
export function weatherDay(forecast){
  const hours=Array.isArray(forecast?.hours)?forecast.hours:[];
  let from=Math.max(WAKING.from,forecast?.hour??0),to=WAKING.to;
  if(from>=to)[from,to]=[forecast.hour,24];
  const waking=hours.filter(entry=>entry.hour>=from&&entry.hour<=to);
  const felt=waking.map(entry=>entry.feelsLike??entry.temperature).filter(value=>value!==null&&value!==undefined);
  const coldest=felt.length?Math.round(Math.min(...felt)):null;
  const step=coldest===null?null:LAYERS.find(({below})=>coldest<below);
  const wet=waking.filter(entry=>entry.hour<to&&entry.chance>=LIKELY);
  const snow=wet.length>0&&wet.filter(entry=>entry.snow).length*2>wet.length;
  const runs=spans(wet.map(entry=>entry.hour));
  const when=!runs.length?'':runs.length===1&&runs[0][0]<=from&&runs[0][1]>=to?'all day'
    :runs.length<=2?runs.map(spanLabel).join(' and '):spanLabel([runs[0][0],runs.at(-1)[1]]);
  return {date:forecast?.date||'',place:forecast?.place||'',low:forecast?.low??null,high:forecast?.high??null,coldest,
    sky:skyOf(waking,{wet,snow}),
    layer:coldest===null?null:step?.layer||'none',dress:coldest===null?'':step?.say||NO_LAYER,
    rain:runs.length&&!snow?when:'',snow:runs.length&&snow?when:''};
}

export function rangeLabel(day){
  if(day?.low===null||day?.low===undefined||day?.high===null||day?.high===undefined)return '';
  return day.low===day.high?`${day.high}°`:`${day.low}–${day.high}°`;
}
// The feel is said only where it is what the advice was decided on: a windy
// 52–70° day that feels like 45 otherwise reads as a heavy jacket for no reason.
export function feelsLabel(day){
  return day?.coldest!==null&&day?.coldest!==undefined&&day?.low!==null&&day?.low!==undefined&&day.coldest<=day.low-3?`feels like ${day.coldest}°`:'';
}
