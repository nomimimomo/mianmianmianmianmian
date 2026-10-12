export const VERSION = '11.3';
export const clone = x => JSON.parse(JSON.stringify(x));
export function uid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
    const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export async function digest(value) {
    const input = typeof value === 'string' ? value : JSON.stringify(value);
    if (!globalThis.crypto?.subtle) { const { sha256 } = await import('/lib.js'); return sha256(input); }
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const moduleDefaults = () => ({ auto: false, withChat: false, count: 4, limit: 20, cooldown: 10 });
export function freshState() {
    return { schemaVersion: 1, settings: { presetName: '', apiMode: 'tavern', customUrl: '', customKey: '', customModel: '', maxTokens: 3000, historyLimit: 200, chatLimit: 200, contextLimit: 16000, worldLimit: 10000, background: true, promptToggles: {}, feeds: { moments: moduleDefaults(), news: { ...moduleDefaults(), count: 4 } } }, contacts: [], sources: {}, ignored: {}, conversations: [], worlds: {}, styles: [], activeConversation: '', migration: null };
}
export function validateState(x) {
    if (!x || x.schemaVersion !== 1 || !Array.isArray(x.contacts) || !Array.isArray(x.conversations) || !x.settings || !x.sources || !x.worlds) throw new Error('文件不是鲜虾数据，未覆盖现有记录');
    const out = clone(x), defaults = freshState().settings;
    out.settings = { ...defaults, ...out.settings, feeds: { moments: { ...defaults.feeds.moments, ...out.settings.feeds?.moments }, news: { ...defaults.feeds.news, ...out.settings.feeds?.news } } };
    out.styles ||= []; out.ignored ||= {}; out.settings.promptToggles ||= {};
    for (const c of out.conversations) { if (!c.id || !Array.isArray(c.messages) || !Array.isArray(c.members)) throw new Error('会话数据不完整'); c.turns ||= []; }
    for(const scope of Object.values(out.socialScopes||{})){if(!scope||!Array.isArray(scope.contacts)||!Array.isArray(scope.conversations))throw Error('聊天文档分区数据不完整');for(const c of scope.conversations){if(!c.id||!Array.isArray(c.messages)||!Array.isArray(c.members))throw Error('聊天文档会话数据不完整');c.turns||=[];}}
    return out;
}
export function orderedPrompts(preset, overrides = {}) {
    const ps = Array.isArray(preset?.prompts) ? preset.prompts : [];
    const groups = preset?.prompt_order || [];
    const order = (groups.find(g => Number(g.character_id) === 100001) || groups[0])?.order || [];
    const map = new Map(ps.map((p, i) => [String(p.identifier ?? i), p]));
    const result = [], seen = new Set();
    for (const o of order) {
        const id = String(o.identifier), p = map.get(id);
        if (!p || seen.has(id)) continue;
        seen.add(id);
        result.push({ ...clone(p), identifier: id, linked: true, enabled: !p.marker && (Object.hasOwn(overrides, id) ? !!overrides[id] : o.enabled !== false) });
    }
    for (const [id, p] of map) if (!seen.has(id)) result.push({ ...clone(p), identifier: id, linked: false, enabled: false });
    return result;
}
export function parseJSON(text) {
    const clean = String(text).trim().replace(/^<think>[\s\S]*?<\/think>\s*/i, '').trim();
    try { return JSON.parse(clean); } catch {}
    const blocks=[...clean.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    if(blocks.length===1){try{return JSON.parse(blocks[0][1].trim());}catch{}}
    // Accept one complete JSON object surrounded by commentary; never eval or invent fields.
    const start=clean.search(/[\[{]/);if(start>=0){let quoted=false,escaped=false,depth=0;
      for(let i=start;i<clean.length;i++){const c=clean[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
        if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0){if(/[\[{]/.test(clean.slice(i+1)))break;try{return JSON.parse(clean.slice(start,i+1));}catch{break;}}}
      }
    }
    let position=-1;try{JSON.parse(clean);}catch(e){position=Number(e.message.match(/position (\d+)/)?.[1]??-1);}
    throw Object.assign(new Error('模型未返回有效 JSON，原有记录已保留，详见错误报告'),{stage:'model_json',position});
}
export function parseReply(text, members) {
    const data = parseJSON(text), rows = Array.isArray(data) ? data : data.messages;
    if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error('回复缺少有效消息列表');
    const allowed = new Set(members);
    return rows.map(row => {
        if (!allowed.has(row.contactId) || typeof row.text !== 'string' || !row.text.trim()) throw new Error('回复包含不在本会话的联系人或空消息，未写入');
        return { id: uid(), side: 'ai', contactId: row.contactId, text: row.text.trim(), createdAt: Date.now() };
    });
}
export function parseFeed(text, max) {
    const data = parseJSON(text), rows = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(rows)) throw Object.assign(new Error('信息流结果缺少 items 列表'),{stage:'feed_items'});
    return rows.slice(0, max).map((row,index) => {
        if (typeof row?.body !== 'string' || !row.body.trim() || typeof row?.author !== 'string') throw Object.assign(new Error('动态字段不完整，未写入'),{stage:'feed_row',row:index,bodyType:typeof row?.body,authorType:typeof row?.author});
        return { id: typeof row.id==='string'?row.id:uid(), likes:parseLikes(row.likes), comments:parseComments(row.comments), author: row.author.slice(0, 120), title: String(row.title || '').slice(0, 200), body: row.body, createdAt: Date.now() };
    });
}
export function applyTurn(conv, reply, batchIds, replacement = null) {
    const turn = replacement || { id: uid(), batchIds: [...batchIds] };
    let insertAt=conv.messages.length;
    if(replacement){
        const old=conv.messages.filter(m=>m.turnId===turn.id&&m.side==='ai');
        turn.revisions||=[];turn.revisions.push({savedAt:Date.now(),messages:clone(old)});
        const first=conv.messages.findIndex(m=>m.turnId===turn.id&&m.side==='ai');
        insertAt=first<0?Math.max(-1,...batchIds.map(id=>conv.messages.findIndex(m=>m.id===id)))+1:first;
        conv.messages=conv.messages.filter(m=>m.turnId!==turn.id||m.side!=='ai');
    }
    for (const m of conv.messages) if (batchIds.includes(m.id)) { m.status = 'sent'; m.turnId = turn.id; }
    conv.messages.splice(insertAt,0,...reply.map(m=>({...m,turnId:turn.id})));
    if (!replacement) conv.turns.push(turn);
    conv.updatedAt = Date.now();
}
export function mergeFeed(bucket, rows, signature, sources, limit) {
    const seen = new Set(bucket.items.map(x => (x.publisherId || '') + '\n' + x.author + '\n' + x.title + '\n' + x.body));
    for (const item of rows) {
        const existing=item.id&&bucket.items.find(x=>x.id===item.id);if(existing){ if(existing.author!==item.author||existing.body!==item.body)throw Error('旧动态身份或正文不匹配'); const selfLikes=(existing.likes||[]).filter(x=>x.id.startsWith('user:'));existing.likes=[...selfLikes,...new Map([...(existing.likes||[]),...(item.likes||[])].filter(x=>!x.id.startsWith('user:')).map(x=>[x.id,x])).values()];const ids=new Set((existing.comments||[]).map(x=>x.id));existing.comments=[...(existing.comments||[]),...(item.comments||[]).filter(x=>x.authorId!=='user'&&!ids.has(x.id)&&!(existing.comments||[]).some(y=>y.author===x.author&&y.text===x.text))];continue;}
        const k = (item.publisherId || '') + '\n' + item.author + '\n' + item.title + '\n' + item.body;
        if (!seen.has(k)) { bucket.items.push({ ...item, signature, sources: clone(sources) }); seen.add(k); }
    }
    if(Number.isFinite(limit))bucket.items = bucket.items.slice(-Math.max(1, limit));
    bucket.lastSignature = signature; bucket.lastChecked = Date.now(); bucket.error = ''; bucket.retryCount = 0;
}
export function sourceStale(item, sources) { return (item.sources || []).some(x => !sources.some(y => y.index === x.index && y.hash === x.hash)); }
export function worldBucket(state, key, name) {
    return state.worlds[key] ||= { name, moments: { items: [], lastSignature: '', lastChecked: 0 }, news: { items: [], lastSignature: '', lastChecked: 0 } };
}
export function migrateLegacy(raw) {
    if (!raw || !Array.isArray(raw.sessions) || !raw.settings) throw new Error('未识别旧版鲜虾数据');
    const state = freshState(), s = raw.settings;
    for (const key of ['presetName', 'customUrl', 'customKey', 'customModel', 'apiMode', 'historyLimit']) if (s[key] !== undefined) state.settings[key] = s[key];
    for (const [preset, names] of Object.entries(s.presetPersonas || {})) for (const name of names) state.contacts.push({ id: uid(), name, bio: '', kind: 'persona', sourceId: '', origin: `旧版 · ${preset}（待关联快照）`, avatar: s.presetPersonaAvatars?.[preset]?.[name] || '' });
    for (const old of raw.sessions) state.conversations.push({ id: uid(), title: old.title || '旧版会话', kind: 'group', members: [], turns: [], draft: '', updatedAt: old.updatedAt || Date.now(), messages: (old.messages || []).map(m => ({ ...clone(m), id: uid(), text: m.text || (m.type === 'card' ? JSON.stringify(m.card || m, null, 2) : m.type === 'style-card' ? JSON.stringify(m.style || {}, null, 2) : ''), status: m.pending || m.status === 'failed' ? 'pending' : 'sent', legacySender: m.sender || '', contactId: '' })) });
    state.migration = { date: Date.now(), note: '旧版未记录完整成员和预设版本，请为旧会话选择成员；原浏览器记录未删除。' };
    return state;
}

function parseLikes(rows){if(rows===undefined)return [];if(!Array.isArray(rows))throw Error('点赞格式错误');return rows.map(r=>{if(typeof r?.name!=='string')throw Error('点赞人格式错误');return {id:typeof r.id==='string'?r.id:r.name,name:r.name.slice(0,120)};});}
function parseComments(rows){if(rows===undefined)return [];if(!Array.isArray(rows))throw Error('评论格式错误');return rows.map(r=>{if(typeof r?.author!=='string'||typeof r.text!=='string')throw Error('评论字段格式错误');return {id:typeof r.id==='string'?r.id:uid(),author:r.author.slice(0,120),text:r.text,replyTo:typeof r.replyTo==='string'?r.replyTo:null,createdAt:Date.now()};});}
