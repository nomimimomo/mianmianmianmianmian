// Fishboard owns persistence. A failed read must never become an empty write.
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
export function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x??null);}
export function validateFishboard(x){
 if(x===null||x===undefined)return;
 if(typeof x!=='object'||Array.isArray(x))throw Error('鱼板面数据格式异常，已停止写入');
 for(const key of ['styles','quotes','quoteGroups'])if(x[key]!==undefined&&!Array.isArray(x[key]))throw Error('鱼板面 '+key+' 数据异常，已停止写入');
 if(x.mianmian!==undefined&&(!x.mianmian||typeof x.mianmian!=='object'||Array.isArray(x.mianmian)))throw Error('人设草稿数据异常，已停止写入');
 for(const key of ['drafts','active','collections'])if(x.mianmian?.[key]!==undefined&&(!x.mianmian[key]||typeof x.mianmian[key]!=='object'||Array.isArray(x.mianmian[key])))throw Error('人设 '+key+' 数据异常，已停止写入');
 for(const side of ['char','user']){const drafts=x.mianmian?.drafts?.[side],active=x.mianmian?.active?.[side],collection=x.mianmian?.collections?.[side];if(drafts!==undefined&&(!drafts||typeof drafts!=='object'||Array.isArray(drafts)))throw Error('人设草稿结构异常，已停止写入');if(active!==undefined&&typeof active!=='string')throw Error('当前人设记录异常，已停止写入');if(collection!==undefined&&(!collection||typeof collection!=='object'||Array.isArray(collection)))throw Error('人设合集结构异常，已停止写入');if(collection?.items!==undefined&&!Array.isArray(collection.items))throw Error('人设合集条目异常，已停止写入');}
 if(x.readingLibrary!==undefined&&(!x.readingLibrary||x.readingLibrary.schema!==1||!Array.isArray(x.readingLibrary.items)))throw Error('书架数据异常，已停止写入');
 if(x.shrimp!==undefined&&(!x.shrimp||x.shrimp.schemaVersion!==1||!Array.isArray(x.shrimp.conversations)||!Array.isArray(x.shrimp.contacts)))throw Error('鲜虾聊天数据异常，已停止写入');
}
export class FishboardGuard{
 constructor({read,write,backup,log,status,verifyDelay=500,verifyAttempts=20}){Object.assign(this,{read,write,backup,log,status,verifyDelay,verifyAttempts});this.blocked=null;this.primed=false;this.baseline=null;this.chain=Promise.resolve();this.pending=0;this.backedUp=false;}
 prime(value){this.assert();validateFishboard(value);if(!this.primed){this.baseline=copy(value??null);this.primed=true;this.log('data.read','success',{hasData:!!value});}}
 assert(){if(this.blocked)throw this.blocked;}
 fail(error){if(!this.blocked){this.blocked=error instanceof Error?error:Error(String(error));this.log('data.guard','blocked',{reason:this.blocked.message});this.status('保存已暂停：'+this.blocked.message,true);}return this.blocked;}
 commit(value){
  this.assert();if(!this.primed)throw this.fail(Error('原数据尚未读取，未写入'));validateFishboard(value);const next=copy(value);this.pending++;this.status('正在确认保存…');
  const job=this.chain.then(async()=>{
   this.assert();let current=await this.read();validateFishboard(current);
   if(canonical(current)!==canonical(this.baseline))throw Error('存储中的鱼板面资料已变化，未覆盖。请先导出本页草稿再重新加载');
   if(!this.backedUp){await this.backup(copy(current));this.backedUp=true;this.log('data.backup','verified');}
   this.log('data.write','requested');await this.write(copy(next));
   for(let i=0;i<this.verifyAttempts;i++){
    const check=await this.read();validateFishboard(check);
    if(canonical(check)===canonical(next)){this.baseline=copy(next);this.log('data.write','confirmed');return;}
    if(canonical(check)!==canonical(this.baseline))throw Error('保存期间检测到其他修改，已停止后续写入');
    if(i+1<this.verifyAttempts)await new Promise(r=>setTimeout(r,this.verifyDelay));
   }
   throw Error('存储端尚未确认保存，已停止后续写入；本页草稿仍保留');
  }).catch(e=>{throw this.fail(e);}).finally(()=>{this.pending--;if(!this.blocked&&!this.pending)this.status('已确认保存');});
  // Legacy editor callers may be synchronous; the rejection is still returned to awaiting modules.
  job.catch(()=>{});this.chain=job;return job;
 }
 async flush(){await this.chain;this.assert();}
}
