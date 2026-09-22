import {weatherDay} from './weather-data.js';

// Where the device is, to about a kilometre: plenty for a forecast, and nothing
// closer leaves the device. Null whenever the browser cannot or will not say,
// and the Worker then goes by the city the connection comes from.
//
// The browser's own timeout does not count the time a permission prompt sits
// unanswered, so a second, longer one ends the wait: a phone asked for the
// first time gets half a minute to answer before the day is read without it.
const round=value=>Math.round(value*100)/100;
export async function locateDevice({geolocation=globalThis.navigator?.geolocation,permissions=globalThis.navigator?.permissions,timeoutMs=10000,promptMs=30000}={}){
  if(!geolocation)return null;
  try{if((await permissions?.query({name:'geolocation'}))?.state==='denied')return null;}catch{}
  return new Promise(resolve=>{
    const timer=setTimeout(()=>resolve(null),promptMs);
    const done=value=>{clearTimeout(timer);resolve(value);};
    try{
      geolocation.getCurrentPosition(({coords})=>done({lat:round(coords.latitude),lon:round(coords.longitude)}),
        ()=>done(null),{enableHighAccuracy:false,timeout:timeoutMs,maximumAge:60*60*1000});
    }catch{done(null);}
  });
}

// Worked out once a day on each device. The first look of the day finds out
// where the device is, asks the Worker for that place's forecast, and keeps
// the advice in the device's encrypted store; every later look that day reads
// it back. The advice does not change under the owner as the day goes on, and
// nothing about where they are leaves the device again until tomorrow.
//
// A failed attempt keeps nothing, so the next look tries again.
export const WEATHER_RESOURCE='weather-day';
// A copy kept in an older shape is worked out again rather than drawn short:
// 2 added the sky.
export const WEATHER_SHAPE=2;
export function dailyWeather({store,remote,locate=locateDevice}={}){
  let pending=null;
  async function saved(token,day){
    try{const value=await store.read(WEATHER_RESOURCE,token);return value?.day===day&&value.shape===WEATHER_SHAPE?value:null;}catch{return null;}
  }
  async function work(token,day){
    const kept=await saved(token,day);
    if(kept)return kept;
    const here=await locate();
    const forecast=await remote(token,`/v1/weather${here?`?lat=${here.lat}&lon=${here.lon}`:''}`,{timeoutMs:15000});
    const result={...weatherDay(forecast),day,shape:WEATHER_SHAPE};
    try{await store.write(WEATHER_RESOURCE,token,result);}catch{}
    return result;
  }
  return {
    resource:WEATHER_RESOURCE,
    saved,
    // One attempt at a time: the home screen refreshes on every return to it,
    // and two returns in a row must not ask for the location twice.
    today(token,day){
      if(pending?.token!==token||pending.day!==day){
        const attempt={token,day,promise:work(token,day).finally(()=>{if(pending===attempt)pending=null;})};
        pending=attempt;
      }
      return pending.promise;
    },
    // Cleared like every other private copy when the device disconnects:
    // it names where the device was this morning.
    async disconnect(token){try{await store.remove(WEATHER_RESOURCE,token);}catch{}}
  };
}
