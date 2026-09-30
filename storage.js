// V8.4: independent account records, using only SillyTavern's existing APIs.
export function createFishboardStore({native, localStorage, crypto, log=()=>{}}) {
    const domains=['styles','char','user','preferences','extras','personaTags','notes'];
    const clone=x=>JSON.parse(JSON.stringify(x));
    const key=domain=>'鲜虾鱼板面.v2.'+domain;
    const cache=new Map(),queues=new Map(),failed=new Map();let mode='tavern';
    const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const empty=domain=>domain==='personaTags'?{}:['styles','notes'].includes(domain)?[]:['char','user'].includes(domain)?{drafts:{},active:'',collections:{items:[],folders:[],tagColors:{}}}:domain==='preferences'?{retention:'off',schedule:'startup',dailyTime:'04:00',weeklyDay:'0',weeklyTime:'04:00',lastRun:0,launcherVisible:true}:{quotes:[],quoteGroups:[],settings:{randomCount:3}};
    function legacyDomain(data,domain){
        if(domain==='personaTags'){try{return JSON.parse(localStorage.getItem('鲜虾鱼板面.personaTags.v1')||'{}');}catch{return {};}}
        if(!data)return empty(domain);if(domain==='styles')return data.styles||[];
        if(['char','user'].includes(domain)){const active=data.mianmian?.active?.[domain]||'',draft=data.mianmian?.drafts?.[domain]?.[active];return {drafts:draft?{[active]:draft}:{},active:draft?active:'',collections:data.mianmian?.collections?.[domain]||empty(domain).collections};}
        if(domain==='extras')return {quotes:data.quotes||[],quoteGroups:data.quoteGroups||[],settings:Object.fromEntries(Object.entries(data.settings||{}).filter(([k])=>k!=='backupCleaner'))};
        return empty(domain); // Cleaner has no dependency on the old whole-data package.
    }
    function recordFrom(settings,domain){
        const raw=settings.accountStorage?.[key(domain)];if(raw){const r=JSON.parse(raw);if(!r||!Object.hasOwn(r,'value'))throw new Error('独立记录损坏：'+domain);return r;}
        if(domain==='preferences'){
            const rawPrefs=settings.accountStorage?.['ame-style-management-v05_backup_preferences_v1'];
            let old={};try{if(rawPrefs)old=JSON.parse(rawPrefs);else old=JSON.parse(localStorage.getItem('鲜虾鱼板面.panelLayout.v1')||'{}').backupCleaner||{};}catch{}
            return {revision:0,value:{...empty(domain),...old,launcherVisible:localStorage.getItem('鲜虾鱼板面.launcher.v1.visible')!=='false'},updated:0};
        }
        let data=settings.extension_settings?.variables?.global?.['鲜虾鱼板面.data.v1'];
        if(!data&&settings.accountStorage?.['鲜虾鱼板面.data.v1'])data=JSON.parse(settings.accountStorage['鲜虾鱼板面.data.v1']);
        return {revision:0,value:legacyDomain(data,domain),updated:0};
    }
    function get(domain){if(!cache.has(domain))throw new Error('数据尚未读取：'+domain);return clone(cache.get(domain).value);}
    async function read(names=domains,{refresh=false}={}) {
        await flush();const wanted=names.filter(name=>refresh||!cache.has(name));if(!wanted.length)return;
        const settings=await native.read();
        for(const name of wanted){const raw=mode==='browser'&&name!=='preferences'?localStorage.getItem(key(name)):null;cache.set(name,raw?JSON.parse(raw):recordFrom(settings,name));}
    }
    async function changesFor(domain,old,next) {
        const changes=[];
        if(['styles','notes'].includes(domain)){
            const before=new Map(old.map(item=>[String(item.id),item])),after=new Map(next.map(item=>[String(item.id),item]));
            for(const id of new Set([...before.keys(),...after.keys()]))if(JSON.stringify(before.get(id)||null)!==JSON.stringify(after.get(id)||null))changes.push({id,base:await hash(before.get(id)||null),...(after.has(id)?{value:after.get(id)}:{remove:true})});
        }else for(const name of new Set([...Object.keys(old),...Object.keys(next)]))if(JSON.stringify(old[name]??null)!==JSON.stringify(next[name]??null))changes.push({name,base:await hash(old[name]??null),...(Object.hasOwn(next,name)?{value:next[name]}:{remove:true})});
        return changes;
    }
    async function apply(domain,current,changes){
        if(['styles','notes'].includes(domain)){const map=new Map(current.map(item=>[String(item.id),item]));for(const change of changes){if(JSON.stringify(map.get(change.id)||null)===JSON.stringify(change.remove?null:change.value))continue;if(await hash(map.get(change.id)||null)!==change.base)throw new Error('另一设备已修改同一条内容，未覆盖；当前编辑仍保留');if(change.remove)map.delete(change.id);else map.set(change.id,clone(change.value));}return [...map.values()];}
        const next=clone(current);for(const change of changes){if(JSON.stringify(next[change.name]??null)===JSON.stringify(change.remove?null:change.value))continue;if(await hash(next[change.name]??null)!==change.base)throw new Error('另一设备已修改同一记录，未覆盖；当前编辑仍保留');if(change.remove)delete next[change.name];else next[change.name]=clone(change.value);}return next;
    }
    let writeQueue=Promise.resolve();
    function set(domain,value){
        if(!cache.has(domain))throw new Error('尚未读取，拒绝覆盖：'+domain);
        if(failed.has(domain))return Promise.reject(new Error('该记录上次未保存，重新打开会重试；未覆盖酒馆数据'));
        const previous=get(domain),next=clone(value);if(JSON.stringify(previous)===JSON.stringify(next))return Promise.resolve();
        const sequence=(cache.get(domain).sequence||0)+1;cache.set(domain,{...cache.get(domain),value:next,sequence});
        const execute=async()=>{
            const changes=await changesFor(domain,previous,next);
            const settings=await native.read(),record=mode==='browser'&&domain!=='preferences'&&localStorage.getItem(key(domain))?JSON.parse(localStorage.getItem(key(domain))):recordFrom(settings,domain);
            const saved={revision:record.revision+1,value:await apply(domain,record.value,changes),updated:Date.now()};
            if(mode==='browser'&&domain!=='preferences'){const encoded=JSON.stringify(saved);localStorage.setItem(key(domain),encoded);if(localStorage.getItem(key(domain))!==encoded)throw new Error('浏览器保存校验失败');}
            else await native.commit(settings,{[key(domain)]:JSON.stringify(saved)},domain);
            if(cache.get(domain).sequence===sequence)cache.set(domain,{...saved,sequence});log('storage',domain,'committed',{revision:saved.revision});failed.delete(domain);localStorage.removeItem('鲜虾鱼板面.unsaved.v84.'+domain);
        };
        const task=writeQueue.then(execute).catch(error=>{failed.set(domain,execute);try{localStorage.setItem('鲜虾鱼板面.unsaved.v84.'+domain,JSON.stringify({previous,next,time:Date.now()}));}catch{}throw error;});
        writeQueue=task.catch(()=>{});queues.set(domain,task);return task;
    }
    async function flush(){await writeQueue;for(const execute of [...failed.values()])await execute();}
    async function replace(values){
        await writeQueue;const settings=await native.read();const records={},updates={};
        for(const [domain,value] of Object.entries(values)){const current=recordFrom(settings,domain);records[domain]={revision:current.revision+1,value:clone(value),updated:Date.now()};updates[key(domain)]=JSON.stringify(records[domain]);}
        if(mode==='browser'){for(const [k,v] of Object.entries(updates))localStorage.setItem(k,v);}else await native.commit(settings,updates,'import');
        for(const [name,record] of Object.entries(records)){cache.set(name,record);failed.delete(name);localStorage.removeItem('鲜虾鱼板面.unsaved.v84.'+name);}
    }
    async function switchMode(next){await flush();const values=Object.fromEntries([...cache].filter(([name])=>name!=='preferences').map(([name,record])=>[name,clone(record.value)]));const old=mode;mode=next;try{await replace(values);}catch(error){mode=old;throw error;}}
    async function initializePreferences(){
        for(const domain of ['preferences','personaTags']){
            if(!cache.has(domain))continue;
            const settings=await native.read(),record=recordFrom(settings,domain);
            if(record.revision>0){cache.set(domain,record);continue;}
            const saved={revision:1,value:get(domain),updated:Date.now()};
            await native.commit(settings,{[key(domain)]:JSON.stringify(saved)},domain);cache.set(domain,saved);
        }
    }
    function reset(){cache.clear();queues.clear();failed.clear();writeQueue=Promise.resolve();}
    return {read,get,set,flush,replace,switchMode,reset,initializePreferences,setMode:value=>{mode=value;},has:name=>cache.has(name)};
}
