import {presets,snapshot} from './bridge.js?v=10.8';
import {diagnostics} from './diagnostics.js?v=10.8';
export function compareEntries(left,right){const used=new Set();const rows=left.map(a=>{let i=right.findIndex((b,i)=>!used.has(i)&&a.identifier&&a.identifier===b.identifier);if(i<0)i=right.findIndex((b,i)=>!used.has(i)&&b.name===a.name&&b.content===a.content);if(i<0)i=right.findIndex((b,i)=>!used.has(i)&&b.name===a.name);const b=i<0?null:right[i];if(i>=0)used.add(i);return {a,b,status:!b?'删除':a.content===b.content&&a.role===b.role?'相同':'修改'};});right.forEach((b,i)=>{if(!used.has(i))rows.push({a:null,b,status:'新增'});});return rows;}
export function loadNoodle(){if(!window.AmeFishboard)throw Error('鱼板面主插件尚未就绪');return Promise.resolve(window.AmeFishboard);}
export function suiteMethods({esc,btn}){return {
 updateUnreadBadge(){const n=this.state?.conversations?.reduce((sum,c)=>sum+(c.unread||0),0)||0;const launcher=document.getElementById('awm-launcher-v54')||this.launcher;if(launcher){launcher.dataset.unread=n?(n>99?'99+':String(n)):'';launcher.title=n?'鲜虾鱼板面 · '+n+' 条未读消息':'鲜虾鱼板面';}},
 quoteSender(id){const m=this.conversation()?.messages.find(x=>x.id===id);return m?.side==='user'?this.self().name:this.contact(m?.contactId)?.name||'成员';},
 showMessageMenu(id){const m=this.conversation()?.messages.find(x=>x.id===id);if(!m)return;this.closeModal();this.root.querySelector('.shr-message-menu')?.remove();const menu=document.createElement('div');menu.className='shr-message-menu';menu.setAttribute('role','toolbar');menu.innerHTML=btn('soc:quote','引用',id)+btn('soc:copy','复制',id)+(m.side==='user'&&m.kind!=='transfer'?btn('editChatMessage','编辑',id)+btn('soc:revoke','撤回',id):'')+btn('soc:delete','删除',id);this.root.append(menu);const anchor=[...this.root.querySelectorAll('[data-message-id]')].find(x=>x.dataset.messageId===id),r=anchor?.getBoundingClientRect(),bounds=this.root.getBoundingClientRect();if(r){menu.style.left=Math.max(8,Math.min(r.left-bounds.left,bounds.width-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(r.top-bounds.top-menu.offsetHeight-8,bounds.height-menu.offsetHeight-8))+'px';}diagnostics.log('chat.menu',{operation:m.side});},
 bindSuite(){
  document.addEventListener('pointerdown',e=>{if(!this.root.contains(e.target))this.root.querySelector('.shr-message-menu')?.remove();});window.addEventListener('shrimp:return',()=>this.open());window.addEventListener('shrimp:editor-log',e=>diagnostics.log('editor.'+e.detail.stage,{operation:e.detail.side,stage:e.detail.status}));
  this.root.addEventListener('click',e=>{if(!e.target.closest('.shr-message-menu,[data-message-id]'))this.root.querySelector('.shr-message-menu')?.remove();},true);
  this.root.addEventListener('input',e=>{if(e.target.id==='shr-draft'&&e.inputType==='insertText'&&e.data==='@'){this.mentionCaret=e.target.selectionStart;this.socialAction('at').catch(x=>this.error(x));}if(e.target.id==='shr-preset-query'){const q=e.target.value.toLowerCase();this.root.querySelectorAll('.shr-compare-row').forEach(el=>el.hidden=!el.textContent.toLowerCase().includes(q));}});
  this.root.addEventListener('change',e=>{if(e.target.id==='shr-preset-entry'){this.root.querySelectorAll('.shr-compare-row').forEach((el,i)=>el.hidden=e.target.value!==''&&String(i)!==e.target.value);return;}if(e.target.matches('[name="presetLeft"],[name="presetRight"]'))this.suiteAction('compare').catch(x=>this.error(x));});
  let taps={};this.root.addEventListener('pointerup',e=>{const avatar=e.target.closest('[data-pat]');if(!avatar)return;const id=avatar.dataset.pat,now=Date.now();if(e.pointerType!=='mouse'&&taps.id===id&&now-taps.time<330){this.socialAction('pat',id).catch(x=>this.error(x));taps={};}else taps={id,time:now};});
  this.root.addEventListener('contextmenu',e=>{const a=e.target.closest('[data-pat]');if(a&&a.dataset.pat!=='user'){e.preventDefault();this.socialAction('mention',a.dataset.pat).catch(x=>this.error(x));}});
  let timer;this.root.addEventListener('pointerdown',e=>{const a=e.target.closest('[data-pat]');if(a&&a.dataset.pat!=='user')timer=setTimeout(()=>{this.socialLongPress=true;this.socialAction('mention',a.dataset.pat).catch(x=>this.error(x));},500);});for(const n of ['pointerup','pointercancel','pointermove'])this.root.addEventListener(n,()=>clearTimeout(timer));
  loadNoodle().then(()=>diagnostics.log('suite.ready')).catch(e=>{diagnostics.log('suite.failure',{reason:e.name});this.status(e.message,true);});
 },
 async suiteAction(a,id){
  if(a==='presets')return window.AmeFishboard.viewPresets();
  if(a==='presetSearch')return window.AmeFishboard.searchPresets();
  if(a==='editor'||a==='styles'){const api=await loadNoodle();api.open(a==='styles'?'styles':'mianmian');this.close();diagnostics.log('suite.open',{operation:a});return;}

 }
};}
