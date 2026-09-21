import {Stack,Label,Strong,Button} from './ui.js';
// Two pictures of money, drawn once for every tool that needs one: a line for a
// figure over time, and a bar for the parts of a whole. Both are built from
// ordinary elements positioned by percentage, with the SVG reserved for the
// line itself, so the type and the dots stay their own size at any width —
// a chart scaled down to a phone does not shrink its labels to nothing.
//
// Neither is the only way to read what it shows. Every value is also in a list
// or a table beside the chart, so a tooltip is a convenience and never a gate.
const SVG='http://www.w3.org/2000/svg';
const svg=(tag,props={})=>{
  const node=document.createElementNS(SVG,tag);
  for(const [key,value] of Object.entries(props))node.setAttribute(key,String(value));
  return node;
};

// Round numbers for an axis: three to five lines at 1, 2 or 5 times a power of
// ten, wide enough to hold every point with a little air above and below. A
// chart of a figure that moved a few per cent is drawn around where it moved,
// not from zero — a line is read by its shape, and its ticks say where it sits.
export function niceTicks(min,max,count=4){
  if(!Number.isFinite(min)||!Number.isFinite(max))return [];
  if(min===max){const pad=Math.abs(min)*0.05||1;min-=pad;max+=pad;}
  const span=max-min,raw=span/Math.max(1,count);
  const power=10**Math.floor(Math.log10(raw));
  const step=[1,2,2.5,5,10].map(f=>f*power).find(value=>value>=raw)||raw;
  const start=Math.floor(min/step)*step,end=Math.ceil(max/step)*step;
  const ticks=[];
  for(let value=start;value<=end+step/2;value+=step)ticks.push(Math.round(value*1e6)/1e6);
  return ticks;
}

