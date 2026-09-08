// Synthetic browser integration harness. Never bundled with the extension.
const fixtureEmail = {subject:'Lunch on Friday?',from:'alex@example.test',name:'Alex',text:'Would noon on Friday work for lunch? Let me know which neighborhood you prefer.',url:'https://mail.google.com/mail/u/0/#inbox/fixture'};
let activeFixture = fixtureEmail;
const mockTab={id:1,url:fixtureEmail.url};
window.chrome = {tabs:{query:async()=>[mockTab],sendMessage:async()=>({email:activeFixture}),onActivated:{addListener(){}},onUpdated:{addListener(){}}}};
window.LanguageModel={availability:async()=> 'available',create:async()=>({prompt:async input=>input[0].content.startsWith('Summarize')?'• Alex proposes lunch Friday at noon.\n• Reply with availability and preferred neighborhood.':'Hi Alex,\n\n[Confirm whether Friday at noon works]. How about [preferred neighborhood]?\n\nEric',destroy(){}})};
document.addEventListener('DOMContentLoaded',()=>{
  const controls=document.createElement('div');controls.textContent='SYNTHETIC TEST DATA · ';
  const next=document.createElement('button');next.textContent='Test: next email';next.onclick=()=>{activeFixture={...fixtureEmail,subject:'Different email',text:'A different message.'};};controls.append(next);
  const unavailable=document.createElement('button');unavailable.textContent='Test: AI unavailable';unavailable.onclick=()=>{window.LanguageModel.availability=async()=> 'unavailable';};controls.append(unavailable);
  document.body.append(controls);
});
