import {diagnostics} from './diagnostics.js?v=11.6';
export function integrationMethods({esc,btn,avatar}){return {
 async fishboardAction(a){
  if(['mianmian','styles','settings'].includes(a)){this.hostReturn=true;await window.AmeFishboard.open(a);if(document.getElementById('awm-panel-v03')?.style.display!=='none')this.close();return;}
  if(a==='search')return window.AmeFishboard.searchPresets();
  if(a==='presets')return window.AmeFishboard.viewPresets();
  if(a==='reading')return this.readingOpen();
  if(a==='miniapps'){this.tab='miniapps';this.detail=false;this.render();return;}
  if(a==='miniapp'){
   await this.readerSaveChain;this.webKey=null;this.txtKey=null;this.webReturn='reading';
   const id=arguments[1];this.state.miniappRecent=[id,...(this.state.miniappRecent||[]).filter(x=>x!==id)].slice(0,8);await this.save();
   if(['styles','mianmian','presets','search'].includes(id))return this.fishboardAction(id);
   if(id==='excerpts'){this.readingKind='excerpt';return this.readingOpen();}
   if(id==='book'){this.readingKind='book';return this.readingOpen();}
   this.readingKind='book';await this.readingOpen();return this.webAction('platform',id);
  }
  if(a==='report')return window.AmeFishboard.exportDiagnostics();
  if(a==='preferences'){this.modal('设置',`<div class="shr-settings-links">${btn('fb:settings','存储空间与清理 ›')}${btn('settings','聊天预设与 API ›')}${btn('soc:settings','群聊规则 ›')}${btn('story:settings','跟随正文发消息 ›')}${btn('feedSettings','朋友圈与公众号 ›')}${btn('proactiveSettings','主动聊天 ›')}${btn('export','聊天备份 ›')}${btn('import','导入聊天备份 ›')}${btn('fb:report','错误报告 ›')}</div>`);return;}
 },
 renderMe(){return `<main class="shr-wide">${this.header('我')}<div class="shr-scroll shr-me"><div class="shr-profile">${avatar(this.self())}<div><h2>${esc(this.self().name)}</h2><small>微信</small></div></div><div class="shr-settings-links">${btn('wallet:open','服务　›')}${btn('fb:settings','存储空间与清理　›')}${btn('settings','聊天预设与 API　›')}${btn('soc:settings','群聊规则　›')}${btn('story:settings','跟随正文发消息　›')}${btn('feedSettings','朋友圈与公众号设置　›')}${btn('proactiveSettings','主动聊天　›')}${btn('export','聊天备份　›')}${btn('import','导入聊天备份　›')}${btn('fb:report','错误报告　›')}</div></div></main>`;},
 renderDiscover(){return this.renderFeed();},
 renderMiniapps(){return this.renderReading();},
 message(id){return this.messageMenu(id);},
 messageMenu(id){const m=this.conversation()?.messages.find(x=>x.id===id);if(!m||m.revoked)return;this.root.querySelector('.shr-message-menu')?.remove();const anchor=[...this.root.querySelectorAll('[data-message-id]')].find(e=>e.dataset.messageId===id)?.querySelector('.shr-bubble,.shr-file-card,.shr-transfer')||[...this.root.querySelectorAll('[data-message-id]')].find(e=>e.dataset.messageId===id);if(!anchor)return;
  const menu=document.createElement('div');menu.className='shr-message-menu';menu.setAttribute('role','toolbar');menu.setAttribute('aria-label','消息操作');menu.innerHTML=btn('soc:quote','引用',id)+btn('soc:copy','复制',id)+(m.side==='user'?btn('editChatMessage','编辑',id)+btn('retryMessage','重新生成回复',id)+btn('soc:revoke','撤回',id):'')+btn('soc:delete','删除',id);this.root.append(menu);
  const r=anchor.getBoundingClientRect(),bounds=this.root.getBoundingClientRect(),w=menu.getBoundingClientRect().width;menu.style.left=Math.max(8,Math.min(r.left-bounds.left,bounds.width-w-8))+'px';menu.style.top=Math.max(58,r.top-bounds.top-menu.offsetHeight-10)+'px';
  const dismiss=e=>{if(!menu.contains(e.target)&&!anchor.contains(e.target)){menu.remove();document.removeEventListener('pointerdown',dismiss,true);}};document.addEventListener('pointerdown',dismiss,true);menu.addEventListener('click',()=>{menu.remove();document.removeEventListener('pointerdown',dismiss,true);});diagnostics.log('message.menu',{stage:m.side});
 },
};}
