// Only story prose may flow into shrimp. No social payload flows back into story history.
export function stripSocial(text){return String(text||'').replace(/<shrimp_social\b[^>]*>[\s\S]*?(?:<\/shrimp_social>|$)/gi,'');}
export function storyProse(text){
 text=stripSocial(text).replace(/<(think|analysis|reasoning|status_app|status|details|script|style)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi,'').replace(/```[\s\S]*?```/g,'');
 const bodies=[...text.matchAll(/<(正文|content|prose)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
 if(bodies.length)text=bodies.map(m=>m[2]).join('\n');
 return text.replace(/<[^>]+>/g,'').trim();
}
export function recentProse(chat,end,limit=4000){
 const cap=Math.max(0,Math.min(4000,Number.isFinite(Number(limit))?Number(limit):4000));let remaining=cap;const rows=[];
 for(let i=Math.min(end,chat.length-1);i>=0&&rows.length<3&&remaining>0;i--){const m=chat[i];if(m.is_user||m.is_system)continue;const prose=storyProse(m.mes);if(!prose)continue;const text=prose.slice(-remaining);rows.unshift({index:i,name:m.name,user:false,text});remaining-=text.length;}
 return rows;
}
export function sanitizeOutgoingHistory(chat){
 if(!Array.isArray(chat))return 0;let count=0;
 for(let i=0;i<chat.length;i++){const m=chat[i];if(!m||typeof m!=='object')continue;const next={...m};let changed=false;for(const key of ['mes','content'])if(typeof m[key]==='string'){next[key]=stripSocial(m[key]);changed||=next[key]!==m[key];}if(changed){chat[i]=next;count++;}}
 return count;
}
