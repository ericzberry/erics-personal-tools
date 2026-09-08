// All DOM construction lives here. Features compose components and supply data.
function element(tag, props={}, children=[]) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(props)) {
    if(value===undefined || value===null)continue;
    if(key==='text')node.textContent=value;
    else if(key==='className')node.className=value;
    else if(key==='hidden'||key==='disabled')node[key]=value;
    else node.setAttribute(key,String(value));
  }
  node.append(...children.filter(Boolean));return node;
}
export const Text=(text='',props={})=>element('p',{text,...props});
export const Label=(text,props={})=>element('span',{text,...props});
export const Heading=(text,level=2,props={})=>element(`h${level}`,{text,...props});
export const Strong=(text,props={})=>element('strong',{text,...props});
export const Stack=(children=[],props={})=>element('div',props,children);
export const Section=(children=[],props={})=>element('section',props,children);
export const Main=children=>element('main',{},children);
export const Button=(text,{variant='quiet',...props}={})=>element('button',{type:'button',text,className:variant==='quiet'?'quiet':`button-${variant}`,...props});
export const Link=(text,href,props={})=>element('a',{text,href,target:'_blank',rel:'noreferrer',...props});
export const Option=(text,value)=>element('option',{text,value});
export const List=(children=[],props={})=>element('ol',props,children);
export const Note=(text,props={})=>Text(text,{className:'footnote',...props});
export const Badge=(text,props={})=>Label(text,{className:'pill',...props});
export const Notice=(text='',props={})=>Text(text,{className:'notice',role:'status',...props});
export const SectionTitle=(title,action,props={})=>Stack([Heading(title,props.level||2,{id:props.titleId}),action],{className:'section-title'});
export const Disclosure=(title,children=[],props={})=>element('details',props,[element('summary',{text:title}),...children]);
export function Field({id,label,kind='search',options=[],hiddenLabel=false,placeholder,rows=9,disabled=false}) {
  const caption=element('label',{for:id,text:label,className:hiddenLabel?'sr-only':undefined});
  const control=kind==='select'?element('select',{id,disabled},options.map(o=>Option(o.text,o.value))):kind==='textarea'?element('textarea',{id,rows,className:'editable-output'}):element('input',{id,type:kind,placeholder,disabled});
  return [caption,control];
}
export function AppHeader({name='Eric’s tools',context='Draft advisor'}) {
  return element('header',{className:'app-header'},[element('img',{className:'mark',src:'icons/icon-32.png',width:24,height:24,alt:''}),Label(name,{className:'compact-brand'}),Strong(context,{id:'current-function',className:'context-label'})]);
}
export const ToolHeading=(title,subtitle)=>Stack([Heading(title,1),Label(subtitle,{className:'subtitle'})],{className:'tool-heading'});
export const Highlight=({id,valueId,label,value})=>Stack([Label(label),Strong(value,{id:valueId})],{id,className:'next-pick-chip',role:'status'});
export const StatusCard=({statusId,detailId,dotId,status,detail,links=[]})=>Stack([Stack([Label('',{id:dotId,className:'dot'}),Strong(status,{id:statusId})],{className:'status-label'}),Text(detail,{id:detailId}),...links.map(l=>Link(l.text,l.href))],{className:'status-card'});
export const Metrics=items=>Stack(items.map(item=>Stack([Strong(item.value,{id:item.id}),Label(item.label)])),{className:'metrics'});
export const SourceNote=(title,description)=>Stack([Label('',{className:'board-dot','aria-hidden':true}),Stack([Strong(title),Text(description)])],{className:'board-note'});
export function UploadField({id,inputId,statusId,label,formats,accept,status,resetId,resetLabel}) {
  return Stack([element('button',{id,type:'button',className:'file-drop','aria-describedby':statusId},[Label('↑',{className:'upload-symbol','aria-hidden':true}),Strong(label),Label(`${formats} · or browse files`)]),element('input',{id:inputId,type:'file',accept,hidden:true}),Text(status,{id:statusId,className:'upload-status',role:'status'}),Button(resetLabel,{id:resetId,hidden:true})],{className:'upload-panel'});
}
export function DataTable(headers,rows) {
  return element('table',{},[element('thead',{},[element('tr',{},headers.map(text=>element('th',{text})))]),element('tbody',{},rows.map(row=>element('tr',{},row.map(text=>element('td',{text:String(text)}))))) ]);
}
export function PickRow(p,ownTeamId) {
  return element('li',{className:`pick pick--compact${p.teamId===ownTeamId?' mine':''}`},[Label(p.overall??'—',{className:'pick-number'}),Stack([Strong(p.player,{className:'pick-name'}),Text(`${p.manual?'Manual':`R${p.round} · P${p.pickInRound}`} · ${p.nflTeam} · ${p.team}`,{className:'pick-meta'})]),Label(p.position,{className:'position'})]);
}
export function RecommendationCard(p,{primary=false}={}) {
  const children=[Text(primary?'PICK NEXT':'ALTERNATIVE',{className:'eyebrow'}),Heading(`${p.name} · ${p.position}`,3),Text(`Rank #${p.rank} · ADP ${p.adp ?? '—'}`,{className:'pick-meta'})];
  if (p.shortWhy) children.push(Text(p.shortWhy,{className:'recommendation-why'}));
  if (p.outlook) children.push(Text(p.outlook,{className:'recommendation-outlook'}));
  children.push(Disclosure('Reasoning',[element('ul',{},p.reasons.map(text=>element('li',{text})))]));
  return element('article',{className:`recommendation${primary?' recommendation--primary':''}`},children);
}
export function EditableResult({id,titleId,copyId,fieldId,title='Summary',label='Generated text — editable'}) {
  return Section([SectionTitle(title,Button('Copy',{id:copyId}),{titleId}),...Field({id:fieldId,label,kind:'textarea',hiddenLabel:true})],{id,hidden:true});
}
export function downloadFile({url,filename}) {const link=Link('',url,{download:filename});link.removeAttribute('target');link.click();}

export const ActionGroup=children=>Stack(children,{className:'action-group'});

export function SelectionRow(player,{owner=null,corrected=false,onSelect}) {
  const actions=ActionGroup(['me','other'].map(value=>{
    const button=Button(value==='me'?'Me':'Someone else',{variant:owner===value?'primary':'secondary',disabled:!!player.identityUnverified,'aria-label':`${player.name}: ${value==='me'?'taken by me':'taken by someone else'}`,'aria-pressed':String(owner===value)});
    button.addEventListener('click',()=>onSelect(value));return button;
  }));
  if(corrected){const undo=Button('Undo',{'aria-label':`Undo correction for ${player.name}`});undo.addEventListener('click',()=>onSelect('undo'));actions.append(undo);}
  return Stack([Stack([Strong(player.name,{className:'pick-name'}),Note(`${player.position} · ${player.nflTeam} · ${player.rank?`Rank #${player.rank}`:'Not in your ranks'} · ${player.espnId!==undefined?`ESPN ${player.espnId}`:'Unmatched — refresh ESPN'}${owner?` · ${owner==='me'?'Yours':'Taken'}`:''}`)]),actions],{className:'selection-row'});
}
export const SubPage=({id,title,backId,children=[]})=>Section([SectionTitle(title,Button('← Back',{id:backId}),{level:1}),...children],{id,hidden:true,className:'sub-page'});
