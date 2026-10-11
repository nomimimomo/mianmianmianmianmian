// Scroll normally until the lower boundary; then show resistance and release feedback.
export function installPullRefresh(root,{key,busy,refresh,error,log}){
 let g=null;
 const reset=()=>{if(g){g.el.style.removeProperty('--shr-pull');const h=g.el.querySelector('.shr-pull-hint');if(h){h.textContent='上拉刷新 · 也可点此刷新';h.classList.remove('ready');}}g=null;};
 root.addEventListener('touchstart',e=>{reset();const el=e.target.closest('[data-pull-refresh]');if(!el||e.touches.length!==1||busy())return;const t=e.touches[0];g={el,x:t.clientX,y:t.clientY,anchor:el.scrollHeight-el.scrollTop-el.clientHeight<=8?t.clientY:null,distance:0,type:el.dataset.pullRefresh,key:key()};},{passive:true});
 root.addEventListener('touchmove',e=>{if(!g)return;if(e.touches.length!==1||!g.el.isConnected||g.key!==key()){reset();return;}const t=e.touches[0];if(Math.abs(t.clientX-g.x)>50){reset();return;}const bottom=g.el.scrollHeight-g.el.scrollTop-g.el.clientHeight<=8;if(!bottom){g.anchor=null;g.distance=0;return;}if(g.anchor===null)g.anchor=t.clientY;g.distance=Math.max(0,g.anchor-t.clientY);if(g.distance>0){if(e.cancelable)e.preventDefault();g.el.style.setProperty('--shr-pull',Math.min(72,g.distance*.5)+'px');const h=g.el.querySelector('.shr-pull-hint');if(h){h.textContent=g.distance>=55?'松开刷新':'继续上拉刷新';h.classList.toggle('ready',g.distance>=55);}}},{passive:false});
 root.addEventListener('touchend',()=>{const current=g;reset();if(!current||current.distance<55||!current.el.isConnected||current.key!==key()||busy())return;log('feed.pull',{operation:current.type});Promise.resolve(refresh(current.type)).catch(error);},{passive:true});
 root.addEventListener('touchcancel',reset,{passive:true});
 // Desktop mouse drag was previously ignored entirely.
 let mouse=null;
 root.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='mouse'||e.button!==0||busy())return;
  const el=e.target.closest('[data-pull-refresh]');if(!el||e.target.closest('button:not(.shr-pull-hint),a,input,textarea'))return;
  mouse={el,x:e.clientX,y:e.clientY,last:e.clientY,distance:0,key:key(),type:el.dataset.pullRefresh};
  el.setPointerCapture?.(e.pointerId);e.preventDefault();
 });
 root.addEventListener('pointermove',e=>{
  const m=mouse;if(!m)return;if(!m.el.isConnected||m.key!==key()||Math.abs(e.clientX-m.x)>50){endMouse(true);return;}
  const dy=m.last-e.clientY;m.last=e.clientY;
  const remaining=Math.max(0,m.el.scrollHeight-m.el.scrollTop-m.el.clientHeight);
  if(dy>0){m.el.scrollTop+=Math.min(remaining,dy);m.distance+=Math.max(0,dy-remaining);}else m.distance=Math.max(0,m.distance+dy);
  m.el.style.setProperty('--shr-pull',Math.min(72,m.distance*.5)+'px');
  const h=m.el.querySelector('.shr-pull-hint');if(h)h.textContent=m.distance>=55?'松开刷新':'继续上拉刷新';e.preventDefault();
 });
 let suppressClick=false;
 const endMouse=cancel=>{const m=mouse;mouse=null;if(!m)return;m.el.style.removeProperty('--shr-pull');const h=m.el.querySelector('.shr-pull-hint');if(h)h.textContent='上拉刷新 · 也可点此刷新';
  if(cancel||m.distance<55||!m.el.isConnected||m.key!==key()||busy())return;
  suppressClick=true;setTimeout(()=>suppressClick=false,0);log('feed.pull',{operation:m.type,mode:'mouse'});Promise.resolve(refresh(m.type)).catch(error);
 };
 root.addEventListener('pointerup',()=>endMouse(false));root.addEventListener('pointercancel',()=>endMouse(true));
 root.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);

}
