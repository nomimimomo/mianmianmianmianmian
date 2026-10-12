import {ctx,storyKey} from './bridge.js?v=11.3';
import {clone} from './core.js?v=11.3';
const fields=['contacts','conversations','activeConversation','ignored','npcCandidates','npcScan','publishers'];
const defaults=()=>({contacts:[],conversations:[],activeConversation:'',ignored:{},npcCandidates:[],npcScan:{},publishers:[],storySocial:{enabled:false,targets:[],rules:''},proactive:{}});
export function captureScope(state){if(!state?.socialScopeKey)return;const bucket=state.socialScopes[state.socialScopeKey]||=defaults();for(const f of fields)bucket[f]=state[f];bucket.storySocial=state.settings.storySocial||{};bucket.proactive=state.settings.proactive||{};}
export function switchScope(state,key){
 if(!state)return false;const hasStory=!!key;key||='__no_story__';
 if(!state.socialScopes){state.socialScopes={};state.socialScopeKey=key;state.socialScopes[key]=defaults();for(const f of fields)if(state[f]!==undefined)state.socialScopes[key][f]=state[f];state.socialScopes[key].storySocial=state.settings.storySocial||defaults().storySocial;state.socialScopes[key].proactive=state.settings.proactive||{};state.scopeMigration={version:1,legacyAssignedTo:hasStory?key:null};}
 if(hasStory&&!state.scopeMigration?.legacyAssignedTo&&state.socialScopeKey==='__no_story__'){captureScope(state);state.socialScopes[key]=state.socialScopes.__no_story__;state.socialScopes.__no_story__=defaults();state.socialScopeKey=key;state.scopeMigration.legacyAssignedTo=key;}
 if(state.socialScopeKey===key){const b=state.socialScopes[key];for(const f of fields)if(state[f]===undefined)state[f]=b[f];return false;}
 captureScope(state);const next=state.socialScopes[key]||=defaults();for(const f of fields)state[f]=next[f];state.settings.storySocial=next.storySocial;state.settings.proactive=next.proactive;state.socialScopeKey=key;return true;
}
export function identityContext(context=ctx()){
 const name=context?.name1||'User';return {player:'当前输入消息的使用者',roleName:name,roleDescription:context?.powerUserSettings?.persona_description||'',rule:`User 当前扮演 ${name}，正文中的 ${name} 就是 User 的故事身份。可区分玩家发言和角色发言，按当前话题判断；不要默认 User 是操控所有人物的作者。`};
}
export function ecosystemMethods(){return {
 ensureSocialScope(){if(!this.state)return;const changed=switchScope(this.state,storyKey());if(changed){this.root?.querySelector('.shr-modal')?.remove();this.modalStack=[];this.modalData=null;this.activePublisher='';this.articleId='';this.groupPanel=false;this.detail=false;this.editingMessage=null;this.retryTarget=null;this.feedMenuId=null;this.manualFeeds?.clear();clearTimeout(this.draftTimer);this.root?.querySelector('.shr-message-menu')?.remove();}return changed;},
 memberName(id,c=this.conversation()){return c?.nicknames?.[id]||this.contact(id)?.name||'成员';},
 applyNameEvents(c,rows){for(const m of rows){if(m.kind==='group_name'){if(c.kind!=='group')continue;const before=c.title;c.title=m.groupName;c.customTitle=true;m.event={type:'group_name',actor:this.memberName(m.contactId,c),before,after:c.title};}
  if(m.kind==='nickname'){const person=this.contact(m.contactId);if(!person)continue;const before=this.memberName(person.id,c);if(m.nicknameScope==='group'){if(c.kind!=='group')continue;c.nicknames||={};c.nicknames[person.id]=m.nickname;}else{person.originalName||=person.name;person.personalNickname=m.nickname;person.name=m.nickname;for(const conv of this.state.conversations)if(conv.kind==='private'&&conv.members[0]===person.id)conv.title=m.nickname;}
   m.event={type:'nickname',before,after:m.nickname,scope:m.nicknameScope};m.text=`${before}将${m.nicknameScope==='group'?'群内昵称':'昵称'}改为「${m.nickname}」`;}
 }},
};}
