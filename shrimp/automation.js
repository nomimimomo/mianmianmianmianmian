import {ctx,storyKey,storyContext} from './bridge.js?v=11.1';
import {buildChatSetup,resolveMembers} from './chat-context.js?v=11.1';
import {chatProtocol,parseChatResponse} from './features.js?v=11.1';
import {digest,uid} from './core.js?v=11.1';
import {trimConversation} from './retention.js?v=11.1';
import {diagnostics} from './diagnostics.js?v=11.1';
// Stability is an observable delay, not an assertion that the user approved the prose.
export function storyBoundary(chat){return {end:chat.length-1,count:chat.filter(m=>!m.is_user&&!m.is_system&&String(m.mes||'').trim()).length};}
export function observeStory(previous,fingerprint,now,delay){const since=previous?.fingerprint===fingerprint?previous.since:now;return {fingerprint,since,ready:now-since>=delay};}
export function automationMethods({field,btn}){return {
 async automaticBoundary(){const chat=ctx().chat||[],key=storyKey(),fingerprint=await digest(chat.map(m=>({user:!!m.is_user,system:!!m.is_system,text:m.mes||''})));this.observedStories ||= {};const delay=(Number(this.state.settings.autoDelay)||60)*1000;
  const observation=observeStory(this.observedStories[key],fingerprint,Date.now(),delay);this.observedStories[key]=observation;
  if(!observation.ready)this.scheduleScan(Math.max(1000,delay-(Date.now()-observation.since)));
  return {...storyBoundary(chat),ready:observation.ready};
 },
 proactiveSettings(){const s=this.state.settings.proactive||{};this.modal('主动聊天',`<p class="shr-note">正文停止变化达到设置的延迟后才触发；每个会话单独设置，0 为关闭。群聊由预设人格主动发起。上一条主动消息未回应时不连续催你。</p>${this.state.conversations.map((c,i)=>field('p'+i,c.title,s[c.id]?.enabled?s[c.id].every:0,'number','min="0" max="100"')).join('')}`,btn('saveProactive','保存','','shr-primary'));},
 async saveProactive(){const v=this.values(),s=this.state.settings.proactive ||= {},boundary=storyBoundary(ctx().chat||[]);for(const [i,c] of this.state.conversations.entries()){const n=Number(v['p'+i]);if(!Number.isInteger(n)||n<0||n>100)throw Error('主动聊天楼层应为 0–100 的整数');s[c.id]={enabled:n>0,every:n};c.proactiveFloors ||= {};c.proactiveFloors[storyKey()]=boundary.count;}await this.save();this.closeModal();this.render();},
 async maybeProactive(boundary){if(!boundary.ready||boundary.end<0||Date.now()-(this.lastAutoFinished||0)<60000||this.gen.busy||this.sending||this.refreshing)return;
  const key=storyKey(),config=this.state.settings.proactive||{};
  for(const c of this.state.conversations){const s=config[c.id];if(!s?.enabled||this.state.settings.storySocial?.enabled&&this.state.settings.storySocial.targets?.includes(c.id))continue;c.proactiveFloors ||= {};const previous=c.proactiveFloors[key];if(previous===undefined||boundary.count<previous){c.proactiveFloors[key]=boundary.count;await this.save();continue;}
   if(boundary.count-previous<s.every||c.draft?.trim()||c.messages.some(m=>m.side==='user'&&['pending','failed'].includes(m.status))||c.messages.at(-1)?.proactive)continue;
   const candidates=c.members.map(id=>this.contact(id)).filter(m=>m&&(c.kind!=='group'||m.kind!=='character')),members=resolveMembers(candidates);if(!members.length)continue;
   this.refreshing=true;const captured=await digest(c.messages);c.proactiveFloors[key]=boundary.count;
   try{await this.save();const context=await storyContext(this.state.settings,boundary.end),fallback=members.some(m=>!m.sourceId)?await this.activeSource():null,compiled=buildChatSetup(this.state,members,fallback,ctx().name1||'User',ctx().name2||'Char');
    const raw=await this.gen.call([...compiled.messages,{role:'system',content:chatProtocol('chat',{socialRules:this.state.settings.socialRules},members,ctx().name1||'User')+' 这次是你主动找用户聊几句，结合当前剧情和聊天关系，不假装用户刚发了消息。只输出text消息，不改群名，不发送功能卡片。'},{role:'user',content:JSON.stringify({storyContext:context.data,localChoiceInstruction:compiled.vars.choice||'',history:c.messages.slice(-this.state.settings.historyLimit)})}]);
    if(storyKey()!==key||await digest(c.messages)!==captured||c.draft?.trim())return;
    const now=await storyContext(this.state.settings,boundary.end);if(now.signature!==context.signature)return;
    const rows=parseChatResponse(raw,members.map(m=>m.id),'chat',key,null).filter(m=>m.kind==='text');const turnId=uid();c.messages.push(...rows.map(m=>({...m,turnId,proactive:true})));c.updatedAt=Date.now();if(!(this.visible&&this.tab==='chats'&&this.conversation()?.id===c.id))c.unread=(c.unread||0)+rows.length;trimConversation(c,this.state.settings.chatLimit);await this.save();diagnostics.log('chat.proactive',{count:rows.length,floor:boundary.count});if(this.visible&&!this.root.querySelector('.shr-modal'))this.render();
   }catch(e){diagnostics.log('chat.proactive.failed',{reason:e.name});this.status('主动消息生成失败，可在聊天中手动重试',true);}
   finally{this.refreshing=false;this.lastAutoFinished=Date.now();this.updateBusyButtons();}return;
  }
 }
};}
