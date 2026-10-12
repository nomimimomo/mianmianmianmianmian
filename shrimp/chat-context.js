import {characterItems,sourceMessages} from './bridge.js?v=11.3';
import {compileLocalMacros} from './features.js?v=11.3';
export function resolveMembers(members,cards=characterItems()){
 return members.map(m=>{
  if(m.kind!=='character')return m;
  const live=cards.find(c=>c.id===m.characterId);
  if(!live)throw Error(`角色卡“${m.name}”暂不可用，请等待酒馆加载完成后重试`);
  return {...m,name:m.personalNickname||live.name,originalName:live.name,bio:live.bio,data:live.data};
 });
}
export function characterPayload(m){
 const d=m.data||{};
 return {contactId:m.id,name:m.originalName||m.name,displayName:m.displayName||m.name,personalNickname:m.personalNickname||'',knowledge:m.knowledge||'',relationships:m.relationships||'',evidence:m.evidence||[],kind:m.kind||'persona',sourceId:m.sourceId||'',bio:m.bio||'',...(m.kind==='character'?{card:{description:d.description||'',personality:d.personality||'',scenario:d.scenario||'',first_mes:d.first_mes||'',mes_example:d.mes_example||'',system_prompt:d.system_prompt||'',post_history_instructions:d.post_history_instructions||'',alternate_greetings:d.alternate_greetings||[],character_book:d.character_book?{...d.character_book,entries:(Array.isArray(d.character_book.entries)?d.character_book.entries:Object.values(d.character_book.entries||{})).filter(e=>e.enabled!==false&&e.disable!==true)}:null,depth_prompt:d.extensions?.depth_prompt||null}}:{})};
}
export function buildChatSetup(state,members,fallback,user,storyCharacter){
 const sources=new Map();
 for(const m of members){const source=m.sourceId?state.sources[m.sourceId]:fallback;if(!source)throw Error(`“${m.name}”的来源预设缺失，请重新关联预设`);sources.set(source.id,source);}
 const messages=[];let promptCount=0;
 for(const source of sources.values()){
  const owners=members.filter(m=>m.sourceId===source.id||!m.sourceId&&fallback?.id===source.id);
  const chars=owners.filter(m=>m.kind==='character').map(m=>m.name);
  const rows=sourceMessages(state,source,user,chars.join('、')||storyCharacter);
  messages.push({role:'system',content:`以下预设来源 ${source.name}，适用成员 ID：${owners.map(m=>m.id).join('、')}。其中人格身份只属于对应成员，不把其他成员改成同一人格。`},...rows);promptCount+=rows.length;
 }
 const compiled=compileLocalMacros(messages);
 for(const m of members){const source=state.sources[m.sourceId];const evidence=(m.evidence||[]).map(e=>({id:e.id,quote:e.quote}));if(evidence.length)compiled.messages.push({role:'system',content:'以下人格原文只绑定 contactId='+m.id+'，稳定身份为'+(m.originalName||m.name)+'。完整预设中的其他身份不能覆盖此绑定。原文中的玩笑、说话方式与人物关系都要保留，不能将其压缩成通用剧情顾问。'+JSON.stringify(evidence)});}
 compiled.messages.push({role:'system',content:'以下是本轮实际参与聊天的成员资料。角色卡中的性格、说话方式、示例对话和关系约束用于对应角色；故事背景人物不会自动成为发言者。聊天展示格式不改变人格。\n'+JSON.stringify(members.map(characterPayload))});
 return {...compiled,promptCount,sourceCount:sources.size,cardCount:members.filter(m=>m.kind==='character').length};
}

// Reference: SillyPhone gates occasional contacts before generation, not with probability prose.
export function selectReplyMembers(members,conversation,batch,random=Math.random){
 if(conversation.kind!=='group'||!members.some(m=>m.kind==='persona'))return members;
 const addressed=new Set(batch.flatMap(m=>m.mentions||[]));
 for(const m of batch){const quoted=conversation.messages.find(q=>q.id===m.replyTo);if(quoted?.contactId)addressed.add(quoted.contactId);}
 return members.filter(m=>m.kind!=='character'||addressed.has(m.id)||batch.some(b=>m.name&&b.text?.includes(m.name))||random()<0.05);
}
