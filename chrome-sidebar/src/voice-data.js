// Eric's writing voice: what he actually wrote in his own sent mail, and the
// profile a reading of it produces.
//
// Everything here is pure text work, so the Worker that reads Gmail and the
// app that shows the result answer to one module. The hard part is not the
// reading — it is that a sent message is mostly other people's words. A reply
// carries the message it answers, a forward carries the thing forwarded, and a
// signature carries a phone number. None of that is voice. `writtenPortion`
// keeps only the part typed before all of it.

const fail=message=>{throw Object.assign(Error(message),{status:400});};

// How much of one message is enough to hear a voice in, and how many messages
// are enough to hear all of them. A message shorter than the minimum is a
// "sounds good" that would teach the reading nothing.
export const MIN_VOICE_SAMPLE=40;
export const MAX_VOICE_SAMPLE=900;
export const VOICE_SAMPLE_TARGET=1000;
// One reading covers as many samples as fit under the provider's prompt limit,
// so the chunk is measured in characters rather than messages: Eric's replies
// are mostly short, and counting them would waste most of the window.
export const VOICE_CHUNK_CHARS=22000;
export const MAX_VOICE_CHUNKS=20;
export const MAX_VOICE_PROMPT=6000;
// A profile that names every correspondent separately is a list, not a voice.
export const MAX_VOICES=5;
export const MAX_REPLY_INSTRUCTION=1200;

// --- Reading a Gmail message

export function decodeBody(data){
  if(typeof data!=='string'||!data)return '';
  try{
    const binary=atob(data.replace(/-/g,'+').replace(/_/g,'/'));
    return new TextDecoder().decode(Uint8Array.from(binary,character=>character.charCodeAt(0)));
  }catch{return '';}
}

const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',mdash:'—',ndash:'–',hellip:'…'};
// An HTML body is cut at the quote before anything else is done to it, because
// a quoted thread is nested markup that no amount of tag stripping separates
// afterwards.
export function htmlToText(html){
  let text=String(html??'');
  const quote=text.search(/<blockquote\b|<div[^>]*(?:gmail_quote|gmail_extra|moz-cite-prefix|yahoo_quoted)/i);
  if(quote>=0)text=text.slice(0,quote);
  return text
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi,'\n')
    .replace(/<[^>]*>/g,'')
    .replace(/&#(\d{1,7});/g,(_,code)=>String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]{1,6});/gi,(_,code)=>String.fromCodePoint(parseInt(code,16)))
    .replace(/&([a-z]+);/gi,(whole,name)=>ENTITIES[name.toLowerCase()]??whole);
}

// Prefer the plain-text alternative: it is what the sender's client wrote down
// as the message, without the markup a rendering added.
export function messageText(payload){
  const plain=[],html=[];
  (function walk(part,depth){
    if(!part||typeof part!=='object'||depth>12)return;
    const type=String(part.mimeType||'').toLowerCase();
    if(type==='text/plain'&&part.body?.data)plain.push(decodeBody(part.body.data));
    else if(type==='text/html'&&part.body?.data)html.push(decodeBody(part.body.data));
    for(const child of Array.isArray(part.parts)?part.parts:[])walk(child,depth+1);
  })(payload,0);
  if(plain.length)return plain.join('\n\n');
  return html.length?htmlToText(html.join('\n')):'';
}

export const headerValue=(payload,name)=>{
  const headers=Array.isArray(payload?.headers)?payload.headers:[];
  const found=headers.find(header=>String(header?.name||'').toLowerCase()===name.toLowerCase());
  return typeof found?.value==='string'?found.value.trim():'';
};

// Where the owner's own words stop. Each of these is a marker a mail client
// puts between what was typed and what was quoted, forwarded or appended.
const CUTS=[
  /\n[ \t]*-{2,}[ \t]*(?:original message|forwarded message)[ \t]*-{2,}/i,
  /\n[ \t]*begin forwarded message:/i,
  /\n[ \t]*_{10,}[ \t]*(?:\n|$)/,
  /\n[ \t]*On\s[\s\S]{0,300}?\bwrote:[ \t]*(?:\n|$)/i,
  /\n[ \t]*From:[ \t]*[^\n]{1,200}\n[ \t]*(?:sent|date|to):/i,
  /\n[ \t]*>/,
  /\n--[ \t]*\n/,
  /\n[ \t]*sent from my [^\n]{0,60}(?:\n|$)/i,
  /\n[ \t]*get outlook for [^\n]{0,40}(?:\n|$)/i
];

