// Local synthetic fixture for the email screen: the real GmailView and the real
// writing-voice controller, with a synthetic message and a synthetic Worker.
// Every state this screen has is a button at the top, so all of them can be
// inspected at 280px and at a normal sidebar width without a Gmail tab.
import {GmailView} from '../src/components/views.js';
import {Button,ActionGroup} from '../src/components/ui.js';
import {mountWritingVoice} from '../src/writing-voice.js';

const email={
  subject:'Reference for my O1 application?',
  name:'Marty Krátký-Katz',from:'martin.kratky.katz@gmail.com',
  text:'Hey man, hope you have been well since we last spoke!'
};
const profile={
  prompt:'Open with "Hey" and a first name. Keep replies to three sentences unless numbers are involved. Use em dashes, not semicolons. Sign off "Eric" alone; never "Best regards". Contractions throughout. Never use exclamation marks with people you have not met.',
  voices:[
    {name:'Warm professional',audience:'investors, founders and people he works with',markers:['opens with "Hey <first name>"','three sentences or fewer','em dashes, no semicolons','signs off "Eric"']},
    {name:'Close and quick',audience:'family and old friends',markers:['lower-case openers','"sounds good", "on it"','no sign-off']},
    {name:'Formal and short',audience:'lawyers, accountants and institutions with a very long name indeed',markers:['"Thanks for the note"','no contractions','signs off "Eric Berry"']}
  ],
  sampled:1000,updatedAt:'2026-09-18T12:00:00.000Z',model:'gpt-5.6-terra'
};
const reply=`Hey Marty — congratulations, and yes, happy to be a reference.

Send the form whenever it is ready and I will turn it around by [date]. If they want specifics on Blockthrough, I can speak to [what you want me to cover].

Eric`;

const summary=`Marty is asking Eric to be a reference for his O1 application. He wants to send a form and asks whether Eric can speak to the Blockthrough work. No date is given.`;

const screen=document.getElementById('email-screen');
const view=GmailView();
view.hidden=false;
screen.append(view);
const $=id=>document.getElementById(id);

// The Worker, scripted. The study advances one page per call so the progress
// line can be looked at mid-flight.
let voiceState={profile:null,scan:null,google:{connected:true,sentMail:true}};
let page=0,refusal='';
const request=async(action,data={})=>{
  if(action==='voice')return voiceState;
  if(action==='list')return {connections:[{id:'a5bb73f0-738b-4cf6-9862-41c6468cf40a',provider:'openai',hasApiKey:true}]};
  if(action==='status')return {connected:true};
  if(action==='google-connect')return {url:'https://accounts.google.com/o/oauth2/v2/auth'};
  if(action==='voice-scan'){
    await new Promise(resolve=>setTimeout(resolve,700));
    // A Google that will not read mail: the refusal, and then the state the
    // panel reads back, which is what turns Resume into the repair.
    if(refusal){voiceState={...voiceState,google:{connected:true,sentMail:false}};throw Error(refusal);}
    page=data.restart?1:page+1;
    const done=page>=4;
    voiceState={...voiceState,scan:done?null:{sampled:page*240,scanned:page*300,accounts:page},profile:done?profile:voiceState.profile};
    return {...voiceState,done};
  }
  if(action==='voice-save'){voiceState={...voiceState,profile:{...voiceState.profile,prompt:data.prompt}};return voiceState;}
  if(action==='voice-forget'){voiceState={...voiceState,profile:null};page=0;return voiceState;}
  throw Error(`unexpected ${action}`);
};
const voice=mountWritingVoice({
  nodes:{status:$('voice-status'),actions:$('voice-actions'),list:$('voice-list'),editor:$('voice-editor'),prompt:$('voice-prompt')},
  request,openExternal:()=>true
});

function show({open=false,drafting=false,drafted=false,summarized=false,learned=false,connected=true,mail=true,refused='',intent=''}){
  $('email-subject').textContent=open?email.subject:'Open an email in Gmail';
  $('email-from').textContent=open?`${email.name} · ${email.from}`:'';
  $('email-read-status').textContent=open?'Latest expanded message':'Open a message, then expand it.';
  $('reply-intent').value=intent;
  for(const id of ['reply-email','summarize-email'])$(id).disabled=!open||drafting;
  $('reply-status').textContent=drafting?'Drafting in your voice…':drafted?'Review and edit before using.':'';
  $('summary-status').textContent='';
  for(const [shown,result,output,copy,text] of [
    [drafted,'reply-result','reply-output','copy-reply',reply],
    [summarized,'summary-result','summary-output','copy-summary',summary]
  ]){
    $(result).hidden=!shown;$(copy).hidden=!shown;
    $(output).value=shown?text:'';
    $(output).dispatchEvent(new Event('output-updated'));
  }
  voiceState={profile:learned?profile:null,scan:refused?{sampled:480,scanned:600,accounts:2,startedAt:''}:null,google:{connected,sentMail:connected&&mail}};
  page=learned?4:0;
  refusal=refused;
  $('email-voice').open=learned||!connected||!mail||!!refused;
  // The refusal is what a study runs into, so the fixture runs one — after the
  // section has read its state, because the panel does one thing at a time.
  voice.load({force:true}).then(()=>{if(refused)voice.study(false);});
}
const states=[
  ['Waiting for a message',{}],
  ['A message open',{open:true}],
  ['Saying what the reply should do',{open:true,intent:'Say yes, ask him to send the form, and mention I can speak to Blockthrough'}],
  ['Drafting',{open:true,intent:'Say yes and ask for the form',drafting:true}],
  ['A reply drafted in his voice',{open:true,intent:'Say yes and ask for the form',drafted:true,learned:true}],
  ['A voice already learned',{open:true,learned:true}],
  ['A summary of the message',{open:true,summarized:true}],
  ['Both, at once',{open:true,intent:'Say yes and ask for the form',drafted:true,summarized:true,learned:true}],
  ['Google not connected for mail',{open:true,connected:false}],
  ['Google refused reading mail',{open:true,mail:false,refused:'Google would not allow reading your sent mail. Connect Google again and approve reading mail. Google said: Request had insufficient authentication scopes.'}]
];
const switcher=ActionGroup(states.map(([label,state])=>{
  const button=Button(label,{variant:'secondary',size:'compact'});
  button.addEventListener('click',()=>show(state));
  return button;
}),{compact:true});
switcher.style.cssText='padding:8px;border-bottom:1px solid #dedfd5;flex-wrap:wrap';
document.getElementById('email-states').append(switcher);
show(states[1][1]);
