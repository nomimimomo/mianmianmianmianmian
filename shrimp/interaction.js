import {appendSystem} from './social.js?v=10.8';
import {uid} from './core.js?v=10.8';
import {diagnostics} from './diagnostics.js?v=10.8';
export const defaultGroupName=(self,members)=>[self,...members].join('、')+`（${members.length+1}）`;
export function interactionMethods({esc,btn,avatar}) { return {
 updateBusyButtons(){
  for(const b of this.root.querySelectorAll('[data-action]')){
   const a=b.dataset.action,busy=(a==='send'||a==='retryMessage'||a==='resendInline')?this.sending:a==='refresh'?this.refreshing:a==='loadModels'?this.loadingModels:false;
   if(busy){if(!b.dataset.idleHtml)b.dataset.idleHtml=b.innerHTML;b.innerHTML='<span class="shr-spinner" aria-label="处理中"></span>';b.disabled=true;b.setAttribute('aria-busy','true');}
   else if(b.dataset.idleHtml){b.innerHTML=b.dataset.idleHtml;delete b.dataset.idleHtml;b.disabled=false;b.removeAttribute('aria-busy');}
  }
 },
 async dispatch(a,id){if(a==='queue')return this.action(a,id);this.pendingActions ||= new Set();const key=JSON.stringify([a,id||'']);if(this.pendingActions.has(key))return;this.pendingActions.add(key);this.updateBusyButtons();try{return await this.action(a,id);}finally{this.pendingActions.delete(key);this.updateBusyButtons();}},
 editChatMessage(id){
  if(this.sending||this.gen.busy)throw Error('请等待当前回复结束后编辑');
  const m=this.conversation()?.messages.find(m=>m.id===id);if(!m)return;if(m.side!=='user'||m.kind==='transfer')throw Error('这条消息不能编辑');
  this.closeModal();this.editingMessage=id;this.editText=m.text;this.render();const input=this.root.querySelector('.shr-inline-edit textarea');input?.focus();
 },
 async inlineCommit(resend){
  if(this.sending||this.gen.busy)throw Error('请等待当前回复结束');
  const c=this.conversation(),m=c?.messages.find(m=>m.id===this.editingMessage);if(!m)return;if(m.side!=='user'||m.kind==='transfer')throw Error('这条消息不能编辑');
  const text=this.editText.trim();if(!text)throw Error('消息不能为空');
  m.text=text;if(m.kind==='option')m.insertText=text;
  this.editingMessage=null;this.editText='';await this.save();this.render();
  if(resend){if(m.side==='user')return this.retryMessage(m.id);const turn=c.turns.find(t=>t.id===m.turnId);if(!turn)throw Error('这条旧消息没有对应的发送记录，修改已保存');const first=turn.batchIds[0];if(first)return this.retryMessage(first);}
 },
 async retryMessage(id){
  if(this.sending||this.gen.busy)throw Error('请等待当前回复结束');
  const c=this.conversation(),m=c?.messages.find(m=>m.id===id&&m.side==='user');if(!m)return;
  this.retryTarget=id;try{return await this.send();}finally{this.retryTarget=null;}
 },
 group(c){
  this.groupDraft={conversationId:c?.id||'',members:[...(c?.members||[])],title:c?.customTitle===false?'':c?.title||'',selecting:!c,removing:false};
  this.groupPanel=true;this.render();
 },
 renderGroupPanel(){
  const d=this.groupDraft,people=d.selecting?this.sortedContacts():d.members.map(id=>this.contact(id)).filter(Boolean);
  return `<main class="shr-chat shr-group-page">${this.header(d.conversationId?'聊天信息':'创建群聊',btn('closeGroup','返回'))}<div class="shr-scroll"><div class="shr-members">${!d.selecting?`<div>${avatar(this.self())}<small>${esc(this.self().name)}</small></div>`:''}${people.map(p=>`<button data-action="toggleMember" data-id="${esc(p.id)}" class="${d.selecting&&d.members.includes(p.id)?'selected':''}"><span class="shr-avatar">${p.avatar?`<img src="${esc(p.avatar)}" alt="">`:'<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14" r="7" fill="currentColor"/><path d="M7 36v-4a13 13 0 0 1 26 0v4" fill="currentColor"/></svg>'}</span><small>${esc(p.name)}</small>${d.removing?'<b>−</b>':d.selecting&&d.members.includes(p.id)?'<b>✓</b>':''}</button>`).join('')}${!d.selecting?btn('addGroupMembers','＋')+btn('removeGroupMembers','−'):''}</div>${d.selecting?btn('finishMembers','完成选择','','shr-primary'):''}<label class="shr-field">群聊名称<input id="shr-group-title" value="${esc(d.title)}" placeholder="${esc(defaultGroupName(this.self().name,d.members.map(id=>this.contact(id)?.name||'成员')))}"></label>${btn('commitGroup','保存','','shr-primary')}${d.conversationId?btn('soc:details','群资料')+btn('soc:search','查找聊天记录')+btn('soc:leave','退出群聊'):''}</div></main>`;
 },
 async commitGroup(){
  if(this.sending||this.gen.busy)throw Error('请等待当前回复结束后修改成员');
  const d=this.groupDraft;if(!d.members.length)throw Error('至少选择一位联系人');
  let c=this.state.conversations.find(x=>x.id===d.conversationId);
  if(!c){c={id:uid(),messages:[],turns:[],draft:'',kind:'group'};this.state.conversations.push(c);}
  if(c.kind==='private'&&(d.members.length!==1||d.members[0]!==c.members[0]))c.kind='group';
  const oldMembers=c.members||[]; for(const id of d.members.filter(x=>!oldMembers.includes(x)))appendSystem(c,`${this.contact(id)?.name||'成员'}加入了群聊`,{type:'join',target:id});for(const id of oldMembers.filter(x=>!d.members.includes(x)))appendSystem(c,`${this.contact(id)?.name||'成员'}被移出了群聊`,{type:'remove',target:id});if(c.title&&d.title.trim()&&c.title!==d.title.trim())appendSystem(c,`群名改为「${d.title.trim()}」`,{type:'rename'});
  c.members=[...d.members];c.customTitle=!!d.title.trim();c.title=d.title.trim()||defaultGroupName(this.self().name,d.members.map(id=>this.contact(id)?.name||'成员'));c.updatedAt=Date.now();
  diagnostics.log('group.updated',{count:c.members.length+1});await this.save();this.state.activeConversation=c.id;this.groupPanel=false;this.tab='chats';this.detail=true;this.activePublisher='';this.render();
 },
};}
