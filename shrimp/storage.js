import {captureScope} from './ecosystem.js?v=11.3';
import {timeoutSignal} from '../compat.js?v=11.3';
import { instrument } from './diagnostics.js?v=11.3';
import { upgradeFeatures } from './features.js?v=11.3';
import { freshState, validateState, uid } from './core.js?v=11.3';
const PATH = '/user/files/ame-fishboard-social-v1.json';
export class Store {
    constructor(ctx, status) { this.ctx = ctx; this.status = status; this.revision = null; this.state = null; this.chain = Promise.resolve(); this.blocked = false; }
    async read() {
        const r = await fetch(`${PATH}?t=${Date.now()}`, { signal:timeoutSignal(20000), cache: 'no-store', credentials: 'same-origin' });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`读取鲜虾数据失败（${r.status}）`);
        const x = await r.json();
        if (!x.revision || !x.data) throw new Error('鲜虾数据损坏，已停止自动保存，请先导出或恢复备份');
        validateState(x.data); return x;
    }
    async load() { let x = await this.read(); const revision=x?.revision??null;
        if(!x){const inherited=window.AmeFishboard?.getData()?.shrimp;if(inherited){validateState(inherited);x={data:inherited};}}
        if(!x){const r=await fetch('/user/files/ame-shrimp-v1.json',{cache:'no-store',signal:timeoutSignal(20000)});if(r.ok){x=await r.json();validateState(x.data);}else if(r.status!==404)throw Error('旧聊天资料暂未读到，未创建空白聊天');}
         this.state = upgradeFeatures(x ? validateState(x.data) : freshState()); this.revision = revision; this.blocked = false; return this.state; }
    save() {
        if (!this.state) return Promise.reject(new Error('数据尚未读完'));
        const task = async () => {
            if (this.blocked) throw new Error('保存已暂停，请导出当前数据后重新加载，避免覆盖另一处修改');
            const run = async () => {
                const remote = await this.read();
                if ((remote?.revision ?? null) !== this.revision) { this.blocked = true; throw new Error('其他页面或设备已修改鲜虾数据。当前草稿仍在，请先导出，再重新加载'); }
                captureScope(this.state);const revision = uid(), payload = JSON.stringify({ revision, data: this.state });
                if (new Blob([payload]).size > 25 * 1024 * 1024) throw new Error('鲜虾数据超过 25MB，请导出备份并清理信息流或压缩头像后重试');
                const bytes = new TextEncoder().encode(payload); let binary = '';
                for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                const r = await fetch('/api/files/upload', { method: 'POST', signal:timeoutSignal(20000), headers: this.ctx().getRequestHeaders(), body: JSON.stringify({ name: 'ame-fishboard-social-v1.json', data: btoa(binary) }) });
                if (!r.ok) throw new Error(`保存失败（${r.status}），当前内容仍在，可重试或导出`);
                this.revision = revision;
                const check = await this.read();
                if (check?.revision !== revision) { this.blocked = true; throw new Error('保存核对失败，可能有其他设备同时写入，请导出当前内容'); }
                this.status('已保存到酒馆');
            };
            if (navigator.locks) await navigator.locks.request('ame-fishboard-social-v1-save', run); else await run();
        };
        this.status('保存中…');
        this.chain = this.chain.catch(() => {}).then(task).catch(e => { this.status(e.message, true); throw e; });
        return this.chain;
    }
}

instrument(Store.prototype, ['read','load','save'], s => ({blocked:s.blocked,loaded:!!s.state}));
