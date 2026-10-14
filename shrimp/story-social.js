import {identityContext} from './ecosystem.js?v=11.6';
import {characterPayload} from './chat-context.js?v=11.6';
import {sanitizeOutgoingHistory} from '../context-isolation.js?v=11.6';
import {ctx,storyKey,sourceMessages} from './bridge.js?v=11.6';
import {uid,digest,clone,parseJSON} from './core.js?v=11.6';
import {splitChatText,compileLocalMacros} from './features.js?v=11.6';
import {defaultSocialRules} from './social.js?v=11.6';
import {diagnostics} from './diagnostics.js?v=11.6';
export function extractSocial(text){const matches=[...String(text).matchAll(/<shrimp_social>([\s\S]*?)<\/shrimp_social>/g)];if(!matches.length)return null;if(matches.length!==1)throw Error('本轮社交数据块重复，未清理正文');return {block:matches[0][0],data:parseJSON(matches[0][1])};}
export function validateSocial(data,conversations){
 if(!data||!Array.isArray(data.groups)||data.groups.length>30)throw Error('社交数据缺少groups');const out=[];
 for(const group of data.groups){const c=conversations.find(c=>c.id===group.conversationId&&!c.left);if(!c||!Array.isArray(group.messages)||group.messages.length>100)throw Error('社交会话或消息列表无效');
  for(const row of group.messages){if(row.sender!=='user'&&!c.members.includes(row.sender))throw Error('社交消息包含非成员');const kind=row.kind||'text';if(!['text','nickname','group_name'].includes(kind)||kind==='text'&&(typeof row.text!=='string'||!row.text.trim()))throw Error('社交消息格式无效');
   if(kind==='group_name'&&(c.kind!=='group'||row.sender==='user'||typeof row.groupName!=='string'||!row.groupName.trim()||row.groupName.length>100))throw Error('群名事件格式无效');
   if(kind==='nickname'&&(row.sender==='user'||typeof row.nickname!=='string'||!row.nickname.trim()||row.nickname.length>40||!['group','personal'].includes(row.nicknameScope)||row.nicknameScope==='group'&&c.kind!=='group'))throw Error('昵称事件格式无效');
   for(const text of kind==='text'?splitChatText(row.text):[typeof row.text==='string'?row.text:''])out.push({conversationId:c.id,message:{id:uid(),side:row.sender==='user'?'user':'ai',contactId:row.sender==='user'?'':row.sender,text,kind,...(kind==='group_name'?{groupName:row.groupName.trim()}:{}),...(kind==='nickname'?{nickname:row.nickname.trim(),nicknameScope:row.nicknameScope}:{}),status:'sent',createdAt:Date.now(),storyGenerated:true}});
  }
 }return out;
}
export function chooseStoryTargets(targets,random=Math.random){return targets.filter(()=>random()<0.35);}
export function storySocialMethods({esc,btn}){return {
 async storySocialAction(a){if(a==='settings'){const s=this.state.settings.storySocial||{};this.modal('跟随正文发消息',`<label class="shr-check"><input type="checkbox" name="enabled" ${s.enabled?'checked':''}>开启同轮社交消息</label><p class="shr-note">随正文生成，不另发AI请求。只读取本轮正文来讨论，不读取微信聊天记录。选择可接收消息的会话；每轮按概率触发，可以没有消息。</p><label class="shr-field">消息规则<textarea name="rules" rows="5">${esc(s.rules||'按人物身份、关系与知情范围自然发消息。可以私聊、闲聊、插话或无人发言，不固定讨论剧情。')}</textarea></label>${this.state.conversations.filter(c=>!c.left).map(c=>`<label class="shr-check"><input type="checkbox" name="targets" value="${esc(c.id)}" ${(s.targets||[]).includes(c.id)?'checked':''}>${esc(c.title)}</label>`).join('')}`,btn('story:save','保存','','shr-primary'));return;}
 if(a==='save'){const v=this.values(),targets=this.selected('targets');if(v.enabled&&!targets.length)throw Error('请选择至少一个会话');this.state.settings.storySocial={enabled:v.enabled,targets,rules:v.rules};await this.save();await this.injectSocial('normal');this.closeModal();}}
 ,async injectSocial(type,forGeneration=false){
 this.ensureSocialScope();const c=ctx(),set=c?.setExtensionPrompt;if(!set){if(this.state?.settings.storySocial?.enabled)throw Error('当前酒馆未提供前端提示词注入接口');return;}
 set('ame-shrimp-social','',1,0);
 if(!forGeneration||!this.state?.settings.storySocial?.enabled||this.gen.busy||!['normal',undefined,null,''].includes(type))return;
 const key=storyKey();if(!key)return;
 const available=this.state.conversations.filter(x=>(this.state.settings.storySocial.targets||[]).includes(x.id)&&!x.left);
 const token=await digest([key,(c.chat||[]).length,(c.chat||[]).at(-1)?.mes||'',available.map(x=>x.id)]);
 if(this.storyTrigger?.token!==token)this.storyTrigger={token,ids:chooseStoryTargets(available).map(x=>x.id)};
 if(key!==storyKey())return;const targets=available.filter(x=>this.storyTrigger.ids.includes(x.id));if(!targets.length){diagnostics.log('social.chance_skip',{count:available.length});return;}
 const people=new Map();for(const conv of targets)for(const id of conv.members){const person=this.contact(id);if(person)people.set(id,person);}
 const sources=new Map();for(const person of people.values()){if(person.sourceId&&this.state.sources[person.sourceId])sources.set(person.sourceId,this.state.sources[person.sourceId]);}
 const presetMaterial=[...sources.values()].map(source=>({id:source.id,name:source.name,members:[...people.values()].filter(p=>p.sourceId===source.id).map(p=>p.id),...compileLocalMacros(sourceMessages(this.state,source,c.name1,c.name2))}));
 const members=targets.map(x=>({conversationId:x.id,kind:x.kind,title:x.title,members:[{id:'user',name:c.name1},...x.members.map(id=>({id,name:this.memberName(id,x)}))]}));
 const instruction=`正常正文结束后，本轮可以附带微信消息，正文与微信独立。私聊、群聊中都可有人联系 User；群成员也可以彼此说话，不必围绕 User。没有合适的话题就不发消息，不强制讨论如何推进剧情。每个人保留自己的语言习惯、关系和关注点，不把同一份助手回答拆给不同成员。日常口语可以短碎、连续发送或单独标点；通知、解释、倾诉可以长消息。不得将小说旁白和读者选项格式搬入微信。角色只知道自己有来源的信息，不能因为后台资料写了某个秘密就知道它；不得编造认识某匹马之类关系来推动剧情。预设人格允许旁观故事，但 User 当前扮演的角色仍是 User，不默认 User 能安排所有人物。只读取本轮正文和下列人物资料，不读取微信历史，不输出 replyTo。末尾最多输出一个 <shrimp_social>{"groups":[{"conversationId":"会话ID","messages":[{"sender":"成员ID","kind":"text","text":"消息"}]}]}</shrimp_social>。没有消息时 groups 为空。不为未入会话的人发言；提及候选 NPC 不代表入群。允许在此块用 sender=user 表示正文中已经明确发生的 User 发言，不虚构其决定。不要输出 status_app。自改群名可用 kind=group_name,groupName；自改昵称用 kind=nickname,nickname,nicknameScope=personal或group。只修改自己的昵称，群名和群内昵称仅群聊可用。不机械触发改名。${this.state.settings.storySocial.rules||''}\n身份：${JSON.stringify(identityContext(c))}\n接收会话：${JSON.stringify(members)}\n各成员资料：${JSON.stringify([...people.values()].map(characterPayload))}\n预设人格原始资料（只继承各自人设、语气、示例反应和关系。正文写作岗位、固定人数、切句字数、状态栏格式及选项要求不是微信任务；微信输出使用上述结构）：${JSON.stringify(presetMaterial)}\n可提及但未自动加入的 NPC：${JSON.stringify((this.state.npcCandidates||[]).map(p=>({name:p.name,bio:p.bio,relationships:p.relationships,knowledge:p.knowledge})))}`;
 if(key!==storyKey())return;set('ame-shrimp-social',instruction,1,0,false,0);diagnostics.log('social.inject',{count:targets.length});
 },
 bindStorySocial(){const c=ctx(),types=c.eventTypes||c.event_types||{};globalThis.ameShrimpSocialInterceptor=async(chat,size,abort,type)=>{sanitizeOutgoingHistory(chat);await this.injectSocial(type,true);};const run=()=>{this.socialChain=(this.socialChain||Promise.resolve()).catch(()=>{}).then(()=>this.receiveSocial()).catch(e=>{diagnostics.log('social.failure',{stage:'receive',errorType:e.name});this.error(e);});};for(const n of ['GENERATION_ENDED','MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_DELETED','CHAT_CHANGED'])if(types[n])c.eventSource.on(types[n],run);if(types.GENERATION_STOPPED)c.eventSource.on(types.GENERATION_STOPPED,()=>c.setExtensionPrompt?.('ame-shrimp-social','',1,0));this.injectSocial('normal').catch(e=>this.error(e));},
 async receiveSocial(){this.ensureSocialScope();if(!this.state?.settings.storySocial?.enabled||this.mainBusy||this.gen.busy)return;const c=ctx(),key=storyKey();if(!key)return;const receipts=this.state.socialReceipts ||= {};let changed=false;
 for(let index=0;index<c.chat.length;index++){const m=c.chat[index];if(m.is_user||m.is_system)continue;const extracted=extractSocial(m.mes);if(!extracted)continue;m.extra ||= {};if(!m.extra.shrimpSocial){m.extra.shrimpSocial={id:uid(),versions:{}};if(typeof c.saveChat!=='function')throw Error('酒馆保存接口不可用');await c.saveChat();if(storyKey()!==key)return;}const id=await digest([key,m.extra.shrimpSocial.id,m.swipe_id||0,extracted.block]);diagnostics.log('social.parse',{id,count:index});
 const allowed=this.state.conversations.filter(x=>(this.state.settings.storySocial.targets||[]).includes(x.id));const rows=validateSocial(extracted.data,allowed);const version=m.swipe_id||0; m.extra ||= {};m.extra.shrimpSocial ||= {id:uid(),versions:{}};
 // Receipt and messages are durably saved before any source text is removed.
 const oldContacts=clone(this.state.contacts);const beforeCounters=new Map(this.state.conversations.map(c=>[c.id,{unread:c.unread,updatedAt:c.updatedAt,title:c.title,customTitle:c.customTitle,nicknames:clone(c.nicknames||{})}]));
 if(storyKey()!==key)return;const previous=receipts[id];if(!previous){for(const row of rows){const target=this.state.conversations.find(x=>x.id===row.conversationId);this.applyNameEvents(target,[row.message]);target.messages.push({...row.message,sourceReceipt:id});if(!(this.visible&&this.tab==='chats'&&this.conversation()?.id===target.id))target.unread=(target.unread||0)+1;target.updatedAt=Date.now();}receipts[id]={key,messageId:m.extra.shrimpSocial.id,swipe:version,createdAt:Date.now()};}
 try{await this.save();}catch(e){if(!previous){for(const target of this.state.conversations){target.messages=target.messages.filter(x=>x.sourceReceipt!==id);Object.assign(target,beforeCounters.get(target.id));}this.state.contacts=oldContacts;delete receipts[id];}throw e;}
 if(storyKey()!==key||c.chat[index]!==m)throw Error('故事已切换，原文未清理');if(!String(m.mes).includes(extracted.block))continue;
 const before=m.mes,swipeBefore=m.swipes?.[version];m.mes=before.replace(extracted.block,'');if(m.swipes&&m.swipes[version]===before)m.swipes[version]=m.mes;m.extra.shrimpSocial.versions[version]=id;if(m.swipe_info?.[version])m.swipe_info[version].extra=clone(m.extra);
 try{if(typeof c.saveChat!=='function')throw Error('酒馆保存接口不可用');await c.saveChat();c.updateMessageBlock?.(index,m,{rerenderMessage:true});diagnostics.log('social.cleaned',{id,count:rows.length});}catch(e){m.mes=before;if(m.swipes)m.swipes[version]=swipeBefore;diagnostics.log('social.cleanup_failed',{id});throw e;}changed=true;
 }
 const active=new Set(c.chat.map(m=>m.extra?.shrimpSocial?.versions?.[m.swipe_id||0]).filter(Boolean));for(const conv of this.state.conversations)for(const m of conv.messages){if(m.sourceReceipt&&receipts[m.sourceReceipt]?.key===key){const inactive=!active.has(m.sourceReceipt);if(!!m.sourceInactive!==inactive){m.sourceInactive=inactive;changed=true;}}}
 if(changed){await this.save();if(this.visible&&!this.root.querySelector('.shr-modal'))this.render();}
 }
};}
