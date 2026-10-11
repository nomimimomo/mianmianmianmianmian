import {upgradeFeatures} from './features.js?v=10.8';
import {freshState,validateState} from './core.js?v=10.8';
import {diagnostics,instrument} from './diagnostics.js?v=10.8';
// The old shrimp file is a read-only migration source. Fishboard owns every new write.
export class Store{
 constructor(ctx,status){this.ctx=ctx;this.status=status;this.state=null;this.blocked=false;this.chain=Promise.resolve();this.saved=null;}
 async load(){const host=window.AmeFishboard;if(!host)throw Error('请从鲜虾鱼板面打开聊天');let data=await host.readShrimp();
  if(!data&&host.mayReadLegacyShrimp()){const r=await fetch('/user/files/ame-shrimp-v1.json?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30000)});if(r.status!==404){if(!r.ok)throw Error('旧鲜虾资料读取失败，未创建空白记录');const old=await r.json();if(!old?.data)throw Error('旧鲜虾资料格式异常，未迁移');data=validateState(old.data);diagnostics.log('migration.legacy_read',{count:data.conversations.length});await host.saveShrimp(data);diagnostics.log('migration.host_saved');}}
  this.state=upgradeFeatures(data?validateState(data):freshState());this.saved=JSON.stringify(data||null);this.blocked=false;return this.state;
 }
 save(){if(!this.state)return Promise.reject(Error('聊天资料尚未读取'));if(this.blocked)return Promise.reject(Error('保存已暂停，请在鱼板面查看诊断提示'));const next=JSON.parse(JSON.stringify(this.state));this.status('保存中…');const task=this.chain.then(async()=>{if(this.blocked)throw Error('保存已暂停');await window.AmeFishboard.saveShrimp(next);this.saved=JSON.stringify(next);this.status('已保存到鲜虾鱼板面');});this.chain=task.catch(e=>{this.blocked=true;this.status(e.message,true);throw e;});this.chain.catch(()=>{});return this.chain;}
}
instrument(Store.prototype,['load','save'],s=>({blocked:s.blocked,loaded:!!s.state}));
