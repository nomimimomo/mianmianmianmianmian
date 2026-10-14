import {timeoutSignal} from '../compat.js?v=11.6';
import {uid, clone, digest} from './core.js?v=11.6';
export const emptyLibrary=()=>({schema:1,revision:null,items:[]});
const valid=x=>{if(!x||x.schema!==1||!Array.isArray(x.items)||x.items.some(r=>!r.id||!['book','excerpt'].includes(r.kind)))throw Error('书架数据格式不正确，未覆盖');return x;};
export const excerptLines=text=>String(text).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/).map(s=>s.trim()).filter(Boolean);
export const exportExcerpts=rows=>rows.map(r=>String(r.text||'').replace(/[\r\n]+/g,' ').trim()).filter(Boolean).join('\n');
export class BrowserLibrary {
 constructor(scope){this.scope=scope;}
 async open(){if(this.db)return this.db;this.db=await new Promise((ok,no)=>{const r=indexedDB.open('ame-shrimp-reading-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('libraries');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});return this.db;}
 async read(){const db=await this.open();return new Promise((ok,no)=>{const r=db.transaction('libraries').objectStore('libraries').get(this.scope);r.onsuccess=()=>ok(valid(r.result||emptyLibrary()));r.onerror=()=>no(r.error);});}
 async write(data,expected){const db=await this.open();return new Promise((ok,no)=>{const tx=db.transaction('libraries','readwrite'),s=tx.objectStore('libraries'),r=s.get(this.scope);let conflict=false;r.onsuccess=()=>{if((r.result?.revision??null)!==expected){conflict=true;tx.abort();return;}s.put(data,this.scope);};tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);tx.onabort=()=>no(Error(conflict?'其他页面修改了书架，请刷新书架后重试':'浏览器保存失败，可能空间不足'));});}
}
export class TavernLibrary {
 constructor(headers){this.headers=headers;this.path='/user/files/ame-fishboard-reading-v1.json';}
 async read(){let r=await fetch(this.path+'?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:timeoutSignal(20000)});if(r.status===404)r=await fetch('/user/files/ame-shrimp-reading-v1.json?t='+Date.now(),{cache:'no-store',signal:timeoutSignal(20000)});if(r.status===404)return emptyLibrary();if(!r.ok)throw Error('酒馆书架读取失败：'+r.status);return valid(await r.json());}
 async write(data,expected){if((await this.read()).revision!==expected)throw Error('其他设备修改了书架，请刷新书架后重试');const bytes=new TextEncoder().encode(JSON.stringify(data));if(bytes.length>25*1024*1024)throw Error('酒馆书架超过 25MB，请将部分书移到浏览器');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const r=await fetch('/api/files/upload',{method:'POST',signal:timeoutSignal(30000),headers:this.headers(),body:JSON.stringify({name:'ame-fishboard-reading-v1.json',data:btoa(binary)})});if(!r.ok)throw Error('酒馆书架保存失败：'+r.status);}
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
