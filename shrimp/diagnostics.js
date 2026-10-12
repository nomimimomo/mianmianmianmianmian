import {VERSION} from './core.js?v=11.1';
export function errorReason(e) {
 const message=String(e?.message||'');
 for(const [pattern,code] of [[/酒馆正在生成/,'tavern_busy'],[/鲜虾正在生成/,'shrimp_busy'],[/冲突|其他页面|其他设备/,'storage_conflict'],[/超时|abort/i,'timeout'],[/fetch|network/i,'network'],[/JSON|格式|没有返回文本/,'response_format'],[/预设|Prompt/,'preset'],[/切换|已变化|已改变/,'context_changed'],[/保存|读取/,'storage'],[/API|模型|地址/,'api_configuration']]) if(pattern.test(message))return code;
 return 'unclassified';
}
// Metadata only. Never pass prompts, message text, keys, URLs or API bodies here.
const KEY = '鲜虾鱼板面.social.diagnostics.v1';
export class Diagnostics {
    constructor(storage) {
        this.storage = storage; this.rows = []; this.sequence = 0; this.active = new Map(); this.persistence = true;
        try { const rows = JSON.parse(storage?.getItem(KEY) || '[]'); if (Array.isArray(rows)) this.rows = rows.slice(-500).filter(r => r && typeof r.event === 'string'); } catch { this.persistence = false; }
    }
    log(event, data = {}) {
        const safe = {};
        // Strict allowlist intentionally excludes arbitrary exception messages.
        for (const key of ['id','operation','elapsed','mainBusy','generatorBusy','sending','refreshing','blocked','loaded','count','characters','status','mode','dryRun','errorType','reason','stage','floor','loreCount','sourceCount','cardCount','memberCount','shape','finishReason','reasoningCharacters','position','row','bodyType','authorType']) {
            const v = data[key]; if (typeof v === 'boolean' || typeof v === 'number') safe[key] = v;
            else if (typeof v === 'string') safe[key] = v.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0,80);
        }
        if(typeof data.shapePreview==='string') safe.shapePreview=data.shapePreview.replace(/[^{}\[\]:,"\s x]/g,'x').slice(0,600);
        window.AmeFishboard?.logShrimp?.(event,safe);
        this.rows.push({ time: new Date().toISOString(), event, ...safe }); this.rows = this.rows.slice(-500);
        try { this.storage?.setItem(KEY, JSON.stringify(this.rows)); } catch { this.persistence = false; }
    }
    apiError(status, detail) {
        this.rows.push({time:new Date().toISOString(),event:'request.error',status,detail});this.rows=this.rows.slice(-500);
        try{this.storage?.setItem(KEY,JSON.stringify(this.rows));}catch{this.persistence=false;}
    }
    async run(operation, task, state = () => ({})) {
        const id = `${Date.now()}-${++this.sequence}`, start = Date.now();
        this.active.set(id, { operation, start }); this.log('start', { id, operation, ...state() });
        const timer = setInterval(() => this.log('waiting', { id, operation, elapsed: Date.now()-start, ...state() }), 15000);
        try { const result = await task(); this.log('success', { id, operation, elapsed: Date.now()-start, ...state() }); return result; }
        catch (e) { this.log('failure', { id, operation, elapsed: Date.now()-start, errorType: e?.name || 'Error', reason: errorReason(e), stage:e?.stage, position:e?.position, row:e?.row, bodyType:e?.bodyType, authorType:e?.authorType, ...state() }); throw e; }
        finally { clearInterval(timer); this.active.delete(id); this.log('finished', { id, operation, ...state() }); }
    }
    report(state = {}) { return JSON.stringify({ version:VERSION, persistence:this.persistence, state, active:[...this.active].map(([id,x])=>({id,operation:x.operation,elapsed:Date.now()-x.start})), events:this.rows },null,2); }
}
let storage; try { storage = globalThis.localStorage; } catch {}
export const diagnostics = new Diagnostics(storage);
export function instrument(target, names, state = () => ({})) {
    for (const name of names) { const original = target[name]; if(typeof original !== 'function') continue;
        target[name] = function(...args) { return diagnostics.run(name, () => original.apply(this,args), () => state(this)); };
    }
}
