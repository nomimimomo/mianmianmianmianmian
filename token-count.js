// Token counts use the active Tavern tokenizer, without prompt padding.
export async function countTokens(text, context) {
 if(!text)return 0;
 const fn=context?.getTokenCountAsync;
 if(typeof fn!=='function')throw Error('酒馆 token 计数接口尚未就绪');
 const n=await fn.call(context,String(text),0);
 if(!Number.isSafeInteger(n)||n<0)throw Error('酒馆返回的 token 数无效');
 return n;
}
const pending=new WeakMap();
export function showTokenCount(el,text,getContext,log=()=>{}) {
 const old=pending.get(el);if(old)clearTimeout(old.timer);
 const job={};pending.set(el,job);el.textContent='…';el.title='按酒馆当前分词器统计';
 job.timer=setTimeout(async()=>{
  if(!el.isConnected||pending.get(el)!==job)return;
  let timeout;
  try {
   const n=await Promise.race([countTokens(text,getContext()),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('token 计数超时')),15000);})]);
   if(el.isConnected&&pending.get(el)===job){el.textContent=String(n);el.title='按酒馆当前分词器统计';}
  }catch(error){if(el.isConnected&&pending.get(el)===job){el.textContent='—';el.title='计数失败：'+error.message;log(error);}}
  finally{clearTimeout(timeout);}
 },250);
}
