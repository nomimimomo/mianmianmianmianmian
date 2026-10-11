import {diagnostics} from './diagnostics.js?v=10.8';
import {uid, clone, digest} from './core.js?v=10.8';
export const emptyLibrary=()=>({schema:1,revision:null,items:[]});
const valid=x=>{if(!x||x.schema!==1||!Array.isArray(x.items)||x.items.some(r=>!r.id||!['book','excerpt'].includes(r.kind)))throw Error('书架数据格式不正确，未覆盖');return x;};
export const excerptLines=text=>String(text).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/).map(s=>s.trim()).filter(Boolean);
export const exportExcerpts=rows=>rows.map(r=>String(r.text||'').replace(/[\r\n]+/g,' ').trim()).filter(Boolean).join('\n');
export class BrowserLibrary {
 constructor(scope){this.scope=scope;}
 async open(){if(this.db)return this.db;this.db=await new Promise((ok,no)=>{const r=indexedDB.open('ame-fishboard-reading-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('libraries');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});return this.db;}
 async read(){const db=await this.open();let data=await new Promise((ok,no)=>{const r=db.transaction('libraries').objectStore('libraries').get(this.scope);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});if(data)return valid(data);
 const old=await new Promise((ok,no)=>{const request=indexedDB.open('ame-shrimp-reading-v1');request.onsuccess=()=>{const legacy=request.result;if(!legacy.objectStoreNames.contains('libraries')){legacy.close();ok(null);return;}const r=legacy.transaction('libraries').objectStore('libraries').get(this.scope);r.onsuccess=()=>{ok(r.result);legacy.close();};r.onerror=()=>{no(r.error);legacy.close();};};request.onerror=()=>no(request.error);});
 if(!old)return emptyLibrary();valid(old);await this.write(old,null);diagnostics.log('reading.migrated',{count:old.items.length,mode:'browser'});return old;
 }

 async write(data,expected){const db=await this.open();return new Promise((ok,no)=>{const tx=db.transaction('libraries','readwrite'),s=tx.objectStore('libraries'),r=s.get(this.scope);let conflict=false;r.onsuccess=()=>{if((r.result?.revision??null)!==expected){conflict=true;tx.abort();return;}s.put(data,this.scope);};tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);tx.onabort=()=>no(Error(conflict?'其他页面修改了书架，请刷新书架后重试':'浏览器保存失败，可能空间不足'));});}
}
export class TavernLibrary {
 constructor(headers){this.headers=headers;}
 async read(){const host=await window.AmeFishboard.readShelf();if(host)return valid(host);if(!window.AmeFishboard.mayReadLegacyShelf())return emptyLibrary();const r=await fetch('/user/files/ame-shrimp-reading-v1.json?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30000)});if(r.status===404)return emptyLibrary();if(!r.ok)throw Error('旧书架读取失败，未创建空书架');const legacy=valid(await r.json());diagnostics.log('reading.legacy_read',{count:legacy.items.length});return legacy;}
 async write(data,expected){valid(data);if((await this.read()).revision!==expected)throw Error('书架已变化，请重新读取');await window.AmeFishboard.saveShelf(data,expected);diagnostics.log('reading.saved',{count:data.items.length,mode:'tavern'});}
}
export class ReadingRepository {
 constructor(local,remote){this.adapters={browser:local,tavern:remote};this.data={};this.chain=Promise.resolve();}
 async load(){for(const place of ['browser','tavern'])this.data[place]=await this.adapters[place].read();}
 rows(kind){return Object.entries(this.data).flatMap(([place,d])=>d.items.filter(r=>r.kind===kind).map(r=>({...clone(r),place})));}
 get(place,id){return this.data[place]?.items.find(r=>r.id===id);}
 run(fn){const task=()=>navigator.locks?navigator.locks.request('shrimp-reading-write',fn):fn();const p=this.chain.catch(()=>{}).then(task);this.chain=p;return p;}
 async commit(place,items){const before=this.data[place],next={schema:1,revision:uid(),items:clone(items)};await this.adapters[place].write(next,before.revision);const check=await this.adapters[place].read();if(JSON.stringify(check)!==JSON.stringify(next))throw Error('保存核对失败，原位置保留；请刷新书架检查');this.data[place]=check;}
 put(place,row){return this.run(async()=>{const clean=clone(row);delete clean.place;const items=clone(this.data[place].items),i=items.findIndex(r=>r.id===clean.id);if(i<0)items.push(clean);else items[i]=clean;await this.commit(place,items);});}
 remove(place,ids){return this.run(()=>this.commit(place,this.data[place].items.filter(r=>!ids.includes(r.id))));}
 move(from,to,id){return this.run(async()=>{if(from===to)return;const source=this.get(from,id);if(!source)throw Error('原记录已不存在，请刷新书架');const existing=this.get(to,id);if(existing&&JSON.stringify(existing)!==JSON.stringify(source))throw Error('目标有不同版本的记录，未覆盖；请分别检查两份内容');if(!existing)await this.commit(to,[...this.data[to].items,clone(source)]);else {const actual=await this.adapters[to].read();if(JSON.stringify(actual.items.find(r=>r.id===id))!==JSON.stringify(source))throw Error('目标记录已变化，原件保留');}await this.commit(from,this.data[from].items.filter(r=>r.id!==id));});}
}
export async function bookFromFile(file){if(file.size>12*1024*1024)throw Error('单本暂限 12MB');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const content=btoa(binary);return {id:uid(),kind:'book',title:file.name.replace(/\.[^.]+$/,''),filename:file.name,mime:file.type||'application/octet-stream',content,hash:await digest(content),size:file.size,group:'',createdAt:Date.now(),progress:0,annotations:[]};}
