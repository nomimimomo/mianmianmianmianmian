import { clone, uid, parseJSON, digest } from './core.js?v=11.3';
export const defaultPublisher = () => ({ id: 'builtin-hk', name: '街巷来信', intro: '用港媒笔触看故事里的世情与人物。', topics: '当地社会、民生、娱乐、人物传闻、街头见闻', style: '香港本地报刊口吻；标题简洁醒目，记者报道笔触，娱乐话题可有圈内消息、传闻及人物反应。措辞贴合故事所处年代。只借鉴口吻，不把其他世界强行设在香港。', script: 'simplified', followed: true, scope: '*', createdAt: Date.now() });
export const defaultFeatures = () => ({ readStory:true });
export function upgradeFeatures(state) {
    if(!state.settings.retentionV16){for(const t of ['moments','news'])if(state.settings.feeds[t].limit===200)state.settings.feeds[t].limit=20;state.settings.chatLimit ||=200;state.settings.retentionV16=true;}
    if (!Array.isArray(state.publishers)) state.publishers=[defaultPublisher()];
    // Old mode controls no longer affect requests; preserve messages and original preset snapshots.
    for(const c of state.conversations)c.features=defaultFeatures();
    return state;
}
export function features(c){return c.features ||= defaultFeatures();}
export function publisherKey(p) { return String(p.name).normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, '') + '|' + (p.scope || '*'); }
export function activePublishers(state, key) { return (state.publishers || []).filter(p => p.followed && (p.scope === '*' || p.scope === key)); }
export function followPublisher(state, proposed) {
    const key = publisherKey(proposed), existing = state.publishers.find(p => publisherKey(p) === key);
    if (existing) { existing.followed = true; return existing; }
    const value = { ...clone(proposed), id: uid(), followed: true, createdAt: Date.now() };
    state.publishers.push(value); return value;
}
export async function feedSignature(context, type, state) {
    return type === 'news' ? digest({ context: context.signature, publishers: activePublishers(state, context.key).map(p => ({ id: p.id, name: p.name, intro: p.intro, topics: p.topics, style: p.style, script: p.script })) }) : context.signature;
}
export function sanitizePublisher(p, scope) {
    if (!p || !['name', 'intro', 'topics', 'style'].every(k => typeof p[k] === 'string' && p[k].trim())) throw new Error('公众号名片缺少名称、简介、主题或口吻，请让人格重新推荐');
    return { name: p.name.trim().slice(0, 80), intro: p.intro.trim().slice(0, 1000), topics: p.topics.trim().slice(0, 2000), style: p.style.trim().slice(0, 3000), script: ['simplified', 'traditional'].includes(p.script) ? p.script : 'simplified', scope: scope || '*' };
}
export function splitChatText(value){return String(value).split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);}
export function parseChatResponse(raw, members, mode, scope, contextRef, maxOptions = 100) {
    const data = parseJSON(raw), rows = Array.isArray(data) ? data : data.messages;
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('回复缺少有效消息列表');
    const allowed = new Set(members), output = []; let count = 0;
    for (const r of rows) {
        if (!allowed.has(r.contactId)) throw new Error('回复包含非本会话成员，未写入');
        const kind = r.kind || 'text';
        if (!['text', 'option', 'publisher', 'style', 'group_name', 'nickname'].includes(kind)) throw new Error('消息类型无法识别');
        if (typeof r.text !== 'string' || (!r.text.trim() && kind !== 'publisher')) throw new Error('回复包含空消息');
        if(r.mentions!==undefined&&(!Array.isArray(r.mentions)||r.mentions.some(x=>!allowed.has(x)&&x!=='user')))throw Error('@成员无效');
        const m = { replyTo:typeof r.replyTo==='string'?r.replyTo:null, mentions:r.mentions||[], id: uid(), side: 'ai', contactId: r.contactId, text: r.text.trim(), kind, createdAt: Date.now() };
        if(kind==='text'&&typeof r.redpacketId==='string')m.redpacketId=r.redpacketId;
        if(kind==='nickname'){if(typeof r.nickname!=='string'||!r.nickname.trim()||r.nickname.length>40||!['personal','group'].includes(r.nicknameScope))throw Error('昵称格式不正确');m.nickname=r.nickname.trim();m.nicknameScope=r.nicknameScope;}
        if(kind==='group_name'){if(typeof r.groupName!=='string'||!r.groupName.trim()||r.groupName.length>100)throw Error('群名格式不正确');m.groupName=r.groupName.trim();}
        if (kind === 'option') {
            if (!contextRef) throw new Error('缺少正文来源，选项未写入');
            if (++count > maxOptions) continue;
            if(typeof r.reader==='string')m.reader=r.reader.trim().slice(0,80);
            m.optionType=typeof r.optionType==='string'?r.optionType:'';
            m.insertText = typeof r.insertText === 'string' && r.insertText.trim() ? r.insertText.trim() : m.text; m.contextRef = clone(contextRef);
        }
        if (kind === 'style') { if(typeof r.styleId!=='string')throw Error('文风消息缺少来源');m.styleId=r.styleId; }
        if (kind === 'publisher') m.publisher = sanitizePublisher(r.publisher, scope);
        if(kind==='text'){for(const text of splitChatText(m.text))output.push({...m,id:uid(),text});}else output.push(m);
    }
    return output;
}
export function parseArticles(raw, max, publishers) {
    const data = parseJSON(raw), rows = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(rows)) throw new Error('公众号结果缺少 items 列表');
    return rows.slice(0, max).map(r => {
        const p = publishers.find(p => p.id === r.publisherId);
        if (!p) throw new Error('文章来自未订阅的公众号，未写入');
        if (!['title','summary','body'].every(k => typeof r[k] === 'string' && r[k].trim())) throw new Error('公众号文章缺少标题、摘要或正文');
        return { id: uid(), publisherId: p.id, author: p.name, title: r.title.trim(), summary: r.summary.trim(), body: r.body.trim(), createdAt: Date.now() };
    });
}
// Variables are local to this one request. No Tavern variables or source prompts are modified.
export function compileLocalMacros(messages, initial = {}) {
    const vars = { ...initial };
    const out = messages.map(m => ({ ...m, content: m.content.replace(/\{\{setvar::([\w.-]+)::((?:(?!\{\{|\}\})[\s\S])*)\}\}/gi, (_, k, v) => { vars[k] = v; return ''; }) }));
    for (const m of out) m.content = m.content.replace(/\{\{getvar::([\w.-]+)\}\}/gi, (raw, k) => Object.hasOwn(vars, k) ? vars[k] : raw);
    return { messages: out, vars };
}
export function chatProtocol(mode, conf, members, user) {
 return `你在独立微信聊天中回复 ${user}。这是用户视角的微信聊天。预设人格可以处于元认知聊天空间；角色卡人物保留其世界观、知识边界、关系和说话方式，不强行变成点评故事的助手。每位成员用自己的身份、性格和口吻交谈。只让所列成员发言，不代替用户，不冒充虚构读者或未邀请的人。正文、角色设定、世界资料和启用预设会在后台一并提供。以最新剧情为依据，话题可自由展开。一次回复可以包含同一成员的多条消息，按完整的意思自然分气泡，保留标点，不限制每句字数。接住最新的话和语气，结合前面的关系。不要先写一份完整的助手回答，再拆给不同成员轮流讲。每个人有自己的注意力、偏好和与其他人的关系；可以插话、互怼、卖关子、说废话、认真讨论或冷场。日常用口语，允许碎句、单独标点、连续发消息；正式通知、解释、倾诉可以长篇。读者选项示例只帮助理解人格，不作为微信消息的固定格式。不要把小说动作旁白搬进聊天，不强制使用网络流行语。群聊不要求人人出场，更不按名单轮流报到；可以只有一人接话、同一人连续说，也可以无人回应。成员间可以互相接话，出场不等于每轮必须发言。每个成员的口吻和知识边界只来自自己的预设或角色卡，不能统一套活泼、疗愈或客服语气；不让古代角色无故懂得现代游戏、网络梗和产品。群聊状态栏中的人格与关系设定适用于对应成员，正文写作流程与思考模板不要求在微信里表演。世界资料是真实背景，不等于每个人已知的信息；不曾见过、听过或有合理来源的秘密不能成为行动依据。不得为了推进剧情临时发明认识某匹马、认出某件物品之类关系。是否谈正文由当前话题决定，不预设群成员的工作是分析剧情、提供方案。普通提问不等于创作指令。允许打趣、反驳、追问、突然想起一件事，不把每次聊天做成逐项答题。用户抱怨时不要默认回复通用安慰套话，不反复用“慢慢说，我听着”一类句式收尾。活泼或克制取决于各自人格，禁止把所有成员变成同一口吻。不要重复状态栏包装标签。
用户让你生成选项、给出下一步建议或修改候选时，直接调用已经提供的预设中对应功能与要求，不额外进入任何模式，不自行指定固定数量或类别。预设的 choice 局部变量也会随资料提供。每个建议用正在聊天的成员本人口吻说出来，kind=option、text 为对用户说的话。若附带可直接填入酒馆输入框的行动或台词，另放 insertText；不要把提议者换成用户角色。若预设要求匿名读者来信，遵循该预设的人数和署名规则，把读者网名放入 reader 字段。reader 仅为来信署名，不加入联系人，也不替代 contactId。讨论继续用 text 即可。
需要推荐文风时，只能从 fishboardStyleLibrary 的真实条目选择，以 kind=style 和准确 styleId 发出文件消息，text 可写推荐理由；禁止编造库里不存在的文风。
想推荐故事内的公众号时可返回 kind=publisher 名片，用户点击关注后才订阅，不每轮强推。默认简体中文，港媒口吻不等于繁体。
允许无人回应时返回{"messages":[]}。引用消息时可提供replyTo为历史消息id，@成员用mentions数组提供成员id。系统事件仅供感知，不必复述。
本群可编辑规则：${conf?.socialRules||''}
群聊成员可以自然地修改群名：返回 kind=group_name、groupName 为新群名、text 为改名说明。仅群聊可用，私聊不可改名。不要每轮改名。成员也可修改自己的昵称，kind=nickname、nickname=新名称、nicknameScope=personal（个人昵称）或group（本群昵称）。只能修改自己，保留原身份和性格。
最终只返回 JSON {"messages":[{"contactId":"成员ID","kind":"text|option|publisher|style|group_name|nickname","text":"成员本人的消息","insertText":"选项可选的拟填入内容","styleId":"仅文风文件使用真实库ID","publisher":{"name":"仅公众号名片使用","intro":"简介","topics":"主题","style":"口吻","script":"simplified"}}]}。不使用的字段省略。
成员：${JSON.stringify(members.map(m=>({contactId:m.id,kind:m.kind,name:m.originalName||m.name,displayName:m.displayName||m.name,bio:m.bio,origin:m.origin,sourceId:m.sourceId})))}`;
}
