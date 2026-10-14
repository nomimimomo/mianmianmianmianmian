import {timeoutSignal} from './compat.js?v=11.6';
const KEY='鲜虾鱼板面.data.v1';
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function decode(x){if(x==null)return null;const v=typeof x==='string'?JSON.parse(x):x;if(!v||!Array.isArray(v.styles)||!Array.isArray(v.quotes))throw Error('原鱼板面资料格式异常，未替换为默认资料');return v;}
export class HostStorage {
 constructor(){this.error=null;this.initial=null;this.chain=Promise.resolve();this.pending=0;this.ready=false;}
 async remote(timeout=20000){
  const controller=new AbortController();let timer;
  const request=(async()=>{const r=await fetch('/api/settings/get',{method:'POST',headers:this.context()?.getRequestHeaders?.()||{'Content-Type':'application/json'},body:'{}',signal:controller.signal});if(!r.ok)throw Error('原资料读取失败（'+r.status+'）');const data=await r.json();return typeof data.settings==='string'?JSON.parse(data.settings):data.settings||data;})();
  // A deadline also covers stalled JSON bodies and fetch wrappers that ignore abort.
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Error('读取酒馆设置超时，请检查连接后点重新读取。原资料未改动。');error.name='TimeoutError';reject(error);controller.abort();},timeout);});
  try{return await Promise.race([request,deadline]);}finally{clearTimeout(timer);}
 }
 async prepare(mode,context,helper){this.error=null;this.mode=mode;this.context=context;this.helper=helper;try{
  if(mode==='browser'){this.ready=true;return;}
  const c=context();
  // Use data already loaded by Tavern; absence is never treated as an empty server.
  const live=c?.extensionSettings&&typeof c.accountStorage?.getItem==='function'?{extension_settings:c.extensionSettings,accountStorage:{[KEY]:c.accountStorage.getItem(KEY)}}:null;
  const populated=live&&(live.extension_settings?.variables?.global?.[KEY]!=null||live.accountStorage[KEY]!=null);
  const started=Date.now();let settings;
  try{settings=populated?live:await this.remote(12000);window.AmeFishboard?.log('storage.read','ready',{elapsedMs:Date.now()-started});}
  catch(e){window.AmeFishboard?.log('storage.read','failed',{attempt:1,elapsedMs:Date.now()-started,message:e.message});throw e;}
  const global=decode(settings.extension_settings?.variables?.global?.[KEY]),account=decode(settings.accountStorage?.[KEY]);
  if(global&&account&&canonical(global)!==canonical(account))throw Error('检测到两份不同的鱼板面资料，保留两份原件，未自动覆盖');
  this.kind=global?'global':account?'account':helper('insertOrAssignVariables')?'global':'account';this.initial=copy(global||account);this.confirmed=copy(this.initial);this.ready=true;
  // No writes, defaults or migrations during startup.
 }catch(e){this.error=e;}}
 assertWritable(){if(this.error)throw this.error;if(!this.ready)throw Error('原资料仍在读取，请稍后再试');}
 read(){this.assertWritable();return copy(this.initial);}
 write(value){this.assertWritable();const next=copy(value);this.initial=copy(next);this.pending++;
  this.chain=this.chain.then(async()=>{this.assertWritable();const settings=await this.remote();const global=decode(settings.extension_settings?.variables?.global?.[KEY]),account=decode(settings.accountStorage?.[KEY]);if(global&&account&&canonical(global)!==canonical(account))throw Error('检测到两份不同的原资料，已停止写入，请先导出核对');const current=decode(this.kind==='global'?settings.extension_settings?.variables?.global?.[KEY]:settings.accountStorage?.[KEY]);if(canonical(current)!==canonical(this.confirmed))throw Error('原资料已在另一页面变化，本次保存停止；请保留本页草稿并重新读取');
   await this.backupOriginal();
   if(this.kind==='global'){const fn=this.helper('insertOrAssignVariables');if(!fn)throw Error('酒馆助手写入接口未就绪');await fn({[KEY]:next},{type:'global'});}
   else{const c=this.context();if(!c?.accountStorage)throw Error('酒馆账户存储接口未就绪');c.accountStorage.setItem(KEY,JSON.stringify(next));if(c.saveSettingsDebounced)c.saveSettingsDebounced();}
   let verified=false;for(let i=0;i<12;i++){if(i)await new Promise(resolve=>setTimeout(resolve,400));const saved=await this.remote();const check=decode(this.kind==='global'?saved.extension_settings?.variables?.global?.[KEY]:saved.accountStorage?.[KEY]);if(canonical(check)===canonical(next)){verified=true;break;}}
   if(!verified)throw Error('酒馆尚未确认保存，已暂停后续写入；请导出本页资料核对');this.confirmed=copy(next);window.AmeFishboard?.log('storage.write','confirmed');
  }).catch(e=>{this.error=e;window.AmeFishboard?.log('storage.write','failed',{message:e.message});window.dispatchEvent(new CustomEvent('fishboard-storage-error'));throw e;}).finally(()=>this.pending--);
  this.chain.catch(()=>{});
 }
 async backupOriginal(){
  if(this.backupChecked||!this.confirmed)return;
  const name='ame-fishboard-before11-v1.json',url='/user/files/'+name;
  const old=await fetch(url+'?t='+Date.now(),{cache:'no-store',signal:timeoutSignal(20000)});
  if(old.ok){const saved=await old.json();decode(saved.data);this.backupChecked=true;return;}
  if(old.status!==404)throw Error('升级前备份暂不可读，尚未覆盖原资料');
  const pack={plugin:'鲜虾鱼板面',version:'11.5',data:this.confirmed},bytes=new TextEncoder().encode(JSON.stringify(pack));let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const r=await fetch('/api/files/upload',{method:'POST',headers:this.context().getRequestHeaders(),signal:timeoutSignal(30000),body:JSON.stringify({name,data:btoa(binary)})});if(!r.ok)throw Error('升级前备份未保存，尚未覆盖原资料');
  const check=await fetch(url+'?t='+Date.now(),{cache:'no-store',signal:timeoutSignal(20000)});if(!check.ok||canonical((await check.json()).data)!==canonical(this.confirmed))throw Error('升级前备份核对失败，尚未覆盖原资料');this.backupChecked=true;
 }
 flush(){return this.chain;}
}