export function writtenPortion(body){
  const text=String(body??'').replace(/\r\n?/g,'\n').replace(/ /g,' ');
  // Every marker is anchored to the start of a line. Searching a copy padded
  // with a newline at each end lets the same pattern catch one that opens the
  // message — a bare forward — and one that closes it.
  const searchable=`\n${text}\n`;
  let end=text.length;
  for(const pattern of CUTS){
    const found=searchable.search(pattern);
    if(found>=0&&found-1<end)end=Math.max(0,found-1);
  }
  return text.slice(0,end)
    .split('\n').filter(line=>!/^[ \t]*>/.test(line)).join('\n')
    .replace(/\[image:[^\]]*\]/gi,' ')
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

// One sent message reduced to what it can teach: who it went to, what it was
// about, and the words the owner typed. The body is trimmed rather than
// dropped, because the opening of a long message carries its voice too.
export function voiceSample(message){
  const payload=message?.payload;
  const text=writtenPortion(messageText(payload));
  if(text.length<MIN_VOICE_SAMPLE)return null;
  const date=Number(message?.internalDate);
  return {
    to:headerValue(payload,'To').slice(0,160),
    subject:headerValue(payload,'Subject').slice(0,160),
    date:Number.isFinite(date)&&date>0?new Date(date).toISOString().slice(0,10):'',
    text:text.slice(0,MAX_VOICE_SAMPLE)
  };
}

// Samples are grouped by size, not by count, so one reading carries as much as
// the provider will accept in a single prompt.
export function voiceChunk(samples=[],limit=VOICE_CHUNK_CHARS){
  const taken=[];let size=0;
  for(const sample of samples){
    const cost=(sample?.text?.length||0)+(sample?.to?.length||0)+(sample?.subject?.length||0)+40;
    if(taken.length&&size+cost>limit)break;
    taken.push(sample);size+=cost;
  }
  return {taken,rest:samples.slice(taken.length)};
}

// --- The profile

const trimmed=(value,limit)=>typeof value==='string'?value.trim().slice(0,limit):'';

export function normalizeVoiceProfile(value,{updatedAt}={}){
  const prompt=trimmed(value?.prompt,MAX_VOICE_PROMPT);
  if(!prompt)fail('A voice profile needs the instructions that describe the voice.');
  const voices=(Array.isArray(value?.voices)?value.voices:[]).slice(0,MAX_VOICES).map(voice=>({
    name:trimmed(voice?.name,60),
    audience:trimmed(voice?.audience,140),
    markers:(Array.isArray(voice?.markers)?voice.markers:[]).slice(0,6).map(marker=>trimmed(marker,140)).filter(Boolean)
  })).filter(voice=>voice.name);
  const sampled=Math.trunc(Number(value?.sampled));
  return {
    prompt,voices,
    sampled:Number.isFinite(sampled)&&sampled>0?Math.min(sampled,100000):0,
    model:trimmed(value?.model,120),
    updatedAt:updatedAt||trimmed(value?.updatedAt,40)||new Date().toISOString()
  };
}

export function replyInstruction(value){
  const text=String(value??'').replace(/\s+/g,' ').trim();
  if(text.length>MAX_REPLY_INSTRUCTION)fail(`Say it in under ${MAX_REPLY_INSTRUCTION.toLocaleString('en-US')} characters.`);
  return text;
}

// How the profile is described to the model that writes a reply. Voices are
// named with the audience that calls for them, so one reply can be written in
// the right one without a second call to choose it.
export function voiceGuidance(profile){
  const voice=normalizeSafely(profile);
  if(!voice)return '';
  const voices=voice.voices.map(entry=>`- ${entry.name}${entry.audience?` — for ${entry.audience}`:''}${entry.markers.length?`: ${entry.markers.join('; ')}`:''}`).join('\n');
  return `How Eric writes, learned from ${voice.sampled.toLocaleString('en-US')} messages he sent:\n${voice.prompt}${voices?`\n\nHis voices, and who each is for:\n${voices}`:''}`;
}
function normalizeSafely(profile){
  try{return normalizeVoiceProfile(profile);}catch{return null;}
}
