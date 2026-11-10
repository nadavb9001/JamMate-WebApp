// Shared insertion drag for legacy FX, mobile FX and Easy Mode. Settings stay
// keyed by effect identity; DOM movement previews a permutation, never a swap.
export function bindEffectReorder(root,{gridSelector,itemSelector,id,onCommit}){
 let drag=null,suppressUntil=0;
 const children=grid=>Array.from(grid.children).filter(el=>el.matches(itemSelector));
 const reset=cancel=>{
  if(!drag)return;
  const d=drag;drag=null;d.ghost?.remove();d.item.classList.remove('jm-order-placeholder');d.item.draggable=true;
  if(cancel)for(const key of d.original){const item=children(d.grid).find(el=>id(el)===key);if(item)d.grid.append(item);}
  d.grid.classList.remove('jm-order-active');suppressUntil=Date.now()+350;
  if(d.pointer!==undefined&&d.handle.hasPointerCapture?.(d.pointer))d.handle.releasePointerCapture(d.pointer);
 };
 const start=(item,grid)=>{
  if(drag)return false;
  const bounds=grid.getBoundingClientRect();
  drag={item,grid,original:children(grid).map(id),slots:children(grid).map((el,index)=>{
   const r=el.getBoundingClientRect();return {index,left:r.left-bounds.left,top:r.top-bounds.top,width:r.width,height:r.height};
  })};
  item.classList.add('jm-order-placeholder');grid.classList.add('jm-order-active');return true;
 };
 const preview=(x,y)=>{
  if(!drag)return;
  const {grid,item,original,slots}=drag,bounds=grid.getBoundingClientRect();
  const localX=x-bounds.left,localY=y-bounds.top,others=children(grid).filter(el=>el!==item);
  const rows=[];
  for(const r of slots){let row=rows.find(row=>Math.abs(row.top-r.top)<Math.min(row.height,r.height)*.45);
   if(!row){row={top:r.top,height:r.height,items:[]};rows.push(row);}row.items.push(r);}
  rows.sort((a,b)=>a.top-b.top);
  let slot=original.length;
  if(localY<rows[0].top)slot=0;
  else if(localY<=rows.at(-1).top+rows.at(-1).height){
   const row=rows.reduce((a,b)=>Math.abs(localY-(a.top+a.height/2))<=Math.abs(localY-(b.top+b.height/2))?a:b);
   row.items.sort((a,b)=>a.left-b.left);
   slot=row.items.find(r=>localX<r.left+r.width/2)?.index??row.items.at(-1).index+1;
  }
  // Slot geometry remains fixed during the gesture. Re-measuring nudged cards
  // causes a backwards drag to oscillate between before/after its neighbour.
  const source=original.indexOf(id(item)),next=original.filter(key=>key!==id(item));
  const target=slot-(source<slot?1:0);next.splice(target,0,id(item));
  const after=next[next.indexOf(id(item))+1],before=children(grid).find(el=>id(el)===after)??null;
  if(item.nextElementSibling===before)return;
  for(const el of others)el.getAnimations?.().forEach(animation=>animation.cancel());
  const positions=new Map(others.map(el=>[el,el.getBoundingClientRect()]));grid.insertBefore(item,before);
  for(const el of others){const old=positions.get(el),now=el.getBoundingClientRect();
   if((old.left!==now.left||old.top!==now.top)&&!matchMedia('(prefers-reduced-motion: reduce)').matches)
    el.animate?.([{transform:`translate(${old.left-now.left}px,${old.top-now.top}px)`},{transform:'none'}],{duration:130,easing:'ease-out'});
  }
 };
 const finish=(x,y)=>{
  if(!drag)return;
  const r=drag.grid.getBoundingClientRect();
  if(x<r.left||x>r.right||y<r.top||y>r.bottom){reset(true);return;}
  const next=children(drag.grid).map(id),old=drag.original;reset(false);
  if(next.some((v,i)=>v!==old[i]))Promise.resolve(onCommit(next)).catch(()=>{});
 };
 root.addEventListener('click',e=>{
  if(Date.now()<suppressUntil||e.target.closest('[data-order-handle]')){e.preventDefault();e.stopImmediatePropagation();}
 },true);
 root.addEventListener('dragstart',e=>{
  if(drag){e.preventDefault();return;}
  const item=e.target.closest(itemSelector),grid=item?.closest(gridSelector);
  if(!item||!grid||!root.contains(grid)||!start(item,grid))return;
  e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id(item)));
 });
 root.addEventListener('dragover',e=>{if(!drag||drag.pointer!==undefined)return;e.preventDefault();e.dataTransfer.dropEffect='move';preview(e.clientX,e.clientY);});
 root.addEventListener('drop',e=>{if(!drag||drag.pointer!==undefined)return;e.preventDefault();e.stopPropagation();preview(e.clientX,e.clientY);finish(e.clientX,e.clientY);});
 root.addEventListener('dragend',()=>reset(true));
 root.addEventListener('pointerdown',e=>{
  const handle=e.target.closest('[data-order-handle]');if(!handle||e.button!==0)return;
  const item=handle.closest(itemSelector),grid=item?.closest(gridSelector);
  if(!item||!grid||!start(item,grid))return;
  e.preventDefault();item.draggable=false;drag.pointer=e.pointerId;
  // Capture on the stationary root: moving a card in the DOM must not cancel
  // pointer capture and restore its old position halfway through the drag.
  drag.handle=root;root.setPointerCapture(e.pointerId);
  const r=item.getBoundingClientRect(),ghost=item.cloneNode(true);ghost.classList.remove('jm-order-placeholder');
  ghost.classList.add('jm-order-ghost');Object.assign(ghost.style,{position:'fixed',width:r.width+'px',height:r.height+'px',left:r.left+'px',top:r.top+'px'});
  ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));document.body.append(ghost);
  drag.ghost=ghost;drag.dx=e.clientX-r.left;drag.dy=e.clientY-r.top;
 });
 root.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;e.preventDefault();
  drag.ghost.style.left=(e.clientX-drag.dx)+'px';drag.ghost.style.top=(e.clientY-drag.dy)+'px';preview(e.clientX,e.clientY);
  const scroll=drag.grid.closest('.jm-scroll,.jm-sheet-body')??document.scrollingElement;
  const r=scroll===document.scrollingElement?{top:0,bottom:innerHeight}:scroll.getBoundingClientRect();
  if(e.clientY<r.top+45)scroll.scrollTop-=18;else if(e.clientY>r.bottom-45)scroll.scrollTop+=18;
 });
 root.addEventListener('pointerup',e=>{if(drag&&e.pointerId===drag.pointer){e.preventDefault();finish(e.clientX,e.clientY);}});
 root.addEventListener('pointercancel',()=>reset(true));
 root.addEventListener('lostpointercapture',()=>reset(true));
 window.addEventListener('blur',()=>reset(true));
 window.addEventListener('keydown',e=>{if(e.key==='Escape')reset(true);});
}
