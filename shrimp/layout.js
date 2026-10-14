import {diagnostics} from './diagnostics.js?v=11.6';
// Adapted from the supplied fishboard viewport/band/rect correction rules.
export function panelBounds(vp,topBar,sendForm,mobile){
 let top=vp.y+8,bottom=vp.y+vp.h-8;
 if(topBar)top=Math.max(top,topBar.bottom+8);
 if(sendForm&&sendForm.top>top)bottom=Math.min(bottom,sendForm.top-8);
 if(bottom-top<Math.min(220,vp.h*.45)){top=vp.y+8;bottom=vp.y+vp.h-8;}
 bottom=Math.max(top+1,bottom);
 const inset=vp.w*.02,width=Math.max(1,Math.min(mobile?620:1120,vp.w-2*inset));
 const height=mobile?Math.min(vp.h-16,bottom-top):bottom-top;
 return {left:vp.x+(vp.w-width)/2,top:mobile?top+(bottom-top-height)/2:top,width,height:Math.max(1,height),inset};
}
export function fitPanel(panel){
 if(!panel||panel.hidden)return;
 const vv=window.visualViewport,vp={x:vv?.offsetLeft||0,y:vv?.offsetTop||0,w:vv?.width||innerWidth,h:vv?.height||innerHeight};
 const visible=selector=>{const e=document.querySelector(selector);if(!e||getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();return r.height>=8&&r.bottom>vp.y&&r.top<vp.y+vp.h?r:null;};
 const band=panelBounds(vp,visible('#top-bar')||visible('#top_bar'),visible('#send_form')||visible('#chat-input-container'),innerWidth<=600);
 const signature=[Math.round(band.width),Math.round(band.height),Math.round(band.top)].join(':');if(panel.dataset.layoutSignature!==signature){panel.dataset.layoutSignature=signature;diagnostics.log('layout.fit',{count:Math.round(band.width),characters:Math.round(band.height)});}
 Object.assign(panel.style,{transform:'none',right:'auto',bottom:'auto'});
 // Theme zoom and transformed body ancestors can change rendered dimensions.
 for(let i=0;i<3;i++){
  const r=panel.getBoundingClientRect(),css=getComputedStyle(panel),sx=r.width/(parseFloat(css.width)||r.width)||1,sy=r.height/(parseFloat(css.height)||r.height)||1;
  panel.style.width=band.width/sx+'px';panel.style.height=band.height/sy+'px';
 }
 for(let i=0;i<3;i++){
  const r=panel.getBoundingClientRect(),css=getComputedStyle(panel),sx=r.width/(parseFloat(css.width)||r.width)||1,sy=r.height/(parseFloat(css.height)||r.height)||1;
  panel.style.left=((parseFloat(panel.style.left)||0)+(band.left-r.left)/sx)+'px';panel.style.top=((parseFloat(panel.style.top)||0)+(band.top-r.top)/sy)+'px';
 }
}
export function bindPanelLayout(panel){
 let scheduled=false;const fit=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;fitPanel(panel);});};
 window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);
 if(window.ResizeObserver){const observer=new ResizeObserver(fit);for(const selector of ['#top-bar','#top_bar','#send_form','#chat-input-container']){const e=document.querySelector(selector);if(e)observer.observe(e);}}
 return fit;
}
