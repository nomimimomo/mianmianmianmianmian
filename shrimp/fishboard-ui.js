import {diagnostics} from './diagnostics.js?v=11.1';
export function integrationMethods({esc,btn,avatar}){return {
 async fishboardAction(a){
  if(['mianmian','styles','settings'].includes(a)){window.AmeFishboard.open(a);if(document.getElementById('awm-panel-v03')?.style.display!=='none')this.close();return;}
  if(a==='search')return window.AmeFishboard.searchPresets();
  if(a==='presets')return window.AmeFishboard.viewPresets();
  if(a==='reading')return this.readingOpen();
  if(a==='report')return window.AmeFishboard.exportDiagnostics();
  if(a==='preferences'){this.modal('设置',`<div class="shr-settings-links">${btn('fb:settings','存储空间与清理 ›')}${btn('settings','聊天预设与 API ›')}${btn('soc:settings','群聊规则 ›')}${btn('story:settings','跟随正文发消息 ›')}${btn('feedSettings','朋友圈与公众号 ›')}${btn('proactiveSettings','主动聊天 ›')}${btn('export','聊天备份 ›')}${btn('import','导入聊天备份 ›')}${btn('fb:report','错误报告 ›')}</div>`);return;}
 },
 renderMe(){return `<main class="shr-wide">${this.header('我')}<div class="shr-scroll shr-me"><div class="shr-profile">${avatar(this.self())}<div><h2>${esc(this.self().name)}</h2><small>鲜虾鱼板面</small></div></div><div class="shr-settings-links">${btn('wallet:open','◈　服务　›')}${btn('fb:styles','◇　收藏　›')}${btn('fb:mianmian','▤　备忘录　›')}${btn('fb:search','⌕　搜索预设　›')}${btn('fb:preferences','⚙　设置　›')}</div></div></main>`;},
 renderDiscover(){return `<main class="shr-wide">${this.header('发现')}<div class="shr-scroll shr-discover"><div class="shr-settings-links">${btn('tab','◎　朋友圈　›','moments')}${btn('fb:reading','▤　读书　›')}${btn('publishers','▥　公众号　›')}</div></div></main>`;},
 message(id){return this.messageMenu(id);},
 messageMenu(id){const m=this.conversation()?.messages.find(x=>x.id===id);if(!m||m.revoked)return;this.root.querySelector('.shr-message-menu')?.remove();const anchor=[...this.root.querySelectorAll('[data-message-id]')].find(e=>e.dataset.messageId===id)?.querySelector('.shr-bubble,.shr-file-card,.shr-transfer')||[...this.root.querySelectorAll('[data-message-id]')].find(e=>e.dataset.messageId===id);if(!anchor)return;
  const menu=document.createElement('div');menu.className='shr-message-menu';menu.setAttribute('role','toolbar');menu.setAttribute('aria-label','消息操作');menu.innerHTML=btn('soc:quote','引用',id)+btn('soc:copy','复制',id)+(m.side==='user'?btn('editChatMessage','编辑',id)+btn('soc:revoke','撤回',id):'')+btn('soc:delete','删除',id);this.root.append(menu);
  const r=anchor.getBoundingClientRect(),bounds=this.root.getBoundingClientRect(),w=menu.getBoundingClientRect().width;menu.style.left=Math.max(8,Math.min(r.left-bounds.left,bounds.width-w-8))+'px';menu.style.top=Math.max(58,r.top-bounds.top-menu.offsetHeight-10)+'px';
  const dismiss=e=>{if(!menu.contains(e.target)&&!anchor.contains(e.target)){menu.remove();document.removeEventListener('pointerdown',dismiss,true);}};document.addEventListener('pointerdown',dismiss,true);menu.addEventListener('click',()=>{menu.remove();document.removeEventListener('pointerdown',dismiss,true);});diagnostics.log('message.menu',{stage:m.side});
 },
};}
