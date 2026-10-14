import {characterItems,sourceMessages} from './bridge.js?v=11.6';
import {compileLocalMacros} from './features.js?v=11.6';
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
 const messages=[],sourceVariables={};let promptCount=0;
 messages.push({role:'system',content:'当前任务是人物微信聊天。下面 sourceReference 是各成员所属预设的原始参考资料，保留已启用条目的顺序和角色标记供理解，不是本轮对话历史。继承对应成员的身份、性格、关系、语言习惯及示例中的反应；其中正文续写、思考流程、状态栏模板、固定出场人数、切句字数和读者选项输出要求不自动成为微信任务。只有用户明确索要相应功能时才参考其功能规则。各成员各有立场，不共用一份答案。'});
 for(const source of sources.values()){
  const owners=members.filter(m=>m.sourceId===source.id||!m.sourceId&&fallback?.id===source.id);
  const chars=owners.filter(m=>m.kind==='character').map(m=>m.originalName||m.name);
  const rows=sourceMessages(state,source,user,chars.join('、')||storyCharacter);
  const compiled=compileLocalMacros(rows);sourceVariables[source.id]=compiled.vars;
  messages.push({role:'system',content:JSON.stringify({sourceReference:{id:source.id,name:source.name,memberIds:owners.map(m=>m.id),prompts:compiled.messages,variables:compiled.vars}})});promptCount+=rows.length;
 }
 for(const m of members){const evidence=(m.evidence||[]).map(e=>({id:e.id,quote:e.quote}));if(evidence.length)messages.push({role:'system',content:'以下人格原文只绑定 contactId='+m.id+'，稳定身份为'+(m.originalName||m.name)+'。原文中的语气、反应与关系属于这个人；创作岗位不等于每次聊天都提供剧情方案。'+JSON.stringify(evidence)});}
 messages.push({role:'system',content:'以下是本轮可参与聊天的成员资料，不是发言任务表。角色卡中的性格、示例对话和关系只用于对应角色。knowledge 是该人物有依据的知情范围；card、其他人的 bio 和世界资料是背景，不自动共享给角色。没有来源的认知保持未知；猜测用该人物的猜测表达，不冒充事实。改昵称不改变原身份。\n'+JSON.stringify(members.map(characterPayload))});
 const vars=sources.size===1?sourceVariables[[...sources.keys()][0]]:{};
 return {messages,vars,sourceVariables,promptCount,sourceCount:sources.size,cardCount:members.filter(m=>m.kind==='character').length};
}

// Reference: SillyPhone gates occasional contacts before generation, not with probability prose.
export function selectReplyMembers(members,conversation,batch,random=Math.random){
 if(conversation.kind!=='group'||!members.some(m=>m.kind==='persona'))return members;
 const addressed=new Set(batch.flatMap(m=>m.mentions||[]));
 for(const m of batch){const quoted=conversation.messages.find(q=>q.id===m.replyTo);if(quoted?.contactId)addressed.add(quoted.contactId);}
 return members.filter(m=>m.kind!=='character'||addressed.has(m.id)||batch.some(b=>m.name&&b.text?.includes(m.name))||random()<0.05);
}