// A figure over time. `points` are in order, each with the label it is read by
// (a quarter), its value, and an optional position on the time axis — a
// quarter nobody read is a gap in time, not a point skipped over. `format`
// writes a value in full for the tooltip and the points' names; `short` writes
// it for a tick.
export function LineChart({points=[],format=String,short=format,label='',height=180,describe=()=>''}={}){
  const values=points.map(point=>point.value);
  const ticks=niceTicks(Math.min(...values),Math.max(...values));
  const low=ticks[0],high=ticks.at(-1),range=high-low||1;
  const xs=points.map((point,index)=>point.x??index);
  const first=xs[0],span=(xs.at(-1)-first)||1;
  const left=point=>((xs[points.indexOf(point)]-first)/span)*100;
  const top=value=>(1-(value-low)/range)*100;

  const plot=Stack([],{className:'line-chart-plot',style:`--chart-height:${height}px`});
  // The grid is recessive: a hairline per tick, its value set small at the
  // left edge just above it rather than in a column of its own.
  plot.append(...ticks.map(tick=>Stack([Label(short(tick),{className:'line-chart-tick'})],
    {className:'line-chart-grid',style:`top:${top(tick).toFixed(3)}%`,'aria-hidden':'true'})));
  const drawing=svg('svg',{viewBox:'0 0 100 100',preserveAspectRatio:'none',class:'line-chart-svg','aria-hidden':'true',focusable:'false'});
  const coords=points.map(point=>[left(point),top(point.value)]);
  const line=coords.map(([x,y],index)=>`${index?'L':'M'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' ');
  const id=`wash-${Math.random().toString(36).slice(2,9)}`;
  const defs=svg('defs'),gradient=svg('linearGradient',{id,x1:0,y1:0,x2:0,y2:1});
  gradient.append(svg('stop',{offset:'0%',class:'line-chart-wash-top'}),svg('stop',{offset:'100%',class:'line-chart-wash-bottom'}));
  defs.append(gradient);
  // The wash is decoration behind the line, fading to nothing well before the
  // floor, so it never reads as an area measured from a baseline the axis does
  // not start at.
  drawing.append(defs,
    svg('path',{d:`${line} L${coords.at(-1)[0].toFixed(3)} 100 L${coords[0][0].toFixed(3)} 100 Z`,fill:`url(#${id})`,class:'line-chart-wash'}),
    svg('path',{d:line,class:'line-chart-line','vector-effect':'non-scaling-stroke'}));
  plot.append(drawing);

  const rule=Stack([],{className:'line-chart-rule',hidden:true,'aria-hidden':'true'});
  const tip=Stack([],{className:'line-chart-tip',hidden:true,'aria-hidden':'true'});
  plot.append(rule);
  // Each point is a button: a keyboard reaches every reading the pointer can,
  // and hears the same words the tooltip shows.
  const dots=points.map((point,index)=>{
    const words=[point.label,format(point.value),describe(point,index)].filter(Boolean).join(' · ');
    const dot=Button('',{className:`line-chart-point${index===points.length-1?' line-chart-point--last':''}`,
      'aria-label':words,style:`left:${left(point).toFixed(3)}%;top:${top(point.value).toFixed(3)}%`});
    dot.addEventListener('focus',()=>show(index));
    dot.addEventListener('blur',hide);
    return dot;
  });
  plot.append(...dots,tip);
  // The newest reading is the one worth naming on the chart itself; the rest
  // are on the axis, in the tooltip and in the table beside it.
  const last=points.at(-1);
  if(last)plot.append(Label(short(last.value),{className:'line-chart-end',
    style:`left:${left(last).toFixed(3)}%;top:${top(last.value).toFixed(3)}%`,'aria-hidden':'true'}));

  function show(index){
    const point=points[index],x=left(point);
    rule.hidden=false;rule.style.left=`${x.toFixed(3)}%`;
    tip.replaceChildren(Label(point.label,{className:'line-chart-tip-label'}),Strong(format(point.value)),
      ...[describe(point,index)].filter(Boolean).map(text=>Label(text,{className:'line-chart-tip-note'})));
    tip.hidden=false;
    // Held inside the plot: a tip at the right edge opens leftward.
    tip.style.left=`${x.toFixed(3)}%`;
    tip.dataset.side=x>60?'left':'right';
    dots.forEach((dot,at)=>dot.classList.toggle('is-active',at===index));
  }
  function hide(){rule.hidden=true;tip.hidden=true;dots.forEach(dot=>dot.classList.remove('is-active'));}
  // The whole plot answers the pointer, not only the dots: the nearest reading
  // in time is the one shown, so a reader never has to land on an 8px mark.
  plot.addEventListener('pointermove',event=>{
    const box=plot.getBoundingClientRect();
    if(!box.width)return;
    const at=((event.clientX-box.left)/box.width)*100;
    let nearest=0;
    points.forEach((point,index)=>{if(Math.abs(left(point)-at)<Math.abs(left(points[nearest])-at))nearest=index;});
    show(nearest);
  });
  plot.addEventListener('pointerleave',hide);

  // Where there are more readings than an axis can name without the labels
  // running into each other, the first, the last and an even spread between.
  // A narrow chart names every other one of those again; `data-step` says
  // which, and the first and the last are always named.
  const every=Math.ceil(points.length/6);
  const shown=points.map((point,index)=>!(index%every)||index===points.length-1);
  let count=0;
  const axis=Stack(points.map((point,index)=>Label(point.label,{className:'line-chart-label',
    style:`left:${left(point).toFixed(3)}%`,
    'data-step':index===0||index===points.length-1?'edge':(shown[index]&&count++%2?'even':'odd'),
    ...(shown[index]?{}:{hidden:true})})),{className:'line-chart-axis','aria-hidden':'true'});
  return Stack([plot,axis],{className:'line-chart',role:'group','aria-label':label});
}

// The parts of a whole, as one bar. Parts come in runs — what can be sold this
// week and what cannot — and a run is set apart from the next by a wider gap
// than the one between its own parts, so the two questions read at once: how
// big each part is, and which side of the line it falls on. A run's tone is
// its colour; the parts inside it share it and are told apart by the gap, by
// their order, and by the list beside the bar that names each one.
//
// Pointing at a part, in the bar or in that list, marks it in both: `data-key`
// joins them, and the container says which is active.
export function ProportionBar({runs=[],label='',format=String}={}){
  const total=runs.reduce((sum,run)=>sum+run.parts.reduce((part,entry)=>part+Math.max(0,entry.value),0),0);
  const bar=Stack(runs.filter(run=>run.parts.some(part=>part.value>0)).map(run=>{
    const size=run.parts.reduce((sum,part)=>sum+Math.max(0,part.value),0);
    return Stack(run.parts.filter(part=>part.value>0).map(part=>Stack([],{
      className:'proportion-part','data-key':part.key,
      title:`${part.label} · ${format(part.value)} · ${share(part.value/total)}`,
      style:`flex-grow:${(part.value/size*1000).toFixed(2)}`
    })),{className:`proportion-run proportion-run--${run.tone||'plain'}`,style:`flex-grow:${(size/total*1000).toFixed(2)}`});
  }),{className:'proportion-bar',role:'img','aria-label':label});
  return bar;
}
// A share of a whole in words. Under half a per cent is still there, and
// saying 0% would claim it is not.
export const share=fraction=>!fraction?'0%':fraction<0.005?'<1%':`${Math.round(fraction*100)}%`;

// Pointing at a part anywhere inside `root` marks every element that carries
// the same key, so a bar and the list that names its parts light up together.
export function linkParts(root){
  const mark=key=>{
    if(key)root.dataset.active=key;else delete root.dataset.active;
    for(const node of root.querySelectorAll('[data-key]'))node.classList.toggle('is-active',!!key&&node.dataset.key===key);
  };
  const find=event=>event.target.closest?.('[data-key]')?.dataset.key||'';
  root.addEventListener('pointerover',event=>mark(find(event)));
  root.addEventListener('pointerleave',()=>mark(''));
  root.addEventListener('focusin',event=>mark(find(event)));
  root.addEventListener('focusout',()=>mark(''));
  return root;
}
