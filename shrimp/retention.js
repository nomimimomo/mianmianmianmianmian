export function trimConversation(c,limit=200){
 const cap=Math.max(1,Number(limit)||200),protectedTurns=new Set(c.messages.filter(m=>m.side==='user'&&['pending','failed'].includes(m.status)).map(m=>m.turnId).filter(Boolean));
 const protectedIds=new Set(c.messages.filter(m=>m.side==='user'&&['pending','failed'].includes(m.status)||protectedTurns.has(m.turnId)).map(m=>m.id));
 const keep=new Set(c.messages.slice(-cap).map(m=>m.id));for(const id of protectedIds)keep.add(id);
 const before=c.messages.length;c.messages=c.messages.filter(m=>keep.has(m.id));
 c.turns=c.turns.filter(t=>t.batchIds.every(id=>keep.has(id))&&c.messages.some(m=>m.turnId===t.id));return before-c.messages.length;
}
