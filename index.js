'use strict';

(function () {
    const AWM_SCRIPT_URL = document.currentScript?.src || '';
    const ID = 'ame-style-management-v05';
    const PANEL_ID = 'awm-panel-v03';
    const STYLE_ID = 'awm-style-v05';

    let root = document;
    let hostWindow = window;

    try {
        if (window.parent && window.parent.document) {
            root = window.parent.document;
            hostWindow = window.parent;
        }
    } catch (_) {}

    const DEFAULT = {
        styles: [],
        quotes: [],
        quoteGroups: [],
        settings: { randomCount: 3 },
        mianmian: { drafts: { char: {}, user: {} }, active: { char: '', user: '' } }
    };

    // 数据存储：使用酒馆助手的全局变量。
    // 这是酒馆服务器端的持久数据，不属于世界书，也不会自动进入上下文。
    // 变量名只作为本插件的数据容器，不参与任何提示词注入。
    const TAVERN_DATA_KEY = '鲜虾鱼板面.data.v1';
    const mmHelper=()=>hostWindow.TavernHelper||globalThis.TavernHelper;
    const mmHelperFn=name=>typeof hostWindow[name]==='function'?hostWindow[name]
        :typeof globalThis[name]==='function'?globalThis[name]
        :typeof mmHelper()?.[name]==='function'?mmHelper()[name].bind(mmHelper()):null;
    let tavernDataReady = false;
    let runtimeData = null;

    const clone = x => JSON.parse(JSON.stringify(x));

    function unique(arr) {
        return [...new Set((arr || []).map(x => String(x || '').trim()).filter(Boolean))];
    }

    function mmParseTags(value) {
        const values=Array.isArray(value)?value:[value];
        return [...new Set(values.flatMap(x=>String(x||'').split(/[、,，\r\n]+/)).map(x=>x.trim()
            .replace(/^["'“”‘’]+|["'“”‘’]+$/g,'').trim()
            .replace(/^[-*•]\s*/, '').trim().replace(/\s+/g,' ')).filter(Boolean))];
    }
    function normalizeStyle(s) {
        const name = String(s?.name || '').trim();
        const content = String(s?.content || '');
        const oldGroup = String(s?.group || '').trim();
        const tags = mmParseTags(s?.tags || []);
        if (oldGroup) tags.push(...oldGroup.split(/[,，、\s]+/));
        return {
            id: s?.id || uid('style'),
            name,
            author: String(s?.author || ''),
            note: String(s?.note || ''),
            tags: unique(tags),
            content
        };
    }

    function normalizeData(x) {
        return {
            styles: Array.isArray(x?.styles) ? x.styles.map(normalizeStyle) : [],
            quotes: Array.isArray(x?.quotes) ? x.quotes : [],
            quoteGroups: Array.isArray(x?.quoteGroups) ? x.quoteGroups : [],
            settings: Object.assign({}, DEFAULT.settings, x?.settings || {}),
            mianmian: x?.mianmian || clone(DEFAULT.mianmian)
        };
    }

    function loadLocalData() {
        try {
            const raw = mmRetiredLocal(ID) ? null : hostWindow.localStorage.getItem(ID);
            const legacyRaw = raw || (mmRetiredLocal('ame-style-management-v03') ? null : hostWindow.localStorage.getItem('ame-style-management-v03'));
            return legacyRaw ? normalizeData(JSON.parse(legacyRaw)) : clone(DEFAULT);
        } catch (_) { return clone(DEFAULT); }
    }

    function canUseTavernStorage() {
        return (!!mmHelperFn('getVariables') && !!mmHelperFn('insertOrAssignVariables')) ||
            !!hostWindow.SillyTavern?.getContext?.()?.accountStorage;
    }

    function readTavernData() {
        if (!canUseTavernStorage()) return null;
        try {
            const stored = mmHelperFn('getVariables') && mmHelperFn('insertOrAssignVariables')
                ? mmHelperFn('getVariables')({ type: 'global' })?.[TAVERN_DATA_KEY]
                : JSON.parse(hostWindow.SillyTavern.getContext().accountStorage.getItem(TAVERN_DATA_KEY) || 'null');
            return stored && typeof stored === 'object' ? normalizeData(stored) : null;
        } catch (err) {
            console.error('[鲜虾鱼板面] 读取酒馆数据失败', err);
            return null;
        }
    }

    function writeTavernData(data) {
        if (!canUseTavernStorage()) return false;
        if(mmHelperFn('insertOrAssignVariables'))
            mmHelperFn('insertOrAssignVariables')({ [TAVERN_DATA_KEY]: clone(data) }, { type: 'global' });
        else hostWindow.SillyTavern.getContext().accountStorage.setItem(TAVERN_DATA_KEY,JSON.stringify(data));
        return true;
    }

    function clearTavernData() {
        if (!canUseTavernStorage()) return false;
        try {
            if (!mmHelperFn('getVariables') || !mmHelperFn('insertOrAssignVariables')) hostWindow.SillyTavern.getContext().accountStorage.removeItem(TAVERN_DATA_KEY);
            else if (mmHelperFn('deleteVariable')) mmHelperFn('deleteVariable')(TAVERN_DATA_KEY, { type: 'global' });
            else {
                const vars = mmHelperFn('getVariables')({ type: 'global' });
                delete vars[TAVERN_DATA_KEY];
                mmHelperFn('replaceVariables')(vars, { type: 'global' });
            }
            return true;
        } catch (err) {
            console.error('[鲜虾鱼板面] 删除酒馆数据失败', err);
            return false;
        }
    }

    function hydrateTavernData() {
        if (tavernDataReady) return;
        const stored = mmReadSelected();
        if (stored) {
            runtimeData = stored;
            tavernDataReady = true;
            return;
        }
        const local = loadLocalData();
        runtimeData = local;
        if (mmStorageMode() === 'browser' || canUseTavernStorage()) {
            try {
                mmWriteData(local);
                tavernDataReady = true;
                if (local.styles.length || local.quotes.length) toast('已将原有数据保存到酒馆', 'success');
            } catch (err) {
                console.error('[鲜虾鱼板面] 首次保存酒馆数据失败', err);
                toast('酒馆数据保存失败，暂时使用浏览器数据', 'warning');
            }
        } else {
            toast('当前酒馆助手没有提供持久化变量接口，暂时使用浏览器数据', 'warning');
        }
    }

    function load() {
        if (!tavernDataReady) hydrateTavernData();
        return runtimeData || loadLocalData();
    }

    function saveLocalData(data) {
        try { hostWindow.localStorage.setItem(ID, JSON.stringify(clone(data))); } catch (_) {}
    }

    function save(data) {
        mmWriteData(data);
    }

    // 文风列表的折叠状态单独保存，不混进文风数据本身。
    // 这样编辑/保存后重新渲染文风页时，可以恢复文件夹和单个文风的展开状态。
    const UI_STATE_KEY = ID + '_ui_state_v1';
    let styleUIState = { folders: {}, styles: {} };

    function loadUIState() {
        try {
            const raw = hostWindow.localStorage.getItem(UI_STATE_KEY);
            if (!raw) return { folders: {}, styles: {} };
            const x = JSON.parse(raw);
            return {
                folders: x && x.folders && typeof x.folders === 'object' ? x.folders : {},
                styles: x && x.styles && typeof x.styles === 'object' ? x.styles : {}
            };
        } catch (_) {
            return { folders: {}, styles: {} };
        }
    }

    function saveUIState() {
        try {
            if(tavernDataReady&&Array.isArray(runtimeData?.styles)){
                const ids=new Set(runtimeData.styles.map(item=>String(item.id))),authors=new Set(runtimeData.styles.map(item=>item.author||'未署名'));
                for(const id of Object.keys(styleUIState.styles))if(!ids.has(id))delete styleUIState.styles[id];
                for(const author of Object.keys(styleUIState.folders))if(!authors.has(author))delete styleUIState.folders[author];
            }
            const encoded=JSON.stringify(styleUIState);
            if(hostWindow.localStorage.getItem(UI_STATE_KEY)!==encoded)hostWindow.localStorage.setItem(UI_STATE_KEY,encoded);
        } catch (_) {}
    }

    styleUIState = loadUIState();

    function uid(prefix) {
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function esc(v) {
        const el = root.createElement('div');
        el.textContent = String(v ?? '');
        return el.innerHTML;
    }

    let mmLastToast={message:'',type:'',time:0};
    function toast(msg, type = 'info') {
        const now=Date.now();if(mmLastToast.message===msg&&mmLastToast.type===type&&now-mmLastToast.time<8000)return;
        mmLastToast={message:msg,type,time:now};
        try {
            if (hostWindow.toastr?.[type]) {
                hostWindow.toastr[type](msg);
                return;
            }
        } catch (_) {}
        console.log('[文风管理]', msg);
    }

    // ============================================================
    // 4. CSS / 主题样式
    // ============================================================
    function addStyle() {
        if (root.getElementById(STYLE_ID)) return;
        const s = root.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
#awm-panel-v03{display:none;position:fixed;z-index:99999;left:0;top:0;width:min(680px,calc(100vw - 24px));height:min(680px,calc(100dvh - 32px));background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor);border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,10px);box-shadow:0 10px 35px rgba(0,0,0,.35);overflow:hidden;font-family:var(--mainFontFamily);font-size:var(--mainFontSize)}
#awm-panel-v03 *{box-sizing:border-box}
.awm-head{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--SmartThemeBorderColor);cursor:default;user-select:none}
.awm-title{font-weight:700;font-size:1.05em}
.awm-head button,.awm-tab,.awm-btn{box-sizing:border-box;border:1px solid var(--SmartThemeBorderColor);background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor);border-radius:var(--mainBorderRadius,7px);padding:6px 10px;cursor:pointer;font:inherit;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;min-height:34px}.awm-toolbar>.awm-btn,.awm-toolbar>.awm-import{height:34px;min-height:34px;padding:0 10px;line-height:1.2;display:inline-flex;align-items:center;justify-content:center}
.awm-head button:hover,.awm-tab:hover,.awm-btn:hover{background:var(--SmartThemeQuoteColor)}
.awm-tabs{display:flex;gap:3px;padding:5px 7px;border-bottom:1px solid var(--SmartThemeBorderColor)}
.awm-tab{border-color:transparent;background:transparent}.awm-tab.active{background:var(--SmartThemeQuoteColor);border-color:var(--SmartThemeBorderColor)}
.awm-main{height:calc(100% - 96px);overflow:hidden;padding:9px;display:flex;flex-direction:column;min-height:0}
.awm-editor-top{display:flex;align-items:center;gap:6px;flex:0 0 auto;margin-bottom:6px}.awm-style-name{flex:1;min-width:0}.awm-style-editor .awm-style-content{flex:1 1 auto;min-height:0;height:auto;margin-top:5px}.awm-count-line{flex:0 0 auto;text-align:left;padding-top:3px;font-size:.85em;opacity:.68}.awm-import-picker{max-width:190px;min-width:100px}.awm-tag-editor{display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-height:34px;padding:4px 6px;border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,7px);background:var(--SmartThemeBlurTintColor)}.awm-tag-editor-input{flex:1 1 120px;min-width:90px;border:0;outline:0;background:transparent;color:var(--SmartThemeBodyColor);font:inherit;font-size:.78em;padding:3px 2px}.awm-tag-x{border:0;background:transparent;color:inherit;cursor:pointer;padding:0 2px}
.awm-toolbar{display:flex;gap:5px;margin-bottom:7px;flex-wrap:nowrap}
.awm-style-note{flex:0 0 auto!important;display:flex;flex-direction:column;gap:4px;min-height:0}
.awm-style-note label{font-size:13px}
.awm-style-note textarea{height:85px;min-height:75px;max-height:min(24vh,200px);resize:vertical}
.awm-folder>summary{display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;list-style:none}
.awm-folder>summary::-webkit-details-marker{display:none}
.awm-folder>summary::marker{content:''}
.awm-folder-fold{flex:0 0 14px;width:14px;text-align:center;font-size:14px;line-height:1}
.awm-folder-fold::before{content:'▸'}
.awm-folder[open] .awm-folder-fold::before{content:'▾'}
.awm-folder>summary .style-group-select{flex:none;margin:0}
.awm-folder-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.awm-folder>summary .awm-meta{flex:none}
.awm-input,.awm-select,.awm-area{background:var(--black70a);color:var(--SmartThemeBodyColor);border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,7px);padding:8px;font-family:inherit}
.awm-input{flex:1;min-width:0}.awm-area{width:100%;min-height:0;resize:none;white-space:pre-wrap;line-height:1.6}
.awm-card{border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,9px);padding:7px;margin-bottom:5px;background:var(--black30a)}
.awm-meta{opacity:.65;font-size:.85em}.awm-note{opacity:.7;margin-left:10px}.awm-count{opacity:.55;font-size:.8em;margin-left:8px;flex-shrink:0}.awm-card-actions{display:flex;align-items:center;gap:5px;margin-left:auto;flex-shrink:0}.awm-copy{margin-left:0}.awm-actions{display:flex;gap:6px;margin-top:7px}.awm-empty{text-align:center;opacity:.5;padding:40px 10px}
.awm-form{display:grid;gap:10px}.awm-form > .awm-input{flex:0 0 auto}.awm-form > div:last-child{flex:1 1 0;min-height:0}.awm-label{font-size:.85em;opacity:.75}
.awm-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--SmartThemeBorderColor);border-radius:999px;padding:4px 8px;margin:3px}
.awm-list{flex:1 1 auto;min-height:0;max-height:none;overflow:auto}.awm-quote-row{padding:8px;border-bottom:1px solid var(--SmartThemeBorderColor)}
.awm-quote-row label{display:flex;gap:8px;align-items:flex-start}
.awm-details summary{cursor:pointer;list-style:none}.awm-details summary::-webkit-details-marker{display:none}
.awm-details summary:before{content:"›";display:inline-block;margin-right:7px;transition:transform .15s ease}.awm-details[open] summary:before{transform:rotate(90deg)}

.awm-tag[data-tag="cot" i],.awm-tag[data-list-tag="cot" i],.awm-tag[data-batch-tag="cot" i],.awm-tag[data-suggest-tag="cot" i],.awm-tag[data-filter-tag="cot" i]{background:#eee5f6!important;color:#674780!important;border-color:#c6afd7!important}.awm-tag.active[data-filter-tag="cot" i],.awm-tag.active[data-batch-tag="cot" i]{background:#d9c6e9!important;color:#4e3268!important}
.awm-note{margin-left:8px;opacity:.62;font-weight:400}.awm-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}.awm-tags-row{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 0 28px}.awm-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border:1px solid var(--SmartThemeBorderColor);border-radius:999px;font-size:.78em;opacity:.82;cursor:pointer}.awm-tag:hover{background:var(--SmartThemeQuoteColor);opacity:1}.awm-tag.active{background:var(--SmartThemeQuoteColor);opacity:1;border-color:var(--SmartThemeBodyColor)}.awm-tag-x{border:0;background:transparent;color:inherit;padding:0;cursor:pointer;font-size:1em;line-height:1}.awm-tag-filter-wrap{display:flex;flex-direction:column;gap:4px;margin:0 0 7px;flex:0 0 auto}.awm-tag-filter{display:flex;flex-wrap:wrap;gap:5px;min-width:0}.awm-tag-filter:empty{display:none}.awm-tag-suggestions{display:flex;flex-wrap:wrap;gap:5px;padding:3px 0;max-height:90px;overflow:auto}.awm-tag-suggestions .awm-tag{margin:0}.awm-tag-editor{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:7px;border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,7px);background:var(--SmartThemeBlurTintColor)}.awm-tag-editor .awm-tag{margin:0}.awm-tag-editor input{border:0;outline:none;background:transparent;color:var(--SmartThemeBodyColor);font:inherit;font-size:.78em;min-width:110px;flex:1;padding:3px}.awm-hint{font-size:.78em;opacity:.55;margin-top:3px}.awm-switch{position:relative;display:inline-flex;align-items:center}.awm-switch input{position:absolute;opacity:0;pointer-events:none}.awm-switch span{display:block;width:38px;height:22px;border-radius:999px;background:var(--SmartThemeBorderColor);position:relative;cursor:pointer}.awm-switch span:after{content:'';position:absolute;width:18px;height:18px;left:2px;top:2px;border-radius:50%;background:var(--SmartThemeBodyColor);transition:transform .15s ease}.awm-switch input:checked+span{background:var(--SmartThemeQuoteColor)}.awm-switch input:checked+span:after{transform:translateX(16px)}.awm-check{width:16px;height:16px;flex:0 0 auto}.awm-folder{border-bottom:1px solid var(--SmartThemeBorderColor);margin-bottom:5px}.awm-folder>summary{cursor:pointer;padding:5px 2px;font-weight:700}.awm-batch{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:7px} .awm-batch-tools{display:flex;gap:5px;align-items:center;margin-left:auto}.awm-batch-pop-wrap{position:relative}.awm-batch-pop{position:absolute;right:0;top:calc(100% + 5px);z-index:20;min-width:230px;max-width:min(360px,80vw);padding:8px;background:var(--SmartThemeBlurTintColor);border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,9px);box-shadow:0 8px 25px rgba(0,0,0,.25)}.awm-batch-pop-list{display:flex;flex-wrap:wrap;gap:5px;max-height:180px;overflow:auto}.awm-batch-new{display:flex;gap:5px;margin-top:8px}.awm-batch-new .awm-input{min-width:0}.awm-batch-new .awm-btn{flex:0 0 auto}.awm-select-tags{display:flex;gap:5px;flex-wrap:wrap;max-height:80px;overflow:auto}
.awm-import{position:relative;overflow:hidden;white-space:nowrap}.awm-import input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
@media (max-width:600px){
#awm-panel-v03{width:min(620px,calc(100vw - 20px));height:min(620px,calc(100dvh - 28px));border-radius:8px}
.awm-head{padding:0 8px}
.awm-tab,.awm-btn,.awm-head button{padding:4px 6px;font-size:.86em}
.awm-main{padding:7px}
.awm-area{min-height:210px;max-height:none}
.awm-toolbar{gap:3px;margin-bottom:5px}.awm-toolbar>.awm-btn,.awm-toolbar>.awm-import{height:32px;min-height:32px;padding:0 9px}
.awm-card{padding:6px;margin-bottom:4px}
}
`;
        root.head.appendChild(s);
    }

    // ============================================================
    // 5. 面板外壳 / 打开 / 关闭 / 拖动 / 视口
    // ============================================================
    function makePanel() {
        if (root.getElementById(PANEL_ID)) return;

        const panel = root.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="awm-head">
                <div class="awm-title">🍥 鲜虾鱼板面</div>
                <div class="awm-head-nav"><div class="awm-tabs">
                    <button class="awm-tab active" data-page="mianmian" data-mm-side="char" title="Char" aria-label="Char">C</button>
                    <button class="awm-tab" data-page="mianmian" data-mm-side="user" title="User" aria-label="User">U</button>
                    <button class="awm-tab" data-page="styles">文风</button>
                    <button class="awm-tab" data-page="settings">设置</button>
                </div><button id="awmClose" type="button">×</button></div>
            </div>
            <div class="awm-main" id="awmMain"></div>
        `;
        // 优先挂到 <html> 而不是 <body>：部分前端在移动端窄屏下会给 <body>（或其外层包裹
        // 容器）加 transform/filter/perspective 来做抽屉滑动动画，这会让所有子元素的
        // position:fixed 变成"相对该祖先定位"而不是相对真实屏幕视口，导致百分比/vw/vh
        // 计算出来的居中位置整体偏移。挂到 <html> 上通常能避开这个坑。
        (root.documentElement || root.body).appendChild(panel);

        mmTrackPanelActions(panel);
        awmEnhanceStyleUI(panel);
        panel.querySelector('#awmClose').onclick = close;
        enableDrag();
        panel.querySelectorAll('[data-page]').forEach(b => {
            b.onclick = () => {
                if(mmWriteLocked()||!mmPageEnabled(b.dataset.page))return;
                if (b.dataset.mmSide) {
                    if (root.getElementById('awmMian')) mmSetActive(b.dataset.mmSide);
                    else { mmRuntime.active = b.dataset.mmSide; render(b.dataset.page); }
                } else render(b.dataset.page);
            };
        });
    }


    // 面板位置按设备独立保存于浏览器界面设置，与角色卡及草稿数据隔离。
    const AWM_LAYOUT_KEY = '鲜虾鱼板面.panelLayout.v1';
    function awmLayoutDevice() { return hostWindow.innerWidth <= 600 ? 'mobile' : 'desktop'; }
    function awmLayoutState() {
        try {
            const all = JSON.parse(hostWindow.SillyTavern?.getContext?.()?.accountStorage?.getItem?.(AWM_LAYOUT_KEY) || hostWindow.localStorage.getItem(AWM_LAYOUT_KEY) || '{}');
            const state = all[awmLayoutDevice()] || {};
            return { locked: !!state.locked, slot: [1, 2, 3].includes(+state.slot) ? +state.slot : 1, slots: state.slots || {}, current: state.current || null };
        } catch (_) { return { locked: false, slot: 1, slots: {} }; }
    }
    function awmLayoutWrite(state) {
        try {
            const all = JSON.parse(hostWindow.SillyTavern?.getContext?.()?.accountStorage?.getItem?.(AWM_LAYOUT_KEY) || hostWindow.localStorage.getItem(AWM_LAYOUT_KEY) || '{}');
            all[awmLayoutDevice()] = state;
            hostWindow.localStorage.setItem(AWM_LAYOUT_KEY, JSON.stringify(all));
            const ctx=hostWindow.SillyTavern?.getContext?.();
            if(ctx?.accountStorage?.setItem){ctx.accountStorage.setItem(AWM_LAYOUT_KEY,JSON.stringify(all));ctx.saveSettingsDebounced?.();}
        } catch (error) { toast('位置保存失败：' + error.message, 'error'); }
    }

    function mmFeatureSlot(key) {
        try { const value=JSON.parse(hostWindow.SillyTavern?.getContext?.()?.accountStorage?.getItem?.(AWM_LAYOUT_KEY+'.bindings')||'{}')[key];return [1,2,3].includes(+value)?+value:0; }catch{return 0;}
    }
    function mmFeaturePosition(key) {
        const state=awmLayoutState(),slot=mmFeatureSlot(key);
        return slot ? state.slots[slot]||null : null;
    }
    function mmFeatureLayoutBind(main) {
        for(const [id,key] of [['awmEditorEnabled','mianmian'],['awmStylesEnabled','styles'],['awmSearchEnabled','search'],['awmBackupEnabled','backup']]){
            const label=main.querySelector('#'+id)?.closest('label');if(!label)continue;
            const row=root.createElement('div');row.className='awm-feature-position-row';label.before(row);row.append(label);
            const select=root.createElement('select');select.setAttribute('aria-label',label.textContent.trim()+'位置');
            select.innerHTML='<option value="0">默认</option><option value="1">位置 1</option><option value="2">位置 2</option><option value="3">位置 3</option>';
            select.value=String(mmFeatureSlot(key));row.append(select);
            select.onchange=()=>{
                try{
                    const ctx=hostWindow.SillyTavern?.getContext?.();
                    if(!ctx?.accountStorage?.setItem)throw Error('酒馆账号设置尚未就绪，请稍后重试');
                    const all=JSON.parse(ctx.accountStorage.getItem(AWM_LAYOUT_KEY+'.bindings')||'{}');
                    all[key]=+select.value;
                    ctx.accountStorage.setItem(AWM_LAYOUT_KEY+'.bindings',JSON.stringify(all));awmLayoutWrite(awmLayoutState());ctx.saveSettingsDebounced?.();
                    if(+select.value&&!mmFeaturePosition(key))toast('此位置尚未保存，请在面板设置中保存到此槽','warning');
                }catch(error){toast('位置绑定保存失败：'+error.message,'error');}
            };
        }
    }
    function mmApplyPagePosition(page) {
        const value=mmFeaturePosition(page);
        if(value)awmLayoutApply(value);else awmLayoutRestore();
    }

    function awmLayoutViewport() {
        const vv = hostWindow.visualViewport;
        return { x: vv?.offsetLeft || 0, y: vv?.offsetTop || 0, w: vv?.width || hostWindow.innerWidth, h: vv?.height || hostWindow.innerHeight };
    }
    function awmNarrowPanelWidth(vp) {
        // A phone in landscape may be wider than the 600px mobile breakpoint.
        // Fit between the outer character columns instead of restoring a desktop slot width.
        const frameWidth = +hostWindow.outerWidth;
        const zoom = +hostWindow.devicePixelRatio;
        const zoomWidth = zoom > 0 && zoom < 1 ? vp.w * zoom : vp.w;
        const visibleWidth = Number.isFinite(frameWidth) && frameWidth > 0 ? Math.min(vp.w, frameWidth, zoomWidth) : Math.min(vp.w, zoomWidth);
        if (awmLayoutDevice() !== 'desktop' || visibleWidth > 800) return null;
        const margin = vp.w * .02;
        return { left: vp.x + margin, width: Math.round(vp.w - margin * 2) };
    }
    function awmLayoutVerticalBand() {
        const vp = awmLayoutViewport();
        const visible = selector => {
            const element = root.querySelector(selector);
            if (!element || hostWindow.getComputedStyle(element).display === 'none') return null;
            const rect = element.getBoundingClientRect();
            return rect.height >= 8 && rect.bottom > vp.y && rect.top < vp.y + vp.h ? rect : null;
        };
        const topBar = visible('#top-bar') || visible('#top_bar');
        const sendForm = visible('#send_form') || visible('#chat-input-container');
        let top = vp.y + 8, bottom = vp.y + vp.h - 8;
        if (topBar) top = Math.max(top, topBar.bottom + 8);
        if (sendForm && sendForm.top > top) bottom = Math.min(bottom, sendForm.top - 8);
        return { top, bottom: Math.max(top + 1, bottom) };
    }
    // All windows share the same measured screen boundaries. No layout is saved here.
    function awmLayoutConstrain(panel) {
        const vp = awmLayoutViewport(), band = awmLayoutVerticalBand();
        panel.style.boxSizing = 'border-box';
        const inset = vp.w * .02;
        const maxWidth = Math.max(1, vp.w - inset * 2), minWidth = Math.min(maxWidth, 240);
        // Correct rendered dimensions as well as coordinates (themes may apply CSS zoom).
        for (let i = 0; i < 3; i++) {
            const rect = panel.getBoundingClientRect();
            const width = Math.max(minWidth, Math.min(maxWidth, rect.width));
            const height = Math.min(band.bottom - band.top, rect.height);
            if (Math.abs(width - rect.width) > .25)
                panel.style.width = width / (rect.width / (parseFloat(hostWindow.getComputedStyle(panel).width) || rect.width) || 1) + 'px';
            if (Math.abs(height - rect.height) > .25)
                panel.style.height = height / (rect.height / (parseFloat(hostWindow.getComputedStyle(panel).height) || rect.height) || 1) + 'px';
        }
        for (let i = 0; i < 3; i++) {
            const rect = panel.getBoundingClientRect();
            const leftMin = vp.x + inset;
            const leftMax = vp.x + vp.w - rect.width - inset;
            const left = Math.max(leftMin, Math.min(leftMax, rect.left));
            const top = Math.max(band.top, Math.min(band.bottom - rect.height, rect.top));
            const scaleX = rect.width / (parseFloat(hostWindow.getComputedStyle(panel).width) || rect.width) || 1;
            const scaleY = rect.height / (parseFloat(hostWindow.getComputedStyle(panel).height) || rect.height) || 1;
            panel.style.left = ((parseFloat(panel.style.left) || 0) + (left - rect.left) / scaleX) + 'px';
            panel.style.top = ((parseFloat(panel.style.top) || 0) + (top - rect.top) / scaleY) + 'px';
        }
    }
    function awmLayoutFitHeight(panel) {
        const band = awmLayoutVerticalBand();
        if (band) {
            const available = band.bottom - band.top;
            if (awmLayoutDevice() === 'desktop') panel.style.height = Math.round(available) + 'px';
            else if (panel.getBoundingClientRect().height > available) panel.style.height = Math.round(available) + 'px';
        }
        return band;
    }
    function awmLayoutCapture() {
        const panel = root.getElementById(PANEL_ID), vp = awmLayoutViewport();
        const rect = panel.getBoundingClientRect();
        return { x: (rect.left - vp.x) / vp.w, y: (rect.top - vp.y) / vp.h,
            size: awmLayoutDevice() === 'mobile' ? rect.height : rect.width };
    }
    function awmLayoutApply(value) {
        const panel = root.getElementById(PANEL_ID);
        if (!panel || panel.style.display === 'none' || !value) return;
        const vp = awmLayoutViewport(), mobile = awmLayoutDevice() === 'mobile';
        if (mobile) panel.style.height = Math.round(Math.min(Math.max(220, vp.h - 16), Math.max(220, Math.min(vp.h - 16, +value.size || 620)))) + 'px';
        else panel.style.width = Math.round(Math.min(vp.w - 16, Math.max(240, +value.size || 680))) + 'px';
        const band = awmLayoutFitHeight(panel);
        const rect = panel.getBoundingClientRect();
        const left = vp.x + Math.max(0, Math.min(vp.w - rect.width, (+value.x || 0) * vp.w));
        const storedTop = vp.y + (+value.y || 0) * vp.h;
        const top = band ? (mobile ? Math.max(band.top, Math.min(band.bottom - rect.height, storedTop)) : band.top)
            : vp.y + Math.max(0, Math.min(vp.h - rect.height, (+value.y || 0) * vp.h));
        panel.style.left = (parseFloat(panel.style.left) || 0) + left - rect.left + 'px';
        panel.style.top = (parseFloat(panel.style.top) || 0) + top - rect.top + 'px';
        awmLayoutConstrain(panel);
    }
    function awmLayoutRestore() {
        const state = awmLayoutState();
        if (state.locked && state.slots[state.slot]) awmLayoutApply(state.slots[state.slot]);
        else if (!state.locked && state.current) awmLayoutApply(state.current);
        else if (state.locked) {
            const panel = root.getElementById(PANEL_ID);
            if (panel && panel.style.display !== 'none') {
                const narrow = awmNarrowPanelWidth(awmLayoutViewport());
                if (narrow) panel.style.width = narrow.width + 'px';
                const band = awmLayoutFitHeight(panel);
                const rect = panel.getBoundingClientRect(), vp = awmLayoutViewport();
                panel.style.left = (parseFloat(panel.style.left) || 0) + (narrow?.left ?? vp.x + (vp.w - rect.width) / 2) - rect.left + 'px';
                const top = band ? (awmLayoutDevice() === 'mobile' ? band.top + (band.bottom - band.top - rect.height) / 2 : band.top)
                    : vp.y + (vp.h - rect.height) / 2;
                panel.style.top = (parseFloat(panel.style.top) || 0) + top - rect.top + 'px';
                awmLayoutConstrain(panel);
            }
        }
    }
    function awmLayoutShowLock(panel) {
        panel.classList.toggle('awm-layout-unlocked', !awmLayoutState().locked);
    }
    function awmLayoutEnsureHandle(panel) {
        if (panel.querySelector('.awm-layout-handle')) return;
        for (const side of ['left','right']) {
            const handle = root.createElement('div');
            handle.className = side === 'left' ? 'awm-layout-handle-left' : 'awm-layout-handle';
            handle.setAttribute('aria-label', side === 'left' ? '拖动左边缘调整面板宽度' : '调整面板大小');
            panel.appendChild(handle);
            let start = null;
            handle.addEventListener('pointerdown', e => {
                if (awmLayoutState().locked) return;
                e.preventDefault(); e.stopPropagation();
                const rect = panel.getBoundingClientRect();
                start = { x:e.clientX,y:e.clientY,w:rect.width,h:rect.height,left:rect.left,top:rect.top };
                handle.setPointerCapture(e.pointerId);
            });
            handle.addEventListener('pointermove', e => {
                if (!start || awmLayoutState().locked) return;
                const vp = awmLayoutViewport();
                if (awmLayoutDevice() === 'mobile') {
                    const band = awmLayoutVerticalBand();
                    const limit = (band ? band.bottom : vp.y + vp.h - 8) - start.top;
                    panel.style.height = Math.max(Math.min(220, limit), Math.min(limit, start.h + e.clientY - start.y)) + 'px';
                } else if (side === 'right') {
                    const limit = vp.x + vp.w - start.left - 8;
                    panel.style.width = Math.max(240,Math.min(limit,start.w + e.clientX - start.x)) + 'px';
                } else {
                    const right = start.left + start.w;
                    const left = Math.max(vp.x + 8,Math.min(right - 240,start.left + e.clientX - start.x));
                    panel.style.transform = 'none'; panel.style.left = left + 'px';
                    panel.style.width = right - left + 'px';
                }
                awmLayoutConstrain(panel);
            });
            for (const type of ['pointerup','pointercancel']) handle.addEventListener(type, () => {
                if (start) { const state = awmLayoutState(); state.current = awmLayoutCapture(); awmLayoutWrite(state); }
                start = null;
            });
        }
    }
    function awmLayoutBindSettings(main) {
        const lock = main.querySelector('#awmLayoutLock'), slot = main.querySelector('#awmLayoutSlot');
        const refresh = () => { const state = awmLayoutState(); lock.textContent = state.locked ? '🔒 已锁定' : '🔓 调整中'; slot.value = String(state.slot); awmLayoutShowLock(root.getElementById(PANEL_ID)); };
        lock.onclick = () => {
            const state = awmLayoutState(); state.locked = !state.locked;
            const panel = root.getElementById(PANEL_ID);
            if (panel?.style.display !== 'none') state.current = awmLayoutCapture();
            if (state.locked && state.current) state.slots[state.slot] = state.current;
            awmLayoutWrite(state); refresh();
        };
        slot.onchange = () => {
            const state = awmLayoutState(); state.slot = +slot.value;
            awmLayoutWrite(state);
            if (state.slots[state.slot]) { awmLayoutApply(state.slots[state.slot]); toast('已切换位置 ' + state.slot, 'success'); }
            else toast('此位置尚未保存；调整后点击保存到此槽', 'warning');
        };
        main.querySelector('#awmLayoutSave').onclick = () => {
            const state = awmLayoutState(), panel = root.getElementById(PANEL_ID);
            const position = panel?.style.display !== 'none' ? awmLayoutCapture() : state.current;
            if (!position) return toast('请先打开面板并调整位置', 'warning');
            state.slots[state.slot] = position; state.current = position; awmLayoutWrite(state); toast('位置 ' + state.slot + ' 已保存', 'success');
        };
        main.querySelector('#awmLayoutReset').onclick = () => {
            const panel = root.getElementById(PANEL_ID), state = awmLayoutState();
            if (panel?.style.display === 'none') {
                state.current = null; delete state.slots[state.slot]; awmLayoutWrite(state);
                return toast('下次打开面板将恢复默认位置', 'success');
            }
            panel.style.width = ''; panel.style.height = ''; panel.style.left = '0px'; panel.style.top = '0px';
            const narrow = awmNarrowPanelWidth(awmLayoutViewport());
            if (narrow) panel.style.width = narrow.width + 'px';
            const band = awmLayoutFitHeight(panel);
            const rect = panel.getBoundingClientRect(), vp = awmLayoutViewport();
            panel.style.left = ((narrow?.left ?? vp.x + (vp.w - rect.width) / 2) - rect.left) + 'px';
            const top = band ? (awmLayoutDevice() === 'mobile' ? band.top + (band.bottom - band.top - rect.height) / 2 : band.top)
                : vp.y + (vp.h - rect.height) / 2;
            panel.style.top = (top - rect.top) + 'px';
            awmLayoutConstrain(panel);
            state.current = awmLayoutCapture(); if (state.locked) state.slots[state.slot] = state.current; awmLayoutWrite(state);
            toast('已恢复默认位置', 'success');
        };
        refresh();
    }

    function enableDrag() {
        const panel = root.getElementById(PANEL_ID);
        const head = panel?.querySelector('.awm-head');
        if (!panel || !head || head.dataset.dragReady) return;
        head.dataset.dragReady = '1';

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        head.addEventListener('pointerdown', e => {
            if (awmLayoutState().locked || e.target.closest('button,input,select,textarea,[role=button]')) return;
            const rect = panel.getBoundingClientRect();
            dragging = true;
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.transform = 'none';
            head.setPointerCapture?.(e.pointerId);
        });

        head.addEventListener('pointermove', e => {
            if (!dragging) return;
            const vp = awmLayoutViewport();
            panel.style.left = Math.max(vp.x, Math.min(vp.x + vp.w - panel.offsetWidth, e.clientX - offsetX)) + 'px';
            const band = awmLayoutVerticalBand();
            const desiredTop = e.clientY - offsetY;
            panel.style.top = (band ? (awmLayoutDevice() === 'mobile'
                ? Math.max(band.top, Math.min(band.bottom - panel.offsetHeight, desiredTop)) : band.top)
                : Math.max(vp.y, Math.min(vp.y + vp.h - panel.offsetHeight, desiredTop))) + 'px';
            awmLayoutConstrain(panel);
        });

        head.addEventListener('pointerup', () => {
            if (dragging) { const state = awmLayoutState(); state.current = awmLayoutCapture(); awmLayoutWrite(state); }
            dragging = false;
        });
        head.addEventListener('pointercancel', () => {
            dragging = false;
        });
    }

    // 用"实测偏移量修正"来居中，而不是依赖 CSS 的 50%/vw/dvh 百分比计算。
    // 原理：不管 position:fixed 的 containing block 是不是被上层某个 transform/
    // filter 祖先劫持了（常见于移动端抽屉滑动动画），getBoundingClientRect() 读到
    // 的永远是元素在屏幕上的真实渲染位置。用"真实位置"和"期望的可视视口中心"
    // 算出一个差值，再把这个差值叠加到当前的 left/top 上——这样无论 left/top 的
    // 百分比基准是不是被劫持，最终在屏幕上的落点都会被拉到真正居中的地方。
    // 同时用 window.visualViewport（存在的话）代替 innerWidth/innerHeight，
    // 顺便解决手机地址栏收起/展开导致可视视口和布局视口不一致的问题。
    function centerPanel() {
        if(mmFeaturePosition(awmCurrentPage)){mmApplyPagePosition(awmCurrentPage);return;}
        if (awmLayoutState().locked || awmLayoutState().current) { awmLayoutRestore(); return; }
        const panel = root.getElementById(PANEL_ID);
        if (!panel || panel.style.display === 'none') return;

        const vv = hostWindow.visualViewport;
        const vw = vv ? vv.width : hostWindow.innerWidth;
        const vh = vv ? vv.height : hostWindow.innerHeight;
        const offsetX = vv ? vv.offsetLeft : 0;
        const offsetY = vv ? vv.offsetTop : 0;

        const narrow = awmNarrowPanelWidth(awmLayoutViewport());
        panel.style.width = (narrow?.width ?? Math.min(panel.getBoundingClientRect().width, Math.max(220, vw - 16))) + 'px';
        if (awmLayoutDevice() === 'mobile') panel.style.height = '';
        const band = awmLayoutFitHeight(panel);
        const rect = panel.getBoundingClientRect();
        const curLeft = parseFloat(panel.style.left) || 0;
        const curTop = parseFloat(panel.style.top) || 0;

        const desiredLeft = narrow?.left ?? offsetX + (vw - rect.width) / 2;
        const desiredTop = band ? (awmLayoutDevice() === 'mobile'
            ? band.top + (band.bottom - band.top - rect.height) / 2 : band.top)
            : offsetY + (vh - rect.height) / 2;

        panel.style.left = (curLeft + (desiredLeft - rect.left)) + 'px';
        panel.style.top = (curTop + (desiredTop - rect.top)) + 'px';
        awmLayoutConstrain(panel);
    }

    let vvBound = false;
    let layoutBoundsObserver = null;
    function bindViewportListeners() {
        if (vvBound) return;
        vvBound = true;
        hostWindow.addEventListener('resize', centerPanel);
        hostWindow.visualViewport?.addEventListener('resize', centerPanel);
        hostWindow.visualViewport?.addEventListener('scroll', centerPanel);
        if (hostWindow.ResizeObserver) {
            layoutBoundsObserver = new hostWindow.ResizeObserver(centerPanel);
            for (const selector of ['#top-bar', '#top_bar', '#send_form', '#chat-input-container']) {
                const node = root.querySelector(selector);
                if (node) layoutBoundsObserver.observe(node);
            }
        }
    }
    function unbindViewportListeners() {
        vvBound = false;
        hostWindow.removeEventListener('resize', centerPanel);
        hostWindow.visualViewport?.removeEventListener('resize', centerPanel);
        hostWindow.visualViewport?.removeEventListener('scroll', centerPanel);
        layoutBoundsObserver?.disconnect();
        layoutBoundsObserver = null;
    }

    function open() {
        addStyle();
        makePanel();
        const panel = root.getElementById(PANEL_ID);
        panel.style.left = '0px';
        panel.style.top = '0px';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.display = 'block';
        awmLayoutEnsureHandle(panel);
        awmLayoutShowLock(panel);
        hydrateTavernData();
        render(awmCurrentPage);
        mmLog('panel', 'panel', 'open');
        centerPanel();
        // 面板首次插入 DOM 时字体/图片等可能还没完成排版，下一帧再校正一次更保险。
        (hostWindow.requestAnimationFrame || hostWindow.setTimeout)(() => { if(mmFeaturePosition(awmCurrentPage))mmApplyPagePosition(awmCurrentPage);else if (awmLayoutState().locked || awmLayoutState().current) awmLayoutRestore(); else centerPanel(); }, 16);
        bindViewportListeners();
    }

    function close() {
        const p = root.getElementById(PANEL_ID);
        awmCaptureStyleView();
        if(root.getElementById('awmMian')){mmPersistCurrent('char');mmPersistCurrent('user');}
        if (p) p.style.display = 'none';
        mmLog('panel', 'panel', 'close');
        unbindViewportListeners();
    }

    // ============================================================
    // 6. 文风数据 / 搜索 / 筛选 / 列表
    // ============================================================
    function findStyleName(data, ids) {
        return (ids || []).map(id => data.styles.find(s => s.id === id)?.name).filter(Boolean).join('、');
    }

    let awmCurrentPage='mianmian';
    const awmStyleView={scroll:0,query:'',tags:[],selected:[]};
    function awmCaptureStyleView() {
        const list=root.getElementById('asq2StyleList');if(!list)return;
        awmStyleView.scroll=list.scrollTop;
        awmStyleView.query=root.getElementById('asq2StyleSearch')?.value||'';
        awmStyleView.selected=[...list.querySelectorAll('.style-select:checked')].map(x=>x.value);
    }
    function awmSyncNav() {
        const host=root.getElementById('awmMian');
        const single=host?.dataset.mmFocus || (host?.classList.contains('awm-mm-narrow')?mmRuntime.active:'');
        root.querySelectorAll('#'+PANEL_ID+' .awm-tab').forEach(b=>{
            b.hidden=!mmPageEnabled(b.dataset.page);
            b.classList.toggle('active',b.dataset.page===awmCurrentPage && (!b.dataset.mmSide || !single || b.dataset.mmSide===single));
        });
    }
    function render(page) {
        const main = root.getElementById('awmMain');
        if (!main) return;
        if (mmWriteLocked()) return;
        if (!mmPageEnabled(page)) page='settings';
        main.classList.remove('awm-panel-settings');
        if (root.getElementById('awmMian')) {
            mmPersistCurrent('char'); mmPersistCurrent('user');
            // A pending load cannot finish into a destroyed frame.
            if (mmRuntime.loadWaiters.char || mmRuntime.loadWaiters.user) return;
        }
        awmCaptureStyleView();
        awmCurrentPage=page;
        if (page === 'mianmian') renderMian(main);
        if (page === 'styles') renderStyles(main);
        if (page === 'settings') renderPanelSettings(main);
        awmSyncNav(); awmFixContrast(); mmApplyPagePosition(page);
    }

    // ============================================================
    // 文风库：筛选、文件夹、多选、批量作者/标签
    // ============================================================
    function renderStyles(main) {
        main.innerHTML = `
            <div class="awm-toolbar">
                <input class="awm-input" id="asq2StyleSearch" placeholder="搜索文风标题、备注、标签和正文">
                <button class="awm-btn" id="asq2NewStyle">＋ 新建</button>
                <label class="awm-btn awm-import" style="cursor:pointer">导入
                    <input id="asq2StyleFile" type="file" accept=".txt,.docx,.doc,.pdf,.json">
                </label>
            </div>
            <div class="awm-tag-filter-wrap" id="asq2TagFilterWrap">
                <div class="awm-tag-filter" id="asq2TagFilter"></div>
                <div class="awm-tag-suggestions" id="asq2TagSuggestions" style="display:none"></div>
            </div>
            <div class="awm-batch">
                <label class="awm-chip" id="asq2SelectAllWrap" hidden><input type="checkbox" id="asq2SelectAll" class="awm-check"> 全选</label>
                <span class="awm-meta" id="asq2SelectedCount" hidden>已选 0</span>
                <div id="asq2BatchTools" class="awm-batch-tools" style="display:none">
                    <div class="awm-batch-pop-wrap">
                        <button class="awm-btn" id="asq2AuthorBtn" type="button">作者</button>
                        <div class="awm-batch-pop" id="asq2AuthorPop" style="display:none"></div>
                    </div>
                    <div class="awm-batch-pop-wrap">
                        <button class="awm-btn" id="asq2TagBtn" type="button">标签</button>
                        <div class="awm-batch-pop" id="asq2TagPop" style="display:none"></div>
                    </div>
                    <button class="awm-btn" id="asq2BatchDelete" type="button">删除</button>
                </div>
            </div>
            <div id="asq2StyleList" class="awm-list"></div>
        `;

        const selectedTags = new Set(awmStyleView.tags);
        main.querySelector('#asq2StyleSearch').value=awmStyleView.query;
        const clearSelection=()=>{main.querySelectorAll('.style-select,.style-group-select,#asq2SelectAll').forEach(x=>x.checked=false);awmStyleView.selected=[];};
        const getSelectedIds = () => [...main.querySelectorAll('.style-select:checked')].map(x => x.value);

        const renderBatchPopups = (data, allTags) => {
            const authorPop = main.querySelector('#asq2AuthorPop');
            const tagPop = main.querySelector('#asq2TagPop');
            if (!authorPop || !tagPop) return;
            const authors = unique(data.styles.map(s => s.author));
            authorPop.innerHTML = `
                <div class="awm-batch-pop-list">
                    ${authors.map(a => `<button type="button" class="awm-tag" data-batch-author="${esc(a)}">${esc(a)}</button>`).join('') || '<span class="awm-meta">暂无作者</span>'}
                </div>
                <div class="awm-batch-new"><input class="awm-input" id="asq2NewAuthor" placeholder="新建作者"><button class="awm-btn" id="asq2CreateAuthor" type="button">新建</button></div>`;
            const ids = getSelectedIds();
            const selectedStyles = data.styles.filter(s => ids.includes(s.id));
            const allSelectedHave = tag => selectedStyles.length > 0 && selectedStyles.every(s => (s.tags || []).includes(tag));
            tagPop.innerHTML = `
                <div class="awm-batch-pop-list">
                    ${allTags.map(t => `<button type="button" class="awm-tag ${allSelectedHave(t) ? 'active' : ''}" data-batch-tag="${esc(t)}">${esc(t)}</button>`).join('') || '<span class="awm-meta">暂无标签</span>'}
                </div>
                <div class="awm-batch-new"><input class="awm-input" id="asq2NewTag" placeholder="新建标签"><button class="awm-btn" id="asq2CreateTag" type="button">新建</button></div>`;
            authorPop.querySelectorAll('[data-batch-author]').forEach(b => b.onclick = () => {
                const idsNow = getSelectedIds(); if (!idsNow.length) return;
                const next = load(); next.styles.forEach(s => { if (idsNow.includes(s.id)) s.author = b.dataset.batchAuthor; });
                save(next); clearSelection(); authorPop.style.display='none'; renderFilters(); refresh();
            });
            tagPop.querySelectorAll('[data-batch-tag]').forEach(b => b.onclick = () => {
                const idsNow = getSelectedIds(); if (!idsNow.length) return;
                const next = load(); const targets = next.styles.filter(s => idsNow.includes(s.id)); const tag = b.dataset.batchTag;
                const allHave = targets.length > 0 && targets.every(s => (s.tags || []).includes(tag));
                targets.forEach(s => { s.tags = unique(s.tags || []); s.tags = allHave ? s.tags.filter(t => t !== tag) : unique([...s.tags, tag]); });
                save(next); renderFilters(); refresh();
            });
            authorPop.querySelector('#asq2CreateAuthor').onclick = () => {
                const value = authorPop.querySelector('#asq2NewAuthor').value.trim(); const idsNow = getSelectedIds(); if (!value || !idsNow.length) return;
                const next = load(); next.styles.forEach(s => { if (idsNow.includes(s.id)) s.author = value; });
                save(next); clearSelection(); authorPop.style.display='none'; renderFilters(); refresh();
            };
            tagPop.querySelector('#asq2CreateTag').onclick = () => {
                const value = tagPop.querySelector('#asq2NewTag').value.trim(); const idsNow = getSelectedIds(); if (!value || !idsNow.length) return;
                const next = load(); next.styles.forEach(s => { if (idsNow.includes(s.id)) s.tags = mmParseTags([...(s.tags || []), value]); });
                save(next); renderFilters(); refresh();
            };
        };

        const renderFilters = () => {
            awmStyleView.tags=[...selectedTags];
            const data = load();
            const allTags = unique(data.styles.flatMap(s => s.tags || [])).sort((a,b) => a.localeCompare(b,'zh-CN'));
            const box = main.querySelector('#asq2TagFilter');
            const input = main.querySelector('#asq2StyleSearch');
            const suggestionBox = main.querySelector('#asq2TagSuggestions');

            // 文风页不再常驻显示全部标签，只显示已经选中的搜索标签。
            box.innerHTML = [...selectedTags].map(tag => `<span class="awm-tag active" data-filter-tag="${esc(tag)}">${esc(tag)} <button class="awm-tag-x" type="button" data-remove-filter-tag="${esc(tag)}">×</button></span>`).join('');
            box.querySelectorAll('[data-remove-filter-tag]').forEach(b => b.onclick = e => {
                e.stopPropagation();
                selectedTags.delete(b.dataset.removeFilterTag);
                renderFilters();
                refresh();
            });

            // 输入搜索词时，只联想已有标签；不会把全部标签铺开。
            const keyword = input?.value.trim().toLowerCase() || '';
            if (suggestionBox) {
                const matches = keyword ? allTags.filter(t => !selectedTags.has(t) && t.toLowerCase().includes(keyword)).slice(0, 12) : [];
                suggestionBox.innerHTML = matches.map(t => `<button type="button" class="awm-tag" data-suggest-tag="${esc(t)}">${esc(t)}</button>`).join('');
                suggestionBox.style.display = matches.length ? 'flex' : 'none';
                suggestionBox.querySelectorAll('[data-suggest-tag]').forEach(b => b.onclick = e => {
                    e.stopPropagation();
                    selectedTags.add(b.dataset.suggestTag);
                    input.value = '';
                    renderFilters();
                    refresh();
                    input.focus();
                });
            }

            renderBatchPopups(data, allTags);
        };

        const getFiltered = () => {
            const data = load(); const key = main.querySelector('#asq2StyleSearch').value.trim().toLowerCase();
            return data.styles.filter(s => {
                const hay = [s.name,s.author,s.note,...(s.tags||[]),s.content].join('\n').toLowerCase();
                const tagOK = !selectedTags.size || [...selectedTags].every(t => (s.tags||[]).includes(t));
                return (!key || hay.includes(key)) && tagOK;
            });
        };

        const syncBatchTools = () => {
            const n = main.querySelectorAll('.style-select:checked').length;
            main.querySelector('#asq2SelectedCount').textContent='已选 '+n;
            main.querySelector('#asq2SelectAllWrap').hidden=!n;
            main.querySelector('#asq2SelectedCount').hidden=!n;
            main.querySelector('#asq2BatchTools').style.display=n?'flex':'none';
            if(!n){main.querySelector('#asq2AuthorPop').style.display='none';main.querySelector('#asq2TagPop').style.display='none';}
        };

        const captureOpenState = () => {
            main.querySelectorAll('.awm-folder[data-folder-key]').forEach(el => {
                styleUIState.folders[el.dataset.folderKey] = !!el.open;
            });
            main.querySelectorAll('.awm-details[data-style-key]').forEach(el => {
                styleUIState.styles[el.dataset.styleKey] = !!el.open;
            });
            saveUIState();
        };

        const refresh = () => {
            captureOpenState();
            const data=load(), list=getFiltered(), selected=new Set(getSelectedIds()), folders=new Map();
            const scroll=main.querySelector('#asq2StyleList').scrollTop;
            list.forEach(s=>{const f=s.author||'未署名';if(!folders.has(f))folders.set(f,[]);folders.get(f).push(s);});
            main.querySelector('#asq2StyleList').innerHTML=[...folders.entries()].map(([author,styles])=>`
                <details class="awm-folder" data-folder-key="${esc(author)}" ${Object.prototype.hasOwnProperty.call(styleUIState.folders, author) ? (styleUIState.folders[author] ? 'open' : '') : 'open'}><summary><span class="awm-folder-fold" aria-hidden="true"></span><input type="checkbox" class="style-group-select awm-check" data-author="${esc(author)}" aria-label="选择此作者组"><span class="awm-folder-name">${mmHighlight(author,main.querySelector('#asq2StyleSearch').value.trim())}</span><span class="awm-meta">（${styles.length}）</span></summary>
                ${styles.map(s=>`<div class="awm-card"><div style="display:flex;align-items:center;gap:6px;min-width:0">
                    <input type="checkbox" class="style-select awm-check" value="${esc(s.id)}" ${selected.has(s.id)?'checked':''}>
                    <details class="awm-details" data-style-key="${esc(s.id)}" ${Object.prototype.hasOwnProperty.call(styleUIState.styles, s.id) && styleUIState.styles[s.id] ? 'open' : ''} style="flex:1;min-width:0"><summary style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:5px;min-width:0;flex-wrap:nowrap">
                        <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${mmHighlight(s.name,main.querySelector('#asq2StyleSearch').value.trim())}</b>
                        
                        <span class="awm-count" style="flex:0 0 auto">${s.content.length}字</span>
                        <span class="awm-card-actions"><button class="awm-btn" data-copy="${esc(s.id)}" type="button">复制</button><button class="awm-btn" data-edit="${esc(s.id)}" type="button">编辑</button></span>
                    </summary>
                    <div style="white-space:pre-wrap;line-height:1.6;margin-top:7px;max-height:280px;overflow:auto">${mmHighlight(s.content,main.querySelector('#asq2StyleSearch').value.trim())}</div></details></div>
                    ${(s.tags&&s.tags.length)?`<div class="awm-tags-row">${s.tags.map(t=>`<span class="awm-tag" data-list-tag="${esc(t)}">${mmHighlight(t,main.querySelector('#asq2StyleSearch').value.trim())}</span>`).join('')}</div>`:''}
                    </div>`).join('')}</details>`).join('') || '<div class="awm-empty">还没有符合条件的文风</div>';
            main.querySelectorAll('.awm-folder[data-folder-key]').forEach(el => {
                el.addEventListener('toggle', () => {
                    styleUIState.folders[el.dataset.folderKey] = !!el.open;
                    saveUIState();
                });
            });
            main.querySelectorAll('.awm-details[data-style-key]').forEach(el => {
                el.addEventListener('toggle', () => {
                    styleUIState.styles[el.dataset.styleKey] = !!el.open;
                    saveUIState();
                });
            });
            main.querySelector('#asq2SelectAll').checked=list.length>0&&list.every(s=>selected.has(s.id)); syncBatchTools();
            main.querySelectorAll('.style-select').forEach(x=>x.onchange=()=>{syncBatchTools();renderBatchPopups(load(),unique(load().styles.flatMap(s=>s.tags||[])));});
            main.querySelectorAll('.style-group-select').forEach(check=>{
                const children=[...check.closest('.awm-folder').querySelectorAll('.style-select')];
                check.checked=children.every(x=>x.checked);check.indeterminate=children.some(x=>x.checked)&&!check.checked;
                check.onclick=e=>e.stopPropagation();
                check.onchange=()=>{children.forEach(x=>x.checked=check.checked);syncBatchTools();renderBatchPopups(load(),unique(load().styles.flatMap(s=>s.tags||[])));};
            });
            main.querySelector('#asq2StyleList').scrollTop=scroll;
            main.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=load().styles.find(x=>x.id===b.dataset.copy);if(!s)return;try{if(hostWindow.navigator?.clipboard?.writeText)await hostWindow.navigator.clipboard.writeText(s.content);else{const ta=root.createElement('textarea');ta.value=s.content;ta.style.position='fixed';ta.style.opacity='0';root.body.appendChild(ta);ta.select();root.execCommand('copy');ta.remove();}toast('已复制文风正文','success');}catch(_){toast('复制失败，请手动复制','warning');}});
            main.querySelectorAll('[data-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();captureOpenState();awmCaptureStyleView();editStyle(b.dataset.edit);});
            main.querySelectorAll('[data-list-tag]').forEach(b=>b.onclick=e=>{e.stopPropagation();const t=b.dataset.listTag;selectedTags.has(t)?selectedTags.delete(t):selectedTags.add(t);renderFilters();refresh();});
        };
        main.querySelector('#asq2StyleSearch').oninput=()=>{renderFilters();refresh();};
        main.querySelector('#asq2StyleSearch').onkeydown=e=>{
            if(e.key!=='Enter')return;
            const value=e.currentTarget.value.trim();
            if(!value)return;
            const exact=unique(load().styles.flatMap(s=>s.tags||[])).find(t=>t.toLowerCase()===value.toLowerCase());
            if(exact && !selectedTags.has(exact)){
                e.preventDefault();
                selectedTags.add(exact);
                e.currentTarget.value='';
                renderFilters();
                refresh();
            }
        };
        main.querySelector('#asq2NewStyle').onclick=()=>editStyle();
        // 统一导入入口：TXT / DOCX 进入文风编辑器，JSON 进入 JSON 条目选择器。
        main.querySelector('#asq2StyleFile').onchange=async e=>{
            const file=e.target.files?.[0];
            if(!file)return;
            const ext=file.name.toLowerCase().split('.').pop();
            try{
                if(ext==='json'){
                    const raw=await file.text();
                    const candidates=parseJSONStyleCandidates(raw);
                    openStyleJsonImportPicker(candidates,file.name);
                }else if(ext==='txt'||ext==='docx'||ext==='doc'||ext==='pdf'){
                    const text=await readDocument(file),blocks=parseStyleBlocks(text);
                    if(blocks.length>1)openStyleJsonImportPicker(blocks.map(b=>({...b,author:'',tags:[]})),file.name);
                    else {
                        const block=blocks[0]||{name:'',content:text};
                        const name=awmInferImportName(block,file.name),candidate={...block,name,author:'',tags:[]};
                        if(awmStyleMatches(load().styles,name).length)await awmImportStyles([candidate]);
                        else await editStyle(null,file);
                    }
                }else{
                    toast('暂不支持这种文件格式','warning');
                }
            }catch(err){
                toast((ext==='json'?'JSON 导入失败：':'文件读取失败：')+err.message,'error');
            }finally{
                e.target.value='';
            }
        };
        main.querySelector('#asq2SelectAll').onchange=e=>{const ids=new Set(getFiltered().map(s=>s.id));main.querySelectorAll('.style-select').forEach(x=>x.checked=e.target.checked&&ids.has(x.value));syncBatchTools();renderBatchPopups(load(),unique(load().styles.flatMap(s=>s.tags||[])));};
        main.querySelector('#asq2AuthorBtn').onclick=()=>{const p=main.querySelector('#asq2AuthorPop');p.style.display=p.style.display==='none'?'block':'none';main.querySelector('#asq2TagPop').style.display='none';};
        main.querySelector('#asq2TagBtn').onclick=()=>{const p=main.querySelector('#asq2TagPop');p.style.display=p.style.display==='none'?'block':'none';main.querySelector('#asq2AuthorPop').style.display='none';};
        main.querySelector('#asq2BatchDelete').onclick=()=>deleteSelectedStyles(main);
        renderFilters(); refresh();
        main.querySelectorAll('.style-select').forEach(x=>x.checked=awmStyleView.selected.includes(x.value));syncBatchTools();
        const list=main.querySelector('#asq2StyleList');list.scrollTop=awmStyleView.scroll;
        hostWindow.requestAnimationFrame(()=>{if(list.isConnected)list.scrollTop=awmStyleView.scroll;});
    }

    // ============================================================
    // 文风编辑：紧凑标签输入
    // ============================================================
    // ============================================================
    // 7. 文风编辑 / 导入 / 作者 / 标签 / 字数
    // ============================================================
    function makeTagEditor(tags) {
        const initial=mmParseTags(tags);
        return `<div class="awm-tag-editor" id="fTagsEditor">${initial.map(t=>`<span class="awm-tag" data-tag="${esc(t)}">${esc(t)} <button class="awm-tag-x" type="button" data-remove-tag="${esc(t)}">×</button></span>`).join('')}<input class="awm-tag-editor-input" id="fTagInput" placeholder="输入标签，回车添加"></div>`;
    }
    function readTagsFromEditor(main){return [...main.querySelectorAll('[data-tag]')].map(x=>x.dataset.tag);}
    function bindTagEditor(main){
        const editor=main.querySelector('#fTagsEditor'),input=main.querySelector('#fTagInput'); if(!editor||!input)return;
        const addTag=value=>{for(const tag of mmParseTags(value)){
            if([...editor.querySelectorAll('[data-tag]')].some(x=>x.dataset.tag===tag))continue;
            const chip=root.createElement('span');chip.className='awm-tag';chip.dataset.tag=tag;
            chip.innerHTML=`${esc(tag)} <button class="awm-tag-x" type="button" data-remove-tag="${esc(tag)}">×</button>`;editor.insertBefore(chip,input);
        }input.value='';};
        input.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text/plain');if(text&&/[、,，\r\n]/.test(text)){e.preventDefault();addTag(text)}});
        input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addTag(input.value);}});
        editor.addEventListener('click',e=>{const b=e.target.closest('[data-remove-tag]');if(b)b.parentElement.remove();});
    }

    // ============================================================
    // 文风编辑：名称 / 作者 / 标签 / 正文 / 导入
    // ============================================================
    async function editStyle(id, initialFile){
        awmCaptureStyleView();
        let imported=!!initialFile;
        const main=root.getElementById('awmMain'), oldData=load(), old=id?oldData.styles.find(x=>x.id===id):null;
        main.innerHTML=`<div class="awm-form awm-style-editor" style="height:100%;display:flex;flex-direction:column">
            <div class="awm-editor-top"><input class="awm-input awm-style-name" id="fName" placeholder="文风名称" value="${esc(old?.name||'')}">
                <div class="awm-actions" style="margin:0"><button class="awm-btn" id="fShowReplace" type="button" aria-expanded="false">替换</button><label class="awm-btn" style="cursor:pointer">导入<input id="fFile" type="file" accept=".txt,.docx,.pdf" style="display:none"></label><button class="awm-btn" id="fCancel" type="button">取消</button><button class="awm-btn" id="fSave" type="button">完成</button></div></div>
            <div class="awm-mm-style-replace" id="fReplacePanel" hidden><input class="awm-input" id="awmStyleFind" placeholder="查找正文词语"><input class="awm-input" id="awmStyleReplacement" placeholder="替换为"><button class="awm-btn" id="awmStyleReplaceAll" type="button">替换文风库全部正文</button></div>
            <input class="awm-input" id="fAuthor" placeholder="作者（可留空）" value="${esc(old?.author||'')}">
            ${makeTagEditor(old?.tags||[])}
            <textarea class="awm-area awm-style-content" id="fContent" placeholder="把文风当作 TXT 直接编辑。换行会原样保留……">${esc(old?.content||'')}</textarea>
            <div class="awm-count-line"><span id="fCount">${(old?.content||'').length}字</span></div>
            <div class="awm-style-note"><label for="fNote">备注</label><textarea id="fNote" class="awm-area" placeholder="写一些自己的话或感想……">${esc(old?.note||'')}</textarea></div></div>`;
        bindTagEditor(main);
        const countEl=main.querySelector('#fCount'),contentEl=main.querySelector('#fContent');
        contentEl.addEventListener('input',()=>countEl.textContent=contentEl.value.length+'字');
        main.querySelector('#fShowReplace').onclick=()=>{
            const panel=main.querySelector('#fReplacePanel');panel.hidden=!panel.hidden;
            main.querySelector('#fShowReplace').setAttribute('aria-expanded',String(!panel.hidden));
            if(!panel.hidden)panel.querySelector('input').focus();
        };
        main.querySelector('#awmStyleReplaceAll').onclick=()=>{
            const find=main.querySelector('#awmStyleFind').value,replacement=main.querySelector('#awmStyleReplacement').value;
            if(!find)return toast('请先输入要替换的词','warning');
            const count=load().styles.reduce((n,item)=>n+(item.content.split(find).length-1),0);
            if(!count)return toast('文风正文没有找到这个词','warning');
            mmMountConfirm();
            mmOpenConfirm('批量替换文风正文','在文风库全部正文中将「'+find+'」替换为「'+replacement+'」，共 '+count+' 处。标题、标签、摘抄和酒馆角色卡不会改变。',()=>{
                const next=load();next.styles.forEach(item=>{item.content=item.content.split(find).join(replacement)});save(next);
                if(id&&next.styles.some(item=>item.id===id)){
                    contentEl.value=contentEl.value.split(find).join(replacement);
                    countEl.textContent=contentEl.value.length+'字';
                }
                toast('已替换 '+count+' 处','success');
            });
        };
        main.querySelector('#fSave').onclick=async()=>{
            const pending=main.querySelector('#fTagInput');if(pending?.value.trim())pending.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
            const name=main.querySelector('#fName').value.trim();if(!name)return toast('请填写文风名称','warning');
            const author=main.querySelector('#fAuthor').value.trim(),tags=readTagsFromEditor(main),content=contentEl.value,next=load(),target=id?next.styles.find(x=>x.id===id):null;
            const prepared=awmPrepareStyle({name,author,tags,content,note:main.querySelector('#fNote').value});
            if(imported&&!target){await awmImportStyles([prepared]);return;}
            if(target)Object.assign(target,prepared);else next.styles.push({id:uid('style'),...prepared});
            save(next);render('styles');
        };
        main.querySelector('#fCancel').onclick=()=>render('styles');
        const loadImportedFile=async file=>{
            imported=true;
            const text=await readDocument(file),blocks=parseStyleBlocks(text),baseName=file.name.replace(/\.[^.]+$/,'');
            if(blocks.length<=1){
                const block=blocks[0]||{name:'',content:text};
                main.querySelector('#fName').value=block.name||baseName;
                main.querySelector('#fAuthor').value='';
                contentEl.value=block.content||text;
                const prepared=awmPrepareStyle({content:contentEl.value});contentEl.value=prepared.content;main.querySelector('#fNote').value=prepared.note;
                countEl.textContent=contentEl.value.length+'字';
                return;
            }
            let picker=main.querySelector('#fImportPicker');
            if(!picker){
                picker=root.createElement('select');
                picker.id='fImportPicker';
                picker.className='awm-select awm-import-picker';
                main.querySelector('.awm-editor-top').insertBefore(picker,main.querySelector('.awm-actions'));
            }
            picker.innerHTML=blocks.map((b,i)=>`<option value="${i}">${esc(b.name||(baseName+' #'+(i+1)))}</option>`).join('');
            const fill=()=>{
                const block=blocks[Number(picker.value)]||blocks[0];
                main.querySelector('#fName').value=block.name||baseName;
                main.querySelector('#fAuthor').value='';
                contentEl.value=block.content||'';
                const prepared=awmPrepareStyle({content:contentEl.value});contentEl.value=prepared.content;main.querySelector('#fNote').value=prepared.note;
                countEl.textContent=contentEl.value.length+'字';
            };
            picker.onchange=fill;fill();
        };

        main.querySelector('#fFile').onchange=async e=>{
            const file=e.target.files?.[0];if(!file)return;
            try{await loadImportedFile(file);}
            catch(err){toast('文件读取失败：'+err.message,'error');}
            finally{e.target.value='';}
        };

        if(initialFile) await loadImportedFile(initialFile);
    }

    // ============================================================
    // JSON 批量导入文风：兼容几种常见结构——
    //   1) 纯数组 [{name/title, content/text}, ...]
    //   2) { styles: [...] }（本插件自己的数据结构）
    //   3) { prompts: [...] }（SillyTavern 预设/正文本预设常见结构，
    //      用 name/identifier 当标题，content 当正文）
    //   4) 兜底：把顶层每个字符串字段当成一条候选
    // 只负责"解析出候选列表"，具体导入哪些由用户在弹窗里勾选决定。
    // ============================================================
    function parseJSONStyleCandidates(raw) {
        let obj;
        try { obj = JSON.parse(raw); } catch (_) { throw new Error('不是合法的 JSON 文件'); }

        let items = [];
        if (Array.isArray(obj)) items = obj;
        else if (obj && Array.isArray(obj.styles)) items = obj.styles;
        else if (obj && Array.isArray(obj.prompts)) items = obj.prompts;
        else if (obj && obj.entries && typeof obj.entries === 'object' && !Array.isArray(obj.entries)) {
            // SillyTavern 世界书/Lorebook 导出格式：entries 是以 "0"/"1"/... 为 key 的对象，
            // 标题字段是 comment，正文字段是 content。
            items = Object.values(obj.entries);
        } else if (obj && typeof obj === 'object') {
            items = Object.entries(obj).filter(([, v]) => typeof v === 'string').map(([k, v]) => ({ name: k, content: v }));
        }
        if (!items.length) throw new Error('没在这个 JSON 里找到可识别的文风内容');

        const candidates = items.map(it => {
            if (typeof it === 'string') return { name: '', content: it, tags: [], author: '' };
            const name = it.name ?? it.title ?? it.comment ?? it.identifier ?? it.id ?? '';
            const content = it.content ?? it.text ?? it.prompt ?? it.value ?? '';
            const tags = mmParseTags(it.tags || []);
            const author = typeof it.author === 'string' ? it.author : '';
            return { name: String(name || '').trim(), content: String(content ?? ''), tags, author, note:String(it.note||'') };
        }).filter(c => c.content.trim().length > 0);

        if (!candidates.length) throw new Error('这些条目都没有正文内容，没法导入');
        return candidates;
    }

    // 导入前先弹一个可勾选的列表，字数太少（很可能是占位/结构标记，不是真正的文风正文）
    // 的条目默认不勾，其余交给用户自己判断，避免几十条里的垃圾条目也被无脑导入。
    function openStyleJsonImportPicker(candidates, fileName) {
        const panel = root.getElementById(PANEL_ID);
        if (!panel || panel.style.display === 'none') return;
        if (panel.querySelector('#awm-json-import')) return;

        const MIN_LEN = 2000;
        const layer = root.createElement('div');
        layer.id = 'awm-json-import';
        layer.style.cssText = [
            'position:absolute',
            'z-index:20',
            'inset:0',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:12px',
            'box-sizing:border-box',
            'background:rgba(0,0,0,.22)'
        ].join(';');

        const box = root.createElement('div');
        box.className = 'awm-modal-box';
        box.style.cssText = [
            'box-sizing:border-box',
            'width:min(420px,100%)',
            'max-height:calc(100% - 24px)',
            'padding:14px',
            'background:var(--SmartThemeBlurTintColor,#222)',
            'color:var(--SmartThemeBodyColor)',
            'border:1px solid var(--SmartThemeBorderColor,#666)',
            'border-radius:10px',
            'box-shadow:0 10px 35px #0008',
            'display:flex',
            'flex-direction:column',
            'overflow:hidden'
        ].join(';');

        box.innerHTML = `
            <div style="margin-bottom:8px;flex:0 0 auto">
                在「${esc(fileName)}」里找到 <b>${candidates.length}</b> 条，勾选要导入的文风（少于 2000 字的默认不勾选）：
            </div>
            <div style="margin-bottom:6px;flex:0 0 auto;display:flex;align-items:center;min-height:30px">
                <label style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;line-height:1.2"><input type="checkbox" id="jsonSelectAll" style="flex:0 0 auto;margin:0;width:18px;height:18px"> <span>全选 / 全不选</span></label><span style="margin-left:auto;font-size:.8em;opacity:.7">沿勾选栏拖动连选</span>
            </div>
            <div id="jsonImportList" style="flex:1 1 auto;min-height:0;overflow:auto;border:1px solid var(--SmartThemeBorderColor);border-radius:7px;padding:6px"></div>
            <div style="margin-top:10px;text-align:right;flex:0 0 auto">
                <button class="awm-btn" id="jsonImportCancel" type="button">取消</button>
                <button class="awm-btn" id="jsonImportOk" type="button">导入选中</button>
            </div>
        `;

        const list = box.querySelector('#jsonImportList');
        list.innerHTML = candidates.map((c, i) => `
            <label style="display:flex;align-items:center;gap:6px;padding:4px 2px;border-bottom:1px solid var(--SmartThemeBorderColor);cursor:pointer">
                <input type="checkbox" class="json-pick" data-i="${i}" ${c.content.trim().length >= MIN_LEN ? 'checked' : ''}>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name || '（未命名）')}</span>
                <span style="opacity:.6;font-size:.82em;flex:0 0 auto">${c.content.length}字</span>
            </label>`).join('');

        layer.appendChild(box);
        panel.appendChild(layer);

        const checks = () => [...box.querySelectorAll('.json-pick')];
        const all=box.querySelector('#jsonSelectAll');
        const sync=()=>{const items=checks(),n=items.filter(x=>x.checked).length;all.checked=n===items.length;all.indeterminate=n>0&&n<items.length;};
        all.onchange = e => {checks().forEach(x => x.checked = e.target.checked);sync();};
        let anchor=null,gesture=null,suppressClick=false;
        checks().forEach(x=>{x.style.cssText='flex:0 0 24px;width:24px;height:24px;margin:0;touch-action:none';});
        const range=(from,to,value)=>{const items=checks();for(let i=Math.min(from,to);i<=Math.max(from,to);i++)items[i].checked=value;sync();};
        list.addEventListener('pointerdown',e=>{
            const input=e.target.closest('.json-pick');if(!input||e.button!==0)return;
            const index=Number(input.dataset.i);e.preventDefault();suppressClick=true;
            gesture={id:e.pointerId,from:e.shiftKey&&anchor!==null?anchor:index,to:index,value:!input.checked};
            range(gesture.from,index,gesture.value);anchor=index;list.setPointerCapture(e.pointerId);
        });
        list.addEventListener('pointermove',e=>{
            if(!gesture||e.pointerId!==gesture.id)return;e.preventDefault();
            const bounds=list.getBoundingClientRect();
            if(e.clientY<bounds.top+28)list.scrollTop-=18;else if(e.clientY>bounds.bottom-28)list.scrollTop+=18;
            const rows=checks();let nearest=gesture.to,distance=Infinity;
            rows.forEach((input,i)=>{const r=input.getBoundingClientRect(),d=Math.abs(e.clientY-r.top-r.height/2);if(d<distance){distance=d;nearest=i;}});
            range(gesture.to,nearest,gesture.value);gesture.to=nearest;
        });
        const end=e=>{if(!gesture||e.pointerId!==gesture.id)return;gesture=null;if(list.hasPointerCapture(e.pointerId))list.releasePointerCapture(e.pointerId);hostWindow.setTimeout(()=>suppressClick=false,0);};
        list.addEventListener('pointerup',end);list.addEventListener('pointercancel',end);
        list.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();return;}
            const input=e.target.closest('label')?.querySelector('.json-pick');if(!input)return;
            if(e.target!==input)return;
            const index=Number(input.dataset.i);if(e.shiftKey&&anchor!==null)range(anchor,index,input.checked);anchor=index;sync();
        });
        list.addEventListener('change',sync);sync();
        box.querySelector('#jsonImportCancel').onclick = () => layer.remove();
        box.querySelector('#jsonImportOk').onclick = () => {
            const chosenIdx = checks().filter(x => x.checked).map(x => Number(x.dataset.i));
            if (!chosenIdx.length) { toast('请至少选一条', 'warning'); return; }

            layer.remove();
            awmImportStyles(chosenIdx.map((i,n)=>({...candidates[i],name:candidates[i].name||('导入文风 '+(n+1)),author:candidates[i].author||String(fileName||'').replace(/\.[^.]+$/,'')}))).catch(err=>toast('导入失败：'+err.message,'error'));
        };
    }

    // ============================================================
    // 文风批量删除：只删除选中的文风，并同步清理摘抄关联
    // ============================================================
    function deleteSelectedStyles(main) {
        const ids = [...main.querySelectorAll('.style-select:checked')].map(x => x.value);
        if (!ids.length) return toast('请先选择文风', 'warning');
        if (root.getElementById('awm-delete-confirm')) return;

        const panel = root.getElementById(PANEL_ID);
        if (!panel) return;

        const layer = root.createElement('div');
        layer.id = 'awm-delete-confirm';
        layer.style.cssText = 'position:absolute;z-index:20;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:rgba(0,0,0,.22)';

        const box = root.createElement('div');
        box.className = 'awm-modal-box';
        box.style.cssText = 'box-sizing:border-box;width:min(420px,100%);max-width:100%;padding:14px;background:var(--SmartThemeBlurTintColor,#222);color:var(--SmartThemeBodyColor);border:1px solid var(--SmartThemeBorderColor,#666);border-radius:10px;box-shadow:0 10px 35px #0008';
        box.innerHTML = '<div style="margin-bottom:10px">确定删除已选的 ' + ids.length + ' 个文风？</div><button class="awm-btn" id="awmYes">删除</button> <button class="awm-btn" id="awmNo">取消</button>';
        layer.appendChild(box);
        panel.appendChild(layer);

        box.querySelector('#awmYes').onclick = () => {
            const data = load();
            const idSet = new Set(ids);
            data.styles = data.styles.filter(s => !idSet.has(s.id));
            data.quotes.forEach(q => q.styles = (q.styles || []).filter(id => !idSet.has(id)));
            save(data);
            layer.remove();
            render('styles');
        };
        box.querySelector('#awmNo').onclick = () => layer.remove();
    }

    function deleteStyle(id) {
        const data = load();
        const s = data.styles.find(x => x.id === id);
        if (!s) return;

        if (root.getElementById('awm-delete-confirm')) return;
        const panel = root.getElementById(PANEL_ID);
        if (!panel) return;

        const layer = root.createElement('div');
        layer.id = 'awm-delete-confirm';
        layer.style.cssText = 'position:absolute;z-index:20;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:rgba(0,0,0,.22)';

        const box = root.createElement('div');
        box.className = 'awm-modal-box';
        box.style.cssText = 'box-sizing:border-box;width:min(420px,100%);max-width:100%;padding:14px;background:var(--SmartThemeBlurTintColor,#222);color:var(--SmartThemeBodyColor);border:1px solid var(--SmartThemeBorderColor,#666);border-radius:10px;box-shadow:0 10px 35px #0008';
        box.innerHTML = '<div style="margin-bottom:10px">确定删除「' + esc(s.name) + '」？</div><button class="awm-btn" id="awmYes">删除</button> <button class="awm-btn" id="awmNo">取消</button>';
        layer.appendChild(box);
        panel.appendChild(layer);

        box.querySelector('#awmYes').onclick = () => {
            const next = load();
            next.styles = next.styles.filter(x => x.id !== id);
            next.quotes.forEach(q => q.styles = (q.styles || []).filter(x => x !== id));
            save(next);
            layer.remove();
            render('styles');
        };
        box.querySelector('#awmNo').onclick = () => layer.remove();
    }


    // ============================================================

    function awmPrepareStyle(style) {
        const text=String(style.content||'');let note=String(style.note||'').trim(),cursor=0;
        while(cursor<text.length){
            const start=text.indexOf('{{',cursor);if(start<0)break;
            let depth=1,i=start+2;
            while(i<text.length&&depth){if(text.slice(i,i+2)==='{{'){depth++;i+=2;}else if(text.slice(i,i+2)==='}}'){depth--;i+=2;}else i++;}
            if(depth)break;
            const inner=text.slice(start+2,i-2).trim();
            // Preserve the source body, and avoid appending the same extracted note on each save.
            if(inner&&!/^(?:user|char)$/i.test(inner)&&!('\n\n'+note+'\n\n').includes('\n\n'+inner+'\n\n'))note=[note,inner].filter(Boolean).join('\n\n');
            cursor=i;
        }
        return {...style,tags:mmParseTags(style.tags||[]),content:text,note};
    }
    function awmStyleKey(name) {
        return String(name||'').normalize('NFKC').toLowerCase().replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g,'')
            .replace(/\bv\d+(?:\.\d+)*\b/g,'').replace(/[^\p{L}\p{N}]/gu,'');
    }
    function awmStyleScore(a,b) {
        a=awmStyleKey(a);b=awmStyleKey(b);if(!a||!b)return 0;if(a===b)return 1;if(Math.min(a.length,b.length)<4)return 0;
        let row=Array.from({length:b.length+1},(_,i)=>i);
        for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
        return 1-row[b.length]/Math.max(a.length,b.length);
    }
    function awmStyleNameSuffixes(name){
        const parts=String(name||'').normalize('NFKC').split(/[-‐‑‒–—:|／/]+/u);
        return parts.slice(1).map((_,i)=>awmStyleKey(parts.slice(i+1).join('-'))).filter(Boolean);
    }
    function awmStyleMatches(styles,name){
        const key=awmStyleKey(name),suffixes=awmStyleNameSuffixes(name);
        return styles.map(s=>{
            const oldKey=awmStyleKey(s.name);
            const score=key&&key===oldKey?1:
                (oldKey&&(suffixes.includes(oldKey)||awmStyleNameSuffixes(s.name).includes(key))) ? .97 : awmStyleScore(s.name,name);
            return {s,score};
        }).filter(x=>x.score>=.82).sort((a,b)=>b.score-a.score).map(x=>x.s);
    }
    function awmInferImportName(block,fileName){
        const styles=load().styles;
        const base=String(fileName||'').replace(/\.[^.]+$/,'').trim();
        const fileMatch=styles.find(s=>awmStyleKey(s.name)===awmStyleKey(base));
        if(fileMatch)return fileMatch.name;
        if(String(block?.name||'').trim())return String(block.name).trim();
        const raw=String(block?.content||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,8);
        const heading=raw.map(line=>line.replace(/^#{1,6}\s*|^\*+|\*+$|^【|】$|^《|》$/g,'').replace(/^(?:文风|标题|名称|writing style|title)\s*[:：]\s*/i,'').trim())
            .filter(line=>line.length>0&&line.length<=90);
        for(const line of heading){const exact=styles.find(s=>awmStyleKey(s.name)===awmStyleKey(line));if(exact)return exact.name;}
        for(const line of heading){const matches=awmStyleMatches(styles,line);if(matches.length&&awmStyleScore(matches[0].name,line)>=.9)return matches[0].name;}
        return base;
    }
    function awmStyleDiff(oldText,newText) {
        const a=oldText.split('\n'),b=newText.split('\n');
        if(a.length*b.length>160000){
            const oldChanged=new Set(),newChanged=new Set();
            for(let i=0;i<Math.max(a.length,b.length);i++)if(a[i]!==b[i]){if(i<a.length)oldChanged.add(i);if(i<b.length)newChanged.add(i);}
            return {oldChanged,newChanged};
        }
        const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
        for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)
            dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
        const oldChanged=new Set(),newChanged=new Set();let i=0,j=0;
        while(i<a.length&&j<b.length){
            if(a[i]===b[j]){i++;j++;}
            else if(dp[i+1][j]>=dp[i][j+1])oldChanged.add(i++);
            else newChanged.add(j++);
        }
        while(i<a.length)oldChanged.add(i++);
        while(j<b.length)newChanged.add(j++);
        return {oldChanged,newChanged};
    }
    function awmCompareStyle(incoming,matches,index,total) {
        return new Promise(resolve=>{
            const panel=root.getElementById(PANEL_ID),layer=root.createElement('div');layer.id='awm-style-compare';
            layer.style.cssText='position:absolute;inset:0;z-index:50;padding:12px;display:flex;background:#0006';
            layer.innerHTML=`<div class="awm-compare-box"><div>对比文风 ${index+1} / ${total}</div><select aria-label="匹配的已有文风"></select><div class="awm-compare-summary" role="status"></div><div class="awm-compare-cols"><section><b data-old-title></b><pre data-old-content></pre></section><section><b data-new-title></b><pre data-new-content></pre></section></div><div class="awm-compare-actions"><button class="awm-btn" data-choice="old">保留旧版</button><button class="awm-btn" data-choice="new">仅替换正文</button><button class="awm-btn" data-choice="skip" title="新增新版，保留旧版">跳过</button><span style="font-size:12px">替换只改正文；跳过保留两版</span></div></div>`;
            const select=layer.querySelector('select');matches.forEach(s=>{const o=root.createElement('option');o.value=s.id;o.textContent=s.name;select.appendChild(o)});select.hidden=matches.length===1;
            const format=s=>String(s.content||'');
            const paint=(node,lines,changed,kind)=>{
                node.innerHTML=lines.map((line,i)=>changed.has(i)?'<span class="awm-diff-'+kind+'">'+esc(line||' ')+'</span>':esc(line||' ')).join('\n');
            };
            const draw=()=>{
                const old=matches.find(x=>x.id===select.value)||matches[0],oldText=format(old),newText=format(incoming);
                const diff=awmStyleDiff(oldText,newText);
                layer.querySelector('[data-old-title]').textContent='旧版 · '+old.name;
                layer.querySelector('[data-new-title]').textContent='新版 · '+incoming.name;
                layer.querySelector('.awm-compare-summary').textContent=diff.oldChanged.size||diff.newChanged.size
                    ? '旧版变化 '+diff.oldChanged.size+' 行 · 新版变化 '+diff.newChanged.size+' 行（着色处）'
                    : '两版内容相同';
                paint(layer.querySelector('[data-old-content]'),oldText.split('\n'),diff.oldChanged,'old');
                paint(layer.querySelector('[data-new-content]'),newText.split('\n'),diff.newChanged,'new');
            };
            select.onchange=draw;draw();
            let answered=false;layer.querySelectorAll('[data-choice]').forEach(b=>b.onclick=event=>{if(answered||event.detail>1)return;answered=true;event.stopPropagation();const id=select.value;layer.remove();resolve({choice:b.dataset.choice,id})});panel.appendChild(layer);awmFixContrast();
        });
    }
    let awmStyleImportBusy=false;
    async function awmImportStyles(candidates) {
        if(awmStyleImportBusy){toast('当前导入尚未完成','warning');return;}
        awmStyleImportBusy=true;
        const next=clone(load());let added=0,updated=0,kept=0,identical=0;
        const batch=uid('import');
        const log=(status,details)=>mmLog('styleImport','styles',status,'',undefined,{batch,...details});
        log('started',{total:candidates.length});
        try{
            for(let i=0;i<candidates.length;i++){
                const incoming=awmPrepareStyle(candidates[i]);
                const matches=awmStyleMatches(next.styles,incoming.name);
                const same=next.styles.find(s=>String(s.content||'')===incoming.content);
                if(same){identical++;log('identical-skipped',{index:i+1,total:candidates.length,matchedId:same.id});continue;}
                if(!matches.length){next.styles.push({...incoming,id:uid('style')});added++;log('added',{index:i+1,reason:'unmatched'});continue;}
                log('review',{index:i+1,total:candidates.length,matchCount:matches.length,matchedIds:matches.map(s=>s.id)});
                const answer=await awmCompareStyle(incoming,matches,i,candidates.length);
                if(answer.choice==='new'){
                    const old=next.styles.find(s=>s.id===answer.id);
                    if(old){old.content=incoming.content;updated++;log('body-replaced',{index:i+1,matchedId:old.id});}
                    else throw Error('所选旧文风不存在');
                }else if(answer.choice==='skip'){
                    next.styles.push({...incoming,id:uid('style')});added++;log('added',{index:i+1,reason:'skip-keep-both',matchedId:answer.id});
                }else{kept++;log('kept-old',{index:i+1,matchedId:answer.id});}
                await new Promise(resolve=>hostWindow.requestAnimationFrame(resolve));
            }
            if(added||updated)save(next);
            render('styles');log('completed',{added,updated,kept,identical});
            toast('导入完成：新增 '+added+'，正文更新 '+updated+'，保留旧版 '+kept+'，正文相同 '+identical,'success');
        }catch(error){log('failed',{message:error.message});throw error;}
        finally{awmStyleImportBusy=false;}
    }
    function awmTagTone(tag){return /^@/.test(tag.trim())?'red':tag.trim().toUpperCase()==='NSFW'?'yellow':'';}
    function awmFixContrast() {
        const panel=root.getElementById(PANEL_ID);if(!panel)return;
        const cs=hostWindow.getComputedStyle(panel);
        const parse=v=>{v=v.trim();if(/^#[0-9a-f]{3,8}$/i.test(v)){let hex=v.slice(1);if(hex.length===3||hex.length===4)hex=[...hex].map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));}const m=v.match(/[\d.]+/g);return m?.length>=3?m.slice(0,3).map(Number):null;};
        let bg=parse(cs.backgroundColor)||[248,246,239],fg=parse(hostWindow.getComputedStyle(root.documentElement).getPropertyValue('--SmartThemeBodyColor'))||parse(cs.color)||[40,45,40];
        const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
        if((Math.max(lum(bg),lum(fg))+.05)/(Math.min(lum(bg),lum(fg))+.05)<4.5)fg=lum(bg)>.179?[25,25,25]:[245,245,245];
        panel.style.setProperty('--SmartThemeBodyColor',`rgb(${fg.join(',')})`);
        panel.style.setProperty('--black70a',`rgb(${bg.join(',')})`);panel.style.setProperty('--black30a',`rgb(${bg.join(',')})`);
        panel.style.setProperty('--awm-safe-bg',`rgb(${bg.join(',')})`);panel.style.setProperty('--awm-safe-ink',`rgb(${fg.join(',')})`);
        panel.querySelectorAll('.awm-tag').forEach(el=>{const tone=awmTagTone(el.dataset.tag||el.dataset.listTag||el.dataset.batchTag||el.dataset.suggestTag||el.textContent.replace(/×/g,'').trim());if(el.dataset.tone!==tone)el.dataset.tone=tone});
        for(const side of ['char','user']){const body=mmFrame(side)?.contentDocument?.body;if(body){body.style.setProperty('--bg',`rgb(${bg.join(',')})`);body.style.setProperty('--panel',`rgb(${bg.join(',')})`);body.style.setProperty('--ink',`rgb(${fg.join(',')})`);}}
    }
    function awmEnhanceStyleUI(panel) {
        const style=root.createElement('style');style.textContent=`
        #${PANEL_ID}{color:var(--awm-safe-ink,var(--SmartThemeBodyColor))}
        #${PANEL_ID} .awm-input,#${PANEL_ID} .awm-select,#${PANEL_ID} .awm-area,#${PANEL_ID} .awm-modal-box,#${PANEL_ID} .awm-dialog,#${PANEL_ID} .awm-mm-dialog,#${PANEL_ID} select,#${PANEL_ID} .awm-tag-editor-input{background:var(--awm-safe-bg)!important;color:var(--awm-safe-ink)!important}
        #${PANEL_ID} .awm-btn,#${PANEL_ID} .awm-tag,#${PANEL_ID} .awm-tab{color:var(--awm-safe-ink)}
        #${PANEL_ID} .awm-card,#${PANEL_ID} .awm-folder,#${PANEL_ID} .awm-tag-editor{background:var(--awm-safe-bg);color:var(--awm-safe-ink)}
        #${PANEL_ID} .awm-tag[data-tone="yellow"]{background:#ffe184!important;color:#513800!important}
        #${PANEL_ID} .awm-tag[data-tone="red"]{background:#f7b5b5!important;color:#6e1111!important}
        #${PANEL_ID} [hidden]{display:none!important}
        #${PANEL_ID} .awm-folder-name{font-size:1.08em;font-weight:700}
        #${PANEL_ID} .awm-folder>summary .awm-meta{font-size:.78em;font-weight:400}
        #${PANEL_ID} .awm-details>summary>b{font-size:.94em;font-weight:500}
        #${PANEL_ID} .awm-details .awm-count{font-size:.75em;font-weight:400}
        #${PANEL_ID} .awm-compare-summary{font-size:12px;opacity:.84}
        #${PANEL_ID} .awm-diff-old{background:#f9d7d2;color:#5b1f1f;box-decoration-break:clone}
        #${PANEL_ID} .awm-diff-new{background:#d5efd8;color:#153f23;box-decoration-break:clone}
        .awm-compare-box{container-type:inline-size;width:100%;min-width:0;min-height:0;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:10px;background:var(--awm-safe-bg);color:var(--awm-safe-ink)}
        .awm-compare-box select{width:100%;max-width:100%;min-width:0}.awm-compare-cols b{overflow-wrap:anywhere}
        .awm-compare-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0;overflow:auto}.awm-compare-cols section{display:flex;flex-direction:column;min-height:0;min-width:0}.awm-compare-cols pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;min-height:0}.awm-compare-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        @container(max-width:680px){.awm-compare-cols{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
        `;panel.appendChild(style);
        let queued=false;const refresh=()=>{if(queued)return;queued=true;hostWindow.requestAnimationFrame(()=>{queued=false;awmFixContrast()})};
        new MutationObserver(refresh).observe(panel,{childList:true,subtree:true});
        new MutationObserver(refresh).observe(root.documentElement,{attributes:true,attributeFilter:['style','class']});
        if(root.body)new MutationObserver(refresh).observe(root.body,{attributes:true,attributeFilter:['style','class']});
        refresh();
    }
    // 9. 设置 / 酒馆文风库
    // ============================================================
    function renderPanelSettings(main) {
        main.innerHTML = `<section class="awm-card" aria-labelledby="awmLayoutTitle">
            <h3 id="awmLayoutTitle">面板位置与大小</h3>
            <div class="awm-layout-controls">
                <button class="awm-btn" id="awmLayoutLock" type="button"></button>
                <select class="awm-select" id="awmLayoutSlot" aria-label="面板位置槽"><option value="1">位置 1</option><option value="2">位置 2</option><option value="3">位置 3</option></select>
                </div><div class="awm-layout-actions"><button class="awm-btn" id="awmLayoutSave" type="button">保存到此槽</button>
                <button class="awm-btn" id="awmLayoutReset" type="button">恢复默认位置</button>
            </div>
        </section>`;
        main.insertAdjacentHTML('beforeend', `<section class="awm-extension-card" aria-labelledby="awmStorageTitle">
          <h3 id="awmStorageTitle">数据存储</h3>
          <label class="awm-extension-line awm-storage-line"><span>存储位置</span><select id="awmStorageMode"><option value="tavern">酒馆（默认）</option><option value="browser">浏览器</option></select></label>
          <div class="awm-extension-actions"><button class="menu_button" id="awmImportData" type="button">导入数据</button><button class="menu_button" id="awmExportData" type="button">导出数据</button><button class="menu_button" id="awmClearTavernData" type="button">清除鱼板面数据</button></div>
        </section><section class="awm-extension-card" id="awmBackupSection" aria-labelledby="awmBackupTitle">
          <div class="awm-backup-heading"><h3 id="awmBackupTitle">备份清理</h3><span id="awmBackupSaveStatus" role="status" aria-live="polite"></span></div>
          <div class="awm-backup-fields">
            <label class="awm-backup-field"><span>保留时间</span><select id="awmBackupRetention"><option value="off">不开启</option><option value="1d">1天</option><option value="7d">7天</option><option value="30d">30天</option><option value="3m">3个月</option><option value="6m">6个月</option><option value="1y">1年</option></select></label>
            <div><label class="awm-backup-field"><span>清理时间</span><select id="awmBackupSchedule"><option value="startup">酒馆加载完成 5 分钟后</option><option value="daily">每天</option><option value="weekly">每周</option></select></label>
              <div class="awm-backup-extra" id="awmBackupDaily" hidden><input id="awmBackupDailyTime" type="time" aria-label="每日清理时刻" value="04:00"></div>
              <div class="awm-backup-extra" id="awmBackupWeekly" hidden><select id="awmBackupWeeklyDay" aria-label="每周清理日期"><option value="0">周日</option><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option></select><input id="awmBackupWeeklyTime" type="time" aria-label="每周清理时刻" value="04:00"></div>
            </div>
          </div>
          
          <div class="awm-extension-actions awm-backup-actions"><button class="menu_button" id="awmBackupManual" type="button">手动删除</button><button class="menu_button" id="awmBackupEmpty" type="button">扫描空备份</button><button class="menu_button" id="awmBackupScan" type="button">检查备份</button><button class="menu_button" id="awmBackupClean" type="button">立即清理</button></div>
          <p id="awmBackupPanelStatus" class="awm-backup-status" role="status"></p><div id="awmBackupConfirm" class="awm-backup-confirm" hidden>
            <p id="awmBackupConfirmMessage"></p>
            <div class="awm-extension-actions"><button class="menu_button" id="awmBackupConfirmCancel" data-backup-confirm type="button">取消</button><button class="menu_button" id="awmBackupConfirmAccept" data-backup-confirm type="button">确认清理</button></div>
          </div>
          
        </section><section class="awm-extension-card" aria-labelledby="awmLogTitle">
          <h3 id="awmLogTitle">诊断日志</h3>
          <div class="awm-extension-actions"><button class="menu_button" id="awmExportMmLog" type="button">导出日志</button><button class="menu_button" id="awmClearMmLog" type="button">清空日志</button></div>
        </section>`);
        main.classList.add('awm-panel-settings');
        awmLayoutBindSettings(main);
        bindDataSettings(main);
        mmBackupBind(main);
    }
    // BEGIN V9.7 isolated backup cleaner.
    const MM_BACKUP_DEFAULT = { enabled: true, retention: 'off', schedule: 'startup', dailyTime: '04:00', weeklyDay: '0', weeklyTime: '04:00', lastRun: 0, lastAutomaticRun: 0 };
    let mmBackupTimer = 0, mmBackupBusy = false, mmBackupStopped = false;
    let mmBackupConfirmResolve = null;

    // This dedicated key never contains styles, C/U drafts or layout data.
    const MM_BACKUP_PREF_KEY='鲜虾鱼板面.backupCleaner.v1';
    let mmBackupReadError=null;
    let mmBackupPrefs=null,mmBackupPrefsReading=null,mmBackupPrefsQueue=Promise.resolve(),mmBackupPrefsSequence=0;
    async function mmBackupServerSettings(){
        let timer;
        const body=await Promise.race([
            (async()=>{const response=await mmSettingsFetch('/api/settings/get',{});return response.json();})(),
            new Promise((_,reject)=>{timer=hostWindow.setTimeout(()=>reject(Error('酒馆设置读取超时')),20000);})
        ]).finally(()=>hostWindow.clearTimeout(timer));
        const settings=typeof body.settings==='string'?JSON.parse(body.settings):body.settings;
        if(!settings||typeof settings!=='object')throw Error('无法读取酒馆设置');
        return settings;
    }
    function mmBackupDecodePrefs(settings){
        const global=settings.extension_settings?.variables?.global;
        if(global?.[MM_BACKUP_PREF_KEY])return global[MM_BACKUP_PREF_KEY];
        const raw=settings.accountStorage?.[MM_BACKUP_PREF_KEY];
        if(raw)return typeof raw==='string'?JSON.parse(raw):raw;
        return null;
    }
    function mmBackupCheckPrefs(value){
        if(!value||typeof value!=='object'||Array.isArray(value))throw Error('清理设置格式异常');
        if(!['off','1d','7d','30d','3m','6m','1y'].includes(value.retention))throw Error('清理保留期限无效');
        return {...MM_BACKUP_DEFAULT,...value};
    }
    async function mmBackupReadPreferences(){
        if(mmBackupPrefs){mmBackupReadError=null;return mmBackupPrefs;}
        if(mmBackupPrefsReading)return mmBackupPrefsReading;
        const sequence=mmBackupPrefsSequence;
        mmBackupReadError=null;
        mmBackupPrefsReading=(async()=>{
            // A slow helper must not prevent reading the server copy.
            const localRead=()=>{
                const ctx=hostWindow.SillyTavern?.getContext?.();let local=null;
                try{local=mmHelperFn('getVariables')?.({type:'global'})?.[MM_BACKUP_PREF_KEY];}catch(_){}
                if(!local)try{local=mmBackupDecodePrefs({extension_settings:ctx?.extensionSettings,accountStorage:{[MM_BACKUP_PREF_KEY]:ctx?.accountStorage?.getItem?.(MM_BACKUP_PREF_KEY)}});}catch(_){}
                if(local)try{return mmBackupCheckPrefs(local);}catch(_){}
                return null;
            };
            let settings,local;
            for(let attempt=0;attempt<2;attempt++){
                if(sequence!==mmBackupPrefsSequence&&mmBackupPrefs)return mmBackupPrefs;
                local=localRead();if(local){mmBackupPrefs=local;return local;}
                try{settings=await mmBackupServerSettings();break;}
                catch(error){
                    if(sequence!==mmBackupPrefsSequence&&mmBackupPrefs)return mmBackupPrefs;
                    local=localRead();if(local){mmBackupPrefs=local;return local;}
                    if(attempt===1)throw error;
                    await new Promise(resolve=>hostWindow.setTimeout(resolve,1500));
                }
            }
            if(sequence!==mmBackupPrefsSequence)return mmBackupPrefs;
            let value=mmBackupDecodePrefs(settings);
            if(!value){const raw=settings.accountStorage?.['鲜虾鱼板面.v2.preferences'];if(raw)value=JSON.parse(raw).value;}
            if(!value){const raw=settings.accountStorage?.['ame-style-management-v05_backup_preferences_v1'];if(raw)value=JSON.parse(raw);}
            if(!value){try{value=JSON.parse(hostWindow.localStorage.getItem(AWM_LAYOUT_KEY)||'{}').backupCleaner;}catch{}}
            mmBackupPrefs=value?mmBackupCheckPrefs(value):{...MM_BACKUP_DEFAULT};return mmBackupPrefs;
        })().then(value=>{mmBackupReadError=null;return value;}).catch(error=>{
            if(sequence!==mmBackupPrefsSequence&&mmBackupPrefs){mmBackupReadError=null;return mmBackupPrefs;}
            mmBackupReadError=error;throw error;
        }).finally(()=>{mmBackupPrefsReading=null;});
        return mmBackupPrefsReading;
    }
    function mmBackupSettings(){return {...MM_BACKUP_DEFAULT,...(mmBackupPrefs||{})};}
    async function mmBackupPersist(changes){
        const next=mmBackupCheckPrefs({...MM_BACKUP_DEFAULT,...mmBackupPrefs,...changes});
        // Keep lastRun and retention only; discard unrelated V8.4 preferences during migration.
        const value=Object.fromEntries(Object.keys(MM_BACKUP_DEFAULT).map(key=>[key,next[key]]));
        mmBackupReadError=null;mmBackupPrefs=value;const sequence=++mmBackupPrefsSequence;
        const task=mmBackupPrefsQueue.catch(()=>{}).then(async()=>{
            if(sequence!==mmBackupPrefsSequence)return;
            const ctx=hostWindow.SillyTavern?.getContext?.(),insert=mmHelperFn('insertOrAssignVariables');
            if(insert)await insert({[MM_BACKUP_PREF_KEY]:clone(value)},{type:'global'});
            else if(ctx?.accountStorage?.setItem)ctx.accountStorage.setItem(MM_BACKUP_PREF_KEY,JSON.stringify(value));
            else throw Error('酒馆设置保存接口尚未就绪，未保存');
            if(!insert)ctx?.saveSettingsDebounced?.();
            if(typeof ctx?.saveSettingsDebounced?.flush==='function')await ctx.saveSettingsDebounced.flush();
            // Native saving may be debounced. Confirm the server copy, not the in-memory value.
            const end=Date.now()+15000;let pause=500;
            while(true){
                if(sequence!==mmBackupPrefsSequence)return;
                const actual=mmBackupDecodePrefs(await mmBackupServerSettings());
                if(actual&&Object.keys(MM_BACKUP_DEFAULT).every(key=>({...MM_BACKUP_DEFAULT,...actual})[key]===value[key]))break;
                if(Date.now()>=end)throw Error('酒馆尚未确认保存，请重试');
                await new Promise(resolve=>hostWindow.setTimeout(resolve,pause));
                pause=Math.min(4000,pause*2);
            }
            mmLog('backupPreferences','settings','committed','',undefined,{retention:value.retention});
        });
        mmBackupPrefsQueue=task;await task;
        if(sequence!==mmBackupPrefsSequence)await mmBackupPrefsQueue;
    }

    // V9.7: retired copies stay in place until the shared retention expires.
    const MM_RETIRED_KEY = '鲜虾鱼板面.retiredCopies.v1';
    function mmRetiredLocal(key) {
        try { return !!JSON.parse(hostWindow.localStorage.getItem(MM_RETIRED_KEY)||'{}')[key]; }
        catch (_) { return false; }
    }
    async function mmContentDigest(raw){
        const bytes=new TextEncoder().encode(raw);
        if(hostWindow.crypto?.subtle?.digest){
            try{return Array.from(new Uint8Array(await hostWindow.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}catch{}
        }
        const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        const data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=128;
        const view=new DataView(data.buffer),bits=bytes.length*8;
        view.setUint32(data.length-8,Math.floor(bits/4294967296));view.setUint32(data.length-4,bits>>>0);
        const w=new Uint32Array(64),r=(x,n)=>(x>>>n)|(x<<(32-n));
        for(let offset=0;offset<data.length;offset+=64){
            for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
            for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(r(a,7)^r(a,18)^(a>>>3))+w[i-16]+(r(b,17)^r(b,19)^(b>>>10))+w[i-7];}
            let [a,b,c,d,e,f,g,j]=h;
            for(let i=0;i<64;i++){const t1=(j+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
            [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
        }
        return h.map(x=>x.toString(16).padStart(8,'0')).join('');
    }
    async function mmRetiredCleanup(retention, automatic = false) {
        if(automatic)await mmBackupWaitIdle();
        const cutoff=mmBackupCutoff(retention);
        if(cutoff===null || mmStorageMode()!=='tavern')return;
        const ctx=hostWindow.SillyTavern?.getContext?.(), account=ctx?.accountStorage;
        if(!account?.removeItem || !account?.setItem)throw Error('旧副本清理：账户存储尚未就绪');
        const server=await mmBackupServerSettings();
        const stored=mmHelperFn('getVariables')&&mmHelperFn('insertOrAssignVariables')
            ? server.extension_settings?.variables?.global?.[TAVERN_DATA_KEY]
            : JSON.parse(server.accountStorage?.[TAVERN_DATA_KEY]||'null');
        // Never hydrate, migrate, or write current editor data from this task.
        const currentMatches=()=>{const current=runtimeData||readTavernData();return current && JSON.stringify(mmNormalize(stored))===JSON.stringify(mmNormalize(current));};
        if(!stored || !Array.isArray(stored.styles) || !stored.mianmian || !currentMatches())
            throw Error('旧副本清理：当前数据尚未通过服务器核验，下次重试');
        const domains=['styles','char','user','preferences','extras','personaTags','notes'];
        const local=hostWindow.localStorage;
        const plans=[
            {store:local, keys:[ID,'ame-style-management-v03',MM_LOCAL_KEY,...domains.map(x=>'鲜虾鱼板面.v2.'+x),...domains.map(x=>'鲜虾鱼板面.unsaved.v84.'+x)]},
            {store:account, keys:domains.map(x=>'鲜虾鱼板面.v2.'+x).concat('ame-style-management-v05_backup_preferences_v1')}
        ];
        const digest=mmContentDigest;
        let removed=0;
        for(const plan of plans){
            const rawLedger=plan.store===account?server.accountStorage?.[MM_RETIRED_KEY]:local.getItem(MM_RETIRED_KEY);
            const ledger=JSON.parse(rawLedger||'{}');
            if(!ledger || typeof ledger!=='object' || Array.isArray(ledger))throw Error('旧副本清理记录损坏，未删除');
            let changed=false;
            for(const key of plan.keys){
                if(automatic)await mmBackupWaitIdle();
                const raw=plan.store===account?server.accountStorage?.[key]:local.getItem(key);
                if(raw==null){if(ledger[key]){delete ledger[key];changed=true;}continue;}
                if(typeof raw!=='string')throw Error('旧副本格式异常，未删除：'+key);
                // Malformed records are reported, not silently discarded.
                const value=JSON.parse(raw);if(!value || typeof value!=='object')throw Error('旧副本内容异常：'+key);
                const hash=await digest(raw),previous=ledger[key];
                const originalTime=key.startsWith('鲜虾鱼板面.v2.')?value.updated:
                    key.startsWith('鲜虾鱼板面.unsaved.v84.')?value.time:null;
                const dated=typeof originalTime==='number'&&Number.isFinite(originalTime)&&originalTime>0&&originalTime<=Date.now();
                const same=previous?.hash===hash;
                const fallback=same&&Number.isFinite(previous.retiredAt)&&previous.retiredAt>0&&previous.retiredAt<=Date.now()?previous.retiredAt:Date.now();
                const retiredAt=dated?originalTime:fallback;
                if(!same||previous.retiredAt!==retiredAt){ledger[key]={hash,retiredAt};changed=true;}
                if(retiredAt>=cutoff)continue;
                // Recheck after asynchronous work; a concurrent edit cancels deletion.
                if(mmStorageMode()!=='tavern' || !currentMatches())throw Error('当前数据发生变化，旧副本清理已暂停');
                if(plan.store.getItem(key)!==raw)continue;
                if(plan.store===account){const latest=await mmBackupServerSettings();if(latest.accountStorage?.[key]!==raw)continue;}
                if(plan.store.getItem(key)!==raw)continue;
                plan.store.removeItem(key);delete ledger[key];changed=true;removed++;
            }
            if(changed){
                const encoded=JSON.stringify(ledger);plan.store.setItem(MM_RETIRED_KEY,encoded);
                if(plan.store===account){
                    ctx.saveSettingsDebounced?.();
                    if(typeof ctx.saveSettingsDebounced?.flush==='function')await ctx.saveSettingsDebounced.flush();
                    const check=await mmBackupServerSettings();
                    if(check.accountStorage?.[MM_RETIRED_KEY]!==encoded)throw Error('旧副本清理记录等待酒馆保存，下次重试');
                }
            }
        }
        mmLog('retiredCopies','clean','completed','',undefined,{removed});
    }

    function mmBackupCutoff(retention, now = Date.now()) {
        if (retention === 'off') return null;
        const days = { '1d': 1, '7d': 7, '30d': 30 };
        if (days[retention]) return now - days[retention] * 86400000;
        const date = new Date(now);
        if (retention === '1y') date.setFullYear(date.getFullYear() - 1);
        else if (retention === '3m' || retention === '6m') date.setMonth(date.getMonth() - Number(retention[0]));
        else return null;
        return date.getTime();
    }
    function mmBackupTime(item) {
        const match = String(item.file_name || '').match(/_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:\D|$)/);
        if (match) {
            const date = new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]);
            if (date.getFullYear() === +match[1] && date.getMonth() === +match[2] - 1 && date.getDate() === +match[3] && date.getHours() === +match[4] && date.getMinutes() === +match[5] && date.getSeconds() === +match[6]) return date.getTime();
        }
        for (const key of ['date', 'time', 'timestamp', 'created_at', 'mtime', 'modified_at']) {
            if (!item[key]) continue;
            const time = new Date(item[key]).getTime();
            if (Number.isFinite(time)) return time;
        }
        return 0;
    }
    function mmBackupSize(item) {
        const value = item.file_size;
        if (value == null || value === '') return 0;
        if (Number.isFinite(+value) && +value >= 0) return +value;
        const match = String(value).match(/^\s*([\d.]+)\s*(B|KB|MB|GB|TB)?\s*$/i);
        return match ? (+match[1] || 0) * ({ B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 }[(match[2] || 'B').toUpperCase()]) : 0;
    }
    function mmBackupFormat(bytes) {
        let i = 0; const units = ['B', 'KB', 'MB', 'GB'];
        while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
        return (i ? bytes.toFixed(1) : Math.round(bytes)) + ' ' + units[i];
    }
    async function mmSettingsFetch(path, body) {
        const st = hostWindow.SillyTavern, context = st?.getContext?.();
        const provider = st?.getRequestHeaders || context?.getRequestHeaders || hostWindow.getRequestHeaders;
        if (typeof provider !== 'function') throw new Error('酒馆请求接口不可用');
        const headers = provider.call(st);
        const controller = new AbortController();
        const timer = hostWindow.setTimeout(() => controller.abort(), 20000);
        try {
            const candidates = [hostWindow.fetch, globalThis.fetch];
            const original = candidates.find(fn => typeof fn?.__baiBaiToolkitOriginalFetch === 'function');
            const request = original?.__baiBaiToolkitOriginalFetch || hostWindow.fetch;
            const response = await request.call(hostWindow, path, { method: 'POST', credentials: 'same-origin', headers, cache: path==='/api/backups/chat/download'?'no-store':'no-cache', signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
            if (!response.ok) throw new Error('酒馆接口 HTTP '+response.status);
            return response;
        } catch (error) {
            if (controller.signal.aborted) throw new Error('酒馆请求超时：'+path);
            throw error;
        } finally { hostWindow.clearTimeout(timer); }
    }
    let mmBackupReport=null, mmBackupNativeLimit=false;
    async function mmBackupFetch(path,body) {
        if(path==='/api/backups/chat/get'){
            if(mmBackupReport?.token)await mmSettingsFetch('/api/data-maid/finalize',{token:mmBackupReport.token}).catch(()=>{});
            try{
                const response=await mmSettingsFetch('/api/data-maid/report',{}),report=await response.json();
                if(!report.token||!report.report)throw new Error('数据清理接口返回无效列表');
                mmBackupReport={token:report.token,items:[...(report.report.chatBackups||[]).map(x=>({...x,kind:'chat'})),...(report.report.settingsBackups||[]).map(x=>({...x,kind:'settings'}))]};
                mmBackupNativeLimit=false;
                return new Response(JSON.stringify(mmBackupReport.items.map(x=>({file_name:x.name,file_size:x.size,mtime:x.mtime,time:x.mtime,kind:x.kind}))),{status:200,headers:{'Content-Type':'application/json'}});
            }catch(error){
                mmBackupReport=null;mmBackupNativeLimit=true;mmLog('backupCleaner','settings','settings-delete-unavailable',error);
                return mmSettingsFetch(path,body); // Older ST still supports chat backups; don't claim settings were removed.
            }
        }
        if(path==='/api/backups/chat/delete'&&mmBackupReport){
            const item=mmBackupReport.items.find(x=>x.name===body.name);
            if(!item?.hash)throw new Error('该文件不在酒馆返回的备份清单中');
            return mmSettingsFetch('/api/data-maid/delete',{token:mmBackupReport.token,hashes:[item.hash]});
        }
        return mmSettingsFetch(path,body);
    }
    let mmBackupLastActivity=Date.now();
    function mmBackupActivity(){mmBackupLastActivity=Date.now();}
    function mmBackupIdleInit(){
        for(const type of ['pointerdown','keydown','input','wheel','touchmove','scroll'])root.addEventListener(type,mmBackupActivity,{capture:true,passive:true});
        root.addEventListener('visibilitychange',mmBackupActivity,{passive:true});
    }
    function mmBackupCanWork(){
        const ctx=hostWindow.SillyTavern?.getContext?.()||{};
        const generating=typeof ctx.isGenerating==='function'?ctx.isGenerating():ctx.isGenerating;
        const stop=root.getElementById('mes_stop');
        return !generating&&!ctx.is_send_press&&!(stop&&hostWindow.getComputedStyle(stop).display!=='none'&&hostWindow.getComputedStyle(stop).visibility!=='hidden')
            &&Date.now()>=mmBackupReadyAt+300000&&Date.now()-mmBackupLastActivity>=60000;
    }
    async function mmBackupWaitIdle(){
        while(true){
            if(mmBackupStopped||!mmBackupAutoEnabled()||root.getElementById('awmChatBackupDialog')?.open){const e=Error('自动任务已让出');e.mmYield=true;throw e;}
            if(mmBackupCanWork())return;
            await new Promise(resolve=>hostWindow.setTimeout(resolve,2000));
        }
    }
    async function mmBackupScan(retention, automatic = false) {
        const cutoff = mmBackupCutoff(retention);
        if (cutoff === null) return { files: [], bytes: 0, total: 0, skipped: 0 };
        if(automatic)await mmBackupWaitIdle();
        const list = await (await mmBackupFetch('/api/backups/chat/get')).json();
        if (!Array.isArray(list)) throw new Error('备份列表格式异常');
        const result = { files: [], bytes: 0, total: 0, skipped: 0, empty: 0 };
        let scanIndex=0,checked=0;
        mmLog('backupCleaner','scan','listed','',undefined,{count:list.length});
        const worker=async()=>{while(scanIndex<list.length&&!mmBackupStopped&&(!automatic||mmBackupAutoEnabled())){
            if(automatic)await mmBackupWaitIdle();
            const item=list[scanIndex++];
            // Never pass settings backups, paths or arbitrary file names to deletion.
            const name = String(item?.file_name || '');
            if (!name || /[/\\]/.test(name) || name.includes('..')) continue;
            result.total++;
            const time = mmBackupTime(item);
            let reason=time && time<cutoff?'expired':'';
            if(!reason && mmBackupValidName(name)){
                try{const response=await mmSettingsFetch('/api/backups/chat/download',{name});
                    if(mmBackupLastMessage(await response.text()).emptyConfirmed){reason='empty';result.empty++;}}
                catch(error){result.skipped++;mmLog('backupCleaner','empty-check','failed',error.message);}
                if(mmBackupStopped)break;
            }
            if(reason){const size=mmBackupSize(item);result.files.push({name,size,reason});result.bytes+=size;}
            else if(!time)result.skipped++;
            checked++;if(!automatic||checked%100===0||checked===list.length)mmBackupStatus('检查备份：'+checked+' / '+list.length);
            if(automatic)await new Promise(resolve=>hostWindow.setTimeout(resolve,500));
        }};
        await Promise.all(Array.from({length:Math.min(automatic?1:4,list.length)},worker));
        return result;
    }
    let mmBackupPending=null;
    function mmBackupIdleStatus(){
        const prefs=mmBackupSettings();
        if(mmBackupAutoEnabled())return prefs.lastAutomaticRun?'上次自动清理：'+new Date(prefs.lastAutomaticRun).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚未自动清理';
        return mmBackupPending&&mmBackupPending.retention===prefs.retention?'待清理备份：'+mmBackupPending.count+' 个 · '+mmBackupFormat(mmBackupPending.bytes):'尚未检查';
    }
    function mmBackupStatus(message) {
        root.querySelectorAll('#awmBackupStatus,#awmBackupPanelStatus').forEach(node=>node.textContent=message);
    }
    function mmBackupSetBusy(busy, action, automatic = false) {
        const toggle=root.getElementById('awmBackupEnabled');if(toggle)toggle.disabled=busy&&!automatic;
        const area = root.getElementById('awmBackupSection');
        if (!area) return;
        area.setAttribute('aria-busy', String(busy));
        area.querySelectorAll('button:not([data-backup-confirm]),input,select').forEach(node => { node.disabled = busy&&(!automatic||['awmBackupScan','awmBackupClean'].includes(node.id)); });
        const clean = area.querySelector('#awmBackupClean');
        
        if (clean) clean.textContent = busy && action === 'clean' ? '…' : '立即清理';
    }
    function mmBackupConfirm(scan) {
        const box = root.getElementById('awmBackupConfirm');
        const message = root.getElementById('awmBackupConfirmMessage');
        const accept = root.getElementById('awmBackupConfirmAccept');
        const cancel = root.getElementById('awmBackupConfirmCancel');
        if (!box || !message || !accept || !cancel) throw new Error('清理确认区域未加载');
        message.textContent = '将删除 ' + scan.files.length + ' 个过期或空白备份，释放约 ' + mmBackupFormat(scan.bytes) + '。原始聊天记录不会删除。';
        box.hidden = false;
        mmBackupStatus('请确认是否清理');
        return new Promise(resolve => {
            const finish = approved => {
                box.hidden = true;
                accept.onclick = cancel.onclick = null;
                mmBackupConfirmResolve = null;
                resolve(approved);
            };
            mmBackupConfirmResolve = finish;
            accept.onclick = () => finish(true);
            cancel.onclick = () => finish(false);
        });
    }
    async function mmBackupRun(action = 'clean', automatic = false) {
        if (mmBackupBusy || mmBackupStopped || (automatic&&!mmBackupAutoEnabled())) return;
        const settings = mmBackupSettings();
        if (mmBackupCutoff(settings.retention) === null) { if (!automatic) mmBackupStatus('请先选择保留时间，当前未开启清理'); return; }
        mmBackupBusy = true;
        mmBackupSetBusy(true, action, automatic);
        mmBackupStatus(action === 'scan' ? '扫描中…' : '清理中…');
        mmLog('backupCleaner', action, automatic ? 'automatic-start' : 'clicked');
        try {
            if(automatic)await mmBackupWaitIdle();
            if(action==='clean'){
                try{await mmRetiredCleanup(settings.retention,automatic);}
                catch(error){if(error.mmYield)throw error;mmLog('retiredCopies','clean','failed',error.message);}
            }
            const scan = await mmBackupScan(settings.retention,automatic);
            mmBackupPending={retention:settings.retention,count:scan.files.length,bytes:scan.bytes};
            mmLog('backupCleaner','scan','completed','',undefined,{automatic,total:scan.total,eligible:scan.files.length,bytes:scan.bytes,skipped:scan.skipped});
            if (mmBackupStopped || (automatic&&!mmBackupAutoEnabled())) return;
            if (action === 'scan') {
                mmBackupStatus('待清理备份：'+scan.files.length+' 个 · '+mmBackupFormat(scan.bytes));
                mmLog('backupCleaner', 'scan', 'completed', '', undefined, { total: scan.total, expired: scan.files.length, bytes: scan.bytes, skipped: scan.skipped });
                return;
            }
            if (!scan.files.length) {
                if(automatic){try{await mmBackupPersist({lastAutomaticRun:Date.now()});}catch(error){mmLog('backupPreferences','lastAutomaticRun','failed',error.message);}}
                mmBackupStatus(mmBackupIdleStatus());mmLog('backupCleaner','clean','completed','',undefined,{automatic,deleted:0});return; }
            if (!automatic && !await mmBackupConfirm(scan)) { mmBackupStatus('已取消清理'); return; }
            if (mmBackupStopped) return;
            let index = 0, deleted = 0, expired = 0, empty = 0, freed = 0, failed = 0;
            const worker = async () => {
                while (index < scan.files.length && !mmBackupStopped && (!automatic||mmBackupAutoEnabled())) {
                    if(automatic)await mmBackupWaitIdle();
                    const item = scan.files[index++];
                    try { await mmBackupFetch('/api/backups/chat/delete', { name: item.name }); deleted++; if(item.reason==='empty')empty++;else expired++; freed += item.size; }
                    catch (_) { failed++; }
                    mmBackupStatus('已处理 ' + (deleted + failed) + ' / ' + scan.files.length + ' 个备份…');
                    if(automatic&&index<scan.files.length)await new Promise(resolve=>hostWindow.setTimeout(resolve,250));
                }
            };
            await Promise.all(Array.from({ length: Math.min(automatic?1:4, scan.files.length) }, worker));
            if (mmBackupStopped) return;
            const age = { '1d':'1 天', '7d':'7 天', '30d':'30 天', '3m':'3 个月', '6m':'6 个月', '1y':'1 年' }[settings.retention];
            const counts = [expired ? age+'前的多余备份 '+expired+' 个' : '', empty ? '无消息备份 '+empty+' 个' : ''].filter(Boolean).join('、');
            const result = (automatic ? '自动清理掉 '+(counts||'备份 0 个') : '已清理 '+deleted+' 个备份') + '，释放 '+mmBackupFormat(freed)+' 空间' + (failed ? '；失败 '+failed+' 个，可重新扫描' : '');
            mmBackupStatus(result+(mmBackupNativeLimit?'；当前酒馆缺少设置备份删除接口，仅处理聊天备份':''));
            mmLog('backupCleaner', 'clean', failed ? 'partial' : 'completed', '', undefined, { automatic, retention:settings.retention, deleted, expired, empty, freed, failed });
            try { await mmBackupPersist({ lastRun: Date.now(),...(automatic?{lastAutomaticRun:Date.now()}:{}) }); }
            catch (error) { mmLog('backupPreferences','lastRun','failed',error.message); }
            mmBackupPending={retention:settings.retention,count:failed,bytes:Math.max(0,scan.bytes-freed)};
            mmBackupStatus(mmBackupIdleStatus());
            toast(result, failed ? 'warning' : 'success');
        } catch (error) {
            if(automatic&&error.mmYield){
                if(!mmBackupStopped&&mmBackupAutoEnabled()){hostWindow.clearTimeout(mmBackupTimer);const resume=()=>{if(mmBackupStopped||!mmBackupAutoEnabled())return;if(mmBackupBusy){mmBackupTimer=hostWindow.setTimeout(resume,10000);return;}mmBackupRun('clean',true);};mmBackupTimer=hostWindow.setTimeout(resume,10000);}
                return;
            }
            mmBackupStatus(automatic?'自动清理失败':'备份' + (action === 'scan' ? '扫描' : '清理') + '失败：' + error.message);
            mmLog('backupCleaner', action, 'failed', error.message);
            if (automatic) toast('自动清理失败', 'error');
        } finally {
            const report=mmBackupReport;mmBackupReport=null;
            if(report?.token)await mmSettingsFetch('/api/data-maid/finalize',{token:report.token}).catch(error=>mmLog('backupCleaner','settings','finalize-failed',error));
            mmBackupBusy=false;
            if (!mmBackupStopped) mmBackupSetBusy(false);
        }
    }
    let mmBackupReadyPromise=null,mmBackupReadyAt=0,mmBackupStartupDone=false,mmBackupScheduleSeq=0;
    function mmBackupWaitReady(){
        if(mmBackupReadyPromise)return mmBackupReadyPromise;
        mmBackupReadyPromise=(async()=>{
            const ctx=hostWindow.SillyTavern?.getContext?.();
            const events=ctx?.eventSource?{eventSource:ctx.eventSource,event_types:ctx.eventTypes||ctx.event_types}:await import('/scripts/events.js');
            if(!events.eventSource?.on)throw Error('尚未连接酒馆初始化事件，自动清理未启动');
            await new Promise(resolve=>{
                const type=events.event_types?.APP_READY||'app_ready';
                const ready=()=>{if(mmBackupReadyAt)return;mmBackupReadyAt=Date.now();events.eventSource.removeListener?.(type,ready);resolve();};
                // APP_READY is replayed by SillyTavern when registered after startup.
                // This callback returns immediately, so it never blocks initialization.
                events.eventSource.on(type,ready);
            });
        })().catch(error=>{mmBackupReadyPromise=null;throw error;});
        return mmBackupReadyPromise;
    }
    function mmBackupAutoEnabled(){const prefs=mmBackupSettings();return prefs.enabled!==false&&prefs.retention!=='off';}
    async function mmBackupSchedule(startup = false) {
        const seq=++mmBackupScheduleSeq;
        try {await mmBackupWaitReady();if(mmBackupStopped||seq!==mmBackupScheduleSeq)return;await mmBackupReadPreferences();}catch(error){mmBackupStatus('清理设置暂未读到，清理未启动；重新打开设置可重试');mmLog('backupPreferences','settings','unavailable',error.message);return;}
        if(seq!==mmBackupScheduleSeq)return;
        hostWindow.clearTimeout(mmBackupTimer);
        if (mmBackupStopped) return;
        const settings = mmBackupSettings();
        if (settings.enabled===false || mmBackupCutoff(settings.retention) === null) return;
        if (settings.schedule === 'startup') {
            if(!mmBackupStartupDone)mmBackupTimer=hostWindow.setTimeout(()=>{
                if(mmBackupStopped||!mmBackupAutoEnabled()||mmBackupSettings().schedule!=='startup')return;
                mmBackupStartupDone=true;mmBackupRun('clean',true);
            },Math.max(0,mmBackupReadyAt+300000-Date.now()));
            return;
        }
        if (!['daily', 'weekly'].includes(settings.schedule)) return;
        const value = settings.schedule === 'weekly' ? settings.weeklyTime : settings.dailyTime;
        const [hour, minute] = (/^\d{2}:\d{2}$/.test(value) ? value : '04:00').split(':').map(Number);
        const now = new Date(), next = new Date(now);
        next.setHours(hour, minute, 0, 0);
        if (settings.schedule === 'weekly') {
            const day = Math.max(0, Math.min(6, Number(settings.weeklyDay) || 0));
            next.setDate(next.getDate() + (day - now.getDay() + 7) % 7);
            if (next <= now) next.setDate(next.getDate() + 7);
        } else if (next <= now) next.setDate(next.getDate() + 1);
        mmBackupTimer = hostWindow.setTimeout(async () => { await mmBackupRun('clean', true); mmBackupSchedule(); }, Math.max(1000, next.getTime() - Date.now(),mmBackupReadyAt+300000-Date.now()));
    }
    // 独立聊天备份弹窗；正文仅存在当前弹窗内，不写入鱼板面数据。
    function mmBackupValidName(name) {
        return /^chat_[^/\\]+\.jsonl$/i.test(name) && !name.includes('..');
    }
    async function mmBackupList() {
        const list = await (await mmSettingsFetch('/api/backups/chat/get')).json();
        if (!Array.isArray(list)) throw new Error('备份列表格式异常');
        return list.filter(item => mmBackupValidName(String(item?.file_name || '')))
            .map(item => ({ name: String(item.file_name), time: mmBackupTime(item), size: mmBackupSize(item) }))
            .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));
    }
    function mmBackupLastMessage(text) {
        const source=String(text).replace(/^\uFEFF/,'').trim();
        let records=[];
        if(source){
            try{
                const whole=JSON.parse(source);
                if(Array.isArray(whole))records=whole;
                else if(Array.isArray(whole?.chat))records=whole.chat;
                else if(Array.isArray(whole?.messages))records=whole.messages;
                else records=[whole];
            }catch(_){records=source.split(/\r?\n/).filter(x=>x.trim()).map(line=>{
                try{return JSON.parse(line);}catch(_){throw Error('备份包含损坏的内容，无法完整读取');}
            });}
        }
        let last=null,nonempty=null,count=0,unknown=false;const searchParts=[];
        for(const item of records){
            if(item&&typeof item==='object'&&typeof item.mes==='string'){
                last=item;count++;searchParts.push(String(item.name||''),item.mes);
                if(item.mes.trim())nonempty=item;
            }else if(!item||typeof item!=='object'||Array.isArray(item)||
                !['chat_metadata','user_name','character_name','create_date','chat_create_date'].some(k=>Object.hasOwn(item,k)))unknown=true;
        }
        const emptyConfirmed=count===0&&!unknown;
        if(!last)return {name:'',text:emptyConfirmed?'此备份没有聊天消息。':'此备份格式无法识别，未判断为空文件。',date:'',count:0,emptyLast:false,emptyConfirmed,searchText:''};
        const shown=last.mes.trim()?last:nonempty;
        return {name:String(shown?.name||''),text:shown?.mes||'最后一条消息为空。',date:String(shown?.send_date||''),
            count,emptyLast:!last.mes.trim(),emptyConfirmed:false,searchText:searchParts.join('\n').toLocaleLowerCase()};
    }
    // Shared read-only geometry for auxiliary dialogs; never moves or saves the main editor.
    function mmToolDialogFit(dialog) {
        if (!dialog.open) return;
        const vp=awmLayoutViewport(),band=awmLayoutVerticalBand(),mobile=awmLayoutDevice()==='mobile';
        const main=root.getElementById(PANEL_ID),visible=main&&hostWindow.getComputedStyle(main).display!=='none';
        const bound=mmFeaturePosition(dialog.id==='awmPresetSearchDialog'?'search':'backup');
        const rect=!bound&&visible?main.getBoundingClientRect():null;
        const state=awmLayoutState(),saved=bound||(state.locked?state.slots[state.slot]:state.current);
        const narrow=awmNarrowPanelWidth(vp),available=band.bottom-band.top;
        const margin=rect?0:8;
        const width=Math.min(vp.w-margin*2,rect?.width||(mobile?vp.w-24:(bound?.size||narrow?.width||saved?.size||680)));
        const height=Math.min(available,rect?.height||(mobile?Math.min(622,saved?.size||622):available));
        const left=rect?.left??(bound?vp.x+(+bound.x||0)*vp.w:null)??narrow?.left??(saved?vp.x+(+saved.x||0)*vp.w:(dialog.id==='awmPresetSearchDialog'&&!mobile?vp.x+vp.w-width-8:vp.x+(vp.w-width)/2));
        const top=rect?.top??(saved?vp.y+(+saved.y||0)*vp.h:(mobile?band.top+(available-height)/2:band.top));
        Object.assign(dialog.style,{width:Math.max(0,width)+'px',height:Math.max(0,height)+'px',
            left:Math.max(vp.x+margin,Math.min(vp.x+vp.w-width-margin,left))+'px',
            top:Math.max(band.top,Math.min(band.bottom-height,top))+'px'});
        awmLayoutConstrain(dialog);
    }
    function mmToolDialogBind(dialog) {
        dialog.classList.add('awm-tool-dialog');
        const fit=()=>mmToolDialogFit(dialog);
        hostWindow.addEventListener('resize',fit);
        hostWindow.visualViewport?.addEventListener('resize',fit);
        hostWindow.visualViewport?.addEventListener('scroll',fit);
        const observer=hostWindow.ResizeObserver?new hostWindow.ResizeObserver(fit):null;
        for(const selector of ['#top-bar','#top_bar','#send_form','#chat-input-container']) {
            const element=root.querySelector(selector); if(element) observer?.observe(element);
        }
        dialog.addEventListener('close',()=>{
            observer?.disconnect();
            hostWindow.removeEventListener('resize',fit);
            hostWindow.visualViewport?.removeEventListener('resize',fit);
            hostWindow.visualViewport?.removeEventListener('scroll',fit);
        },{once:true});
        fit();
    }

    // Reads references in the CURRENT preset, not the saved preset file or a separate search database.
    let mmPresetNativeModule=null;
    async function mmPresetNative() {
        if (!mmPresetNativeModule) mmPresetNativeModule=import('/scripts/openai.js').catch(()=>null);
        return mmPresetNativeModule;
    }
    function mmPresetEntries(native,scope) {
        const context=hostWindow.SillyTavern?.getContext?.();
        const manager=native?.promptManager;
        const settings=manager?.serviceSettings||context?.chatCompletionSettings||native?.oai_settings;
        if (!Array.isArray(settings?.prompts)||!Array.isArray(settings?.prompt_order))throw Error('当前预设数据尚未就绪，请稍后重新打开。');
        const strategy=manager?.configuration?.promptOrder?.strategy||'global';
        const activeId=manager?.activeCharacter?.id??(strategy==='global'?(manager?.configuration?.promptOrder?.dummyId??100001):null);
        const order=settings.prompt_order.find(x=>String(x.character_id)===String(activeId))?.order;
        if (!Array.isArray(order))throw Error('当前预设的条目链接尚未就绪，请稍后重新打开。');
        const byId=new Map(),seen=new Set(),entries=[];
        for(const prompt of settings.prompts)if(prompt&&!byId.has(prompt.identifier))byId.set(prompt.identifier,prompt);
        for (const ref of order) {
            if(!ref||seen.has(ref.identifier))continue;
            seen.add(ref.identifier);
            const prompt=byId.get(ref.identifier);
            if(prompt&&(scope==='all'||ref.enabled))entries.push(mmPresetReadCurrentFields(prompt));
        }
        return entries;
    }
    function mmPresetReadCurrentFields(prompt) {
        const visible=field=>field&&field.getClientRects().length>0;
        const quick=root.getElementById(prompt.identifier+'_prompt_quick_edit_textarea');
        const save=root.getElementById('completion_prompt_manager_popup_entry_form_save');
        const name=root.getElementById('completion_prompt_manager_popup_entry_form_name');
        const body=root.getElementById('completion_prompt_manager_popup_entry_form_prompt');
        if(save?.dataset.pmPrompt===String(prompt.identifier)&&visible(body))return {...prompt,name:visible(name)?name.value:prompt.name,content:body.value};
        // A view of the live native field; never assign this draft back to the preset or keep a copy.
        return visible(quick)?{...prompt,content:quick.value}:prompt;
    }
    function mmPresetMatches(text,keyword) {
        if(!keyword)return [];
        const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        return Array.from(String(text??'').matchAll(new RegExp(escaped,'giu')),m=>({start:m.index,end:m.index+m[0].length}));
    }
    function mmPresetHits(prompt,keyword) {
        return ['name','content'].flatMap(source=>mmPresetMatches(prompt[source],keyword).map(hit=>({...hit,source})));
    }
    // One preview per matching sentence; original hit indexes/counts still drive full-text navigation.
    function mmPresetHitGroups(prompt,hits) {
        const groups=[];let source=null,text='',cursor=0,start=0,lastStart=-1;
        for(let index=0;index<hits.length;index++){
            const hit=hits[index];
            if(hit.source!==source){source=hit.source;text=String(prompt[source]??'');cursor=0;start=0;lastStart=-1;}
            while(cursor<hit.start){if(/[。！？!?；;\n]/.test(text[cursor]))start=cursor+1;cursor++;}
            if(start===lastStart)continue;
            groups.push({hit,index});lastStart=start;
        }
        return groups;
    }
    function mmPresetHighlight(node,text,keyword,marks=null) {
        text=String(text??'');let cursor=0;
        for(const hit of mmPresetMatches(text,keyword)){
            node.append(root.createTextNode(text.slice(cursor,hit.start)));
            const mark=root.createElement('mark');mark.textContent=text.slice(hit.start,hit.end);
            node.append(mark);marks?.push(mark);cursor=hit.end;
        }
        node.append(root.createTextNode(text.slice(cursor)));
    }
    function mmPresetSnippet(text,hit) {
        text=String(text??'');const separators=/[。！？!?；;\n]/;
        let start=hit.start,end=hit.end;
        while(start>0&&hit.start-start<72&&!separators.test(text[start-1]))start--;
        while(end<text.length&&end-hit.end<72&&!separators.test(text[end]))end++;
        if(end<text.length&&separators.test(text[end]))end++;
        return (start>0&&!separators.test(text[start-1])?'…':'')+text.slice(start,end)+(end<text.length&&!separators.test(text[end-1])?'…':'');
    }
    // Native quick-edit textareas save on blur. Block only the handoff blur, never rewrite their values.
    function mmPresetFocusState(field=root.activeElement) {
        if(!field||!field.matches('textarea,input,select'))return null;
        if(!field.closest('#openai_settings,#completion_prompt_manager,#quick-edit-container,#completion_prompt_manager_popup')&&
            !field.matches('[data-pm-prompt],[id$="_prompt_quick_edit_textarea"],[id^="completion_prompt_manager_popup_entry_form_"]'))return null;
        return {field,start:field.selectionStart,end:field.selectionEnd,direction:field.selectionDirection,scrollTop:field.scrollTop,scrollLeft:field.scrollLeft};
    }
    function mmPresetWithoutBlur(state,action) {
        const stop=event=>{if(event.target===state?.field)event.stopImmediatePropagation();};
        root.addEventListener('blur',stop,true);root.addEventListener('focusout',stop,true);
        try{return action();}finally{root.removeEventListener('blur',stop,true);root.removeEventListener('focusout',stop,true);}
    }

    async function mmPresetSaveEntries(native, expectedName, drafts, status) {
        const settings=native?.promptManager?.serviceSettings||native?.oai_settings;
        if(!settings||typeof native?.getChatCompletionPreset!=='function')throw Error('当前酒馆缺少预设保存接口');
        const check=()=>{if(settings.preset_settings_openai!==expectedName)throw Error('当前预设已切换，编辑内容已保留');};
        const snapshot=()=>{
            check();
            const value=structuredClone(native.getChatCompletionPreset(settings));
            value.prompts=value.prompts.map(prompt=>({...prompt,...mmPresetReadCurrentFields(prompt)}));
            return value;
        };
        const save=async value=>{
            const response=await mmSettingsFetch('/api/presets/save',{apiId:'openai',name:expectedName,preset:value});
            const result=await response.json();
            if(result.name!==expectedName)throw Error('预设保存返回的名称不一致');
            const index=native.openai_setting_names?.[expectedName];
            if(index!==undefined&&native.openai_settings)native.openai_settings[index]=structuredClone(value);
        };
        status('正在保存当前预设…');
        await save(snapshot());
        check();
        const next=snapshot();
        for(const [identifier,fields] of drafts){
            const prompt=next.prompts.find(p=>p.identifier===identifier);
            if(!prompt||prompt.marker)throw Error('修改的条目不存在或不是可编辑正文，草稿已保留');
            for(const key of ['name','content'])if(Object.hasOwn(fields,key))prompt[key]=fields[key];
        }
        status('正在保存全部修改…');
        await save(next);
        check();
        for(const stored of next.prompts){
            const live=settings.prompts.find(p=>p.identifier===stored.identifier);
            if(live)Object.assign(live,stored);
            const quick=root.getElementById(stored.identifier+'_prompt_quick_edit_textarea');
            if(quick)quick.value=stored.content||'';
            const button=root.getElementById('completion_prompt_manager_popup_entry_form_save');
            if(button?.dataset.pmPrompt===String(stored.identifier)){
                const body=root.getElementById('completion_prompt_manager_popup_entry_form_prompt');
                if(body)body.value=stored.content||'';
                const name=root.getElementById('completion_prompt_manager_popup_entry_form_name');
                if(name)name.value=stored.name||'';
            }
        }
        hostWindow.SillyTavern?.getContext?.()?.saveSettingsDebounced?.();
        native.promptManager?.render?.();
        status('已保存');
    }

    async function mmPresetSearchOpen() {
        if(!mmFeatures().search)return;
        const existing=root.getElementById('awmPresetSearchDialog');
        if(existing){existing.querySelector('[data-search]')?.focus();return;}
        let focus=mmPresetFocusState(),restoreOnClose=false;
        const dialog=root.createElement('dialog');
        dialog.id='awmPresetSearchDialog';dialog.setAttribute('aria-labelledby','awmPresetSearchTitle');dialog.setAttribute('aria-modal','false');
        dialog.innerHTML=`<div class="awm-tool-shell">
            <header class="awm-tool-head"><h3 id="awmPresetSearchTitle">预设全文搜索</h3><button type="button" data-close aria-label="关闭搜索">×</button></header>
            <div class="awm-preset-search-bar"><input type="search" data-search placeholder="搜索名称和正文" aria-label="搜索预设名称和正文" autocomplete="off"><select data-scope aria-label="搜索范围"><option value="enabled">已启用</option><option value="all">全部</option></select></div>
            <div class="awm-preset-summary-row"><p class="awm-preset-summary" data-summary role="status" aria-live="polite">读取当前预设…</p><button type="button" data-save disabled>保存</button></div><span class="awm-preset-save-status" data-save-status role="status"></span>
            <div class="awm-preset-results" data-results tabindex="0"></div>
            <section class="awm-preset-view" data-view hidden><nav><button type="button" data-back>‹ 返回结果</button><div class="awm-preset-navigation"><button type="button" data-prev>上一个</button><span data-position aria-live="polite"></span><button type="button" data-next>下一个</button></div></nav><div class="awm-preset-full" data-full tabindex="0" aria-label="条目完整正文"></div></section>
        </div>`;
        (root.documentElement||root.body).appendChild(dialog);
        // Search interactions cannot bubble into the preset manager or its keyboard/save handlers.
        for(const type of ['click','dblclick','input','change','keydown','keyup','pointerdown','pointerup'])dialog.addEventListener(type,event=>event.stopPropagation());
        const q=key=>dialog.querySelector('[data-'+key+']');
        const el=(tag,className,text)=>{const node=root.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
        let native=null,ready=false,timer=null,viewId=null,marks=[],position=0,resultScroll=0;
        let saving=false,draftName='';
        const drafts=new Map();
        const currentName=()=>(native?.promptManager?.serviceSettings||native?.oai_settings)?.preset_settings_openai;
        const keyword=()=>q('search').value.trim(),entries=()=>{
            if(drafts.size&&currentName()!==draftName)throw Error('预设已切换，请切回「'+draftName+'」保存未完成的修改');
            return mmPresetEntries(native,q('scope').value).map(p=>({...p,...drafts.get(p.identifier)}));
        };
        const editField=(node,prompt,key)=>{
            if(prompt.marker)return;
            node.tabIndex=0;node.setAttribute('aria-label',key==='name'?'点击编辑条目名称':'点击编辑条目正文');
            const begin=()=>{
                if(saving)return;
                const fieldPreset=currentName();
                const input=el(key==='name'?'input':'textarea','awm-preset-inline-editor');
                input.value=prompt[key]||'';input.setAttribute('aria-label',key==='name'?'条目名称':'条目正文');
                if(key==='content'){input.rows=2;q('full').classList.add('awm-preset-editing-content');q('full').scrollTop=0;}
                input.oninput=()=>{
                    if(!drafts.size)draftName=fieldPreset;
                    drafts.set(prompt.identifier,{...drafts.get(prompt.identifier),[key]:input.value});
                    prompt[key]=input.value;
                    q('save-status').textContent='';q('save').textContent='保存';
                };
                node.replaceWith(input);input.focus();
                marks=marks.filter(mark=>mark.isConnected);jump(0);
            };
            node.onclick=begin;node.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();begin();}};
        };
        const alive=()=>dialog.isConnected&&dialog.open;
        const fail=error=>{viewId=null;marks=[];q('view').hidden=true;q('results').hidden=false;q('summary').textContent=error.message;q('results').replaceChildren();};
        const jump=index=>{
            if(!marks.length){q('position').textContent='0 / 0';q('prev').disabled=q('next').disabled=true;return;}
            marks[position]?.classList.remove('awm-current-hit');position=(index+marks.length)%marks.length;
            const mark=marks[position];mark.classList.add('awm-current-hit');q('position').textContent=(position+1)+' / '+marks.length;
            q('prev').disabled=q('next').disabled=marks.length<2;
            const scroller=q('full'),a=mark.getBoundingClientRect(),b=scroller.getBoundingClientRect();
            scroller.scrollTop+=a.top-b.top-Math.max(0,(scroller.clientHeight-a.height)/2);
        };
        const showEntry=(identifier,index=0,focusView=true)=>{
            if(saving)return;
            try{
                const prompt=entries().find(x=>x.identifier===identifier);
                if(!prompt){viewId=null;q('view').hidden=true;q('results').hidden=false;search();return;}
                viewId=identifier;marks=[];position=0;q('full').replaceChildren();q('full').classList.remove('awm-preset-editing-content');
                const title=el('h4','awm-preset-full-title');if(prompt.name)mmPresetHighlight(title,prompt.name,keyword(),marks);else title.textContent='未命名条目';
                const body=el('div','awm-preset-body');mmPresetHighlight(body,prompt.content,keyword(),marks);
                q('full').append(title,body);editField(title,prompt,'name');editField(body,prompt,'content');if(!q('results').hidden)resultScroll=q('results').scrollTop;q('results').hidden=true;q('view').hidden=false;
                jump(Math.min(index,Math.max(0,marks.length-1)));if(focusView)q('full').focus({preventScroll:true});
            }catch(error){fail(error);}
        };
        const search=()=>{
            if(!alive()||!ready||saving)return;
            hostWindow.clearTimeout(timer);
            try{
                const text=keyword(),prompts=entries();
                viewId=null;marks=[];q('view').hidden=true;q('results').hidden=false;q('results').replaceChildren();
                const fragment=root.createDocumentFragment();let count=0,items=0;
                for(const prompt of prompts){
                    const hits=text?mmPresetHits(prompt,text):[];if(text&&!hits.length)continue;
                    count+=hits.length;items++;
                    const row=el('article','awm-preset-result'),head=el('div','awm-preset-result-head');
                    const name=el('button','awm-preset-entry-name');name.type='button';mmPresetHighlight(name,prompt.name||'未命名条目',text);
                    name.onclick=()=>showEntry(prompt.identifier);head.append(name);if(text)head.append(el('span','awm-preset-hit-count',hits.length+' 处'));row.append(head);
                    mmPresetHitGroups(prompt,hits).forEach(({hit,index})=>{
                        const link=el('button','awm-preset-hit');link.type='button';link.setAttribute('aria-label',(hit.source==='name'?'名称':'正文')+'第 '+(index+1)+' 处命中，查看完整正文');
                        if(hit.source==='name')link.append(el('span','awm-preset-name-label','名称 · '));
                        mmPresetHighlight(link,mmPresetSnippet(prompt[hit.source],hit),text);
                        link.onclick=()=>showEntry(prompt.identifier,index);row.append(link);
                    });fragment.append(row);
                }
                q('summary').textContent=text?items+' 个条目 · '+count+' 处命中':'当前预设 · '+items+' 个条目';
                if(!items)fragment.append(el('p','awm-preset-empty',text?'没有匹配的条目。':'当前范围没有条目。'));
                q('results').append(fragment);q('results').scrollTop=0;
            }catch(error){fail(error);}
        };

        q('save').onclick=async()=>{
            if(saving||!ready)return;
            const id=viewId,name=drafts.size?draftName:currentName();
            saving=true;
            const controls=[...dialog.querySelectorAll('button,input,select,textarea')];
            const disabled=controls.map(node=>node.disabled);controls.forEach(node=>node.disabled=true);
            try{
                await mmPresetSaveEntries(native,name,new Map(drafts),text=>{q('save').textContent=text==='已保存'?'保存':'保存中…';});
                drafts.clear();draftName='';q('save-status').textContent='';saving=false;search();if(id!==null)showEntry(id);
            }catch(error){q('save-status').textContent='保存未完成：'+error.message;mmLog('presetEdit','preset','failed',error.message);}
            finally{saving=false;q('save').textContent='保存';controls.forEach((node,i)=>node.disabled=disabled[i]);}
        };

        q('search').oninput=()=>{hostWindow.clearTimeout(timer);if(!keyword())search();else timer=hostWindow.setTimeout(search,100);};
        q('scope').onchange=search;
        q('back').onclick=()=>{viewId=null;marks=[];q('view').hidden=true;q('results').hidden=false;q('results').scrollTop=resultScroll;q('results').focus({preventScroll:true});};
        q('prev').onclick=()=>jump(position-1);q('next').onclick=()=>jump(position+1);
        const closeSearch=()=>{if(saving)return;if(drafts.size&&!hostWindow.confirm('关闭并放弃所有条目的未保存修改？'))return;restoreOnClose=dialog.contains(root.activeElement);dialog.close();};
        q('close').onclick=closeSearch;
        dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeSearch();}});
        const context=hostWindow.SillyTavern?.getContext?.(),event=context?.eventTypes?.OAI_PRESET_CHANGED_AFTER||context?.event_types?.OAI_PRESET_CHANGED_AFTER;
        const changed=()=>{if(!alive()||saving||dialog.querySelector('.awm-preset-inline-editor'))return;if(viewId!==null)showEntry(viewId,position,false);else search();};
        if(event)context.eventSource?.on?.(event,changed);
        let editTimer=null;
        const edited=event=>{
            const target=event.target;
            if(dialog.contains(target)||!target.closest?.('#openai_settings,#completion_prompt_manager,#quick-edit-container,#completion_prompt_manager_popup'))return;
            hostWindow.clearTimeout(editTimer);editTimer=hostWindow.setTimeout(changed,100);
        };
        const handoff=event=>{
            if(!dialog.contains(event.relatedTarget))return;
            const state=mmPresetFocusState(event.target);
            if(state){focus=state;event.stopImmediatePropagation();}
        };
        for(const type of ['input','change','click'])root.addEventListener(type,edited,true);
        for(const type of ['blur','focusout'])root.addEventListener(type,handoff,true);
        dialog.addEventListener('close',()=>{
            hostWindow.clearTimeout(editTimer);
            for(const type of ['input','change','click'])root.removeEventListener(type,edited,true);
            for(const type of ['blur','focusout'])root.removeEventListener(type,handoff,true);
            hostWindow.clearTimeout(timer);
            if(event){const off=context.eventSource?.removeListener||context.eventSource?.off;off?.call(context.eventSource,event,changed);}
            dialog.remove();marks=[];
            if(restoreOnClose&&focus?.field.isConnected)mmPresetWithoutBlur(focus,()=>{
                focus.field.focus({preventScroll:true});
                if(typeof focus.start==='number'&&typeof focus.field.setSelectionRange==='function')focus.field.setSelectionRange(focus.start,focus.end,focus.direction||'none');
                focus.field.scrollTop=focus.scrollTop;focus.field.scrollLeft=focus.scrollLeft;
            });
        },{once:true});
        mmPresetWithoutBlur(focus,()=>{dialog.show();mmToolDialogBind(dialog);q('search').focus({preventScroll:true});});
        native=await mmPresetNative();ready=true;q('save').disabled=false;search();
    }
    function mmPresetSearchAttach() {
        if(!mmFeatures().search){root.getElementById('awmPresetSearchButton')?.remove();return;}
        const area=root.getElementById('openai_settings')||root;
        const label=area.querySelector('[data-i18n="View / Edit bias preset"]');
        const header=label?.closest('.inline-drawer-toggle')||area.querySelector('.openai_logit_bias_list')?.closest('.inline-drawer')?.querySelector('.inline-drawer-toggle')||root.querySelector('#completion_prompt_manager .completion_prompt_manager_header');
        if(!header)return;
        root.querySelectorAll('#awmPresetSearchButton').forEach(button=>{if(!header.contains(button))button.remove();});
        if(header.querySelector('#awmPresetSearchButton'))return;
        const button=root.createElement('button');button.id='awmPresetSearchButton';button.type='button';button.textContent='🔎';
        button.title='搜索当前预设';button.setAttribute('aria-label','搜索当前预设');
        // Prevent a pointer press from blurring quick-edit before the guarded modal handoff.
        button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();});
        button.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();});
        for(const type of ['pointerup','mouseup','keydown','keyup'])button.addEventListener(type,event=>event.stopPropagation());
        button.onclick=event=>{event.preventDefault();event.stopPropagation();mmPresetSearchOpen();};
        const collapse=header.querySelector('.inline-drawer-icon');header.insertBefore(button,collapse||null);
    }
    function mmPresetSearchWatch() {
        mmPresetSearchAttach();let queued=false;
        const observer=new hostWindow.MutationObserver(records=>{
            if(queued||!records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&
                (node.matches('[data-i18n="View / Edit bias preset"],#completion_prompt_manager,.completion_prompt_manager_header,#awmPresetSearchButton')||node.querySelector('[data-i18n="View / Edit bias preset"],#completion_prompt_manager,.completion_prompt_manager_header')))))return;
            queued=true;hostWindow.queueMicrotask(()=>{queued=false;mmPresetSearchAttach();});
        });
        observer.observe(root.body,{childList:true,subtree:true});
    }

    async function mmBackupOpen(scanEmptyOnOpen = false) {
        scanEmptyOnOpen=scanEmptyOnOpen===true;
        const existing = root.getElementById('awmChatBackupDialog');
        if (existing) { if (!existing.open) existing.showModal();if(scanEmptyOnOpen)existing.querySelector('[data-empty]')?.click(); return; }
        const dialog = root.createElement('dialog');
        dialog.id = 'awmChatBackupDialog'; dialog.className = 'awm-chat-backup-dialog';
        dialog.setAttribute('aria-labelledby', 'awmChatBackupDialogTitle');
        dialog.innerHTML = `<div class="awm-chat-backup-shell">
            <header><h3 id="awmChatBackupDialogTitle">聊天备份</h3><button type="button" data-close aria-label="关闭">×</button></header>
            <div class="awm-chat-backup-tools"><label><input type="checkbox" data-all> 全选</label><input type="search" data-search placeholder="搜索聊天内容关键词" aria-label="搜索聊天内容关键词"><button type="button" data-refresh>重新扫描</button><button type="button" data-empty>扫描空备份</button></div>
            <div class="awm-chat-backup-list" data-list></div>
            <div class="awm-chat-backup-confirm" data-confirm hidden><p data-confirm-text></p><div><button type="button" data-cancel>取消</button><button type="button" data-accept>确认删除</button></div></div>
            <footer><span data-count>已选 0 个</span><button type="button" data-remove disabled>删除所选备份</button></footer>
            <p class="awm-chat-backup-status" data-status role="status" aria-live="polite">扫描中…</p>
        </div>`;
        (root.documentElement || root.body).appendChild(dialog);
        const q = key => dialog.querySelector('[data-' + key + ']');
        let files = [], busy = false, scanSeq = 0, emptyScanning=false;
        const picks = new Set(), cache = new Map(), pending = new Map(), searchErrors = new Map();
        let searchTimer = null, searchSeq = 0, searching = false;
        const keyword = () => q('search').value.trim().toLocaleLowerCase();
        const visibleFiles = () => {
            const text = keyword();
            return !text ? files : files.filter(item => cache.get(item.name)?.searchText.includes(text));
        };
        const readMessage = async item => {
            if (cache.has(item.name)) return cache.get(item.name);
            if (pending.has(item.name)) return pending.get(item.name);
            const generation = scanSeq;
            const task = (async () => {
                const response = await mmBackupFetch('/api/backups/chat/download', { name: item.name });
                const message = mmBackupLastMessage(await response.text());
                if (alive() && generation === scanSeq) cache.set(item.name, message);
                return message;
            })();
            pending.set(item.name, task);
            try { return await task; }
            finally { if (pending.get(item.name) === task) pending.delete(item.name); }
        };
        const alive = () => dialog.isConnected && dialog.open;
        const status = text => { if (alive()) q('status').textContent = text; };
        const el = (tag, className, text) => {
            const node = root.createElement(tag); if (className) node.className = className;
            if (text !== undefined) node.textContent = text; return node;
        };
        const update = () => {
            q('count').textContent = '已选 ' + picks.size + ' 个 · 约 ' + mmBackupFormat(files.filter(x => picks.has(x.name)).reduce((a, x) => a + x.size, 0));
            const visible = visibleFiles();
            q('all').checked = visible.length > 0 && visible.every(x => picks.has(x.name));
            q('all').indeterminate = visible.some(x => picks.has(x.name)) && !q('all').checked;
            q('remove').disabled = busy || searching || !picks.size;
            q('all').disabled = busy || searching; q('confirm').hidden = true;
        };
        const setBusy = value => {
            busy = value;
            dialog.querySelectorAll('button,input').forEach(node => { node.disabled = value; });
            if(emptyScanning)q('close').disabled=false;
            if (!value) update();
        };
        const render = () => {
            const list = q('list'); list.replaceChildren();
            if (!visibleFiles().length) list.append(el('p', '', searching ? '正在搜索聊天内容…' : (files.length ? '没有匹配的聊天备份。' : '没有聊天备份。')));
            for (const item of visibleFiles()) {
                const row = el('article', 'awm-chat-backup-row'), line = el('div', 'awm-chat-backup-line');
                const check = el('input'); check.type = 'checkbox'; check.checked = picks.has(item.name);
                check.setAttribute('aria-label', '选择 ' + item.name);
                check.onchange = () => { check.checked ? picks.add(item.name) : picks.delete(item.name); update(); };
                const toggle = el('button', 'awm-chat-backup-toggle'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
                const title = el('span', 'awm-chat-backup-name', item.name);
                const info = el('span', 'awm-chat-backup-info', (item.time ? new Date(item.time).toLocaleString() : '日期未知') + ' · 约 ' + mmBackupFormat(item.size));
                const sign = el('span', 'awm-chat-backup-sign', '+'); sign.setAttribute('aria-hidden', 'true');
                toggle.append(title, info, sign); line.append(check, toggle);
                const detail = el('div', 'awm-chat-backup-detail'); detail.hidden = true;
                let reading = false;
                toggle.onclick = async () => {
                    if (reading || busy) return;
                    if (!detail.hidden) { detail.hidden = true; toggle.setAttribute('aria-expanded', 'false'); sign.textContent = '+'; return; }
                    detail.hidden = false; toggle.setAttribute('aria-expanded', 'true'); sign.textContent = '−';
                    reading = true; toggle.disabled = true; detail.textContent = '…';
                    mmLog('backupPreview', 'chat', 'clicked');
                    try {
                        const message = await readMessage(item);
                        if (!alive() || !row.isConnected) return;
                        detail.replaceChildren();
                        detail.append(el('small', '', '共 ' + message.count + ' 条消息 · ' + (message.emptyLast ? '最后一条为空，显示上一条有正文的消息' : '最后一条消息')));
                        detail.append(el('div', 'awm-chat-backup-speaker', message.name + (message.date ? ' · ' + message.date : '')));
                        detail.append(el('p', '', message.text));
                        mmLog('backupPreview', 'chat', 'completed', '', undefined, { messageCount: message.count, emptyLast: message.emptyLast });
                    } catch (error) {
                        if (alive() && row.isConnected) detail.textContent = '读取失败：' + error.message + '。收起后可重试。';
                        mmLog('backupPreview', 'chat', 'failed', error);
                    } finally { reading = false; if (alive() && row.isConnected) toggle.disabled = busy; }
                };
                row.append(line, detail); list.append(row);
            }
            update();
        };
        const searchContents = async () => {
            const seq = ++searchSeq, text = keyword();
            searching = !!text; searchErrors.clear(); render();
            if (!text) { status('共 ' + files.length + ' 个聊天备份。点击一行展开消息；删除仅影响备份副本。'); return; }
            const targets = files.slice(); let cursor = 0, completed = 0;
            const current = () => alive() && seq === searchSeq;
            const report = () => {
                if (!current()) return;
                status('搜索聊天内容：已读取 ' + completed + ' / ' + targets.length + ' 个备份 · 匹配 ' + visibleFiles().length + ' 个' + (searchErrors.size ? ' · 读取失败 ' + searchErrors.size + ' 个' : ''));
            };
            report();
            const worker = async () => {
                while (current() && cursor < targets.length) {
                    const item = targets[cursor++];
                    try { await readMessage(item); }
                    catch (error) { if (current()) searchErrors.set(item.name, error.message); }
                    if (!current()) return;
                    completed++; report();
                }
            };
            await Promise.all(Array.from({ length: Math.min(3, targets.length) }, worker));
            if (!current()) return;
            searching = false; render();
            status('搜索完成 · 匹配 ' + visibleFiles().length + ' / ' + targets.length + ' 个聊天备份' + (searchErrors.size ? '；' + searchErrors.size + ' 个读取失败，结果不完整，点击重新扫描可重试。' : '。'));
            mmLog('backupSearch', 'chat', searchErrors.size ? 'partial' : 'completed', '', undefined, { total: targets.length, matched: visibleFiles().length, failed: searchErrors.size });
        };
        const scan = async () => {
            if (busy) return;
            const seq = ++scanSeq; ++searchSeq; hostWindow.clearTimeout(searchTimer); searching = false; setBusy(true); status('扫描中…');
            try {
                const next = await mmBackupList();
                if (!alive() || seq !== scanSeq) return;
                files = next; picks.clear(); cache.clear(); pending.clear(); searchErrors.clear(); render();
                status('共 ' + files.length + ' 个聊天备份。点击一行展开消息；删除仅影响备份副本。');
                mmLog('backupBrowser', 'chat', 'listed', '', undefined, { count: files.length });
            } catch (error) { status('扫描失败：' + error.message); mmLog('backupBrowser', 'chat', 'failed', error); }
            finally { if (alive() && seq === scanSeq) { setBusy(false); if (keyword()) await searchContents(); } }
        };
        const scanEmpty=async()=>{
            if(busy)return;
            const seq=++scanSeq;++searchSeq;hostWindow.clearTimeout(searchTimer);searching=false;emptyScanning=true;
            q('search').value='';picks.clear();cache.clear();searchErrors.clear();setBusy(true);
            let checked=0,failed=0;
            try{
                const next=await mmBackupList();if(!alive()||seq!==scanSeq)return;files=next;
                for(const item of files){
                    if(!alive()||seq!==scanSeq)return;
                    try{const response=await mmBackupFetch('/api/backups/chat/download',{name:item.name});const message=mmBackupLastMessage(await response.text());if(!alive()||seq!==scanSeq)return;if(message.emptyConfirmed)picks.add(item.name);}
                    catch(_){failed++;}
                    checked++;status('扫描空备份：'+checked+' / '+files.length+' · 找到 '+picks.size+' 个');
                }
                render();status((picks.size?'已选中全部 '+picks.size+' 个空备份，可自行取消勾选或删除。':'未发现空备份。')+(failed?' '+failed+' 个读取失败，未选中。':''));
            }catch(error){status('扫描未完成：'+error.message);}
            finally{emptyScanning=false;if(alive()&&seq===scanSeq){render();setBusy(false);}}
        };
        q('empty').onclick=scanEmpty;
        q('refresh').onclick = scan;
        q('search').oninput = () => {
            ++searchSeq; hostWindow.clearTimeout(searchTimer); searching = !!keyword(); render();
            status(searching ? '正在搜索聊天内容…' : '共 ' + files.length + ' 个聊天备份。');
            searchTimer = hostWindow.setTimeout(searchContents, 250);
        };
        q('all').onchange = () => { const checked = q('all').checked; visibleFiles().forEach(x => checked ? picks.add(x.name) : picks.delete(x.name)); render(); };
        q('remove').onclick = () => {
            q('confirm-text').textContent = '删除所选的 ' + picks.size + ' 个聊天备份？原始聊天记录保留。'; q('confirm').hidden = false;
        };
        q('cancel').onclick = () => { q('confirm').hidden = true; };
        q('accept').onclick = async () => {
            if (busy || !picks.size) return;
            if (mmBackupBusy) { status('自动清理正在执行，请稍后重新扫描。'); return; }
            const names = [...picks]; let deleted = 0, failed = 0;
            mmBackupBusy = true; mmBackupSetBusy(true, 'clean'); setBusy(true); q('confirm').hidden = true;
            q('accept').textContent = '…'; status('核对备份列表…');
            mmLog('backupManualDelete', 'chat', 'clicked', '', undefined, { selected: names.length });
            try {
                const current = new Set((await mmBackupList()).map(x => x.name));
                for (const name of names) {
                    if (!current.has(name)) { files = files.filter(x => x.name !== name); picks.delete(name); continue; }
                    try { await mmSettingsFetch('/api/backups/chat/delete', { name }); deleted++; files = files.filter(x => x.name !== name); picks.delete(name); cache.delete(name); }
                    catch (error) { failed++; mmLog('backupManualDelete', 'chat', 'file-failed', error); }
                    status('已处理 ' + (deleted + failed) + ' / ' + names.length + ' 个…');
                }
                if (alive()) { render(); status('已删除 ' + deleted + ' 个备份' + (failed ? '；失败 ' + failed + ' 个，保留勾选以便重试。' : '。原始聊天记录保留。')); }
                mmLog('backupManualDelete', 'chat', failed ? 'partial' : 'completed', '', undefined, { deleted, failed });
            } catch (error) { status('删除失败：' + error.message); mmLog('backupManualDelete', 'chat', 'failed', error); }
            finally { mmBackupBusy = false; mmBackupSetBusy(false); if (alive()) { q('accept').textContent = '确认删除'; setBusy(false); } }
        };
        const close = () => { if (!busy||emptyScanning) dialog.close(); };
        q('close').onclick = close;
        dialog.addEventListener('cancel', event => { if (busy&&!emptyScanning) event.preventDefault(); });
        dialog.addEventListener('close', () => { scanSeq++; searchSeq++; hostWindow.clearTimeout(searchTimer); cache.clear(); pending.clear(); searchErrors.clear(); picks.clear(); dialog.remove(); }, { once: true });
        dialog.showModal(); mmToolDialogBind(dialog);if(scanEmptyOnOpen)await scanEmpty();else await scan();
    }

    function mmBackupSaveStatus(text){const node=root.getElementById('awmBackupSaveStatus');if(node)node.textContent=text;}
    async function mmBackupBind(main) {
        const section = main.querySelector('#awmBackupSection');
        if (!section) return;
        section.querySelector('#awmBackupManual').onclick=()=>mmBackupOpen();
        section.querySelector('#awmBackupEmpty').onclick=()=>mmBackupOpen(true);
        const q = id => section.querySelector('#' + id), settings = mmBackupSettings();
        mmLog('backupPreferences', 'settings', 'restored', '', undefined, { retention: settings.retention, schedule: settings.schedule });
        q('awmBackupRetention').value = settings.retention;
        q('awmBackupSchedule').value = settings.schedule;
        q('awmBackupDailyTime').value = settings.dailyTime;
        q('awmBackupWeeklyDay').value = settings.weeklyDay;
        q('awmBackupWeeklyTime').value = settings.weeklyTime;
        const sync = () => {
            const mode = q('awmBackupSchedule').value;
            q('awmBackupDaily').hidden = mode !== 'daily';
            q('awmBackupWeekly').hidden = mode !== 'weekly';
        };
        let saveSequence=0;
        ['awmBackupRetention', 'awmBackupSchedule', 'awmBackupDailyTime', 'awmBackupWeeklyDay', 'awmBackupWeeklyTime'].forEach(id => {
            const persist = async () => {
                mmLog('backupPreferences', 'settings', 'changed', '', undefined, { field: id, value: q(id).value });
                const sequence=++saveSequence;sync();mmBackupSaveStatus('…');
                try {
                    await mmBackupPersist({ ...(id==='awmBackupRetention'?{enabled:q('awmBackupRetention').value!=='off'}:{}), retention: q('awmBackupRetention').value, schedule: q('awmBackupSchedule').value, dailyTime: q('awmBackupDailyTime').value || '04:00', weeklyDay: q('awmBackupWeeklyDay').value, weeklyTime: q('awmBackupWeeklyTime').value || '04:00' });
                    if(sequence!==saveSequence)return;
                    mmBackupPending=null;mmBackupSchedule();mmBackupSyncToggle();mmBackupStatus(mmBackupIdleStatus());mmBackupSaveStatus('设置已保存');
                } catch (error) { if(sequence===saveSequence){mmBackupSaveStatus('保存失败');mmBackupStatus('设置保存失败：'+error.message);}mmLog('backupPreferences','settings','failed',error); }
            };
            q(id).onchange = persist;

        });
        q('awmBackupManual').onclick = ()=>mmBackupOpen();
        q('awmBackupScan').onclick = ()=>mmBackupRun('scan');
        q('awmBackupClean').onclick = ()=>mmBackupRun('clean');
        sync(); mmBackupSyncToggle();mmBackupSetBusy(mmBackupBusy);
        if(!mmBackupBusy)mmBackupStatus(mmBackupReadError?'清理设置暂未读到，重新打开设置可重试':mmBackupIdleStatus());
        try{
            await mmBackupReadPreferences();
            if(!section.isConnected||saveSequence)return;
            const loaded=mmBackupSettings();
            q('awmBackupRetention').value=loaded.retention;
            q('awmBackupSchedule').value=loaded.schedule;
            q('awmBackupDailyTime').value=loaded.dailyTime;
            q('awmBackupWeeklyDay').value=loaded.weeklyDay;
            q('awmBackupWeeklyTime').value=loaded.weeklyTime;
            sync();mmBackupSyncToggle();if(!mmBackupBusy)mmBackupStatus(mmBackupIdleStatus());
        }catch(error){if(!saveSequence){mmBackupStatus('清理设置暂未读到，清理未启动；重新打开设置可重试');mmLog('backupPreferences','settings','failed',error.message);}}
    }
    hostWindow.addEventListener('pagehide', () => { mmBackupStopped = true; hostWindow.clearTimeout(mmBackupTimer); mmBackupConfirmResolve?.(false); });
    // END V9.7 isolated backup cleaner.

    const MM_FEATURE_KEY='鲜虾鱼板面.features.v1';
    function mmFeatures() {
        try {
            const account=hostWindow.SillyTavern?.getContext?.()?.accountStorage;
            return {editor:true,styles:true,search:true,inlineEdit:true,...JSON.parse(account?.getItem?.(MM_FEATURE_KEY)||hostWindow.localStorage.getItem(MM_FEATURE_KEY)||'{}')};
        } catch (_) { return {editor:true,styles:true,search:true,inlineEdit:true}; }
    }
    function mmPageEnabled(page) {
        const flags=mmFeatures();return page==='mianmian'?flags.editor:page==='styles'?flags.styles:true;
    }
    function mmFeatureApply() {
        awmSyncNav();
        const panel=root.getElementById(PANEL_ID);
        if(panel&&panel.style.display!=='none'&&!mmPageEnabled(awmCurrentPage))render('settings');
        if(!mmFeatures().search)root.getElementById('awmPresetSearchDialog')?.close();
        mmPresetSearchAttach();
        hostWindow.__awmInlineFeatureSync?.();
    }
    function mmFeatureSet(key,enabled) {
        if(mmWriteLocked()||mmRuntime.loadWaiters.char||mmRuntime.loadWaiters.user)throw Error('请等待当前操作完成');
        const value=JSON.stringify({...mmFeatures(),[key]:!!enabled});
        const ctx=hostWindow.SillyTavern?.getContext?.();
        if(ctx?.accountStorage?.setItem){ctx.accountStorage.setItem(MM_FEATURE_KEY,value);ctx.saveSettingsDebounced?.();}
        else hostWindow.localStorage.setItem(MM_FEATURE_KEY,value);
        mmFeatureApply();
    }
    function bindExtensionSettings(main) {
        mmFeatureLayoutBind(main);
        for(const [id,key] of [['awmEditorEnabled','editor'],['awmStylesEnabled','styles'],['awmSearchEnabled','search'],['awmInlineEditEnabled','inlineEdit']]) {
            const input=main.querySelector('#'+id);if(!input)continue;input.checked=mmFeatures()[key];
            input.onchange=()=>{try{mmFeatureSet(key,input.checked);}catch(error){input.checked=mmFeatures()[key];toast(error.message,'warning');}};
        }
        const launcherToggle=main.querySelector('#awmLauncherVisible');
        launcherToggle.checked=mmLauncherVisible();
        launcherToggle.onchange=()=>mmSetLauncherVisible(launcherToggle.checked);
        const launcherSize=main.querySelector('#awmLauncherSize');
        launcherSize.value=hostWindow.localStorage.getItem(MM_LAUNCHER_KEY+'.size')||'56';
        main.querySelector('#awmLauncherSizeValue').textContent=launcherSize.value+'px';
        launcherSize.oninput=()=>{main.querySelector('#awmLauncherSizeValue').textContent=mmLauncherSize(launcherSize.value)+'px';};
        main.querySelector('#awmResetLauncher').onclick=()=>{
            hostWindow.localStorage.removeItem(MM_LAUNCHER_KEY+'.position');
            const button=root.getElementById('awm-launcher-v54');
            if(button){button.style.left=button.style.top='';button.style.right='18px';button.style.bottom='95px';}
            mmSetLauncherVisible(true);launcherToggle.checked=true;
        };
        const toggle=main.querySelector('#awmBackupEnabled');toggle.disabled=false;
        mmBackupWaitReady().then(()=>mmBackupReadPreferences()).then(()=>{toggle.disabled=false;mmBackupSyncToggle();if(!mmBackupBusy)mmBackupStatus(mmBackupIdleStatus());}).catch(error=>{mmBackupStatus('清理设置暂未读到，清理未启动；重新打开设置可重试');mmLog('backupPreferences','settings','failed',error.message);});
        toggle.onchange=async()=>{
            const previous=mmBackupSettings();toggle.disabled=true;
            const enabled=toggle.checked;
            hostWindow.clearTimeout(mmBackupTimer);
            try {
                await mmBackupPersist({enabled,retention:enabled&&previous.retention==='off'?'7d':previous.retention});
                mmBackupSchedule();mmBackupStatus(mmBackupIdleStatus());
                const select=root.getElementById('awmBackupRetention');if(select)select.value=mmBackupSettings().retention;
            } catch(error){mmBackupStatus('设置保存失败：'+error.message);}
            finally{toggle.disabled=false;mmBackupSyncToggle();}
        };
        mmFeatureApply();
    }
    function mmBackupSyncToggle() {
        const toggle=root.getElementById('awmBackupEnabled'),prefs=mmBackupSettings();
        if(toggle)toggle.checked=prefs.enabled!==false&&prefs.retention!=='off';
    }
    function bindDataSettings(main) {
        main.querySelector('#awmStorageMode').value=mmStorageMode();
        main.querySelector('#awmExportMmLog').onclick = mmExportDiagnostics;
        main.querySelector('#awmClearMmLog').onclick = () => { mmDiagnostics.length = 0; mmPersistDiagnostics();toast('诊断日志已清空', 'success'); };
        main.querySelector('#awmImportData').onclick = importAllData;
        main.querySelector('#awmExportData').onclick = exportAllData;
        main.querySelector('#awmStorageMode').onchange = async e => {
            const previous = mmStorageMode();
            try { await mmSwitchStorage(e.target.value); }
            catch (err) { e.target.value = previous; toast('切换失败：' + err.message, 'error'); }
        };

        main.querySelector('#awmClearTavernData').onclick=()=>{
            if(mmStorageMode() === 'tavern' && !canUseTavernStorage()) return toast('当前没有可用的酒馆持久化接口','warning');
            const ok=mmStorageMode() === 'browser' ? (hostWindow.localStorage.removeItem(MM_LOCAL_KEY), true) : clearTavernData();
            if(!ok) return toast('清除失败','error');
            runtimeData=clone(DEFAULT);
            tavernDataReady=true;
            toast('已清除鲜虾鱼板面数据','success');
            if(root.getElementById(PANEL_ID)?.style.display !== 'none') render('styles');
        };
    }

    // 11. 文档解析 / 文风块 / 数据导入导出
    // ============================================================
    function extractAuthor(text) {
        const src = String(text || '').replace(/\r\n?/g, '\n');

        // 先抓明确的作者字段。
        const explicit = [
            /(?:^|\n)\s*(?:作者|作\s*者)\s*[:：=＝\-—]\s*["“”\'‘’]?([^\n\r"“”\'‘’<>]+?)["“”\'‘’]?\s*$/im,
            /(?:^|\n)\s*(?:author|written\s+by|created\s+by)\s*[:：=＝\-—]?\s*["“”\'‘’]?([^\n\r"“”\'‘’<>]+?)["“”\'‘’]?\s*$/im,
            /<author>\s*([^<\n]+?)\s*<\/author>/i,
            /\[(?:author|作者)\]\s*[:：=＝\-—]?\s*([^\n]+)/i,
            /(?:^|\n)\s*(?:by|作者为|作者是|作家为|作家是)\s*[:：=＝\-—]?\s*["“”\'‘’]?([^\n\r"“”\'‘’<>]+?)["“”\'‘’]?\s*$/im
        ];
        for (const re of explicit) {
            const m = src.match(re);
            if (m?.[1]) return cleanAuthor(m[1]);
        }

        // 没有“作者：”时，从文档前部寻找“人名 + 作者/作品/文风”等明确上下文。
        const head = src.split('\n').slice(0, 40).join('\n');
        const contextual = [
            /([\u4e00-\u9fff]{2,4})\s*[（(\[]\s*(?:作者|作家|原作者)\s*[）)\]]/i,
            /(?:作者|作家|原作者)\s*[：: ]\s*([\u4e00-\u9fff]{2,4})/i,
            /([\u4e00-\u9fff]{2,4})\s*(?:的)?\s*(?:文风|写作风格|写法|笔法)/i,
            /(?:文风|写作风格|写法|笔法)\s*(?:参考|模仿|仿照|取自|来自)\s*([\u4e00-\u9fff]{2,4})/i,
            /(?:style|writing style)\s*(?:of|by)\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i,
            /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})\s*[（(]\s*(?:author|writer)\s*[）)]/i
        ];
        for (const re of contextual) {
            const m = head.match(re);
            if (m?.[1]) return cleanAuthor(m[1]);
        }

        // 最后仅在“作者/作家/author”附近抓人名，避免从正文随便抽一个名字。
        const nearby = [
            /(?:作者|作家|原作者|author|writer)[^\n]{0,30}?([\u4e00-\u9fff]{2,4})/i,
            /([\u4e00-\u9fff]{2,4})[^\n]{0,30}?(?:作者|作家|原作者)/i
        ];
        for (const re of nearby) {
            const m = src.match(re);
            if (m?.[1]) return cleanAuthor(m[1]);
        }

        return '';
    }

    function cleanAuthor(value) {
        return String(value || '')
            .replace(/^[\s:：=＝\-—,，、]+|[\s\"“”'‘’<>]+$/g, '')
            .replace(/^(?:作者|作家|原作者)\s*[:：=＝]?\s*/i, '')
            .trim();
    }

    function parseStyleBlocks(text) {
        const src = String(text || '').replace(/\r\n?/g, '\n');
        const re = /<writing_style:([^>\n]+)>\s*([\s\S]*?)\s*<\/writing_style:\1>/gi;
        const blocks = [];
        let m;
        while ((m = re.exec(src))) {
            blocks.push({ name: m[1].trim(), content: m[2].replace(/^\n+|\n+$/g, '') });
        }
        return blocks.length ? blocks : [{ name: '', content: src }];
    }

    // ============================================================
    // 文档读取：TXT / DOCX / DOC / PDF
    // 不加载外部网络解析器。
    // DOCX：直接读取 ZIP 内的 word/document.xml。
    // PDF：使用酒馆页面已经加载的 PDF.js。
    // ============================================================
    // ============================================================
    // 文档读取：TXT / DOCX / DOC / PDF / JSON
    // 优先使用酒馆自己随前端提供的库：
    //   /lib/jszip.min.js  -> DOCX
    //   /lib/pdf.mjs       -> PDF
    // 不依赖 esm.sh / jsDelivr，也不要求 window.JSZip / window.pdfjsLib
    // ============================================================
    let mammothPromise=null;
    function getBaseUrl(){return new URL('.',hostWindow.location.href).href;}
    async function ensureMammoth(){
        if(hostWindow.mammoth?.extractRawText)return hostWindow.mammoth;
        if(mammothPromise)return mammothPromise;
        mammothPromise=(async()=>{
            const script=AWM_SCRIPT_URL||[...root.scripts].map(s=>s.src).find(src=>/\/(?:鲜虾鱼板面|mianmian|mianmianmianmianmian)\/index\.js(?:\?|$)/.test(decodeURI(src)));
            if(!script)throw Error('无法确定鱼板面安装目录，请刷新酒馆后重试');
            const url=new URL('vendor/mammoth.browser.js',script).href;
            await new Promise((resolve,reject)=>{
                const node=root.createElement('script');let timer;
                const finish=error=>{hostWindow.clearTimeout(timer);node.onload=node.onerror=null;if(error){node.remove();reject(error);}else resolve();};
                node.src=url;node.onload=()=>finish(hostWindow.mammoth?.extractRawText?null:Error('DOCX 解析器未正确初始化'));
                node.onerror=()=>finish(Error('无法加载 DOCX 解析器，请确认更新时包含 vendor 文件夹'));
                timer=hostWindow.setTimeout(()=>finish(Error('DOCX 解析器加载超时，请重试')),15000);
                (root.head||root.documentElement).appendChild(node);
            });
            return hostWindow.mammoth;
        })();
        try{return await mammothPromise;}catch(error){mammothPromise=null;throw error;}
    }
    async function readDocx(file){
        const mammoth=await ensureMammoth();
        const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
        if(!result.value.trim())throw Error('DOCX 未提取到文字，请确认文档正文不是图片');
        return result.value;
    }
    function awmPdfPageText(items){
        const lines=[];let line=null;
        for(const item of items){
            if(typeof item.str!=='string'||!item.transform)continue;
            const x=item.transform[4],y=item.transform[5],height=Math.max(1,Math.abs(item.height)||Math.hypot(item.transform[2],item.transform[3])||12);
            if(!line||Math.abs(line.y-y)>Math.max(2,height*.3)){
                line={y,height,x,parts:[]};lines.push(line);
            }
            line.parts.push({...item,x,height});line.height=Math.max(line.height,height);
            if(item.hasEOL)line=null;
        }
        if(!lines.length)return '';
        const margin=Math.min(...lines.filter(l=>l.parts.some(p=>p.str.trim())).map(l=>l.x));
        const output=[];let previous=null;
        for(const row of lines){
            let text='',end=null,last='';
            for(const part of row.parts){
                if(/^\s+$/.test(part.str)&&part.width<part.height*.12)continue;
                const value=part.str.replace(/[\u2f00-\u2fdf]/g,c=>c.normalize('NFKC')).replace(/[⻛⻓⻆]/g,c=>({'⻛':'风','⻓':'长','⻆':'角'})[c]);
                const gap=end===null?0:part.x-end;
                // Preserve actual spaces; infer a missing word gap only from geometry.
                if(text&&value&&!/\s$/.test(text)&&!/^\s/.test(value)){
                    const cjk=/[\u2e80-\u9fff\uf900-\ufaff]/;
                    const threshold=cjk.test(last.slice(-1))&&cjk.test(value[0])?part.height*.65:part.height*.18;
                    if(gap>threshold)text+=' '.repeat(Math.min(8,Math.max(1,Math.round(gap/(part.height*.28)))));
                }
                text+=value;last=value||last;end=part.x+(part.width||0);
            }
            if(!text.trim())continue;
            if(previous&&previous.y-row.y>Math.max(previous.height,row.height)*1.65)output.push('');
            const indent=Math.min(32,Math.max(0,Math.round((row.x-margin)/(row.height*.5))));
            output.push(' '.repeat(indent)+text.replace(/\s+$/,''));previous=row;
        }
        return output.join('\n');
    }
    function awmPdfReflow(pages){
        const blocks=[];let blank=false,fenced=false;
        const kind=t=>/^```|^~~~/.test(t)?'fence':/^#{1,6}\s/.test(t)?'heading':/^<\/?[^<>]+>$/.test(t)?'tag':/^(?:[-*+•]\s|\d+[.)、]\s*)/.test(t)?'list':/^[;；⬇]/.test(t)?'label':/^\|.*\|$/.test(t)?'table':'text';
        const join=(a,b)=>a+(/[\u2e80-\u9fff\uf900-\ufaff，。！？；：、）】》]$/.test(a)||/^[\u2e80-\u9fff\uf900-\ufaff，。！？；：、）】》]/.test(b)||/[-/\u00ad]$/.test(a)?'':' ')+b;
        for(const page of pages){
            blank=false;
            for(const raw of page.trim().split('\n')){
                const text=raw.trim();if(!text){blank=true;continue;}
                const type=kind(text),last=blocks.at(-1);
                if(type==='fence'){blocks.push({text:raw,type,blank});fenced=!fenced;blank=false;continue;}
                if(fenced||type==='table'){blocks.push({text:raw,type:'literal',blank});blank=false;continue;}
                if(!last||type!=='text'||!['text','list'].includes(last.type)||blank){
                    blocks.push({text:raw.trimEnd(),type,blank:blank||(type==='heading'&&/^##/.test(text))});
                }else last.text=join(last.text,text);
                blank=false;
            }
        }
        return blocks.map((b,i)=>(i&&b.blank?'\n':'')+b.text).join('\n');
    }
    async function readPdf(file){
        const base=getBaseUrl();let pdfjs=hostWindow.pdfjsLib,lastError;
        if(!pdfjs?.getDocument){
            for(const filename of ['pdf.min.mjs','pdf.mjs']){
                try{
                    const mod=await import(new URL('lib/'+filename,base).href);
                    pdfjs=mod.getDocument?mod:hostWindow.pdfjsLib;
                    if(!pdfjs?.getDocument)throw Error('PDF 解析器没有可用接口');
                    if(pdfjs.GlobalWorkerOptions)pdfjs.GlobalWorkerOptions.workerSrc=new URL('lib/'+filename.replace('pdf.','pdf.worker.'),base).href;
                    break;
                }catch(error){pdfjs=null;lastError=error;}
            }
        }
        if(!pdfjs?.getDocument)throw Error('无法加载酒馆 PDF 解析器：'+(lastError?.message||''));
        const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});let text;
        try{
            const pdf=await task.promise,pages=[];
            for(let i=1;i<=pdf.numPages;i++){
                const page=await pdf.getPage(i),content=await page.getTextContent();
                pages.push(awmPdfPageText(content.items));page.cleanup?.();
            }
            text=awmPdfReflow(pages);
        }finally{await task.destroy?.();}
        if(!String(text||'').trim())throw Error('PDF 未提取到文字，可能是扫描件或图片型 PDF，需要文字识别');
        return text;
    }

    async function readDocument(file) {
        const ext = file.name.toLowerCase().split('.').pop();

        if (ext === 'txt') return await file.text();
        if (ext === 'json') return await file.text();
        if (ext === 'docx') return await readDocx(file);
        if (ext === 'pdf') return await readPdf(file);

        if (ext === 'doc') {
            throw new Error(
                '旧版 .doc 是二进制 Word 格式，无法用 DOCX 读取器直接解析；' +
                '请将 .doc 另存为 .docx 或 .txt 后导入'
            );
        }

        throw new Error('暂不支持这种文件格式');
    }

    // ============================================================
    // 全部数据：鲜虾鱼板面专用 .mian 文件
    // 说明：不做加密。导出的是完整 JSON，只使用 .mian 扩展名，
    // 导入时同时检查扩展名和插件标识，避免误导入普通 JSON。
    // ============================================================
    const DATA_FILE_FORMAT = '鲜虾鱼板面';
    const DATA_FILE_VERSION = 1;
    const DATA_FILE_PLUGIN = 'ame-style-management-v05';

    function makeDataPackage(data){
        return {
            format: DATA_FILE_FORMAT,
            plugin: DATA_FILE_PLUGIN,
            version: DATA_FILE_VERSION,
            data: data
        };
    }

    function parseDataPackage(text){
        let pack;
        try{
            pack=JSON.parse(String(text||'').replace(/^\uFEFF/,'').trim());
        }catch(_){
            throw new Error('文件内容不是有效的 JSON');
        }

        if(
            !pack ||
            pack.format !== DATA_FILE_FORMAT ||
            pack.plugin !== DATA_FILE_PLUGIN ||
            pack.version !== DATA_FILE_VERSION
        ){
            throw new Error('这不是鲜虾鱼板面的 .mian 数据文件');
        }

        const x=pack.data;
        if(!x || !Array.isArray(x.styles) || !Array.isArray(x.quotes) || !Array.isArray(x.quoteGroups)){
            throw new Error('.mian 文件的数据结构无效');
        }

        return {
            styles:x.styles.map(normalizeStyle),
            quotes:x.quotes,
            quoteGroups:unique(x.quoteGroups),
            settings:Object.assign({},DEFAULT.settings,x.settings||{}),
            mianmian:x.mianmian||clone(DEFAULT.mianmian)
        };
    }

    function exportAllData(){
        try{
            mmPersistCurrent('char'); mmPersistCurrent('user');
            const pack=makeDataPackage(load());
            const text=JSON.stringify(pack,null,2);
            const blob=new Blob([text],{type:'application/json;charset=utf-8'});
            const url=hostWindow.URL.createObjectURL(blob);
            const a=root.createElement('a');
            a.href=url;
            a.download='鲜虾鱼板面_数据备份.mian';
            (root.body||root.documentElement).appendChild(a);
            a.click();
            a.remove();
            hostWindow.setTimeout(()=>hostWindow.URL.revokeObjectURL(url),1000);
            toast('已导出全部数据','success');
        }catch(err){
            console.error('[鲜虾鱼板面]',err);
            toast('导出失败：'+err.message,'error');
        }
    }

    function importAllData(){
        // 不要因为上一次文件选择被取消而锁死按钮。
        // 移动端从文件选择器返回时，用户取消选择通常不会触发 change，
        // 因此这里复用已有 input，并在每次打开前清空 value。
        let input=root.getElementById('awm-data-file-input');

        if(!input){
            input=root.createElement('input');
            input.id='awm-data-file-input';
            input.type='file';
            input.accept='.mian';
            input.style.display='none';
            (root.body||root.documentElement).appendChild(input);
        }

        input.value='';

        input.onchange=async()=>{
            const file=input.files?.[0];
            if(!file)return;

            if(!/\.mian$/i.test(file.name)){
                toast('只能导入 .mian 数据文件','error');
                input.value='';
                return;
            }

            try{
                const text=await file.text();
                const next=parseDataPackage(text);
                // .mian 已通过格式校验，直接覆盖当前插件数据。
                // 不使用浏览器 confirm，避免酒馆/手机端弹窗兼容问题。
                save(next);
                render('styles');
                toast('数据导入成功','success');
            }catch(err){
                toast('数据导入失败：'+err.message,'error');
            }finally{
                // 保留 input 本身，这样移动端取消后仍可再次点击。
                input.value='';
            }
        };

        // 某些移动端在文件选择器返回后会保留旧的文件状态，
        // 先清空 value 再 click，确保下一次一定能重新选择。
        try{
            input.click();
        }catch(err){
            console.error('[鲜虾鱼板面]',err);
            toast('无法打开文件选择器','error');
        }
    }

    // ============================================================
    // ============================================================
    // 面面：双列编辑器、草稿、酒馆角色/User 写回
    // 角色卡和 User 的原始资料只在打开时读取，不存入插件备份。
    // ============================================================
    const MM_STORAGE_CHOICE = ID + '_storage_choice_v1';
    const MM_LOCAL_KEY = ID + '_all_data_v2';
    const MM_EDITOR_HTML = "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>面面</title>\n<style>\n:root{\n  --bg:#f4f3f1;--panel:#fff;--ink:#292827;--muted:#8a8783;--line:#e6e3df;\n  --soft:#f8f7f5;--accent:#6f6a67;--shadow:0 8px 28px rgba(40,35,30,.06)\n}\n*{box-sizing:border-box}html,body{height:100%;margin:0}\nbody{font-family:Inter,\"Noto Sans SC\",\"Microsoft YaHei\",sans-serif;background:var(--bg);color:var(--ink);overflow:hidden}\nbutton,input,textarea,select{font:inherit}\n[contenteditable=\"true\"]{outline:0}button{cursor:pointer}\n.app{height:100vh;display:flex;flex-direction:column}\n.topbar{height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;background:#fff;border-bottom:1px solid var(--line);flex:0 0 62px}\n.brand{display:flex;gap:12px;align-items:center}.logo{width:34px;height:34px;border:1px solid #d9d5d0;border-radius:10px;display:grid;place-items:center;font-size:17px;background:#faf9f7}\n.brand strong{font-size:15px;letter-spacing:.2px}.brand span{font-size:11px;color:var(--muted);margin-left:7px}\n.actions{display:flex;gap:8px}.btn{height:34px;padding:0 13px;border:1px solid var(--line);background:#fff;border-radius:8px;color:#494642}\n.btn:hover{background:#f7f5f2}.btn.primary{background:#2f2d2b;color:white;border-color:#2f2d2b}\n.main{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(360px,.95fr);gap:12px;padding:14px}\n.pane{min-width:0;min-height:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}\n.pane-head{height:52px;flex:0 0 52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid var(--line)}\n.pane-title{font-size:13px;font-weight:650}.pane-sub{font-size:11px;color:var(--muted);margin-top:3px}\n.actions-small{display:flex;gap:7px;align-items:center}.btn-small{height:30px;padding:0 10px;border:1px solid var(--line);background:#fff;border-radius:7px;color:#5e5a56;font-size:11px}\n.scroll{overflow:auto;min-height:0;flex:1;padding:14px}\n.scroll::-webkit-scrollbar{width:9px;height:9px}.scroll::-webkit-scrollbar-thumb{background:#d8d5d1;border-radius:10px;border:2px solid transparent;background-clip:padding-box}\n.prompt-sticky-tools{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.98);padding:10px 14px 8px;margin:-14px -14px 10px;border-bottom:1px solid var(--line);box-shadow:0 3px 10px rgba(40,35,30,.04);backdrop-filter:blur(8px)}.prompt-toolbar{display:flex;gap:8px;margin-bottom:8px}.search{position:relative;flex:1}.search input{width:100%;height:34px;border:1px solid var(--line);border-radius:8px;background:#fbfaf8;padding:0 11px 0 32px;outline:0;font-size:11px}\n.search span{position:absolute;left:11px;top:9px;color:#aaa;font-size:12px}.search-count{font-size:10px;color:#999;white-space:nowrap;align-self:center}.order-note{font-size:11px;color:var(--muted);background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:9px 11px;margin-bottom:12px}\n.card{border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:10px;overflow:hidden;transition:.15s box-shadow,.15s transform}\n.card.dragging{opacity:.55;box-shadow:0 14px 30px rgba(40,35,30,.13);transform:scale(.995)}\n.card.drop-target{border-color:#9d978f;box-shadow:0 0 0 2px #eeeae5}\n.card-head{display:flex;align-items:center;gap:9px;padding:11px 12px;background:#fcfbfa;border-bottom:1px solid var(--line);min-width:0}\n.drag{color:#aaa;cursor:grab;font-size:16px;user-select:none}.num{font-size:10px;color:#aaa;width:22px}\n.type{font-size:10px;letter-spacing:.4px;color:#77716b;border:1px solid #e4e0db;border-radius:999px;padding:3px 7px;background:#fff}\n.card-title{font-size:12px;font-weight:650;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.iconbtn{border:0;background:transparent;color:#888;padding:4px 6px;border-radius:6px}.iconbtn:hover{background:#eeeae6;color:#444}\n.card-body{padding:12px}.merge-check{width:14px;height:14px;margin:0 1px 0 2px;accent-color:#6f6a67}.persona-wrap{position:relative}.card.collapsed .card-body{display:none}.card.collapsed .card-head{border-bottom:0}\n.fold-label{font-size:9px;color:#aaa;margin-left:2px}.editor{width:100%;min-height:145px;resize:vertical;border:0;outline:0;background:transparent;color:#35322f;font-size:13px;line-height:1.8}\n.persona-editor{min-height:120px}\n.meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.chip{font-size:10px;color:#77716b;background:#f5f3f0;border-radius:5px;padding:4px 7px}\n.world-card .card-body{padding:0;background:#fff}\n.editor-tools{display:flex;gap:6px;align-items:center;padding:7px 12px;border-top:1px solid var(--line);background:#fcfbfa}.editor-tools .btn-small{height:27px}.editor-tools .hint{font-size:10px;color:#aaa;margin-left:auto}\n.world-wrap,.persona-wrap{position:relative}.world-highlight,.persona-highlight{position:absolute;inset:0;min-height:120px;padding:18px 20px 24px;color:transparent;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;pointer-events:none;font:15px/1.8 ui-monospace,SFMono-Regular,Consolas,\"Noto Sans Mono\",monospace;z-index:0;overflow:hidden}.world-highlight mark,.persona-highlight mark{background:#f3e4a6;color:transparent;border-radius:2px;padding:0}.world-editor,.persona-editor{position:relative;z-index:1;width:100%;min-height:120px;display:block;border:0;outline:0;background:transparent;color:#35322f;padding:18px 20px 24px;font:15px/1.8 ui-monospace,SFMono-Regular,Consolas,\"Noto Sans Mono\",monospace;resize:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word}.world-editor::placeholder,.persona-editor::placeholder{color:#b3aea8}.world-editor.search-transparent,.persona-editor.search-transparent{color:#35322f;caret-color:#35322f}\n.world-title-input{flex:1 1 120px;min-width:90px;border:0;outline:0;background:transparent;color:#35322f;font-size:12px;font-weight:650;padding:2px 0}\n.world-title-input:focus{border-bottom:1px solid #cfc9c3}\n.persona-highlight,.world-highlight{color:transparent!important;pointer-events:none;user-select:none}.persona-highlight mark,.world-highlight mark{color:transparent!important;background:#f3e4a6;border-radius:2px}.search mark{background:#f3e4a6;color:inherit;border-radius:2px;padding:0 1px}.quick-tags{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;margin:0 0 2px;padding:1px 1px 3px;scrollbar-width:none}.quick-tags::-webkit-scrollbar{display:none}.quick-tag{height:28px;padding:0 9px;border:1px solid var(--line);border-radius:7px;background:#fff;color:#6b6762;font-size:11px}.quick-tag:hover{background:#f7f5f2}.quick-tag code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}\n.world-meta{font-size:9px;color:#aaa;white-space:nowrap}\n.replace-bar{display:none;gap:7px;align-items:center;padding:8px 0 2px}.replace-bar.open{display:flex}.replace-bar input{flex:1;min-width:0;height:32px;border:1px solid var(--line);border-radius:7px;padding:0 9px;outline:0;background:#fbfaf8;font-size:11px}.replace-actions{display:flex;gap:5px}.replace-actions .btn-small{white-space:nowrap}.replace-info{display:none}.pair-hint{font-size:9px;color:#999;margin-left:2px;white-space:nowrap}.pair-tags{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}.pair-tag{border-color:#c9c2b9;background:#faf7f2}.right-scroll{padding:0}.card-preview{padding:18px;border-bottom:1px solid var(--line)}\n.avatar-row{display:flex;gap:13px;align-items:center}.avatar-save-btn{height:30px;align-self:center}.avatar{width:76px;height:76px;border-radius:12px;object-fit:cover;background:#eeeae6;border:1px solid var(--line)}\n.avatar-empty{display:grid;place-items:center;color:#aaa;font-size:24px}.char-name{font-size:19px;font-weight:700}.char-meta{font-size:11px;color:var(--muted);margin-top:5px}\n.section{padding:15px 18px;border-bottom:1px solid var(--line)}.section-title{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:650;margin-bottom:10px}\n.field{margin-bottom:10px}.field:last-child{margin-bottom:0}.field label{display:block;font-size:10px;color:#96908a;margin-bottom:5px}\n.field input,.field textarea{width:100%;border:1px solid var(--line);border-radius:7px;padding:8px 9px;outline:0;background:#fff;font-size:12px}.field textarea{min-height:85px;line-height:1.7;resize:vertical}\n.book-list{display:flex;flex-direction:column;gap:7px}.entry{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}\n.entry-head{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#fbfaf8}.entry-dot{width:7px;height:7px;border-radius:50%;background:#777}\n.entry-name{font-size:11px;font-weight:600;flex:1}.entry-order{font-size:9px;color:#aaa}.entry-body{padding:10px;border-top:1px solid var(--line);display:none}.entry.open .entry-body{display:block}\n.kv{display:grid;grid-template-columns:85px 1fr;gap:7px;margin-bottom:7px;align-items:start}.kv:last-child{margin-bottom:0}.kv label{font-size:9px;color:#999;padding-top:7px}\n.kv input,.kv select,.kv textarea{width:100%;font-size:10px;border:1px solid var(--line);border-radius:6px;padding:6px 7px;background:#fff;outline:0}.kv textarea{min-height:70px;line-height:1.55;resize:vertical}\n.greeting{border:1px solid var(--line);border-radius:8px;margin-bottom:8px;overflow:hidden}.greeting-head{display:flex;align-items:center;padding:8px 10px;background:#fbfaf8;gap:7px}.greeting-head span{font-size:10px;color:#999}.greeting-head strong{font-size:11px;flex:1}.greeting.collapsed .greeting-body{display:none}.greeting-body{padding:9px}.greeting-body textarea{width:100%;min-height:110px;border:1px solid var(--line);border-radius:6px;padding:8px;font-size:11px;line-height:1.65;resize:vertical;outline:0}\n.add{width:100%;height:35px;border:1px dashed #d3cec8;border-radius:8px;background:#fff;color:#777;font-size:11px}.add:hover{background:#faf8f5}\n.footer-note{font-size:10px;color:#aaa;text-align:center;padding:10px}.empty{padding:28px 15px;text-align:center;color:#aaa;font-size:12px;border:1px dashed #ddd8d2;border-radius:9px}\n\n.collection-manage{display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.collection-manage .btn-small.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}.collection-folder-create{display:flex;gap:6px;align-items:center;flex:1;min-width:180px}.collection-folder-create input{height:30px;min-width:0;flex:1;border:1px solid var(--line);border-radius:7px;background:#fbfaf8;padding:0 8px;font-size:10px;outline:0}.collection-folder-create .btn-small{white-space:nowrap}.collection-select-mode .collection-card{cursor:pointer}.collection-select-box{width:16px;height:16px;accent-color:#2f2d2b;display:none;flex:0 0 16px}.collection-pane.select-mode .collection-select-box{display:block}.collection-card.selected{border-color:#8d8882;background:#f8f5f1}.collection-bulk{display:none;gap:5px;align-items:center;width:100%;padding:7px 0 0;border-top:1px solid var(--line);margin-top:3px}.collection-pane.select-mode .collection-bulk{display:flex}.collection-bulk select{height:30px;flex:1;min-width:0;border:1px solid var(--line);border-radius:7px;background:#fff;font-size:10px;padding:0 7px}.collection-bulk .btn-small{white-space:nowrap}.collection-tag-editor{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:5px}.collection-tag-chip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 5px 0 6px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:9px;color:#666}.collection-tag-chip .tag-dot{width:9px;height:9px;border:0;border-radius:50%;padding:0;display:block;cursor:pointer}.tag-color-input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}.collection-tag-chip .tag-text,.collection-tag-chip .tag-remove{border:0;background:transparent;padding:0;color:#666;font-size:9px}.collection-tag-chip .tag-remove{color:#aaa;font-size:10px;cursor:pointer}.collection-tag-chip .tag-dot{width:7px;height:7px;border-radius:50%;display:block}.collection-tag-input{border:0;outline:0;background:transparent;font-size:9px;min-width:90px;height:22px}.collection-tag-color{position:relative;width:20px;height:20px;border:1px solid var(--line);border-radius:50%;padding:0;background:transparent;overflow:hidden;cursor:pointer}.collection-tag-color input{position:absolute;inset:-6px;width:32px;height:32px;opacity:0;cursor:pointer}.collection-meta-folder{font-size:9px;color:#999;margin-top:3px}.collection-card .collection-info{padding-bottom:1px}.collection-card .collection-card-actions{display:none}.collection-card.editing .collection-card-actions{display:none}.collection-folder-name{font-size:9px;color:#888}.collection-folder-create.is-open{display:flex}.collection-tag-filter-dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle}.collection-card .collection-info{display:flex;flex-direction:column;justify-content:center}.collection-card .collection-name{margin-bottom:2px}.collection-card .collection-tag-editor{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px;min-height:22px}.collection-card .collection-tag-input{border:1px solid transparent;border-radius:6px;padding:0 4px;height:22px;min-width:82px;color:#777}.collection-card .collection-tag-input:focus{border-color:var(--line);background:#fbfaf8}.collection-tag-chip{height:21px;padding:0 5px;border-radius:999px;background:#f5f3f0;border-color:transparent}.collection-tag-chip .tag-dot{width:7px;height:7px}.collection-tag-chip .tag-remove{display:none}.collection-tag-chip:hover .tag-remove{display:inline-block}.collection-tag-color{width:18px;height:18px;border-radius:50%}.collection-folder-create{margin:0 0 8px;padding:7px;background:#fbfaf8;border:1px solid var(--line);border-radius:8px}.collection-folder-create input{background:#fff}.collection-folder-name{font-size:9px;color:#999}.collection-pane:not(.select-mode) .collection-select-box{display:none}.collection-pane.select-mode .collection-card{cursor:pointer}\n.collection-tools{display:flex;gap:7px;margin-bottom:9px}.collection-search,.collection-select{height:32px;border:1px solid var(--line);border-radius:7px;background:#fbfaf8;outline:0;font-size:10px;padding:0 9px}.collection-search{flex:1;min-width:0}.collection-select{width:110px}.collection-tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}.collection-filter-tag{height:25px;padding:0 8px;border:1px solid var(--line);border-radius:999px;background:#fff;color:#777;font-size:9px}.collection-filter-tag.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}.collection-folder-tabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 10px}.collection-folder-tab{height:28px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:#fff;color:#777;font-size:9px;cursor:pointer}.collection-folder-tab.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}.collection-folder-delete{width:26px;height:26px;border:1px solid var(--line);border-radius:7px;background:#fff;color:#999;font-size:13px;cursor:pointer}.collection-folder-delete:hover{color:#555;background:#f7f4f0}.collection-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.collection-card{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 9px;box-shadow:none;cursor:pointer}.collection-card:hover{background:#fbfaf8}.collection-card.collection-dragging{opacity:.55}.collection-avatar{width:42px;height:42px;border-radius:8px;object-fit:cover;background:#eeeae6;border:1px solid var(--line);flex:0 0 42px}.collection-avatar.empty{display:grid;place-items:center;color:#aaa;font-size:16px}.collection-info{min-width:0;flex:1}.collection-name{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.collection-meta{font-size:9px;color:#999;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.collection-card-actions{display:flex;gap:3px;align-items:center}.collection-card-actions input{width:55px;height:25px;border:1px solid var(--line);border-radius:6px;padding:0 5px;font-size:9px}.collection-drag-handle{display:none;color:#aaa;cursor:grab;font-size:15px;user-select:none}.collection-pane.drag-mode .collection-drag-handle{display:block}.collection-pane.drag-mode .collection-card{cursor:grab}.collection-empty{padding:28px 15px;border:1px dashed #d8d3cd;border-radius:10px;color:#aaa;text-align:center;font-size:11px}\n.collection-pane{display:none}.collection-pane.collection-modal-open{display:flex;position:fixed;inset:76px 22px 22px 22px;z-index:18;width:auto;height:auto;box-shadow:0 20px 70px rgba(0,0,0,.18)}\n.collection-close{display:none}.collection-pane.collection-modal-open .collection-close{display:block}.collection-card.editing .collection-card-actions{display:flex}.collection-card.editing{background:#faf8f5}\n\n.modal-back{position:fixed;inset:0;background:rgba(35,32,29,.28);display:none;align-items:center;justify-content:center;padding:20px;z-index:20}\n.modal{width:min(720px,100%);max-height:80vh;background:#fff;border-radius:12px;border:1px solid var(--line);box-shadow:0 20px 70px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden}\n.modal-head{padding:13px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}.modal-body{padding:16px;overflow:auto}.modal textarea{width:100%;height:360px;border:1px solid var(--line);border-radius:8px;padding:12px;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical} .confirm-message{font-size:14px;line-height:1.8;color:#444;white-space:pre-line}.confirm-modal{width:min(520px,100%)}\n.backtop{position:fixed;right:28px;bottom:28px;width:38px;height:38px;border:1px solid var(--line);border-radius:50%;background:#fff;color:#666;box-shadow:0 8px 24px rgba(40,35,30,.12);display:none;place-items:center;z-index:15}.backtop.show{display:grid}.toast{position:fixed;right:22px;bottom:22px;background:#302e2b;color:white;padding:10px 13px;border-radius:8px;font-size:11px;opacity:0;transform:translateY(8px);transition:.2s;z-index:30}.toast.show{opacity:1;transform:none}\n.mobile-tabs{display:none}\n.main.prompt-focus{grid-template-columns:minmax(0,1fr)}\n.main.prompt-focus > .pane:not(:first-child){display:none}\n@media (min-width:901px){.prompt-focus .scroll{padding:18px 22px}.prompt-focus .prompt-sticky-tools{margin:-18px -22px 12px;padding-left:22px;padding-right:22px}}\n@media(max-width:900px){\n  body{overflow:hidden}.app{height:100dvh}.topbar{height:auto;min-height:58px;flex:0 0 auto;padding:9px 12px;position:relative}.brand span{display:none}.brand strong{font-size:14px}.actions{gap:5px;max-width:calc(100vw - 64px);overflow-x:auto;scrollbar-width:none}.actions::-webkit-scrollbar{display:none}.actions .btn{padding:0 8px;font-size:10px;height:32px;flex:0 0 auto}\n  .mobile-tabs{display:flex;gap:5px;padding:6px 7px;background:#fff;border-bottom:1px solid var(--line)}.mobile-tabs button{flex:1;height:30px;border:1px solid var(--line);border-radius:8px;background:#faf9f7;color:#777;font-size:11px}.mobile-tabs button.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}\n  .main{display:block;height:calc(100dvh - 86px);padding:8px;overflow:hidden}.pane{height:100%;width:100%;border-radius:10px;box-shadow:none}.pane.mobile-hidden{display:none}.collection-pane{display:flex}.collection-pane.collection-modal-open{position:static;inset:auto;width:100%;height:100%;box-shadow:none}.collection-close{display:none}.pane-head{height:48px;flex-basis:48px;padding:0 12px}.scroll{padding:10px}.replace-bar{display:none;gap:7px;align-items:center;padding:8px 0 2px}.replace-bar.open{display:flex}.replace-bar input{flex:1;min-width:0;height:32px;border:1px solid var(--line);border-radius:7px;padding:0 9px;outline:0;background:#fbfaf8;font-size:11px}.replace-actions{display:flex;gap:5px}.replace-actions .btn-small{white-space:nowrap}.replace-info{display:none}.pair-hint{font-size:9px;color:#999;margin-left:2px;white-space:nowrap}.pair-tags{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}.pair-tag{border-color:#c9c2b9;background:#faf7f2}.right-scroll{padding:0}.prompt-sticky-tools{position:sticky;top:0;z-index:10;margin:-10px -10px 10px;padding:9px 10px 7px;background:rgba(255,255,255,.98);border-bottom:1px solid var(--line);box-shadow:0 3px 10px rgba(40,35,30,.04);backdrop-filter:blur(8px)}.prompt-toolbar{position:relative;top:auto;z-index:auto;background:transparent;padding-bottom:0;margin-bottom:7px}.quick-tags{margin:0;padding-bottom:3px;overflow-x:auto;flex-wrap:nowrap}.quick-tag{flex:0 0 auto}.order-note{display:none}\n  .card{margin-bottom:8px}.card-head{padding:10px;flex-wrap:wrap}.world-card .world-title-input{order:10;flex:1 1 100%;width:100%;min-width:0;height:30px}.world-card .world-meta{margin-left:auto}.world-highlight,.persona-highlight{font-size:15px;line-height:1.8;padding:18px 16px 28px}.world-editor,.persona-editor{min-height:120px;font-size:15px;line-height:1.8;padding:18px 16px 28px}.backtop{right:18px;bottom:18px}\n  .persona-editor{min-height:120px;font-size:15px;line-height:1.8}\n  .section{padding:12px}.card-preview{padding:14px}.avatar{width:62px;height:62px}.field textarea{min-height:110px}\n  .greeting-body textarea{min-height:35dvh}.toast{right:12px;bottom:12px}\n  .topbar{height:46px;flex-basis:46px;padding:0 9px;gap:6px}.brand{gap:7px}.logo{width:28px;height:28px;border-radius:8px;font-size:14px}.brand strong{font-size:13px}.brand span{display:none}.actions{gap:4px;max-width:70%;overflow-x:auto;scrollbar-width:none}.actions::-webkit-scrollbar{display:none}.actions .btn{height:30px;padding:0 9px;font-size:10px;white-space:nowrap}\n  .mobile-tabs{padding:5px 7px}.mobile-tabs button{height:29px;font-size:10px}\n  .main{height:calc(100dvh - 81px);padding:6px;gap:7px}.pane-head{height:40px;flex-basis:40px;padding:0 10px}.pane-title{font-size:11px}.pane-sub{font-size:9px}.pane-head .actions-small{gap:4px}.pane-head .btn-small{height:27px;padding:0 7px;font-size:10px}\n  .prompt-sticky-tools{padding:5px 7px 4px;margin:-10px -10px 6px}.prompt-toolbar{gap:5px;margin-bottom:4px}.search input{height:29px;font-size:10px}.search span{left:9px;top:7px}.quick-tags{gap:4px;padding-bottom:1px}.quick-tag{height:24px;padding:0 7px;font-size:9px}.quick-tag code{font-size:9px}\n  .collection-head{height:auto;min-height:56px;padding:9px 10px;gap:8px}.collection-head strong{font-size:14px}.collection-actions{gap:4px;overflow-x:auto}.collection-actions .btn{height:29px;padding:0 8px;font-size:9px;white-space:nowrap}.collection-list{padding:0;gap:7px;grid-template-columns:repeat(2,minmax(0,1fr))}.collection-tools{margin-bottom:7px}.collection-select{width:96px}.collection-card-actions{display:none}.collection-card.editing .collection-card-actions{display:flex;flex:1;flex-wrap:wrap}.collection-card.editing .collection-card-actions input{display:block;flex:1;min-width:90px}.collection-scroll{padding:9px}\n}\n\n\n.current-tags-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:0 2px 12px;margin-top:-3px}\n.current-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap}\n.current-tag-input{height:24px;min-width:120px;flex:1 1 120px;border:1px solid transparent;border-radius:6px;background:transparent;padding:0 5px;outline:0;font-size:10px;color:#666}\n.current-tag-input:focus{border-color:var(--line);background:#fbfaf8}\n.current-tag-chip{display:inline-flex;align-items:center;gap:4px;height:23px;padding:0 6px;border:1px solid var(--line);border-radius:999px;background:#f7f5f2;font-size:9px;color:#666}\n.current-tag-chip .tag-dot{width:8px;height:8px;border:0;border-radius:50%;padding:0;cursor:pointer}\n.current-tag-chip .tag-remove{border:0;background:transparent;color:#aaa;padding:0 1px;cursor:pointer;font-size:10px}\n@media(max-width:900px){.current-tags-row{padding-bottom:9px}.current-tag-input{min-width:90px}}\n/* 竖屏主编辑区：一列连续滚动，折叠区始终位于底部。 */\n.other-section{border-top:1px solid var(--line);background:#fff}.other-section>summary{padding:17px 18px;font-size:12px;font-weight:650;cursor:pointer;list-style:none}.other-section>summary:after{content:'⌄';float:right;color:#999}.other-section[open]>summary:after{content:'⌃'}.other-section .section{border-top:1px solid var(--line);border-bottom:0}\n@media(max-width:900px){.topbar{min-height:51px;flex-basis:51px}.brand{flex:0 0 auto}.actions{max-width:none;flex:1;justify-content:flex-start}.actions .btn{min-width:44px}.mobile-tabs button{min-width:0;line-height:1.2}.main{height:auto;flex:1;min-height:0}.section{padding:14px}.field textarea{font-size:15px}.greeting-body textarea{font-size:15px}.other-section>summary{font-size:13px}}\n\n/* 最终单列布局；固定工具栏仅用于编辑，不参与卡片排序。 */\nhtml,body,.app{height:100%;overflow:hidden}.topbar{position:relative;z-index:12;flex:0 0 auto;min-height:54px;height:auto;padding:8px 12px;gap:8px}.brand{flex:none;gap:7px}.brand strong{font-size:13px}.actions{flex:1;justify-content:flex-end;overflow-x:auto;max-width:none}.actions .btn{height:34px;flex:none;white-space:nowrap}.main,.main.prompt-focus{display:block;flex:1;min-height:0;height:auto;overflow:hidden;padding:0;width:100%;max-width:760px;margin:0 auto}.pane,.main.prompt-focus>.pane{display:flex!important;height:100%;width:100%;border-radius:0;box-shadow:none}.scroll{padding:0 12px 22px;overflow-y:auto;overscroll-behavior:contain}.prompt-sticky-tools{position:sticky;top:0;margin:0 -12px 0;padding:10px 12px 8px;z-index:11;background:white}.prompt-toolbar{margin:0 0 7px}.prompt-toolbar .btn-small{height:35px;white-space:nowrap}.quick-tags{margin:0}.card-preview{padding:15px 4px 10px;border-bottom:0}.avatar-row{gap:12px}.avatar{width:82px;height:82px;cursor:pointer;flex:none}.char-name{font-size:19px;cursor:pointer}.char-name:hover{text-decoration:underline}#nameInput:not([hidden]){height:38px;border:1px solid var(--line);border-radius:7px;padding:0 9px;font-size:17px;min-width:0;width:min(300px,60vw)}.current-tags-row{padding:4px 4px 10px;margin:0}.current-tag-input{flex:1;min-width:100px}#promptList{margin:0}#promptList .card{margin-bottom:0;border-radius:9px}.card-head .drag{display:none}.card-head .num{font-size:11px}.card-head .type{font-size:10px}.section{padding:17px 4px;border-bottom:1px solid var(--line)}.book-section{padding-top:20px}.section-title{font-size:14px;margin-bottom:12px}.section-count{color:#999;font-size:11px}.book-list{margin-bottom:7px}.book-list:empty{display:none}.entry-head{min-height:45px}.book-drag{font-size:19px;color:#aaa;cursor:grab;touch-action:none;padding:4px}.entry.dragging{opacity:.55}.entry.drop-target{border-color:#9d978f;box-shadow:0 0 0 2px #eeeae5}.entry.open .entry-body{display:block}.entry-body .kv:has(.world-editor){display:block}.entry-body .kv:has(.world-editor)>label{display:block;margin-bottom:4px}.entry-body .world-editor{font-size:15px;min-height:150px;line-height:1.7;padding:10px;resize:vertical;border:1px solid var(--line)}.greeting-list:empty{display:none}.other-section{margin:0 -12px;border-top:0}.other-section>summary{padding:17px 16px;font-size:14px}.other-section .section{padding:14px 16px}.other-section textarea{min-height:110px}.backtop{right:15px;bottom:15px}.mobile-tabs{display:none!important}\n@media(max-width:900px){.topbar{min-height:49px;height:auto;padding:6px}.actions{gap:4px}.actions .btn{height:32px;padding:0 9px}.main{padding:0;height:auto}.scroll{padding:0 10px 20px}.prompt-sticky-tools{margin:0 -10px;padding:10px 10px 7px}.prompt-toolbar{gap:5px}.prompt-toolbar .btn-small{font-size:11px;padding:0 8px}.search input{height:35px;font-size:12px}.search span{top:9px}.quick-tag{height:31px;font-size:11px;padding:0 9px}.quick-tag code{font-size:11px}.card-head{flex-wrap:nowrap}.card-preview{padding:12px 4px}.avatar{width:82px;height:82px}.section{padding:17px 4px}.field textarea{font-size:15px}.greeting-body textarea{min-height:160px}.other-section .field textarea{min-height:100px}}\n\n.format-tools{display:flex;gap:5px;align-items:center;overflow-x:auto;padding:5px 0 1px;scrollbar-width:none}.format-tools::-webkit-scrollbar{display:none}.format-tools .quick-tag{white-space:nowrap;flex:none}.format-tools .quick-tag.active{background:#2f2d2b;color:#fff}.format-tools select{height:30px;border:1px solid var(--line);border-radius:7px;background:white;color:#555;font-size:11px;padding:0 6px;flex:none}.visual-editor{padding:18px 16px 28px;font:15px/1.8 ui-monospace,SFMono-Regular,Consolas,'Noto Sans Mono',monospace;min-height:130px;outline:none;white-space:pre-wrap;overflow-wrap:anywhere}.visual-editor[hidden],textarea[hidden],.persona-highlight[hidden]{display:none!important}.visual-line{min-height:1.8em}.visual-line.h1{font-size:1.75em;font-weight:750;line-height:1.35;margin:7px 0}.visual-line.h2{font-size:1.4em;font-weight:700;line-height:1.45;margin:5px 0}.visual-line.h3{font-size:1.18em;font-weight:650;margin:4px 0}.visual-line.bullet{padding-left:1.3em;position:relative}.visual-line.bullet:before{content:'•';position:absolute;left:.25em}.visual-line.number{padding-left:1.6em;list-style:decimal;display:list-item;list-style-position:inside}.visual-line.quote{padding-left:12px;border-left:3px solid #b9b3ac;color:#777}.visual-line code{background:#f3f1ee;border-radius:3px;padding:1px 3px}.entry-body .visual-editor{border:1px solid var(--line);border-radius:6px;padding:10px;font-family:inherit}.visual-editor strong{font-weight:750}\n:root{--bg:#f6f4f1;--panel:#fff;--ink:#343434;--muted:#8d8a88;--line:#e5e0db;--soft:#f7f5f2}.topbar,.prompt-sticky-tools{display:none!important}\n/* 面面编辑区：统一标题、字段字号和板块分隔 */\n.card-preview .char-name{font-weight:600!important;font-size:19px!important;line-height:1.35!important}\n.section-title,.field>label,.card .card-title,.card .card-head,.entry .entry-title{font-size:14px!important;font-weight:600!important;line-height:1.5!important}\n.section,.book-section,.field{border-color:var(--line)!important}\n.section+.section,details.other-section{border-top:1px solid var(--line)!important;margin-top:16px!important;padding-top:16px!important}\n.section-title{padding-bottom:9px!important;margin-bottom:12px!important;border-bottom:1px solid var(--line)!important}\n.section-count{font-size:12px!important;font-weight:400!important}\n.mm-name-wrap{min-width:0;flex:1}.mm-name-wrap #nameInput:not([hidden]){width:100%;max-width:320px;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 8px}.section-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}</style>\n<style>.mm-search-hit{background:rgba(245,202,104,.23)!important;box-shadow:inset 3px 0 #e7b849!important}mark{background:#f5ca68!important;color:#25211a!important}</style>\n<style>\n.card-preview .avatar-row{align-items:stretch;min-height:82px}.card-preview .mm-name-wrap{min-width:0;flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:1px}.card-preview .char-name{line-height:1.15!important}.card-preview #nameInput:not([hidden]){height:26px;width:100%;font-size:13px}.card-preview .current-tags-row{margin:0;padding:0;min-height:22px;display:flex;flex-wrap:nowrap;overflow:hidden;align-items:center}.card-preview .current-tags{display:flex;gap:3px;max-width:65%;overflow-x:auto;flex:none}.card-preview .current-tag-input{min-width:40px;width:100%;height:23px;font-size:11px}.card-preview .mm-inline-actions{display:flex;gap:4px;align-items:end}.card-preview .mm-inline-actions button{font:inherit;font-size:11px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:5px;padding:2px 6px;cursor:pointer}.entry-head .entry-name-input{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;outline:none}.entry-body .kv{display:block}.entry-body .kv>label{display:block;margin-bottom:4px}.book-section,.book-list,.entry.open,.entry-body{max-height:none!important;overflow:visible!important}.entry-head .merge-check{flex:none;margin:0 4px}.entry-head>span:last-child{display:inline-flex;width:18px;justify-content:center;align-items:center}.mm-busy .card-preview{opacity:.75}\n</style><style>.world-card .card-head>.iconbtn{flex:0 0 28px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;margin:0;padding:0;line-height:1}.card-preview .current-tags-row{display:block;overflow:visible}.card-preview .current-tags{display:flex;flex-wrap:wrap;max-width:none;overflow:visible;gap:4px}.card-preview .current-tag-input{display:block;flex:none;width:100%;margin-top:4px}.card-preview .mm-name-wrap{justify-content:flex-start}.card-preview .mm-inline-actions{margin-top:auto}.entry-head{display:flex;align-items:center;gap:7px}.entry-head .entry-name-input{flex:1;min-width:0}.entry-fold{flex:none;width:25px;height:30px;border:0;background:transparent;color:inherit;cursor:pointer}.section-title #bookName{border:0;background:transparent;color:inherit;font:inherit;font-weight:700;min-width:0;flex:1;outline:none}.section-title #bookName:focus{border-bottom:1px solid var(--line)}.persona-wrap,.world-wrap{height:auto!important;min-height:0!important}.scroll{padding-bottom:75px!important}.entry-head .iconbtn,.entry-head .entry-fold{flex:0 0 28px!important;width:28px!important;height:28px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:0!important;margin:0!important;line-height:1!important;vertical-align:middle!important}</style><style id=\"mm-contrast-style\">\n.card,.card-head,.card-body,.entry,.entry-head,.entry-body,.greeting,.greeting-head,.greeting-body,.other-section,.editor-tools,.type,.btn,.btn-small,.quick-tag,.add,.field input,.field textarea,.kv input,.kv textarea,.kv select,.greeting-body textarea{background:var(--panel);color:var(--ink)}\n.editor,.persona-editor,.world-editor,.world-title-input,.current-tag-input,.char-name,.field label,.kv label,.iconbtn,.section-count,.entry-order,.num{color:var(--ink)}\n.current-tag-input:focus{background:var(--panel)}\ninput::placeholder,textarea::placeholder{color:var(--ink);opacity:.65}\n.entry.open .world-editor{overflow:hidden!important;resize:none!important;max-height:none!important}\n.mm-title-status-row{display:flex;align-items:flex-start;gap:7px;min-width:0;width:100%}.mm-title-status-row .char-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mm-title-status-row #nameInput:not([hidden]){flex:1 1 auto;min-width:0}.mm-title-status-row #mmOperationStatus{margin-left:auto;flex:0 1 auto;min-width:0;text-align:right;font-size:11px;line-height:1.35;overflow-wrap:anywhere}</style>\n<style id=\"mm-no-horizontal-scroll\">.scroll{overflow-x:hidden;overflow-y:auto;overflow-wrap:anywhere}.scroll .card,.scroll .entry,.scroll .section{min-width:0;max-width:100%}.scroll textarea,.scroll input,.scroll [contenteditable]{max-width:100%}#pairTags{display:none}</style><style>/* V10.16 whole-button wrapping */\n.card-preview .mm-inline-actions{display:flex!important;flex-wrap:wrap!important;gap:8px 12px!important;min-width:0;max-width:100%}\n.card-preview .mm-inline-actions button{flex:0 0 auto!important;width:auto!important;min-width:36px!important;min-height:40px;padding:6px 2px!important;white-space:nowrap!important;word-break:normal!important;writing-mode:horizontal-tb!important}\n.card-preview .mm-name-wrap{min-width:0}\n</style><style>/* V10.16 single-row toolbar */\n.card-preview .mm-inline-actions{display:grid!important;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);flex-wrap:nowrap!important;gap:clamp(2px,.7vw,6px)!important;width:100%;min-width:0;max-width:100%;align-items:center}\n.card-preview .mm-inline-actions button{box-sizing:border-box!important;min-width:0!important;width:100%!important;max-width:100%;margin:0!important;padding:6px 0!important;min-height:40px;font-size:clamp(12px,3.3vw,16px)!important;white-space:nowrap!important;word-break:normal!important;writing-mode:horizontal-tb!important}\n@media(max-width:380px){.card-preview .avatar-row{gap:8px}.card-preview .avatar{width:72px!important;height:72px!important;min-width:72px!important;flex:0 0 72px!important}}\n</style></head>\n<body>\n<div class=\"app\">\n<header class=\"topbar\"><div class=\"brand\"><div class=\"logo\">✦</div><strong>面面</strong></div>\n<div class=\"actions\"><button class=\"btn primary\" onclick=\"savePreviewDraft()\">保存</button><button class=\"btn\" onclick=\"requestTavernWrite('overwrite')\">覆盖</button><button class=\"btn\" onclick=\"newCard()\">新建</button><button class=\"btn\" onclick=\"openExportDialog()\">导出</button><button class=\"btn\" onclick=\"undo()\" title=\"撤销\">↶</button><button class=\"btn\" onclick=\"redo()\" title=\"重做\">↷</button></div></header>\n<main class=\"main\"><section class=\"pane\"><div class=\"scroll\" id=\"promptScroll\">\n  <div class=\"prompt-sticky-tools\"><div class=\"prompt-toolbar\"><div class=\"search\"><span>⌕</span><input id=\"promptSearch\" type=\"search\" placeholder=\"搜索人设 / 世界书…\" oninput=\"renderPrompt();renderBook()\"></div><button class=\"btn-small\" onclick=\"openReplace()\">替换</button><button class=\"btn-small\" onclick=\"foldCurrentCard()\">折叠当前</button></div>\n      <div class=\"quick-tags\" id=\"quickTags\" aria-label=\"常用标签\">\n        <button class=\"quick-tag\" data-tag=\"{{user}}\" onclick=\"insertQuickTag('{{user}}')\"><code>{{user}}</code></button>\n        <button class=\"quick-tag\" data-tag=\"{{char}}\" onclick=\"insertQuickTag('{{char}}')\"><code>{{char}}</code></button>\n        <button class=\"quick-tag\" data-tag=\"quote\" data-pair-open=\"&quot;\" data-pair-close=\"&quot;\"><code>\"\"</code></button>\n        <button class=\"quick-tag\" data-tag=\":\" onclick=\"insertQuickTag(':')\"><code>:</code></button>\n        <button class=\"quick-tag\" data-tag=\",\" onclick=\"insertQuickTag(',')\"><code>,</code></button>\n        <button class=\"quick-tag\" data-tag=\".\" onclick=\"insertQuickTag('.')\"><code>.</code></button>\n        <button class=\"quick-tag\" data-tag=\";\" onclick=\"insertQuickTag(';')\"><code>;</code></button>\n        <button class=\"quick-tag\" data-tag=\"- \" onclick=\"insertQuickTag('- ')\"><code>-</code></button>\n        <button class=\"quick-tag\" data-tag=\"【】\" data-pair-open=\"【\" data-pair-close=\"】\"><code>【】</code></button>\n        <button class=\"quick-tag\" data-tag=\"[]\" data-pair-open=\"[\" data-pair-close=\"]\"><code>[]</code></button>\n        <button class=\"quick-tag\" data-tag=\"<>\" data-pair-open=\"&lt;\" data-pair-close=\"&gt;\"><code>&lt;&gt;</code></button>\n        <button class=\"quick-tag\" data-tag=\"()\" data-pair-open=\"(\" data-pair-close=\")\"><code>()</code></button>\n        <span id=\"pairTags\" class=\"pair-tags\" aria-label=\"未闭合标签\"></span>\n      </div>\n      <div class=\"format-tools\" id=\"formatTools\" aria-label=\"文字格式\">\n        <button class=\"quick-tag\" type=\"button\" onclick=\"toggleVisualEditor()\" id=\"visualToggle\" title=\"可视编辑与纯文本编辑切换\">可视编辑</button>\n        <select id=\"blockStyle\" aria-label=\"段落格式\" onchange=\"applyBlockStyle(this.value);this.value=''\">\n          <option value=\"\">正文 / 标题</option><option value=\"h1\">大标题 #</option><option value=\"h2\">中标题 ##</option><option value=\"h3\">小标题 ###</option><option value=\"p\">正文</option>\n        </select>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyInlineStyle('bold')\" title=\"加粗，实际保存为 **文字**\"><b>B</b></button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyInlineStyle('italic')\" title=\"斜体，实际保存为 *文字*\"><i>I</i></button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyBlockStyle('bullet')\" title=\"无序列表，实际保存为 - 条目\">• 列表</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyBlockStyle('number')\" title=\"有序列表，实际保存为 1. 条目\">1. 列表</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyBlockStyle('quote')\" title=\"引用，实际保存为 > 文字\">❞ 引用</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"copyFormat()\" title=\"复制当前段落格式\">格式刷</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"pasteFormat()\" title=\"把复制的格式应用于目标段落\">应用格式</button>\n      </div>\n      <div class=\"replace-bar\" id=\"replaceBar\">\n        <input id=\"replaceFind\" placeholder=\"查找\">\n        <span>→</span><input id=\"replaceWith\" placeholder=\"替换为\">\n        <div class=\"replace-actions\"><button class=\"btn-small\" onclick=\"replaceOne()\">替换</button><button class=\"btn-small\" onclick=\"replaceAllText()\">全部替换</button><button class=\"btn-small\" onclick=\"closeReplace()\">×</button></div>\n        <span class=\"replace-info\" id=\"replaceInfo\"></span>\n      </div>\n  </div>\n  <div class=\"card-preview\"><div class=\"avatar-row\"><div id=\"avatarBox\" class=\"avatar avatar-empty\" role=\"button\" tabindex=\"0\" title=\"更换头像\">＋</div><div class=\"mm-name-wrap\"><div class=\"mm-title-status-row\"><div id=\"nameView\" class=\"char-name\" role=\"button\" tabindex=\"0\" title=\"点击改名\">新角色</div><input id=\"nameInput\" placeholder=\"填写姓名\" hidden></div><div class=\"current-tags-row\" id=\"currentTagsRow\"><div class=\"current-tags\" id=\"currentTags\"></div><input id=\"currentTagInput\" class=\"current-tag-input\" placeholder=\"添加 Tag\" onkeydown=\"handleCurrentTagKeydown(event)\"></div><div class=\"mm-inline-actions\"><button type=\"button\" data-mm-inline=\"overwrite\">覆盖</button><button type=\"button\" data-mm-inline=\"new\">新建</button></div></div></div><input id=\"avatar\" type=\"file\" accept=\"image/*\" hidden onchange=\"loadAvatar(event)\"></div>\n  \n  <div id=\"promptList\"></div>\n  <div class=\"section book-section\"><div class=\"section-title\"><input id=\"bookName\" aria-label=\"点击修改世界书名称\" placeholder=\"Character Book\" oninput=\"state.data.character_book.name=this.value;recordHistory()\"><span id=\"bookCount\" class=\"section-count\">0 entries</span><button class=\"btn-small\" type=\"button\" onclick=\"mergeSelected()\">合并所选</button></div><div id=\"bookList\" class=\"book-list\"></div><button class=\"add\" data-mm-add-entry>＋ 新增世界书条目</button></div>\n  <div class=\"section\"><div class=\"section-title\"><span>First Messages</span><span id=\"greetingCount\" class=\"section-count\">0</span></div><div id=\"greetingList\"></div><button class=\"add\" onclick=\"addGreeting()\">＋ 新增开场白</button></div>\n    <details class=\"other-section\"><summary>Other</summary>    <div class=\"section\">\n      \n      <div class=\"field\"><label>Personality</label><textarea id=\"personality\" placeholder=\"角色性格……\" oninput=\"state.data.personality=this.value;recordHistory()\"></textarea></div>\n      <div class=\"field\"><label>Scenario</label><textarea id=\"scenario\" placeholder=\"故事背景 / 当前场景……\" oninput=\"state.data.scenario=this.value;recordHistory()\"></textarea></div>\n      <div class=\"field\"><label>Creator Notes</label><textarea id=\"creatorNotes\" placeholder=\"作者备注……\" oninput=\"state.data.creator_notes=this.value;recordHistory()\"></textarea></div>\n    </div>\n\n    <div class=\"section\">\n      <div class=\"section-title\"><span>Example Dialogue</span></div>\n      <div class=\"field\"><textarea id=\"mesExample\" placeholder=\"示例对话……\" oninput=\"state.data.mes_example=this.value;recordHistory()\"></textarea></div>\n    </div>\n\n</details>\n</div></section></main>\n<div class=\"modal-back\" id=\"modal\">\n <div class=\"modal\">\n  <div class=\"modal-head\"><strong>粘贴角色卡 JSON</strong><button class=\"iconbtn\" onclick=\"closeModal()\">×</button></div>\n  <div class=\"modal-body\"><textarea id=\"jsonInput\" placeholder='粘贴 chara_card_v2 JSON……'></textarea><div style=\"display:flex;justify-content:flex-end;gap:8px;margin-top:10px\"><button class=\"btn\" onclick=\"closeModal()\">取消</button><button class=\"btn primary\" onclick=\"applyJSON()\">导入</button></div></div>\n </div>\n</div>\n<div class=\"modal-back\" id=\"exportModal\">\n <div class=\"modal confirm-modal\">\n  <div class=\"modal-head\"><strong>选择导出格式</strong><button class=\"iconbtn\" onclick=\"closeExportDialog()\">×</button></div>\n  <div class=\"modal-body\"><div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:10px\">\n   <button class=\"btn\" onclick=\"exportJSON();closeExportDialog()\">JSON</button>\n   <button class=\"btn\" onclick=\"exportPNG();closeExportDialog()\">PNG</button>\n   <button class=\"btn\" onclick=\"exportTXT();closeExportDialog()\">TXT</button>\n  </div></div>\n </div>\n</div>\n\n<div class=\"modal-back\" id=\"confirmModal\">\n <div class=\"modal confirm-modal\">\n  <div class=\"modal-head\"><strong id=\"confirmTitle\">确认操作</strong><button class=\"iconbtn\" onclick=\"closeConfirm()\">×</button></div>\n  <div class=\"modal-body\"><div id=\"confirmMessage\" class=\"confirm-message\"></div><div style=\"display:flex;justify-content:flex-end;gap:8px;margin-top:16px\"><button class=\"btn\" onclick=\"closeConfirm()\">取消</button><button class=\"btn primary\" id=\"confirmOK\">确定</button></div></div>\n </div>\n</div>\n<button class=\"backtop\" id=\"backtop\" title=\"回到顶部\" onclick=\"scrollPromptTop()\">↑</button>\n<div class=\"toast\" id=\"toast\"></div>\n\n<script>\nconst PERSONA_TEMPLATE = `char_name:\n  Chinese name: \n  Nickname: \n  age: \n  gender: \n  height: \n  identity:\n    - \n  background_story:\n    童年(0-12岁):\n    少年(13-18岁):\n    青年(19-35岁):\n    中年(35-至今):\n    现状:\n\n  social_status: \n    - \n\n  appearance:\n    hair: \n    eyes: \n    skin:\n    face_style: \n    build: \n      - \n  attire:\n    business_formal:\n    business_casual:\n    casual_wear:\n    home_wear:\n\n  archetype: \n\n  personality:\n    core_traits: \n      - : \"\"\n    romantic_traits: \n      - : \"\"\n\n\n  lifestyle_behaviors:\n    - \n    - \n\n  work_behaviors:\n    - \n\n  emotional_behaviors:\n    angry:\n    happy: \n\n  goals:\n    - \n\n  weakness:\n    - \n\n  likes:\n    - \n\n  dislikes:\n    - \n\n  skills:\n    - 工作: [\"\",\"\"]\n    - 生活: [\"\",\"\"]\n    - 爱好: [\"\",\"\"]\n\n  NSFW_information:\n    Sex_related traits:\n      experiences: \n      sexual_orientation: \n      sexual_role: \n      sexual_habits: \n        - \n    Kinks: \n    Limits:`;\n\nlet state = {\n  avatarData:\"\",\n  collectionMeta:{tags:[],folder:\"\"},\n  data:{\n    name:\"\",description:\"\",personality:\"\",scenario:\"\",first_mes:\"\",\n    mes_example:\"\",creator_notes:\"\",system_prompt:\"\",post_history_instructions:\"\",\n    alternate_greetings:[],\n    character_book:{name:\"\",description:\"\",scan_depth:4,token_budget:0,recursive_scanning:false,entries:[]}\n  },\n  promptOrder:[]\n};\n\nlet historyStack=[], redoStack=[], historyBusy=false, editSession=null, saveTimer=null;\nfunction getFocusState(){\n  const el=document.activeElement;\n  if(!el || !el.matches?.('textarea,input,select,[contenteditable=\"true\"]')) return null;\n  const info={id:el.id||'',historyKey:el.dataset?.historyKey||'',dataId:el.dataset?.id||'',selectionStart:null,selectionEnd:null,scrollTop:el.scrollTop||0,scrollLeft:el.scrollLeft||0};\n  if(typeof el.selectionStart==='number'){info.selectionStart=el.selectionStart;info.selectionEnd=el.selectionEnd;}\n  return info;\n}\nfunction getViewState(){\n  const ps=document.getElementById('promptScroll'), rs=document.querySelector('.right-scroll');\n  return {promptTop:ps?.scrollTop||0,promptLeft:ps?.scrollLeft||0,rightTop:rs?.scrollTop||0,rightLeft:rs?.scrollLeft||0};\n}\nfunction snapshot(){ return JSON.stringify({avatarData:state.avatarData,collectionMeta:state.collectionMeta||{tags:[],folder:\"\"},data:state.data,promptOrder:state.promptOrder,__focus:getFocusState(),__view:getViewState()}); }\nfunction restoreSnapshot(raw){\n  const x=JSON.parse(raw);\n  const focus=x.__focus||null;\n  const view=x.__view||null;\n  delete x.__focus; delete x.__view;\n  state=x;\n  renderAll();\n  markDirty(false);\n  requestAnimationFrame(()=>{\n    restoreFocus(focus);\n    if(view){\n      requestAnimationFrame(()=>{\n        const ps=document.getElementById('promptScroll'),rs=document.querySelector('.right-scroll');\n        if(ps){ps.scrollTop=view.promptTop||0;ps.scrollLeft=view.promptLeft||0}\n        if(rs){rs.scrollTop=view.rightTop||0;rs.scrollLeft=view.rightLeft||0}\n      });\n    }\n  });\n}\nfunction restoreFocus(info){\n  if(!info)return;\n  let el=null;\n  if(info.historyKey) el=document.querySelector(`[data-history-key=\"${CSS.escape(info.historyKey)}\"]`);\n  if(!el && info.dataId) el=document.querySelector(`[data-id=\"${CSS.escape(info.dataId)}\"]`);\n  if(!el && info.id) el=document.getElementById(info.id);\n  if(!el)return;\n  el.focus({preventScroll:true});\n  if(typeof el.setSelectionRange==='function' && typeof info.selectionStart==='number'){\n    const max=el.value?.length||0;\n    const a=Math.min(info.selectionStart,max),b=Math.min(info.selectionEnd??a,max);\n    el.setSelectionRange(a,b);\n  }\n  if(typeof info.scrollTop==='number')el.scrollTop=info.scrollTop;\n  if(typeof info.scrollLeft==='number')el.scrollLeft=info.scrollLeft;\n}\nfunction recordHistory(){\n  if(historyBusy)return;\n  const snap=snapshot();\n  if(historyStack[historyStack.length-1]!==snap){\n    historyStack.push(snap);\n    if(historyStack.length>300)historyStack.shift();\n  }\n  redoStack=[];markDirty(true);\n}\nfunction pushHistory(){recordHistory()}\nfunction beginEditSession(el){editSession=el?.dataset?.historyKey||el?.id||''}\nfunction endEditSession(){editSession=null}\nfunction undo(){\n  if(historyStack.length<2)return;\n  historyBusy=true;\n  const current=historyStack.pop();\n  redoStack.push(current);\n  restoreSnapshot(historyStack[historyStack.length-1]);\n  historyBusy=false;toast(\"已撤销上一步\");\n}\nfunction redo(){\n  if(!redoStack.length)return;\n  historyBusy=true;\n  const next=redoStack.pop();\n  historyStack.push(next);\n  restoreSnapshot(next);\n  historyBusy=false;toast(\"已重做上一步\");\n}\nfunction markDirty(dirty=true){clearTimeout(saveTimer);if(dirty)saveTimer=setTimeout(()=>saveLocal(true),600)}\nfunction saveLocal(silent=false){try{if(window.parent!==window)window.parent.postMessage({source:'mianmian-editor',action:'draftChanged',card:cardRaw(),avatarData:state.avatarData,userTags:window.__mmUserTags?.()},'*');markDirty(false)}catch(e){if(!silent)toast('草稿同步失败')}}\nfunction restoreLocal(){return false}\nfunction uid(){return Math.random().toString(36).slice(2,10)}\nfunction toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1500)}\nfunction esc(s){return String(s??\"\").replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]))}\nfunction entryTitle(e){return e.comment||\"未命名世界书条目\"}\nfunction renderName(){document.getElementById('nameView').textContent=state.data.name||\"CHAR\";document.getElementById('nameInput').value=state.data.name||\"\"}\nfunction editName(){const view=document.getElementById('nameView'),input=document.getElementById('nameInput');view.hidden=true;input.hidden=false;input.value=state.data.name||'';input.focus();input.select()}\nfunction finishName(){const view=document.getElementById('nameView'),input=document.getElementById('nameInput');state.data.name=input.value.trim();view.hidden=false;input.hidden=true;renderName();recordHistory()}\ndocument.getElementById('nameView').addEventListener('click',editName);\ndocument.getElementById('nameView').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();editName()}});\ndocument.getElementById('nameInput').addEventListener('blur',finishName);\ndocument.getElementById('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur()}});\ndocument.querySelector('.card-preview').addEventListener('click',e=>{if(e.target.closest('#avatarBox'))document.getElementById('avatar').click()});\ndocument.querySelector('.card-preview').addEventListener('keydown',e=>{if(e.target.id==='avatarBox'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();document.getElementById('avatar').click()}});\n\nfunction makeEntry(){\n  return {id:uid(),comment:\"新世界书条目\",keys:[],secondary_keys:[],content:\"\",\n    constant:false,selective:false,selectiveLogic:\"AND\",insertion_order:1,position:\"before_char\",\n    depth:undefined,activation:{mode:\"keyword\",probability:100,weight:1,pool:\"default\"},\n    importance:\"medium\",persistence:false,dependencies:[],participants:[],enabled:true,\n    prevent_recursion:false}\n}\nfunction normalizeEntry(e,i){\n  e={...makeEntry(),...e,id:e.id||uid()};\n  if(!Array.isArray(e.keys))e.keys=typeof e.keys===\"string\"?e.keys.split(/[,，]/).map(x=>x.trim()).filter(Boolean):[];\n  if(!Array.isArray(e.secondary_keys))e.secondary_keys=[];\n  e.insertion_order=Number.isFinite(Number(e.insertion_order))?Number(e.insertion_order):(i+1);\n  return e;\n}\nfunction emptyState(){\n  return {avatarData:\"\",collectionMeta:{tags:[],folder:\"\"},data:{name:\"\",description:\"\",personality:\"\",scenario:\"\",first_mes:\"\",\n    mes_example:\"\",creator_notes:\"\",system_prompt:\"\",post_history_instructions:\"\",alternate_greetings:[],\n    character_book:{name:\"\",description:\"\",scan_depth:4,token_budget:0,recursive_scanning:false,entries:[]}},promptOrder:[]}\n}\nfunction initialState(){\n  // HTML 刚打开、以及「清空」后的真正初始状态：只保留一张完全空白的人设卡。\n  const s=emptyState();\n  s.promptOrder=[{id:uid(),type:\"description\",ref:null,collapsed:false}];\n  return s;\n}\nfunction templateState(){\n  // 「新建」专用：只有点击新建时才加载人设模板。\n  const s=initialState();\n  s.data.description=PERSONA_TEMPLATE;\n  return s;\n}\nlet pendingConfirmAction=null;\nfunction showConfirm(title,message,action){\n  pendingConfirmAction=action;\n  document.getElementById('confirmTitle').textContent=title;\n  document.getElementById('confirmMessage').textContent=message;\n  document.getElementById('confirmOK').onclick=()=>{const fn=pendingConfirmAction;pendingConfirmAction=null;closeConfirm();if(fn)fn()};\n  document.getElementById('confirmModal').style.display='flex';\n}\nfunction closeConfirm(){pendingConfirmAction=null;document.getElementById('confirmModal').style.display='none'}\nfunction replaceStateAndRecord(next,label){\n  // 先保留当前状态，再替换为新状态；新状态本身作为一条历史记录。\n  if(historyStack.length===0)historyStack=[snapshot()];\n  state=next;\n  renderAll();\n  recordHistory();\n  saveLocal(true);\n  toast(label);\n}\nfunction newCard(){\n  showConfirm('新建角色卡','当前编辑内容将被替换为空白角色卡。\\n\\n确定新建吗？',()=>{\n    const fileInputs=document.querySelectorAll('input[type=\"file\"]');fileInputs.forEach(x=>x.value='');\n    const search=document.getElementById('promptSearch');if(search)search.value='';\n    replaceStateAndRecord(initialState(),'已新建空白角色卡');\n  });\n}\nfunction clearAll(){\n  showConfirm('清空角色卡','这会清除角色名、头像、人设内容、世界书、开场白、示例对话以及所有其他数据。\\n\\n清空后只保留一张完全空白的人设卡，不会载入模板。\\n\\n确定清空吗？',()=>{\n    const fileInputs=document.querySelectorAll('input[type=\"file\"]');fileInputs.forEach(x=>x.value='');\n    const search=document.getElementById('promptSearch');if(search)search.value='';\n    replaceStateAndRecord(initialState(),'已全部清空');\n  });\n}\nfunction addPromptBlock(type=\"world\"){\n  if(type!==\"world\")return;\n  const e=makeEntry();e.insertion_order=Math.max(0,...state.data.character_book.entries.map(x=>Number(x.insertion_order)||0))+1;state.data.character_book.entries.push(e);\n  state.promptOrder.splice(1,0,{id:uid(),type:'world',ref:e.id,collapsed:false});recordHistory();renderAll()\n}\nfunction addEntry(){\n  if(document.body.classList.contains('mm-busy'))return;\n  const search=document.getElementById('promptSearch');if(search)search.value='';\n  addPromptBlock(\"world\");\n  const entry=state.data.character_book.entries.at(-1);\n  const node=[...document.querySelectorAll('#bookList .entry')].find(e=>e.dataset.id===entry.id);\n  if(node){node.classList.add('open');node.querySelector('.entry-fold').textContent='−';node.scrollIntoView({block:'nearest'});}\n  window.parent.postMessage({source:'mianmian-editor',action:'bookAdded',...window.__mmSnapshot()},'*');\n}\nfunction removeBlock(id){ const i=state.promptOrder.findIndex(x=>x.id===id);if(i<0)return;\n  const b=state.promptOrder[i];\n  if(b.type===\"world\")state.data.character_book.entries=state.data.character_book.entries.filter(e=>e.id!==b.ref);\n  state.promptOrder.splice(i,1);recordHistory();renderAll()\n}\nfunction syncOrders(){\n  let n=Math.max(state.data.character_book.entries.length,...state.data.character_book.entries.map(e=>Number(e.insertion_order)||0));state.promptOrder.forEach(b=>{if(b.type==='world'){const e=state.data.character_book.entries.find(x=>x.id===b.ref);if(e)e.insertion_order=n--}})\n}\nfunction moveBlock(from,to){\n  if(from===to)return;const [x]=state.promptOrder.splice(from,1);state.promptOrder.splice(to,0,x);syncOrders();recordHistory();renderAll()\n}\nfunction toggleBlock(id){const b=state.promptOrder.find(x=>x.id===id);if(b){b.collapsed=!b.collapsed;renderPrompt()}}\nfunction collapseAll(){state.promptOrder.forEach(b=>b.collapsed=true);renderPrompt()}\nfunction expandAll(){state.promptOrder.forEach(b=>b.collapsed=false);renderPrompt()}\n\nfunction textFromHTML(el){const clone=el.cloneNode(true);clone.querySelectorAll('mark').forEach(m=>m.replaceWith(document.createTextNode(m.textContent)));clone.querySelectorAll('br').forEach(b=>b.replaceWith('\\n'));return (clone.innerText||clone.textContent||\"\").replace(/\\u00a0/g,' ')}\nfunction highlightText(text,q){if(!q)return esc(text).replace(/\\n/g,'<br>');const safe=esc(text).replace(/\\n/g,'<br>');const re=new RegExp('('+q.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+')','gi');return safe.replace(re,'<mark>$1</mark>')}\nfunction updateEntryFromEditor(el){const e=state.data.character_book.entries.find(x=>x.id===el.dataset.id);if(e)e.content=el.value;updateEditorHighlight(el);autoGrowTextarea(el)}\nfunction syncEditor(el){const e=state.data.character_book.entries.find(x=>x.id===el.dataset.id);if(e)e.content=el.value}\nfunction updateEditorHighlight(el){const box=el.parentElement?.querySelector(el.classList.contains('persona-editor')?'.persona-highlight':'.world-highlight');if(!box)return;const q=(document.getElementById('promptSearch')?.value||'').trim();box.innerHTML=highlightText(el.value,q);box.style.height=Math.max(el.offsetHeight,120)+'px';box.scrollTop=el.scrollTop;box.scrollLeft=el.scrollLeft;el.classList.remove('search-transparent')}\nfunction updateWorldHighlight(el){updateEditorHighlight(el)}\nfunction captureScrollState(el){const states=[];let p=el;while(p){states.push([p,p.scrollTop,p.scrollLeft]);p=p.parentElement}return states}\nfunction restoreScrollState(states){states.forEach(([p,top,left])=>{p.scrollTop=top;p.scrollLeft=left})}\nfunction growTextarea(el,min=120){const ps=document.getElementById('promptScroll'),rs=document.querySelector('.right-scroll');const pt=ps?.scrollTop||0,rt=rs?.scrollTop||0;const a=el.selectionStart,b=el.selectionEnd;const states=captureScrollState(el);el.style.height='auto';el.style.height=Math.max(min,el.scrollHeight)+'px';restoreScrollState(states);if(ps)ps.scrollTop=pt;if(rs)rs.scrollTop=rt;if(document.activeElement===el&&typeof a==='number')el.setSelectionRange(a,b)}\nfunction autoGrowEditor(el){growTextarea(el,120)}\nfunction autoGrowTextarea(el){growTextarea(el,120)}\nfunction autoGrowAll(){document.querySelectorAll('.world-editor,.persona-editor').forEach(el=>growTextarea(el,120));}\nfunction growOpenBookEntries(){document.querySelectorAll('#bookList .entry.open .world-editor').forEach(el=>autoGrowTextarea(el))}\nfunction toggleBookEntry(button){const entry=button.closest('.entry');entry.classList.toggle('open');button.textContent=entry.classList.contains('open')?'−':'＋';if(entry.classList.contains('open'))requestAnimationFrame(()=>growOpenBookEntries())}\nlet mmEditorResizeObserver;\nfunction watchEditorWidth(){const scroller=document.getElementById('promptScroll');if(!scroller||mmEditorResizeObserver)return;let width=scroller.clientWidth;mmEditorResizeObserver=new ResizeObserver(()=>{const next=scroller.clientWidth;if(next===width)return;width=next;requestAnimationFrame(()=>{autoGrowAll();document.querySelectorAll('.persona-editor,.world-editor').forEach(updateEditorHighlight)})});mmEditorResizeObserver.observe(scroller)}\nfunction scrollPromptTop(){document.getElementById('promptScroll')?.scrollTo({top:0,behavior:'smooth'})}\nfunction scrollFirstSearchMatch(){\n  requestAnimationFrame(()=>{\n    const q=(document.getElementById('promptSearch')?.value||'').trim();\n    if(!q)return;\n    const first=document.querySelector('#promptList .world-highlight mark, #promptList .persona-highlight mark');\n    if(first)first.parentElement?.scrollIntoView({behavior:'smooth',block:'center'});\n  });\n}\nfunction updateSearchCount(){}\nfunction updatePersonaHighlight(){}\nfunction mergeSelected(){const ids=[...document.querySelectorAll('#bookList .merge-check:checked')].map(x=>x.dataset.mergeId);if(ids.length<2){toast('至少选择 2 个世界书条目');return;}const ordered=state.promptOrder.filter(b=>b.type==='world'&&ids.includes(b.ref)).map(b=>state.data.character_book.entries.find(e=>e.id===b.ref)).filter(Boolean);const merged={...normalizeEntry({...ordered[0],id:uid(),comment:''},0),comment:'',content:ordered.map(e=>`【${e.comment||'未命名世界书条目'}】\\n${e.content||''}`).join('\\n\\n'),keys:[...new Set(ordered.flatMap(e=>e.keys||[]))]};const firstId=ordered[0].id;state.data.character_book.entries=state.data.character_book.entries.filter(e=>!ids.includes(e.id));state.data.character_book.entries.push(merged);const firstIndex=state.promptOrder.findIndex(b=>b.type==='world'&&b.ref===firstId);state.promptOrder=state.promptOrder.filter(b=>!(b.type==='world'&&ids.includes(b.ref)));state.promptOrder.splice(firstIndex,0,{id:uid(),type:'world',ref:merged.id,collapsed:false});recordHistory();renderAll();toast(`已合并 ${ordered.length} 个世界书条目`)}\nfunction getTextareaLineInfo(el){\n  const start=el.selectionStart,value=el.value;\n  const lineStart=value.lastIndexOf('\\n',start-1)+1;\n  const lineEnd0=value.indexOf('\\n',start);\n  const lineEnd=lineEnd0<0?value.length:lineEnd0;\n  const line=value.slice(lineStart,lineEnd);\n  const m=line.match(/^(\\s*)(-\\s+|\\*\\s+|\\d+[.)]\\s+)(.*)$/);\n  const indent=(line.match(/^\\s*/)||[''])[0];\n  return {value,start,lineStart,lineEnd,line,m,indent,marker:m?.[2]||'',content:m?.[3]||''};\n}\nfunction findPreviousNonEmptyLine(value,lineStart){\n  let end=lineStart-1;\n  while(end>=0){\n    const start=value.lastIndexOf('\\n',end-1)+1;\n    const line=value.slice(start,end).replace(/\\r$/,'');\n    if(line.trim())return {start,line};\n    if(start===0)break;\n    end=start-1;\n  }\n  return null;\n}\nfunction parentIndentForLine(value,lineStart,currentIndent){\n  const prev=findPreviousNonEmptyLine(value,lineStart);\n  if(!prev)return '';\n  const prevIndent=(prev.line.match(/^\\s*/)||[''])[0];\n  if(prevIndent.length<currentIndent.length)return prevIndent;\n  let end=prev.start;\n  while(end>0){\n    const p=findPreviousNonEmptyLine(value,end);\n    if(!p)break;\n    const pi=(p.line.match(/^\\s*/)||[''])[0];\n    if(pi.length<currentIndent.length)return pi;\n    end=p.start;\n  }\n  return currentIndent.length>=4?currentIndent.slice(0,-4):'';\n}\nfunction indentUnit(){return '    ';}\nfunction handleSmartListKeydown(e){\n  const el=e.target;\n  if(!el.matches?.('textarea')||!['Enter','Backspace','Tab'].includes(e.key))return;\n  if(e.isComposing)return;\n  const value=el.value,start=el.selectionStart,end=el.selectionEnd;\n  if(start!==end)return;\n  const info=getTextareaLineInfo(el);\n  const {lineStart,line,m,indent,marker,content}=info;\n\n  if(e.key==='Enter'){\n    e.preventDefault();\n    // 列表回车：严格复制当前行的缩进和项目符号，保持同一级。\n    if(m){\n      el.setRangeText('\\n'+indent+marker,start,start,'end');\n    }else{\n      // 普通 YAML 键在冒号后进入下一层；普通文本保持当前缩进。\n      const trimmed=line.trimEnd();\n      const nextIndent=/[:：]$/.test(trimmed)?indent+indentUnit():indent;\n      el.setRangeText('\\n'+nextIndent,start,start,'end');\n    }\n    el.dispatchEvent(new Event('input',{bubbles:true}));\n    return;\n  }\n\n  if(e.key==='Backspace'){\n    // 只有“刚生成的空列表项、光标停在项目符号末尾”才退出列表层级。\n    // 一旦用户已经把这一行原有内容删空，Backspace 必须恢复办公软件原生行为，\n    // 允许继续删除换行并与上一行合并。\n    const isEmptyList=m && content.trim()==='' && start===lineStart+indent.length+marker.length;\n    if(isEmptyList && lineStart>0){\n      e.preventDefault();\n      const parent=parentIndentForLine(value,lineStart,indent);\n      // 删除当前行的缩进和项目符号，并保留一个可继续输入的位置。\n      el.setRangeText(parent,lineStart,start,'end');\n      el.dispatchEvent(new Event('input',{bubbles:true}));\n    }\n    return;\n  }\n\n  if(e.key==='Tab'){\n    e.preventDefault();\n    if(e.shiftKey){\n      if(indent.length){\n        const remove=Math.min(indentUnit().length,indent.length);\n        el.setRangeText('',lineStart,lineStart+remove,'start');\n      }\n    }else{\n      el.setRangeText(indentUnit(),lineStart,lineStart,'end');\n    }\n    el.dispatchEvent(new Event('input',{bubbles:true}));\n  }\n}\nfunction bindSmartListEditing(){\n  document.querySelectorAll('textarea,[contenteditable=\"true\"]').forEach(el=>{if(el.dataset.mmSmartListBound)return;el.dataset.mmSmartListBound='1';el.addEventListener('keydown',handleSmartListKeydown)});\n  document.querySelectorAll('.quick-tag[data-pair-open]').forEach(btn=>{\n    if(btn.dataset.bound==='1')return;\n    btn.dataset.bound='1';\n    btn.addEventListener('mousedown',ev=>ev.preventDefault());\n    btn.addEventListener('click',()=>insertQuickPair(btn.dataset.pairOpen||'',btn.dataset.pairClose||''));\n  });\n}\nlet lastEditor=null,lastSelectionStart=0,lastSelectionEnd=0;\nfunction rememberEditor(el){if(!el?.matches?.('.persona-editor,.world-editor'))return;lastEditor=el;lastSelectionStart=el.selectionStart??0;lastSelectionEnd=el.selectionEnd??lastSelectionStart;updatePairTag()}\nfunction insertQuickTag(tag){\n  if(visualMode&&activeVisualEditor?.isConnected){insertVisualText(tag);return}\n  const el=lastEditor?.isConnected?lastEditor:(document.activeElement?.matches?.('.persona-editor,.world-editor')?document.activeElement:document.querySelector('.persona-editor,.world-editor'));\n  if(!el){toast('请先点进人设或世界书正文');return}\n  const start=lastEditor===el?lastSelectionStart:(el.selectionStart??el.value.length),end=lastEditor===el?lastSelectionEnd:(el.selectionEnd??start);\n  el.focus(); el.setRangeText(tag,start,end,'end');\n  lastEditor=el; lastSelectionStart=start+tag.length; lastSelectionEnd=start+tag.length;\n  el.dispatchEvent(new Event('input',{bubbles:true})); rememberEditor(el);\n}\nfunction insertQuickPair(open,close){\n  if(visualMode&&activeVisualEditor?.isConnected){\n    const editor=activeVisualEditor,selection=window.getSelection();editor.focus();\n    if(selection?.rangeCount){\n      const range=selection.getRangeAt(0);\n      if(editor.contains(range.commonAncestorContainer)){\n        range.deleteContents();const text=document.createTextNode(open+close);range.insertNode(text);\n        const caret=document.createRange();caret.setStart(text,open.length);caret.collapse(true);\n        selection.removeAllRanges();selection.addRange(caret);syncVisualEditor(editor);return;\n      }\n    }\n    insertVisualText(open+close);return;\n  }\n  const el=lastEditor?.isConnected?lastEditor:(document.activeElement?.matches?.('.persona-editor,.world-editor')?document.activeElement:document.querySelector('.persona-editor,.world-editor'));\n  if(!el){toast('请先点进人设或世界书正文');return}\n  const start=lastEditor===el?lastSelectionStart:(el.selectionStart??el.value.length),end=lastEditor===el?lastSelectionEnd:(el.selectionEnd??start);\n  const text=open+close; el.focus(); el.setRangeText(text,start,end,'end');\n  const pos=start+open.length; el.setSelectionRange(pos,pos);\n  lastEditor=el; lastSelectionStart=pos; lastSelectionEnd=pos;\n  el.dispatchEvent(new Event('input',{bubbles:true})); rememberEditor(el);\n}\nconst dismissedPairs=new Map();\nfunction findUnmatchedTags(text){\n  // 扫描当前卡片里的所有 XML/HTML 风格标签；导入和手动输入一视同仁。\n  const re=/<\\/?([^<>\\s/]+)(?:\\s[^<>]*)?>/g;\n  const stack=[], unmatchedClose=[];\n  let m;\n  while((m=re.exec(text||''))){\n    const full=m[0], name=m[1];\n    const closing=full.startsWith('</');\n    const self=/\\/\\s*>$/.test(full);\n    if(self) continue;\n    if(!closing) stack.push({name,pos:m.index});\n    else{\n      let idx=-1;\n      for(let i=stack.length-1;i>=0;i--){ if(stack[i].name===name){idx=i;break} }\n      if(idx>=0) stack.splice(idx,1);\n      else unmatchedClose.push({name,pos:m.index});\n    }\n  }\n  const out=[], seen=new Set();\n  stack.forEach(x=>{\n    const label='</'+x.name+'>';\n    if(!seen.has(label)){seen.add(label);out.push({label,open:'',close:label});}\n  });\n  unmatchedClose.forEach(x=>{\n    const label='<'+x.name+'>';\n    if(!seen.has(label)){seen.add(label);out.push({label,open:label,close:''});}\n  });\n  return out;\n}\nfunction updatePairTag(){\n  const box=document.getElementById('pairTags'); if(!box)return;\n  const el=lastEditor?.isConnected?lastEditor:null;\n  if(!el){box.innerHTML='';return}\n  const key=el.dataset.historyKey||el.dataset.id||el.id||'editor';\n  const pairs=findUnmatchedTags(el.value);\n  const seen=new Set();\n  box.innerHTML=pairs.filter(p=>{\n    const k=p.label+'|'+p.open+'|'+p.close;\n    if(seen.has(k)||dismissedPairs.get(key)?.has(k))return false;\n    seen.add(k);return true;\n  }).map(p=>`<button class=\"quick-tag pair-tag\" type=\"button\" data-pair-open=\"${esc(p.open)}\" data-pair-close=\"${esc(p.close)}\" data-pair-key=\"${esc(p.label+'|'+p.open+'|'+p.close)}\"><code>${esc(p.label)}</code></button>`).join('');\n  box.querySelectorAll('.pair-tag').forEach(btn=>{\n    btn.addEventListener('mousedown',ev=>ev.preventDefault());\n    btn.addEventListener('click',()=>insertQuickPair(btn.dataset.pairOpen||'',btn.dataset.pairClose||''));\n    btn.addEventListener('dblclick',ev=>{\n      ev.preventDefault();\n      const set=dismissedPairs.get(key)||new Set(); set.add(btn.dataset.pairKey); dismissedPairs.set(key,set); btn.remove();\n    });\n  });\n}\nfunction insertMatchingPair(){const first=document.querySelector('#pairTags .pair-tag');if(first)first.click()}\nfunction openReplace(){if(visualMode)toggleVisualEditor();document.getElementById('replaceBar').classList.add('open');document.getElementById('replaceFind').focus();updateReplaceInfo()}\nfunction closeReplace(){document.getElementById('replaceBar').classList.remove('open')}\nfunction getEditableElements(){return [...document.querySelectorAll('.persona-editor,.world-editor')].filter(e=>e.isConnected)}\nfunction replaceCount(find){if(!find)return 0;let n=0;for(const el of getEditableElements()){let i=0;while((i=el.value.indexOf(find,i))!==-1){n++;i+=Math.max(1,find.length)}}return n}\nfunction updateReplaceInfo(){const find=document.getElementById('replaceFind')?.value||'';const info=document.getElementById('replaceInfo');if(info)info.textContent=find?`共 ${replaceCount(find)} 处`:''}\nfunction replaceOne(){const find=document.getElementById('replaceFind').value;if(!find)return;const withv=document.getElementById('replaceWith').value;const el=lastEditor?.isConnected?lastEditor:getEditableElements()[0];if(!el)return;const start=el.selectionStart??0;const idx=el.value.indexOf(find,start);const idx2=idx<0?el.value.indexOf(find):idx;if(idx2<0){toast('没有找到');return}el.focus();el.setRangeText(withv,idx2,idx2+find.length,'end');el.dispatchEvent(new Event('input',{bubbles:true}));lastEditor=el;lastSelectionStart=idx2+withv.length;lastSelectionEnd=lastSelectionStart;updateReplaceInfo()}\nfunction replaceAllText(){const find=document.getElementById('replaceFind').value;if(!find)return;const withv=document.getElementById('replaceWith').value;let total=0;for(const el of getEditableElements()){const n=(el.value.match(new RegExp(find.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'g'))||[]).length;if(n){el.value=el.value.split(find).join(withv);el.dispatchEvent(new Event('input',{bubbles:true}));total+=n}}toast(`已全部替换 ${total} 处`);updateReplaceInfo()}\n\nfunction foldCurrentCard(){\n  const ae=document.activeElement;\n  let el=ae?.closest?.('#promptList .card');\n  if(!el && lastEditor?.isConnected)el=lastEditor.closest?.('#promptList .card');\n  if(!el){toast('请先点一下要折叠的卡片');return}\n  const b=state.promptOrder[Number(el.dataset.i)];\n  if(b){b.collapsed=true;renderPrompt();}\n}\nfunction renderPrompt(){\n  const box=document.getElementById('promptList'),q=(document.getElementById('promptSearch')?.value||\"\").trim().toLowerCase();\n  const filtered=state.promptOrder.map((b,i)=>({b,i})).filter(({b})=>{\n    if(b.type!=='description')return false;\n    if(!q)return true;\n    if(b.type===\"description\")return (\"description 人设 \"+state.data.description).toLowerCase().includes(q);\n    const e=state.data.character_book.entries.find(x=>x.id===b.ref);\n    return e && (entryTitle(e)+\" \"+e.content).toLowerCase().includes(q)\n  });\n  if(!state.promptOrder.length){box.innerHTML='<div class=\"empty\">还没有 Prompt 内容。<br><br>点击「＋ 世界书」新增条目。</div>';return}\n  if(!filtered.length){box.innerHTML='<div class=\"empty\">没有找到匹配的卡片。</div>';return}\n  box.innerHTML=filtered.map(({b,i})=>{\n    if(b.type===\"description\"){\n      return `<div class=\"card ${b.collapsed?'collapsed':''}\" data-i=\"${i}\">\n        <div class=\"card-head\"><span class=\"drag\" draggable=\"true\">≡</span><span class=\"num\">${String(i+1).padStart(2,\"0\")}</span>\n        <span class=\"type\">PERSONA</span><span class=\"card-title\">Description</span>\n        <button class=\"iconbtn\" onclick=\"toggleBlock('${b.id}')\" title=\"折叠/展开\">${b.collapsed?'＋':'−'}</button></div>\n        <div class=\"card-body\"><div class=\"persona-wrap\"><div class=\"persona-highlight\">${highlightText(state.data.description,q)}</div><div class=\"visual-editor\" data-field=\"description\" contenteditable=\"true\" spellcheck=\"false\" hidden></div><textarea class=\"editor persona-editor\" data-history-key=\"description\" onfocus=\"beginEditSession(this);rememberEditor(this)\" onscroll=\"updateEditorHighlight(this)\" oninput=\"state.data.description=this.value;updateEditorHighlight(this);autoGrowTextarea(this);recordHistory()\">${esc(state.data.description)}</textarea></div></div>\n      </div>`\n    }\n    const e=state.data.character_book.entries.find(x=>x.id===b.ref);if(!e)return \"\";\n    return `<div class=\"card world-card ${b.collapsed?'collapsed':''}\" data-i=\"${i}\">\n      <div class=\"card-head\"><span class=\"drag\" draggable=\"true\">≡</span><span class=\"num\">${String(i+1).padStart(2,\"0\")}</span>\n      <input class=\"merge-check\" type=\"checkbox\" data-merge-id=\"${e.id}\" title=\"选择后可合并\"><span class=\"type\">WORLD BOOK</span><input class=\"world-title-input\" value=\"${esc(e.comment)}\" placeholder=\"世界书标题\" oninput=\"updateEntry('${e.id}','comment',this.value);syncTitle('${e.id}',this.value);recordHistory()\">\n      <span class=\"world-meta\">order ${e.insertion_order}</span><button class=\"iconbtn\" onclick=\"toggleBlock('${b.id}')\">${b.collapsed?'＋':'−'}</button>\n      <button class=\"iconbtn\" onclick=\"removeBlock('${b.id}')\">×</button></div>\n      <div class=\"card-body\">\n        <div class=\"world-wrap\"><div class=\"world-highlight\">${highlightText(e.content,q)}</div><textarea class=\"world-editor\" data-id=\"${e.id}\" data-history-key=\"world:${e.id}\" placeholder=\"世界书正文……\" onfocus=\"beginEditSession(this);rememberEditor(this)\" onscroll=\"updateWorldHighlight(this)\" oninput=\"updateEntryFromEditor(this);recordHistory()\">${esc(e.content)}</textarea></div>\n        \n      </div>\n    </div>`\n  }).join('');\n  attachDrag();refreshVisualEditors(); autoGrowAll(); document.querySelectorAll(\".persona-editor,.world-editor\").forEach(updateEditorHighlight); updateSearchCount(); bindSmartListEditing(); if(lastEditor?.isConnected)updatePairTag();\n}\nfunction getEditor(id){return document.querySelector('.world-editor[data-id=\"'+id+'\"]')}\nfunction syncTitle(id,v){document.querySelectorAll('#promptList .world-card').forEach(c=>{const b=state.promptOrder[Number(c.dataset.i)];if(b?.ref===id)c.querySelector('.world-title-input').value=v||''})}\nfunction attachDrag(){\n  document.querySelectorAll('#promptList .card').forEach(el=>{\n    const handle=el.querySelector('.drag'); if(!handle)return;\n    handle.draggable=true;\n    handle.addEventListener('dragstart',ev=>{el.classList.add('dragging');ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',el.dataset.i)});\n    handle.addEventListener('dragend',()=>el.classList.remove('dragging'));\n    el.addEventListener('dragover',ev=>{ev.preventDefault();el.classList.add('drop-target')});\n    el.addEventListener('dragleave',()=>el.classList.remove('drop-target'));\n    el.addEventListener('drop',ev=>{ev.preventDefault();el.classList.remove('drop-target');const from=Number(ev.dataTransfer.getData('text/plain')),to=Number(el.dataset.i);if(Number.isInteger(from)&&Number.isInteger(to)&&from!==to)moveBlock(from,to)});\n  });\n}\nfunction updateEntry(id,k,v){const e=state.data.character_book.entries.find(x=>x.id===id);if(!e)return;e[k]=v;if(k==='comment'){document.querySelectorAll('.entry[data-id=\\\"'+id+'\\\"] .entry-name').forEach(x=>x.textContent=v||'未命名世界书条目')}}\nfunction updateKeys(id,v){const e=state.data.character_book.entries.find(x=>x.id===id);if(e)e.keys=v.split(/[,，]/).map(x=>x.trim()).filter(Boolean);recordHistory()}\nfunction updateActivation(id,v){const e=state.data.character_book.entries.find(x=>x.id===id);if(!e)return;e.constant=v===\"constant\";e.activation=e.activation||{};e.activation.mode=v}\n\nfunction renderBook(keepOpen=true){\n  const list=document.getElementById('bookList'),es=state.data.character_book.entries;\n  document.getElementById('bookCount').textContent=es.length+\" entries\";\n  if(!es.length){list.innerHTML='';return}\n  const openIds=[...document.querySelectorAll('.entry.open')].map(x=>x.dataset.id);\n  const query=(document.getElementById('promptSearch')?.value||'').trim().toLowerCase();\n  list.innerHTML=es.filter(e=>!query||(`${e.comment} ${e.content}`).toLowerCase().includes(query)).map(e=>`\n    <div class=\"entry ${openIds.includes(e.id)&&keepOpen?'open':''}\" data-id=\"${e.id}\">\n      <div class=\"entry-head\"><span class=\"book-drag\" draggable=\"true\" title=\"拖动排序\" onclick=\"event.stopPropagation()\">≡</span>\n      <input class=\"merge-check\" type=\"checkbox\" data-merge-id=\"${e.id}\" title=\"选择合并\" onclick=\"event.stopPropagation()\"><input class=\"entry-name-input\" aria-label=\"修改条目标题\" value=\"${esc(entryTitle(e))}\" onclick=\"event.stopPropagation()\" oninput=\"updateEntry('${e.id}','comment',this.value);recordHistory()\"><button class=\"iconbtn\" title=\"删除世界书条目\" onclick=\"event.stopPropagation();removeBookEntry('${e.id}')\">×</button><button type=\"button\" class=\"entry-fold\" title=\"展开或收起\" onclick=\"event.stopPropagation();toggleBookEntry(this)\">${openIds.includes(e.id)&&keepOpen?'−':'＋'}</button></div>\n      <div class=\"entry-body\">\n\n        <div class=\"kv\"><label>Primary Keys</label><input value=\"${esc(e.keys.join(', '))}\" oninput=\"updateKeys('${e.id}',this.value)\"></div>\n        <div class=\"kv\"><label>Content</label><div class=\"visual-editor\" data-field=\"world\" data-id=\"${e.id}\" contenteditable=\"true\" spellcheck=\"false\" hidden></div><textarea class=\"world-editor\" data-id=\"${e.id}\" oninput=\"updateEntry('${e.id}','content',this.value);autoGrowTextarea(this);recordHistory()\">${esc(e.content)}</textarea></div>\n\n      </div>\n    </div>`).join('');document.querySelectorAll('#bookList .world-editor').forEach(field=>{const item=es.find(e=>e.id===field.dataset.id);if(item)field.value=String(item.content||'')});attachBookDrag();refreshVisualEditors();bindSmartListEditing();requestAnimationFrame(growOpenBookEntries)\n}\nfunction attachBookDrag(){\n  document.querySelectorAll('#bookList .entry').forEach(el=>{\n    const h=el.querySelector('.book-drag');\n    h.addEventListener('dragstart',e=>{e.stopPropagation();e.dataTransfer.setData('text/plain',el.dataset.id);el.classList.add('dragging')});\n    h.addEventListener('dragend',()=>el.classList.remove('dragging'));\n    el.addEventListener('dragover',e=>e.preventDefault());\n    el.addEventListener('drop',e=>{e.preventDefault();moveBookEntry(e.dataTransfer.getData('text/plain'),el.dataset.id)});\n    let touch=null;\n    h.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touch={id:el.dataset.id,x:e.clientX,y:e.clientY,active:false,timer:setTimeout(()=>{if(touch){touch.active=true;h.setPointerCapture(e.pointerId);el.classList.add('dragging')}},450)}});\n    h.addEventListener('pointermove',e=>{if(!touch)return;if(!touch.active){if(Math.abs(e.clientX-touch.x)+Math.abs(e.clientY-touch.y)>12){clearTimeout(touch.timer);touch=null}return}e.preventDefault();const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('#bookList .entry');document.querySelectorAll('#bookList .entry').forEach(x=>x.classList.toggle('drop-target',x===target&&x!==el))});\n    h.addEventListener('pointerup',e=>{if(!touch)return;clearTimeout(touch.timer);if(touch.active){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('#bookList .entry');el.classList.remove('dragging');document.querySelectorAll('#bookList .entry').forEach(x=>x.classList.remove('drop-target'));if(target)moveBookEntry(touch.id,target.dataset.id)}touch=null});\n    h.addEventListener('pointercancel',()=>{if(touch)clearTimeout(touch.timer);touch=null;el.classList.remove('dragging')});\n  })\n}\nfunction removeBookEntry(id){\n  const scroller=document.getElementById('promptScroll');\n  const previous=scroller.scrollTop;\n  const anchor=[...document.querySelectorAll('#bookList .entry')].find(el=>el.dataset.id!==id && el.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top);\n  const anchorId=anchor?.dataset.id, anchorTop=anchor?.getBoundingClientRect().top;\n  const index=state.promptOrder.findIndex(b=>b.type==='world'&&b.ref===id);\n  if(index<0)return;\n  state.promptOrder.splice(index,1);\n  state.data.character_book.entries=state.data.character_book.entries.filter(e=>e.id!==id);\n  recordHistory();renderBook();\n  scroller.scrollTop=previous;\n  requestAnimationFrame(()=>{\n    const next=anchorId&&[...document.querySelectorAll('#bookList .entry')].find(el=>el.dataset.id===anchorId);\n    if(next)scroller.scrollTop+=next.getBoundingClientRect().top-anchorTop;\n  });\n}\nfunction moveBookEntry(from,to){if(from===to)return;const entries=state.data.character_book.entries;const a=entries.findIndex(x=>x.id===from),b=entries.findIndex(x=>x.id===to);if(a<0||b<0)return;entries.splice(b,0,entries.splice(a,1)[0]);state.promptOrder=[...state.promptOrder.filter(x=>x.type==='description'),...entries.map(e=>state.promptOrder.find(x=>x.type==='world'&&x.ref===e.id)||{id:uid(),type:'world',ref:e.id,collapsed:false})];recordHistory();renderBook();}\n\nfunction addGreeting(){\n  if(!state.data.first_mes){state.data.first_mes=''}\n  else {if(!Array.isArray(state.data.alternate_greetings))state.data.alternate_greetings=[];state.data.alternate_greetings.push('')}\n  recordHistory();renderGreetings();\n  setTimeout(()=>{const x=document.querySelectorAll('.greeting textarea');x[x.length-1]?.focus()},0)\n}\nfunction removeGreeting(i){\n  if(i===0)state.data.first_mes='';\n  else state.data.alternate_greetings.splice(i-1,1);\n  recordHistory();renderGreetings();\n}\nfunction renderGreetings(){\n  const list=document.getElementById('greetingList'),gs=[state.data.first_mes||'',...(state.data.alternate_greetings||[])];\n  document.getElementById('greetingCount').textContent=(gs[0]?gs.length:gs.length-1)+' 个';\n  list.innerHTML=gs.map((g,i)=>`<div class=\"greeting collapsed\" data-greeting=\"${i}\">\n    <div class=\"greeting-head\" onclick=\"this.parentElement.classList.toggle('collapsed')\"><span>OPENING ${i+1}</span><strong>${i===0?'主开场白':'备用开场白 '+i}</strong><span class=\"fold-label\">点击展开</span>${i===0?'':`<button class=\"iconbtn\" onclick=\"event.stopPropagation();removeGreeting(${i})\">×</button>`}</div>\n    <div class=\"greeting-body\"><textarea oninput=\"${i===0?'state.data.first_mes=this.value':`state.data.alternate_greetings[${i-1}]=this.value`};recordHistory()\">${esc(g)}</textarea></div>\n  </div>`).join('');\n}\n\nconst COLLECTION_KEY='mianmian_character_collection_v3';\nconst COLLECTION_KEY_OLD='mianmian_character_collection_v2';\nlet collection=[];\nlet collectionDragMode=false;\nlet collectionSelectMode=false;\nlet collectionSelected=new Set();\nlet collectionActiveTag='';\nlet collectionActiveFolder='';\nlet collectionTagColors={};\nlet collectionFolders=[];\nfunction loadCollection(){collection=[];collectionFolders=[];collectionTagColors={}}\nfunction saveCollection(){if(window.parent!==window)window.parent.postMessage({source:'mianmian-editor',action:'collectionChanged',collection:{items:collection,folders:collectionFolders,tagColors:collectionTagColors}},'*')}\nfunction randomTagColor(){const colors=['#F3B6B6','#F3C78E','#E7D38E','#BFD7B5','#AFCFE8','#C8B9E8','#D9B4D8','#B8D8D8','#D8C2A8','#C7CED6'];return colors[Math.floor(Math.random()*colors.length)]}\nfunction ensureTagColor(tag){if(tag&&!collectionTagColors[tag])collectionTagColors[tag]=randomTagColor();return collectionTagColors[tag]||'#c7ced6'}\nfunction collectionItemFromState(){return {id:uid(),name:state.data.name||'未命名角色',avatarData:state.avatarData||'',card:cardRaw(),tags:[...(state.collectionMeta?.tags||[])],folder:state.collectionMeta?.folder||''}}\nfunction saveCurrentToCollection(){loadCollection();const item=collectionItemFromState();const same=collection.findIndex(x=>x.name===item.name);if(same>=0){item.id=collection[same].id;item.tags=[...(state.collectionMeta?.tags||collection[same].tags||[])];item.folder=(state.collectionMeta?.folder ?? collection[same].folder ?? '')}if(same>=0)collection[same]=item;else collection.push(item);state.collectionMeta={tags:[...(item.tags||[])],folder:item.folder||''};saveCollection();renderCollection();renderCurrentTags();toast('已保存到合集')}\nfunction openCollection(){const pane=document.querySelector('.collection-pane');if(!pane)return;if(window.matchMedia('(max-width:900px)').matches){showMobilePane('collection');return}pane.classList.add('collection-modal-open');renderCollection()}\nfunction closeCollection(){document.querySelector('.collection-pane')?.classList.remove('collection-modal-open')}\nfunction toggleCollectionDrag(){if(collectionSelectMode)toggleSelectMode();collectionDragMode=!collectionDragMode;if(!collectionDragMode)saveCollection();const pane=document.querySelector('.collection-pane');pane?.classList.toggle('drag-mode',collectionDragMode);const btn=document.getElementById('collectionDragBtn');if(btn)btn.textContent=collectionDragMode?'完成调整':'调整位置';renderCollection()}\nfunction toggleSelectMode(){if(collectionDragMode)toggleCollectionDrag();collectionSelectMode=!collectionSelectMode;if(!collectionSelectMode)collectionSelected.clear();document.querySelector('.collection-pane')?.classList.toggle('select-mode',collectionSelectMode);const btn=document.getElementById('collectionSelectBtn');if(btn)btn.textContent=collectionSelectMode?'完成归类':'多选归类';renderCollection()}\nfunction toggleCollectionSelection(i){if(collectionSelected.has(i))collectionSelected.delete(i);else collectionSelected.add(i);renderCollection()}\nfunction clearSelection(){collectionSelected.clear();renderCollection()}\nfunction createFolder(){const box=document.getElementById('folderCreateBox');if(!box)return;box.style.display=box.style.display==='none'?'flex':'none';if(box.style.display!=='none'){const input=document.getElementById('newFolderName');input.value='';input.focus()}}\nfunction confirmCreateFolder(){const input=document.getElementById('newFolderName');const name=(input?.value||'').trim();if(!name){toast('请输入文件夹名称');return}if(collectionFolders.includes(name)||collection.some(x=>(x.folder||'')===name)){toast('这个文件夹已经存在');return}collectionFolders.push(name);const selected=[...collectionSelected];if(selected.length){selected.forEach(i=>{if(collection[i])collection[i].folder=name});collectionSelected.clear();toast(`已将 ${selected.length} 个角色归入「${name}」`)}else toast(`已创建文件夹「${name}」`);saveCollection();const box=document.getElementById('folderCreateBox');if(box)box.style.display='none';renderCollection()}\nfunction applySelectedFolder(){const select=document.getElementById('bulkFolderSelect');const folder=select?.value||'';const selected=[...collectionSelected];if(!folder){toast('请选择文件夹');return}if(!selected.length){toast('请先选择角色');return}selected.forEach(i=>{if(collection[i])collection[i].folder=folder});collectionSelected.clear();saveCollection();renderCollection();toast(`已归类 ${selected.length} 个角色`)}\nfunction deleteSelectedFolder(){const select=document.getElementById('collectionFolderFilter');const folder=select?.value||'';if(!folder){toast('请先在文件夹筛选中选择要删除的文件夹');return}showConfirm('删除文件夹',`确定删除文件夹「${folder}」吗？\\n\\n文件夹中的角色不会被删除，只会变成「未分类」。`,()=>{collectionFolders=collectionFolders.filter(f=>f!==folder);collection.forEach(x=>{if((x.folder||'')===folder)x.folder=''});if(select)select.value='';if(document.getElementById('bulkFolderSelect'))document.getElementById('bulkFolderSelect').value='';saveCollection();renderCollection();toast(`已删除文件夹「${folder}」`)})}\nfunction collectionTags(){return [...new Set(collection.flatMap(x=>x.tags||[]).filter(Boolean))]}\nfunction setCollectionTag(tag){collectionActiveTag=tag||'';renderCollection()}\nfunction addTagToCollectionItem(i,tag){if(!collection[i])return;tag=String(tag||'').trim();if(!tag)return;if(!(collection[i].tags||[]).includes(tag))collection[i].tags=[...(collection[i].tags||[]),tag];ensureTagColor(tag);saveCollection();renderCollection()}\nfunction removeTagFromCollectionItem(i,tag){if(!collection[i])return;collection[i].tags=(collection[i].tags||[]).filter(t=>t!==tag);saveCollection();renderCollection()}\nfunction changeTagColor(tag,color){if(!tag)return;collectionTagColors[tag]=color||randomTagColor();saveCollection();renderCollection()}\nfunction updateCollectionFolder(i,value){if(!collection[i])return;collection[i].folder=String(value||'').trim();saveCollection();renderCollection()}\nfunction ensureCurrentTagState(){if(!state.collectionMeta)state.collectionMeta={tags:[],folder:\"\"};if(!Array.isArray(state.collectionMeta.tags))state.collectionMeta.tags=[]}\nfunction renderCurrentTags(){\n  ensureCurrentTagState();\n  const box=document.getElementById('currentTags'); if(!box)return;\n  box.innerHTML=state.collectionMeta.tags.map(t=>`<span class=\"current-tag-chip\" style=\"${/^@/.test(t)?'background:#f7b5b5;color:#6e1111':t.toUpperCase()==='NSFW'?'background:#ffe184;color:#513800':''}\"><button type=\"button\" class=\"tag-dot\" style=\"background:${esc(ensureTagColor(t))}\" title=\"修改颜色\" onclick=\"changeCurrentTagColor('${esc(t)}')\"></button><span>${esc(t)}</span><button type=\"button\" class=\"tag-remove\" title=\"删除 Tag\" onclick=\"removeCurrentTag('${esc(t)}')\">×</button></span>`).join('');\n}\n    function mmParseTags(value) {\n        const values=Array.isArray(value)?value:[value];\n        return [...new Set(values.flatMap(x=>String(x||'').split(/[、,，\\r\\n]+/)).map(x=>x.trim()\n            .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g,'').trim()\n            .replace(/^[-*•]\\s*/, '').trim().replace(/\\s+/g,' ')).filter(Boolean))];\n    }\nfunction addCurrentTags(text){ensureCurrentTagState();for(const tag of mmParseTags(text)){if(!state.collectionMeta.tags.includes(tag)){state.collectionMeta.tags.push(tag);state.collectionMeta.tagsDirty=true}ensureTagColor(tag)}document.getElementById('currentTagInput').value='';renderCurrentTags();recordHistory();}\nfunction handleCurrentTagKeydown(ev){if(ev.key==='Enter'){ev.preventDefault();addCurrentTags(ev.currentTarget.value)}}\ndocument.getElementById('currentTagInput').addEventListener('paste',ev=>{const text=ev.clipboardData?.getData('text/plain');if(text&&/[、,，\\r\\n]/.test(text)){ev.preventDefault();addCurrentTags(text)}});\nfunction removeCurrentTag(tag){ensureCurrentTagState();state.collectionMeta.tags=state.collectionMeta.tags.filter(t=>t!==tag);state.collectionMeta.tagsDirty=true;renderCurrentTags();recordHistory()}\nfunction changeCurrentTagColor(tag){const color=prompt('输入颜色，例如 #8B7E74',ensureTagColor(tag));if(color&&/^#[0-9a-fA-F]{6}$/.test(color)){collectionTagColors[tag]=color;saveCollection();renderCurrentTags();recordHistory()}}\n\nfunction renderCollection(){\n  const box=document.getElementById('collectionList');if(!box)return;loadCollection();\n  const search=(document.getElementById('collectionSearch')?.value||'').trim().toLowerCase();\n  const folder=collectionActiveFolder||'';\n  const folders=[...new Set([...collectionFolders,...collection.map(x=>x.folder||'')].filter(Boolean))];\n  // 文件夹是第一层筛选；未选择文件夹 = 全部角色。\n  // Tag 是第二层筛选，只显示当前文件夹中实际存在的 Tag；不再提供“全部”按钮，未选择 Tag 就表示全部。\n  const folderItems=folder?collection.filter(x=>x.folder===folder):collection;\n  const tags=[...new Set(folderItems.flatMap(x=>x.tags||[]).filter(Boolean))];\n  if(collectionActiveTag && !tags.includes(collectionActiveTag)) collectionActiveTag='';\n  const tagBox=document.getElementById('collectionTags');\n  if(tagBox){\n    tagBox.innerHTML=tags.map(t=>`<button class=\"collection-filter-tag ${collectionActiveTag===t?'active':''}\" data-collection-tag=\"${esc(t)}\"><span class=\"collection-tag-filter-dot\" style=\"background:${esc(ensureTagColor(t))}\"></span>${esc(t)}</button>`).join('');\n    tagBox.querySelectorAll('[data-collection-tag]').forEach(btn=>btn.addEventListener('click',()=>setCollectionTag(btn.dataset.collectionTag||'')));\n  }\n  const folderTabs=document.getElementById('collectionFolderTabs');\n  if(folderTabs){\n    folderTabs.innerHTML='<button class=\"collection-folder-tab '+(!folder?'active':'')+'\" data-folder=\"\">全部</button>'+folders.map(f=>`<button class=\"collection-folder-tab ${folder===f?'active':''}\" data-folder=\"${esc(f)}\">${esc(f)}</button>`).join('')+(folder?'<button class=\"collection-folder-delete\" onclick=\"deleteSelectedFolder()\" title=\"删除当前文件夹\">×</button>':'');\n    folderTabs.querySelectorAll('[data-folder]').forEach(btn=>btn.addEventListener('click',()=>{collectionActiveFolder=btn.dataset.folder||'';collectionActiveTag='';renderCollection()}));\n  }\n\n  const bulk=document.getElementById('bulkFolderSelect');if(bulk){bulk.innerHTML='<option value=\"\">选择文件夹</option>'+folders.map(f=>`<option value=\"${esc(f)}\">${esc(f)}</option>`).join('')}\n  const items=collection.map((x,i)=>({x,i})).filter(({x})=>{const hay=((x.name||'')+' '+(x.tags||[]).join(' ')+' '+(x.folder||'')).toLowerCase();return (!search||hay.includes(search))&&(!folder||x.folder===folder)&&(!collectionActiveTag||(x.tags||[]).includes(collectionActiveTag))});\n  if(!items.length){box.innerHTML='<div class=\"collection-empty\">还没有符合条件的角色。<br><br>在当前角色完成后，点击「保存」。</div>';return}\n  box.innerHTML=items.map(({x,i})=>{\n    const selected=collectionSelected.has(i);\n    const tagsHtml=(x.tags||[]).map(t=>`<span class=\"collection-tag-chip\" title=\"点击 Tag 筛选，点击色点修改颜色\"><button type=\"button\" class=\"tag-dot\" style=\"background:${esc(ensureTagColor(t))}\" onclick=\"event.stopPropagation();document.getElementById('tagColor-${i}-${encodeURIComponent(t)}').click()\"></button><input id=\"tagColor-${i}-${encodeURIComponent(t)}\" class=\"tag-color-input\" type=\"color\" value=\"${esc(ensureTagColor(t))}\" onchange=\"changeTagColor('${esc(t)}',this.value)\" onclick=\"event.stopPropagation()\"><button type=\"button\" class=\"tag-text\" onclick=\"event.stopPropagation();setCollectionTag('${esc(t)}')\">${esc(t)}</button><button type=\"button\" class=\"tag-remove\" onclick=\"event.stopPropagation();removeTagFromCollectionItem(${i},'${esc(t)}')\">×</button></span>`).join('');\n    return `<div class=\"collection-card ${selected?'selected':''}\" data-index=\"${i}\" draggable=\"${collectionDragMode}\" onclick=\"handleCollectionClick(this,${i})\"><input class=\"collection-select-box\" type=\"checkbox\" ${selected?'checked':''} onclick=\"event.stopPropagation();toggleCollectionSelection(${i})\"><span class=\"collection-drag-handle\">≡</span>${x.avatarData?`<img class=\"collection-avatar\" src=\"${x.avatarData}\">`:'<div class=\"collection-avatar empty\">＋</div>'}<div class=\"collection-info\"><div class=\"collection-name\">${esc(x.name||'未命名角色')}</div><div class=\"collection-meta-folder\">${esc(x.folder||'未分类')}</div><div class=\"collection-tag-editor\">${tagsHtml}<input class=\"collection-tag-input\" placeholder=\"添加 Tag\" onkeydown=\"if(event.key==='Enter'){event.preventDefault();addTagToCollectionItem(${i},this.value);this.value=''}\" onclick=\"event.stopPropagation()\"></div></div><button class=\"iconbtn\" onclick=\"event.stopPropagation();removeCollectionItem(${i})\" title=\"删除\">×</button></div>`\n  }).join('');\n  attachCollectionLongPress();attachCollectionDrag();\n}\nfunction handleCollectionClick(el,i){if(collectionDragMode)return;if(collectionSelectMode){toggleCollectionSelection(i);return}openCollectionItem(i)}\nfunction attachCollectionLongPress(){/* 合集不再通过长按编辑文件夹/Tag，统一使用选择归类与卡片内 Tag 输入 */}\nfunction attachCollectionDrag(){if(!collectionDragMode)return;document.querySelectorAll('.collection-card[draggable=true]').forEach(el=>{el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.index);el.classList.add('collection-dragging')});el.addEventListener('dragend',()=>el.classList.remove('collection-dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain')),to=Number(el.dataset.index);if(from===to)return;const [item]=collection.splice(from,1);collection.splice(to,0,item);saveCollection();renderCollection()})})}\n\nfunction openCollectionItem(i){const x=collection[i];if(!x?.card)return;parseCard(x.card);state.avatarData=x.avatarData||'';state.collectionMeta={tags:[...(x.tags||[])],folder:x.folder||''};historyStack=[snapshot()];redoStack=[];renderAll();saveLocal(true);showMobilePane('prompt');toast('已打开：'+(x.name||'未命名角色'))}\nfunction removeCollectionItem(i){showConfirm('删除合集角色','只会删除合集里的这一份保存，不会删除当前正在编辑的角色。\\n\\n确定删除吗？',()=>{collection.splice(i,1);saveCollection();renderCollection()})}\n\nfunction showMobilePane(which){\n  const panes=[...document.querySelectorAll('.main > .pane')];\n  panes.forEach(p=>p.classList.add('mobile-hidden'));\n  const map={prompt:panes[0],card:panes[1],collection:panes[2]};\n  map[which]?.classList.remove('mobile-hidden');\n  ['Prompt','Card','Collection'].forEach(k=>{const b=document.getElementById('tab'+k);if(b)b.classList.toggle('active',k.toLowerCase()===which)});\n}\n\n\nfunction togglePromptFocus(){\n  const main=document.querySelector('.main');\n  if(!main)return;\n  const active=main.classList.toggle('prompt-focus');\n  const btn=document.getElementById('promptFocusBtn');\n  if(btn)btn.textContent=active?'退出展开':'展开编辑';\n  if(active) showMobilePane('prompt');\n  else document.querySelectorAll('.main > .pane').forEach(p=>p.classList.remove('mobile-hidden'));\n}\nfunction exportCollection(){\n  loadCollection();\n  const payload={format:'mianmian_collection',version:2,characters:structuredClone(collection),folders:structuredClone(collectionFolders),tagColors:structuredClone(collectionTagColors)};\n  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'面面-角色合集.json');\n  toast('合集已导出');\n}\nfunction importCollection(ev){\n  const f=ev.target.files?.[0]; ev.target.value=''; if(!f)return;\n  const r=new FileReader();\n  r.onload=()=>{try{\n    const payload=JSON.parse(r.result);\n    if(payload?.format!=='mianmian_collection'||!Array.isArray(payload.characters))throw new Error('这不是面面导出的合集文件');\n    const next=payload.characters.map(x=>({...x,id:x.id||uid(),tags:Array.isArray(x.tags)?x.tags:[],folder:x.folder||''}));const nextFolders=Array.isArray(payload.folders)?payload.folders:[];const nextColors=payload.tagColors&&typeof payload.tagColors==='object'?payload.tagColors:{};\n    showConfirm('导入角色合集','导入会替换当前「面面」里的整个合集，不会影响当前正在编辑的角色卡。\\n\\n确定导入吗？',()=>{collection=next;collectionFolders=nextFolders;collectionTagColors=nextColors;collection.forEach(x=>(x.tags||[]).forEach(t=>ensureTagColor(t)));collectionActiveTag='';collectionActiveFolder='';saveCollection();renderCollection();toast('合集已导入')});\n  }catch(e){alert('合集导入失败：'+e.message)}};\n  r.readAsText(f);\nrenderCurrentTags();\n}\nfunction renderAll(){\n  const otherWasOpen=document.querySelector('.other-section')?.open||false;\n  renderName();document.getElementById('bookName').value=state.data.character_book.name||'Character Book';\n  document.getElementById('personality').value=state.data.personality||\"\";\n  document.getElementById('scenario').value=state.data.scenario||\"\";\n  document.getElementById('creatorNotes').value=state.data.creator_notes||\"\";\n  document.getElementById('mesExample').value=state.data.mes_example||\"\";\n  renderPrompt();renderGreetings();renderBook(true);refreshVisualEditors();watchEditorWidth();\n  const mainDescription=document.querySelector('#promptList textarea[data-history-key=\"description\"]');\n  if(mainDescription)mainDescription.value=String(state.data.description||'');\n  const box=document.getElementById('avatarBox');\n  if(state.avatarData)box.outerHTML=`<img id=\"avatarBox\" class=\"avatar\" role=\"button\" tabindex=\"0\" title=\"更换头像\" src=\"${state.avatarData}\">`;\n  else box.outerHTML='<div id=\"avatarBox\" class=\"avatar avatar-empty\" role=\"button\" tabindex=\"0\" title=\"更换头像\">＋</div>';\n  renderCurrentTags();\n  document.querySelector('.other-section').open=otherWasOpen;\n}\nfunction loadAvatar(ev){const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{state.avatarData=r.result;recordHistory();renderAll()};r.readAsDataURL(f)}\nfunction parseCard(raw){\n  let root=raw;if(root?.data)root=root.data;\n  if(root?.data?.data)root=root.data;\n  const d={...state.data,...(root.data||root)};\n  const book={...state.data.character_book,...(d.character_book||{})};\n  book.entries=(book.entries||[]).map(normalizeEntry);\n  d.character_book=book;d.alternate_greetings=Array.isArray(d.alternate_greetings)?d.alternate_greetings:[];\n  state.data=d;state.promptOrder=[];\n  state.promptOrder.push({id:uid(),type:\"description\",ref:null,collapsed:false});\n  book.entries.forEach(e=>state.promptOrder.push({id:uid(),type:\"world\",ref:e.id,collapsed:false}));\n}\nfunction loadFile(ev){const f=ev.target.files[0];if(!f)return;if(f.type==='image/png'||/\\.png$/i.test(f.name)){loadTavernPNG(f);return}const r=new FileReader();r.onload=()=>{try{parseCard(JSON.parse(r.result));recordHistory();renderAll();toast(\"JSON 已导入\")}catch(e){alert(\"JSON 解析失败：\"+e.message)}};r.readAsText(f)}\nfunction decodeBase64UTF8(str){const bin=atob(str.trim());const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder('utf-8').decode(bytes)}\nfunction loadTavernPNG(file){const r=new FileReader();r.onload=()=>{try{const bytes=new Uint8Array(r.result);const json=extractPNGCharacterJSON(bytes);if(!json)throw new Error('PNG 中没有找到角色卡 JSON（需要是酒馆角色卡 PNG）');parseCard(json);state.avatarData=r.result;recordHistory();renderAll();toast('酒馆 PNG 角色卡已导入')}catch(e){alert('PNG 导入失败：'+e.message)}};r.readAsArrayBuffer(file)}\nfunction extractPNGCharacterJSON(bytes){\n  const sig=[137,80,78,71,13,10,26,10];\n  for(let i=0;i<8;i++) if(bytes[i]!==sig[i]) throw new Error('不是有效 PNG');\n  let p=8;\n  while(p+8<=bytes.length){\n    const len=new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0);\n    const type=String.fromCharCode(...bytes.slice(p+4,p+8));\n    const data=bytes.slice(p+8,p+8+len);\n    if(type==='tEXt'){\n      const zero=data.indexOf(0);\n      if(zero>0){\n        const key=new TextDecoder('latin1').decode(data.slice(0,zero));\n        const val=new TextDecoder('latin1').decode(data.slice(zero+1));\n        if(key==='chara'){\n          try{return JSON.parse(decodeBase64UTF8(val))}catch(e){}\n        }\n      }\n    }\n    if(type==='iTXt'){\n      const zero=data.indexOf(0);\n      if(zero>0){\n        const key=new TextDecoder('utf-8').decode(data.slice(0,zero));\n        let o=zero+1;\n        if(key==='chara' && o+2<data.length){\n          const compressionFlag=data[o];\n          o+=2; // compression flag + compression method\n          for(let n=0;n<2;n++){const z=data.indexOf(0,o);if(z<0){o=data.length;break}o=z+1}\n          if(compressionFlag===0){\n            const text=new TextDecoder('utf-8').decode(data.slice(o));\n            try{return JSON.parse(text)}catch(e){\n              try{return JSON.parse(decodeBase64UTF8(text))}catch(e2){}\n            }\n          }\n        }\n      }\n    }\n    p+=12+len;\n    if(type==='IEND') break;\n  }\n  return null;\n}\nfunction importDialog(){document.getElementById('jsonInput').value=\"\";document.getElementById('modal').style.display=\"flex\"}\nfunction closeModal(){document.getElementById('modal').style.display=\"none\"}\nfunction applyJSON(){try{parseCard(JSON.parse(document.getElementById('jsonInput').value));recordHistory();renderAll();closeModal();toast(\"JSON 已导入\")}catch(e){alert(\"JSON 解析失败：\"+e.message)}}\nfunction cardRaw(){ const d=structuredClone(state.data); d._mmCharTags=[...(state.collectionMeta?.tags||[])]; d._mmCharTagsDirty=!!state.collectionMeta?.tagsDirty; return {spec:\"chara_card_v2\",spec_version:\"2.0\",data:d}; }\nfunction downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}\nfunction openExportDialog(){document.getElementById('exportModal').style.display='flex'}\nfunction closeExportDialog(){document.getElementById('exportModal').style.display='none'}\nfunction exportTXT(){\n  const parts=[];\n  for(const b of state.promptOrder){\n    if(b.type==='description') parts.push(state.data.description||'');\n    else if(b.type==='world'){\n      const e=state.data.character_book.entries.find(x=>x.id===b.ref);\n      if(e) parts.push(e.content||'');\n    }\n  }\n  const text=parts.filter(x=>x!==undefined).join('\\n\\n');\n  downloadBlob(new Blob([text],{type:'text/plain;charset=utf-8'}),(state.data.name||'character_card')+'.txt');\n  toast('已导出 TXT');\n}\nfunction exportJSON(){ const raw=cardRaw(),name=(raw.data.name||\"character_card\")+\".json\"; downloadBlob(new Blob([JSON.stringify(raw,null,2)],{type:\"application/json\"}),name); toast(\"已导出 JSON\"); }\nfunction b64utf8(str){const bytes=new TextEncoder().encode(str);let bin=\"\";for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin)}\nfunction crc32(bytes){let table=crc32.table;if(!table){table=crc32.table=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0}}let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}\nfunction pngChunk(type,data){const te=new TextEncoder();const tb=te.encode(type),out=new Uint8Array(12+data.length),dv=new DataView(out.buffer);dv.setUint32(0,data.length);out.set(tb,4);out.set(data,8);dv.setUint32(8+data.length,crc32(new Uint8Array([...tb,...data])));return out}\nfunction injectCharaPNG(bytes,json){const sig=bytes.slice(0,8),chunks=[];let p=8;while(p+8<=bytes.length){const len=new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0),type=new TextDecoder(\"latin1\").decode(bytes.slice(p+4,p+8)),data=bytes.slice(p+8,p+8+len);if(type!==\"tEXt\" || new TextDecoder(\"latin1\").decode(data.slice(0,Math.max(0,data.indexOf(0))))!==\"chara\")chunks.push(bytes.slice(p,p+12+len));p+=12+len;if(type===\"IEND\")break;}const val=new TextEncoder().encode(\"chara\\0\"+b64utf8(JSON.stringify(json)));const meta=pngChunk(\"tEXt\",val);let total=sig.length+meta.length+chunks.reduce((n,c)=>n+c.length,0),out=new Uint8Array(total);let o=0;out.set(sig,o);o+=8;out.set(meta,o);o+=meta.length;for(const c of chunks){out.set(c,o);o+=c.length}return out}\nfunction dataURLBytes(dataURL){const b=dataURL.split(\",\")[1];const bin=atob(b);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}\nfunction exportPNG(){const json=cardRaw(); if(state.avatarData && /^data:image\\/png;base64,/i.test(state.avatarData)){const out=injectCharaPNG(dataURLBytes(state.avatarData),json);downloadBlob(new Blob([out],{type:\"image/png\"}),(json.data.name||\"character_card\")+\".png\");toast(\"已导出酒馆 PNG\");return;}\n  const canvas=document.createElement(\"canvas\");canvas.width=512;canvas.height=512;const ctx=canvas.getContext(\"2d\");ctx.fillStyle=\"#f1efec\";ctx.fillRect(0,0,512,512);const finish=()=>{const bytes=dataURLBytes(canvas.toDataURL(\"image/png\"));const out=injectCharaPNG(bytes,json);downloadBlob(new Blob([out],{type:\"image/png\"}),(json.data.name||\"character_card\")+\".png\");toast(\"已导出酒馆 PNG\")};\n  if(state.avatarData){const img=new Image();img.onload=()=>{const r=Math.max(512/img.width,512/img.height),w=img.width*r,h=img.height*r;ctx.drawImage(img,(512-w)/2,(512-h)/2,w,h);finish()};img.src=state.avatarData;}else finish();}\nlet visualMode=false,activeVisualEditor=null,copiedFormat='p';\nconst visualBlockPrefix={p:'',h1:'# ',h2:'## ',h3:'### ',bullet:'- ',number:'1. ',quote:'> '};\nfunction editorDataValue(el){return el.dataset.field==='description'?state.data.description:(state.data.character_book.entries.find(e=>e.id===el.dataset.id)?.content||'')}\nfunction setEditorDataValue(el,value){if(el.dataset.field==='description')state.data.description=value;else {const e=state.data.character_book.entries.find(x=>x.id===el.dataset.id);if(e)e.content=value}}\nfunction escapeHTML(s){return esc(s)}\nfunction inlineToHTML(s){return escapeHTML(s).replace(/\\*\\*([^*\\n]+)\\*\\*/g,'<strong>$1</strong>').replace(/(^|[^*])\\*([^*\\n]+)\\*/g,'$1<em>$2</em>').replace(/`([^`\\n]+)`/g,'<code>$1</code>')}\nfunction lineInfo(line){let m;if((m=/^(#{1,3})\\s+(.*)$/.exec(line)))return {kind:'h'+m[1].length,text:m[2]};if((m=/^[-*]\\s+(.*)$/.exec(line)))return {kind:'bullet',text:m[1]};if((m=/^\\d+\\.\\s+(.*)$/.exec(line)))return {kind:'number',text:m[1]};if((m=/^>\\s?(.*)$/.exec(line)))return {kind:'quote',text:m[1]};return {kind:'p',text:line}}\nfunction renderVisualEditor(el){el.innerHTML=editorDataValue(el).split('\\n').map(line=>{const b=lineInfo(line);return `<div class=\"visual-line ${b.kind}\" data-kind=\"${b.kind}\">${inlineToHTML(b.text)||'<br>'}</div>`}).join('')}\nfunction refreshVisualEditors(){document.querySelectorAll('.visual-editor').forEach(el=>{if(!visualMode){el.hidden=true;el.nextElementSibling.hidden=false;const highlight=el.previousElementSibling;if(highlight?.classList.contains('persona-highlight'))highlight.hidden=false;return}el.hidden=false;el.nextElementSibling.hidden=true;const highlight=el.previousElementSibling;if(highlight?.classList.contains('persona-highlight'))highlight.hidden=true;renderVisualEditor(el);bindVisualEditor(el)})}\nfunction richText(node){if(node.nodeType===3)return node.nodeValue;if(node.nodeName==='BR')return '';const text=[...node.childNodes].map(richText).join('');if(node.nodeName==='STRONG'||node.nodeName==='B')return '**'+text+'**';if(node.nodeName==='EM'||node.nodeName==='I')return '*'+text+'*';if(node.nodeName==='CODE')return '`'+text+'`';return text}\nfunction visualToMarkdown(el){const nodes=[...el.childNodes];return nodes.map(node=>{if(node.nodeType===3)return node.nodeValue;const kind=node.dataset?.kind||'p',prefix=visualBlockPrefix[kind]??'';const content=[...node.childNodes].map(richText).join('');return content?prefix+content:''}).join('\\n')}\nfunction syncVisualEditor(el){const value=visualToMarkdown(el);setEditorDataValue(el,value);const textarea=el.nextElementSibling;textarea.value=value;recordHistory()}\nfunction bindVisualEditor(el){if(el.dataset.visualBound)return;el.dataset.visualBound='1';el.addEventListener('focus',()=>activeVisualEditor=el);el.addEventListener('pointerup',()=>activeVisualEditor=el);el.addEventListener('keyup',()=>activeVisualEditor=el);el.addEventListener('input',()=>syncVisualEditor(el));el.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});el.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.execCommand('insertParagraph');setTimeout(()=>syncVisualEditor(el),0)}})}\nfunction toggleVisualEditor(){if(visualMode&&activeVisualEditor?.isConnected)syncVisualEditor(activeVisualEditor);visualMode=!visualMode;document.getElementById('visualToggle').textContent=visualMode?'纯文本编辑':'可视编辑';document.getElementById('visualToggle').classList.toggle('active',visualMode);refreshVisualEditors();toast(visualMode?'正在可视编辑；保存时写入 Markdown 文本':'正在编辑实际文本')}\nfunction currentRawEditor(){return lastEditor?.isConnected?lastEditor:(document.activeElement?.matches?.('.persona-editor,.world-editor')?document.activeElement:document.querySelector('.persona-editor'))}\nfunction editSelectedRawLines(el,kind){const start=el.selectionStart,end=el.selectionEnd,text=el.value;const begin=text.lastIndexOf('\\n',start-1)+1;let finish=text.indexOf('\\n',end);if(finish<0)finish=text.length;const lines=text.slice(begin,finish).split('\\n');const next=lines.map((line,i)=>{const old=lineInfo(line);return old.text?(kind==='p'?'':kind==='number'?`${i+1}. `:visualBlockPrefix[kind])+old.text:''}).join('\\n');el.focus();el.setRangeText(next,begin,finish,'select');el.dispatchEvent(new Event('input',{bubbles:true}));rememberEditor(el)}\nfunction selectedVisualLines(el){const sel=getSelection();if(!sel.rangeCount)return [];const range=sel.getRangeAt(0);return [...el.querySelectorAll('.visual-line')].filter(line=>range.intersectsNode(line))}\nfunction applyBlockStyle(kind){if(!visualMode){const el=currentRawEditor();if(el)editSelectedRawLines(el,kind);return}const el=activeVisualEditor;if(!el?.isConnected)return;const lines=selectedVisualLines(el);if(!lines.length)return;lines.forEach(line=>{line.dataset.kind=kind;line.className='visual-line '+kind});syncVisualEditor(el)}\nfunction applyInlineStyle(kind){if(!visualMode){const el=currentRawEditor();if(!el)return;const a=el.selectionStart,b=el.selectionEnd,mark=kind==='bold'?'**':'*';el.focus();el.setRangeText(mark+el.value.slice(a,b)+mark,a,b,'select');el.setSelectionRange(a+mark.length,b+mark.length);el.dispatchEvent(new Event('input',{bubbles:true}));rememberEditor(el);return}const el=activeVisualEditor;if(!el?.isConnected)return;el.focus();document.execCommand(kind==='bold'?'bold':'italic',false);syncVisualEditor(el)}\nfunction copyFormat(){if(visualMode){const el=activeVisualEditor;copiedFormat=el?selectedVisualLines(el)[0]?.dataset.kind||'p':'p'}else {const el=currentRawEditor();copiedFormat=el?lineInfo(el.value.slice(el.value.lastIndexOf('\\n',el.selectionStart-1)+1).split('\\n')[0]).kind:'p'}toast('已复制段落格式')}\nlet mmBrushOn=false,mmBrushPrefix='';\nfunction mmBrushToggle(){\n  if(mmBrushOn){mmBrushOn=false;document.querySelectorAll('[data-mm-brush]').forEach(b=>b.classList.remove('active'));return false}\n  const el=currentRawEditor();if(!el)return false;\n  const line=el.value.slice(el.value.lastIndexOf('\\n',Math.max(0,el.selectionStart-1))+1).split('\\n')[0];\n  mmBrushPrefix=(line.match(/^([ \\t]*)(?:((?:#{1,6}|[-*+]|\\d+\\.|>) )|)/)||[])[0]||'';\n  mmBrushOn=true;document.querySelectorAll('[data-mm-brush]').forEach(b=>b.classList.add('active'));return true;\n}\ndocument.addEventListener('pointerup',event=>{if(!mmBrushOn)return;const el=event.target.closest?.('textarea.persona-editor,textarea.world-editor');if(!el)return;\n  setTimeout(()=>{if(!mmBrushOn||!el.isConnected)return;const pos=el.selectionStart,start=el.value.lastIndexOf('\\n',Math.max(0,pos-1))+1,end=el.value.indexOf('\\n',start);\n    const line=el.value.slice(start,end<0?el.value.length:end),old=(line.match(/^([ \\t]*)(?:((?:#{1,6}|[-*+]|\\d+\\.|>) )|)/)||[])[0]||'';\n    if(old===mmBrushPrefix)return;el.setRangeText(mmBrushPrefix,start,start+old.length,'preserve');el.dispatchEvent(new Event('input',{bubbles:true}));rememberEditor(el);\n  },0);\n});\nwindow.__mmBrushToggle=mmBrushToggle;\nwindow.__mmBrushClear=()=>{if(mmBrushOn)mmBrushToggle()};\nfunction pasteFormat(){applyBlockStyle(copiedFormat)}\nfunction insertVisualText(text){const el=activeVisualEditor;if(!el?.isConnected)return;el.focus();document.execCommand('insertText',false,text);syncVisualEditor(el)}\ndocument.getElementById('formatTools').addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});\ndocument.addEventListener(\"focusin\",e=>{window.parent.postMessage({source:\"mianmian-editor\",action:\"focus\"},\"*\");\n  if(e.target.matches?.(\"input,textarea,select,[contenteditable=true]\")) beginEditSession(e.target);\n  if(e.target.matches?.('.persona-editor,.world-editor')) rememberEditor(e.target);\n});\ndocument.addEventListener('keyup',e=>{if(e.target.matches?.('.persona-editor,.world-editor')){rememberEditor(e.target)}});\ndocument.addEventListener('select',e=>{if(e.target.matches?.('.persona-editor,.world-editor'))rememberEditor(e.target)});\ndocument.addEventListener('mouseup',e=>{if(e.target.matches?.('.persona-editor,.world-editor'))rememberEditor(e.target)});\ndocument.addEventListener('touchend',e=>{if(e.target.matches?.('.persona-editor,.world-editor'))setTimeout(()=>rememberEditor(e.target),0)},{passive:true});\ndocument.addEventListener(\"focusout\",e=>{\n  if(e.target.matches?.(\"input,textarea,select,[contenteditable=true]\")) endEditSession();\n});\ndocument.addEventListener(\"keydown\",e=>{\n  if((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase()===\"z\"){e.preventDefault();undo();}\n  else if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()===\"y\" || (e.shiftKey&&e.key.toLowerCase()===\"z\"))){e.preventDefault();redo();}\n  else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='h'){e.preventDefault();openReplace();}\n  else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='f'){e.preventDefault();document.getElementById('promptSearch')?.focus();document.getElementById('promptSearch')?.select();}\n});\ndocument.addEventListener('input',e=>{if(e.target.matches?.('.persona-editor,.world-editor')){lastEditor=e.target;lastSelectionStart=e.target.selectionStart??0;lastSelectionEnd=e.target.selectionEnd??lastSelectionStart;updatePairTag()}});\ndocument.addEventListener('selectionchange',()=>{const el=document.activeElement;if(el?.matches?.('.persona-editor,.world-editor'))rememberEditor(el)});\n\ndocument.getElementById('promptScroll').addEventListener('scroll',()=>document.getElementById('backtop').classList.toggle('show',document.getElementById('promptScroll').scrollTop>500));\ndocument.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});\nfunction savePreviewDraft(){window.parent.postMessage({source:\"mianmian-editor\",action:\"saveDraft\",card:cardRaw(),avatarData:state.avatarData},\"*\")}\nfunction requestTavernWrite(action){\n  if(window.parent===window){toast('请从酒馆插件入口打开');return}\n  if(action==='overwrite')window.parent.postMessage({source:'mianmian-editor',action:'overwriteClick',time:Date.now()},'*');\n  window.parent.postMessage({source:'mianmian-editor',action,card:cardRaw(),avatarData:state.avatarData},\"*\");\n}\nwindow.__mmRunTool=(command,value)=>{if(command==='brush')return mmBrushToggle();if(command==='tag')return insertQuickTag(value||'');if(command==='pair')return insertQuickPair(value?.open||'',value?.close||'');if(command==='inline')return applyInlineStyle(value);if(command==='block')return applyBlockStyle(value);};\nfunction mmHostAction(command){window.parent.postMessage({source:'mianmian-editor',action:'inlineAction',command},'*')}\nwindow.__mmStartNew=()=>{window.__mmNamingNew=true;const input=document.getElementById('nameInput'),view=document.getElementById('nameView');view.hidden=true;input.hidden=false;input.value='';input.placeholder='填写姓名';input.focus();};\nwindow.__mmNewName=()=>document.getElementById('nameInput').value.trim();\nwindow.__mmTemplate=name=>{const card=templateState();card.data.name=name;return {spec:'chara_card_v2',data:card.data};};\nwindow.__mmBusy=(busy)=>{document.body.classList.toggle('mm-busy',busy);document.querySelectorAll('input,textarea,button,[contenteditable]').forEach(el=>{if(el.matches('[contenteditable]'))el.contentEditable=busy?'false':'true';else el.disabled=busy})};\nwindow.__mmReceive=data=>{\n  const event={data};\n  if(data?.source!=='mianmian-host')return;\n  if(event.data.action==='collectionLoad'){const c=event.data.collection||{};collection=Array.isArray(c.items)?c.items:[];collectionFolders=Array.isArray(c.folders)?c.folders:[];collectionTagColors=c.tagColors||{};renderAll();return}\n  if(event.data.action==='hostCommand'){if(event.data.command==='saveDraft')savePreviewDraft();if(event.data.command==='overwrite')requestTavernWrite('overwrite');return}\n  if(event.data.action==='templateNew'){replaceStateAndRecord(templateState(),'已载入面面内置模板');state.data.name=event.data.name||state.data.name;renderAll();return}\n  if(event.data.action==='tool'){const m=event.data;try{if(m.command==='tag')insertQuickTag(m.value||'');else if(m.command==='pair')insertQuickPair(m.open||'',m.end||'');else if(m.command==='visual')toggleVisualEditor();else if(m.command==='block')applyBlockStyle(m.value);else if(m.command==='inline')applyInlineStyle(m.value);else if(m.command==='copyFormat')copyFormat();else if(m.command==='pasteFormat')pasteFormat();else if(m.command==='fold')foldCurrentCard();else if(m.command==='find'){document.getElementById('promptSearch').value=m.find||'';renderPrompt();renderBook()}else if(m.command==='replaceOne'||m.command==='replaceAll'){document.getElementById('replaceFind').value=m.find||'';document.getElementById('replaceWith').value=m.replace||'';if(m.command==='replaceOne')replaceOne();else replaceAllText()}}catch(e){toast('编辑操作失败：'+e.message)}return}\n  if(event.data.action==='load'&&event.data.card){try{window.__mmLoad(event.data.card,event.data.avatarData)}catch(error){window.parent.postMessage({source:'mianmian-editor',action:'loadError',error:String(error.message||error).slice(0,150)},'*')}}\n  if(event.data.action==='result')toast(event.data.message);\n};\nwindow.addEventListener('message',event=>{if(event.source===window.parent)window.__mmReceive(event.data)});\n// 每次直接打开 HTML 都从空白初始状态开始；「新建」才加载人设模板.\nstate=initialState();\nhistoryStack=[snapshot()];\nredoStack=[];\nrenderAll();\nif(window.parent!==window)window.parent.postMessage({source:\"mianmian-editor\",action:\"ready\"},\"*\");\n// 面面当前打开的编辑稿：两栏分别在各自 iframe 内搜索与替换。\nwindow.__mmSearchAll=function(query){\n  const q=String(query||'').trim().toLowerCase();\n  const textFields=['description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions'];\n  const values=textFields.map(k=>String(state.data[k]||''))\n    .concat(Array.isArray(state.data.alternate_greetings)?state.data.alternate_greetings:[])\n    .concat((state.data.character_book?.entries||[]).flatMap(e=>[e.comment||'',e.content||'',...(e.keys||[])]));\n  const hits=q?values.reduce((n,v)=>n+(v.toLowerCase().split(q).length-1),0):0;\n  const input=document.getElementById('promptSearch');if(input)input.value=query||'';\n  renderPrompt();renderBook();\n  document.querySelectorAll('.card,.entry,.field,details.other-section').forEach(el=>{\n    const content=[el.textContent,...[...el.querySelectorAll('textarea,input')].map(x=>x.value)].join(' ').toLowerCase();\n    el.classList.toggle('mm-search-hit',!!q&&content.includes(q));\n  });\n  return hits;\n};\nwindow.__mmReplaceAll=function(find,replacement){\n  find=String(find||'');replacement=String(replacement??'');if(!find)return 0;\n  let total=0;\n  const apply=v=>{const source=String(v||'');const n=source.split(find).length-1;total+=n;return n?source.split(find).join(replacement):source};\n  for(const k of ['description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions'])state.data[k]=apply(state.data[k]);\n  if(Array.isArray(state.data.alternate_greetings))state.data.alternate_greetings=state.data.alternate_greetings.map(apply);\n  for(const e of state.data.character_book?.entries||[]){e.comment=apply(e.comment);e.content=apply(e.content);if(Array.isArray(e.keys))e.keys=e.keys.map(apply)}\n  if(total){recordHistory();renderAll();saveLocal(true)}\n  return total;\n};\n\nwindow.__mmLoad=(card,avatarData)=>{\n  if(!card?.data||!Array.isArray(card.data.character_book?.entries))throw Error('载入资料结构不完整');\n  window.__mmNamingNew=false;parseCard(card);state.avatarData=avatarData||'';state.collectionMeta={...state.collectionMeta,tags:[...(card.data._mmCharTags||[])],tagsDirty:!!card.data._mmCharTagsDirty};historyStack=[snapshot()];redoStack=[];renderAll();\n  const field=document.querySelector('#promptList textarea[data-history-key=\"description\"]');\n  if(!field)throw Error('编辑器没有生成人设文本框');\n  const expected=String(card.data.description||'').replace(/\\r\\n?/g,'\\n');\n  if(field.value!==expected){field.value=expected;updateEditorHighlight(field);autoGrowTextarea(field)}\n  if(field.value!==expected)throw Error('人设正文渲染不一致');\n  const greetings=Array.isArray(card.data.alternate_greetings)?card.data.alternate_greetings.length:0;\n  const receipt={name:state.data.name,descriptionLength:field.value.length,firstMessageLength:String(state.data.first_mes||'').length,\n    greetingCount:greetings,bookCount:state.data.character_book.entries.length};\n  window.parent.postMessage({source:'mianmian-editor',action:'loaded',receipt},'*');\n  return receipt;\n};\nwindow.__mmTagsSaved=()=>{ensureCurrentTagState();state.collectionMeta.tagsDirty=false;};\nwindow.__mmSnapshot=()=>({card:cardRaw(),avatarData:state.avatarData});\nwindow.__mmBookSaved=book=>{\n  state.data.character_book.name=book.name;\n  for(const e of state.data.character_book.entries){const saved=book.entries.find(x=>x.id===e.id);if(saved?._mmRaw)e._mmRaw=saved._mmRaw;}\n  const name=document.getElementById('bookName');if(name)name.value=book.name;\n};\ndocument.addEventListener('click',event=>{\n  const button=event.target.closest('[data-mm-inline],[data-mm-add-entry]');if(!button||button.disabled)return;\n  if(button.hasAttribute('data-mm-add-entry'))addEntry();else mmHostAction(button.dataset.mmInline);\n});\nwindow.addEventListener('error',event=>window.parent.postMessage({source:'mianmian-editor',action:'editorError',error:String(event.message).slice(0,200)},'*'));\nwindow.addEventListener('unhandledrejection',event=>window.parent.postMessage({source:'mianmian-editor',action:'editorError',error:String(event.reason?.message||event.reason).slice(0,200)},'*'));\n</script>\n</body>\n</html>\n";
    const MM_USER_HTML = "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>面面</title>\n<style>\n:root{\n  --bg:#f4f3f1;--panel:#fff;--ink:#292827;--muted:#8a8783;--line:#e6e3df;\n  --soft:#f8f7f5;--accent:#6f6a67;--shadow:0 8px 28px rgba(40,35,30,.06)\n}\n*{box-sizing:border-box}html,body{height:100%;margin:0}\nbody{font-family:Inter,\"Noto Sans SC\",\"Microsoft YaHei\",sans-serif;background:var(--bg);color:var(--ink);overflow:hidden}\nbutton,input,textarea,select{font:inherit}\n[contenteditable=\"true\"]{outline:0}button{cursor:pointer}\n.app{height:100vh;display:flex;flex-direction:column}\n.topbar{height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;background:#fff;border-bottom:1px solid var(--line);flex:0 0 62px}\n.brand{display:flex;gap:12px;align-items:center}.logo{width:34px;height:34px;border:1px solid #d9d5d0;border-radius:10px;display:grid;place-items:center;font-size:17px;background:#faf9f7}\n.brand strong{font-size:15px;letter-spacing:.2px}.brand span{font-size:11px;color:var(--muted);margin-left:7px}\n.actions{display:flex;gap:8px}.btn{height:34px;padding:0 13px;border:1px solid var(--line);background:#fff;border-radius:8px;color:#494642}\n.btn:hover{background:#f7f5f2}.btn.primary{background:#2f2d2b;color:white;border-color:#2f2d2b}\n.main{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(360px,.95fr);gap:12px;padding:14px}\n.pane{min-width:0;min-height:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}\n.pane-head{height:52px;flex:0 0 52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid var(--line)}\n.pane-title{font-size:13px;font-weight:650}.pane-sub{font-size:11px;color:var(--muted);margin-top:3px}\n.actions-small{display:flex;gap:7px;align-items:center}.btn-small{height:30px;padding:0 10px;border:1px solid var(--line);background:#fff;border-radius:7px;color:#5e5a56;font-size:11px}\n.scroll{overflow:auto;min-height:0;flex:1;padding:14px}\n.scroll::-webkit-scrollbar{width:9px;height:9px}.scroll::-webkit-scrollbar-thumb{background:#d8d5d1;border-radius:10px;border:2px solid transparent;background-clip:padding-box}\n.prompt-sticky-tools{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.98);padding:10px 14px 8px;margin:-14px -14px 10px;border-bottom:1px solid var(--line);box-shadow:0 3px 10px rgba(40,35,30,.04);backdrop-filter:blur(8px)}.prompt-toolbar{display:flex;gap:8px;margin-bottom:8px}.search{position:relative;flex:1}.search input{width:100%;height:34px;border:1px solid var(--line);border-radius:8px;background:#fbfaf8;padding:0 11px 0 32px;outline:0;font-size:11px}\n.search span{position:absolute;left:11px;top:9px;color:#aaa;font-size:12px}.search-count{font-size:10px;color:#999;white-space:nowrap;align-self:center}.order-note{font-size:11px;color:var(--muted);background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:9px 11px;margin-bottom:12px}\n.card{border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:10px;overflow:hidden;transition:.15s box-shadow,.15s transform}\n.card.dragging{opacity:.55;box-shadow:0 14px 30px rgba(40,35,30,.13);transform:scale(.995)}\n.card.drop-target{border-color:#9d978f;box-shadow:0 0 0 2px #eeeae5}\n.card-head{display:flex;align-items:center;gap:9px;padding:11px 12px;background:#fcfbfa;border-bottom:1px solid var(--line);min-width:0}\n.drag{color:#aaa;cursor:grab;font-size:16px;user-select:none}.num{font-size:10px;color:#aaa;width:22px}\n.type{font-size:10px;letter-spacing:.4px;color:#77716b;border:1px solid #e4e0db;border-radius:999px;padding:3px 7px;background:#fff}\n.card-title{font-size:12px;font-weight:650;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.iconbtn{border:0;background:transparent;color:#888;padding:4px 6px;border-radius:6px}.iconbtn:hover{background:#eeeae6;color:#444}\n.card-body{padding:12px}.merge-check{width:14px;height:14px;margin:0 1px 0 2px;accent-color:#6f6a67}.persona-wrap{position:relative}.card.collapsed .card-body{display:none}.card.collapsed .card-head{border-bottom:0}\n.fold-label{font-size:9px;color:#aaa;margin-left:2px}.editor{width:100%;min-height:145px;resize:vertical;border:0;outline:0;background:transparent;color:#35322f;font-size:13px;line-height:1.8}\n.persona-editor{min-height:120px}\n.meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.chip{font-size:10px;color:#77716b;background:#f5f3f0;border-radius:5px;padding:4px 7px}\n.world-card .card-body{padding:0;background:#fff}\n.editor-tools{display:flex;gap:6px;align-items:center;padding:7px 12px;border-top:1px solid var(--line);background:#fcfbfa}.editor-tools .btn-small{height:27px}.editor-tools .hint{font-size:10px;color:#aaa;margin-left:auto}\n.world-wrap,.persona-wrap{position:relative}.world-highlight,.persona-highlight{position:absolute;inset:0;min-height:120px;padding:18px 20px 24px;color:transparent;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;pointer-events:none;font:15px/1.8 ui-monospace,SFMono-Regular,Consolas,\"Noto Sans Mono\",monospace;z-index:0;overflow:hidden}.world-highlight mark,.persona-highlight mark{background:#f3e4a6;color:transparent;border-radius:2px;padding:0}.world-editor,.persona-editor{position:relative;z-index:1;width:100%;min-height:120px;display:block;border:0;outline:0;background:transparent;color:#35322f;padding:18px 20px 24px;font:15px/1.8 ui-monospace,SFMono-Regular,Consolas,\"Noto Sans Mono\",monospace;resize:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word}.world-editor::placeholder,.persona-editor::placeholder{color:#b3aea8}.world-editor.search-transparent,.persona-editor.search-transparent{color:#35322f;caret-color:#35322f}\n.world-title-input{flex:1 1 120px;min-width:90px;border:0;outline:0;background:transparent;color:#35322f;font-size:12px;font-weight:650;padding:2px 0}\n.world-title-input:focus{border-bottom:1px solid #cfc9c3}\n.persona-highlight,.world-highlight{color:transparent!important;pointer-events:none;user-select:none}.persona-highlight mark,.world-highlight mark{color:transparent!important;background:#f3e4a6;border-radius:2px}.search mark{background:#f3e4a6;color:inherit;border-radius:2px;padding:0 1px}.quick-tags{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;margin:0 0 2px;padding:1px 1px 3px;scrollbar-width:none}.quick-tags::-webkit-scrollbar{display:none}.quick-tag{height:28px;padding:0 9px;border:1px solid var(--line);border-radius:7px;background:#fff;color:#6b6762;font-size:11px}.quick-tag:hover{background:#f7f5f2}.quick-tag code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}\n.world-meta{font-size:9px;color:#aaa;white-space:nowrap}\n.replace-bar{display:none;gap:7px;align-items:center;padding:8px 0 2px}.replace-bar.open{display:flex}.replace-bar input{flex:1;min-width:0;height:32px;border:1px solid var(--line);border-radius:7px;padding:0 9px;outline:0;background:#fbfaf8;font-size:11px}.replace-actions{display:flex;gap:5px}.replace-actions .btn-small{white-space:nowrap}.replace-info{display:none}.pair-hint{font-size:9px;color:#999;margin-left:2px;white-space:nowrap}.pair-tags{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}.pair-tag{border-color:#c9c2b9;background:#faf7f2}.right-scroll{padding:0}.card-preview{padding:18px;border-bottom:1px solid var(--line)}\n.avatar-row{display:flex;gap:13px;align-items:center}.avatar-save-btn{height:30px;align-self:center}.avatar{width:76px;height:76px;border-radius:12px;object-fit:cover;background:#eeeae6;border:1px solid var(--line)}\n.avatar-empty{display:grid;place-items:center;color:#aaa;font-size:24px}.char-name{font-size:19px;font-weight:700}.char-meta{font-size:11px;color:var(--muted);margin-top:5px}\n.section{padding:15px 18px;border-bottom:1px solid var(--line)}.section-title{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:650;margin-bottom:10px}\n.field{margin-bottom:10px}.field:last-child{margin-bottom:0}.field label{display:block;font-size:10px;color:#96908a;margin-bottom:5px}\n.field input,.field textarea{width:100%;border:1px solid var(--line);border-radius:7px;padding:8px 9px;outline:0;background:#fff;font-size:12px}.field textarea{min-height:85px;line-height:1.7;resize:vertical}\n.book-list{display:flex;flex-direction:column;gap:7px}.entry{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}\n.entry-head{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#fbfaf8}.entry-dot{width:7px;height:7px;border-radius:50%;background:#777}\n.entry-name{font-size:11px;font-weight:600;flex:1}.entry-order{font-size:9px;color:#aaa}.entry-body{padding:10px;border-top:1px solid var(--line);display:none}.entry.open .entry-body{display:block}\n.kv{display:grid;grid-template-columns:85px 1fr;gap:7px;margin-bottom:7px;align-items:start}.kv:last-child{margin-bottom:0}.kv label{font-size:9px;color:#999;padding-top:7px}\n.kv input,.kv select,.kv textarea{width:100%;font-size:10px;border:1px solid var(--line);border-radius:6px;padding:6px 7px;background:#fff;outline:0}.kv textarea{min-height:70px;line-height:1.55;resize:vertical}\n.greeting{border:1px solid var(--line);border-radius:8px;margin-bottom:8px;overflow:hidden}.greeting-head{display:flex;align-items:center;padding:8px 10px;background:#fbfaf8;gap:7px}.greeting-head span{font-size:10px;color:#999}.greeting-head strong{font-size:11px;flex:1}.greeting.collapsed .greeting-body{display:none}.greeting-body{padding:9px}.greeting-body textarea{width:100%;min-height:110px;border:1px solid var(--line);border-radius:6px;padding:8px;font-size:11px;line-height:1.65;resize:vertical;outline:0}\n.add{width:100%;height:35px;border:1px dashed #d3cec8;border-radius:8px;background:#fff;color:#777;font-size:11px}.add:hover{background:#faf8f5}\n.footer-note{font-size:10px;color:#aaa;text-align:center;padding:10px}.empty{padding:28px 15px;text-align:center;color:#aaa;font-size:12px;border:1px dashed #ddd8d2;border-radius:9px}\n\n.collection-manage{display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.collection-manage .btn-small.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}.collection-folder-create{display:flex;gap:6px;align-items:center;flex:1;min-width:180px}.collection-folder-create input{height:30px;min-width:0;flex:1;border:1px solid var(--line);border-radius:7px;background:#fbfaf8;padding:0 8px;font-size:10px;outline:0}.collection-folder-create .btn-small{white-space:nowrap}.collection-select-mode .collection-card{cursor:pointer}.collection-select-box{width:16px;height:16px;accent-color:#2f2d2b;display:none;flex:0 0 16px}.collection-pane.select-mode .collection-select-box{display:block}.collection-card.selected{border-color:#8d8882;background:#f8f5f1}.collection-bulk{display:none;gap:5px;align-items:center;width:100%;padding:7px 0 0;border-top:1px solid var(--line);margin-top:3px}.collection-pane.select-mode .collection-bulk{display:flex}.collection-bulk select{height:30px;flex:1;min-width:0;border:1px solid var(--line);border-radius:7px;background:#fff;font-size:10px;padding:0 7px}.collection-bulk .btn-small{white-space:nowrap}.collection-tag-editor{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:5px}.collection-tag-chip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 5px 0 6px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:9px;color:#666}.collection-tag-chip .tag-dot{width:9px;height:9px;border:0;border-radius:50%;padding:0;display:block;cursor:pointer}.tag-color-input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}.collection-tag-chip .tag-text,.collection-tag-chip .tag-remove{border:0;background:transparent;padding:0;color:#666;font-size:9px}.collection-tag-chip .tag-remove{color:#aaa;font-size:10px;cursor:pointer}.collection-tag-chip .tag-dot{width:7px;height:7px;border-radius:50%;display:block}.collection-tag-input{border:0;outline:0;background:transparent;font-size:9px;min-width:90px;height:22px}.collection-tag-color{position:relative;width:20px;height:20px;border:1px solid var(--line);border-radius:50%;padding:0;background:transparent;overflow:hidden;cursor:pointer}.collection-tag-color input{position:absolute;inset:-6px;width:32px;height:32px;opacity:0;cursor:pointer}.collection-meta-folder{font-size:9px;color:#999;margin-top:3px}.collection-card .collection-info{padding-bottom:1px}.collection-card .collection-card-actions{display:none}.collection-card.editing .collection-card-actions{display:none}.collection-folder-name{font-size:9px;color:#888}.collection-folder-create.is-open{display:flex}.collection-tag-filter-dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle}.collection-card .collection-info{display:flex;flex-direction:column;justify-content:center}.collection-card .collection-name{margin-bottom:2px}.collection-card .collection-tag-editor{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px;min-height:22px}.collection-card .collection-tag-input{border:1px solid transparent;border-radius:6px;padding:0 4px;height:22px;min-width:82px;color:#777}.collection-card .collection-tag-input:focus{border-color:var(--line);background:#fbfaf8}.collection-tag-chip{height:21px;padding:0 5px;border-radius:999px;background:#f5f3f0;border-color:transparent}.collection-tag-chip .tag-dot{width:7px;height:7px}.collection-tag-chip .tag-remove{display:none}.collection-tag-chip:hover .tag-remove{display:inline-block}.collection-tag-color{width:18px;height:18px;border-radius:50%}.collection-folder-create{margin:0 0 8px;padding:7px;background:#fbfaf8;border:1px solid var(--line);border-radius:8px}.collection-folder-create input{background:#fff}.collection-folder-name{font-size:9px;color:#999}.collection-pane:not(.select-mode) .collection-select-box{display:none}.collection-pane.select-mode .collection-card{cursor:pointer}\n.collection-tools{display:flex;gap:7px;margin-bottom:9px}.collection-search,.collection-select{height:32px;border:1px solid var(--line);border-radius:7px;background:#fbfaf8;outline:0;font-size:10px;padding:0 9px}.collection-search{flex:1;min-width:0}.collection-select{width:110px}.collection-tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}.collection-filter-tag{height:25px;padding:0 8px;border:1px solid var(--line);border-radius:999px;background:#fff;color:#777;font-size:9px}.collection-filter-tag.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}.collection-folder-tabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 10px}.collection-folder-tab{height:28px;padding:0 10px;border:1px solid var(--line);border-radius:7px;background:#fff;color:#777;font-size:9px;cursor:pointer}.collection-folder-tab.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}.collection-folder-delete{width:26px;height:26px;border:1px solid var(--line);border-radius:7px;background:#fff;color:#999;font-size:13px;cursor:pointer}.collection-folder-delete:hover{color:#555;background:#f7f4f0}.collection-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.collection-card{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 9px;box-shadow:none;cursor:pointer}.collection-card:hover{background:#fbfaf8}.collection-card.collection-dragging{opacity:.55}.collection-avatar{width:42px;height:42px;border-radius:8px;object-fit:cover;background:#eeeae6;border:1px solid var(--line);flex:0 0 42px}.collection-avatar.empty{display:grid;place-items:center;color:#aaa;font-size:16px}.collection-info{min-width:0;flex:1}.collection-name{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.collection-meta{font-size:9px;color:#999;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.collection-card-actions{display:flex;gap:3px;align-items:center}.collection-card-actions input{width:55px;height:25px;border:1px solid var(--line);border-radius:6px;padding:0 5px;font-size:9px}.collection-drag-handle{display:none;color:#aaa;cursor:grab;font-size:15px;user-select:none}.collection-pane.drag-mode .collection-drag-handle{display:block}.collection-pane.drag-mode .collection-card{cursor:grab}.collection-empty{padding:28px 15px;border:1px dashed #d8d3cd;border-radius:10px;color:#aaa;text-align:center;font-size:11px}\n.collection-pane{display:none}.collection-pane.collection-modal-open{display:flex;position:fixed;inset:76px 22px 22px 22px;z-index:18;width:auto;height:auto;box-shadow:0 20px 70px rgba(0,0,0,.18)}\n.collection-close{display:none}.collection-pane.collection-modal-open .collection-close{display:block}.collection-card.editing .collection-card-actions{display:flex}.collection-card.editing{background:#faf8f5}\n\n.modal-back{position:fixed;inset:0;background:rgba(35,32,29,.28);display:none;align-items:center;justify-content:center;padding:20px;z-index:20}\n.modal{width:min(720px,100%);max-height:80vh;background:#fff;border-radius:12px;border:1px solid var(--line);box-shadow:0 20px 70px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden}\n.modal-head{padding:13px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}.modal-body{padding:16px;overflow:auto}.modal textarea{width:100%;height:360px;border:1px solid var(--line);border-radius:8px;padding:12px;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical} .confirm-message{font-size:14px;line-height:1.8;color:#444;white-space:pre-line}.confirm-modal{width:min(520px,100%)}\n.backtop{position:fixed;right:28px;bottom:28px;width:38px;height:38px;border:1px solid var(--line);border-radius:50%;background:#fff;color:#666;box-shadow:0 8px 24px rgba(40,35,30,.12);display:none;place-items:center;z-index:15}.backtop.show{display:grid}.toast{position:fixed;right:22px;bottom:22px;background:#302e2b;color:white;padding:10px 13px;border-radius:8px;font-size:11px;opacity:0;transform:translateY(8px);transition:.2s;z-index:30}.toast.show{opacity:1;transform:none}\n.mobile-tabs{display:none}\n.main.prompt-focus{grid-template-columns:minmax(0,1fr)}\n.main.prompt-focus > .pane:not(:first-child){display:none}\n@media (min-width:901px){.prompt-focus .scroll{padding:18px 22px}.prompt-focus .prompt-sticky-tools{margin:-18px -22px 12px;padding-left:22px;padding-right:22px}}\n@media(max-width:900px){\n  body{overflow:hidden}.app{height:100dvh}.topbar{height:auto;min-height:58px;flex:0 0 auto;padding:9px 12px;position:relative}.brand span{display:none}.brand strong{font-size:14px}.actions{gap:5px;max-width:calc(100vw - 64px);overflow-x:auto;scrollbar-width:none}.actions::-webkit-scrollbar{display:none}.actions .btn{padding:0 8px;font-size:10px;height:32px;flex:0 0 auto}\n  .mobile-tabs{display:flex;gap:5px;padding:6px 7px;background:#fff;border-bottom:1px solid var(--line)}.mobile-tabs button{flex:1;height:30px;border:1px solid var(--line);border-radius:8px;background:#faf9f7;color:#777;font-size:11px}.mobile-tabs button.active{background:#2f2d2b;color:#fff;border-color:#2f2d2b}\n  .main{display:block;height:calc(100dvh - 86px);padding:8px;overflow:hidden}.pane{height:100%;width:100%;border-radius:10px;box-shadow:none}.pane.mobile-hidden{display:none}.collection-pane{display:flex}.collection-pane.collection-modal-open{position:static;inset:auto;width:100%;height:100%;box-shadow:none}.collection-close{display:none}.pane-head{height:48px;flex-basis:48px;padding:0 12px}.scroll{padding:10px}.replace-bar{display:none;gap:7px;align-items:center;padding:8px 0 2px}.replace-bar.open{display:flex}.replace-bar input{flex:1;min-width:0;height:32px;border:1px solid var(--line);border-radius:7px;padding:0 9px;outline:0;background:#fbfaf8;font-size:11px}.replace-actions{display:flex;gap:5px}.replace-actions .btn-small{white-space:nowrap}.replace-info{display:none}.pair-hint{font-size:9px;color:#999;margin-left:2px;white-space:nowrap}.pair-tags{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}.pair-tag{border-color:#c9c2b9;background:#faf7f2}.right-scroll{padding:0}.prompt-sticky-tools{position:sticky;top:0;z-index:10;margin:-10px -10px 10px;padding:9px 10px 7px;background:rgba(255,255,255,.98);border-bottom:1px solid var(--line);box-shadow:0 3px 10px rgba(40,35,30,.04);backdrop-filter:blur(8px)}.prompt-toolbar{position:relative;top:auto;z-index:auto;background:transparent;padding-bottom:0;margin-bottom:7px}.quick-tags{margin:0;padding-bottom:3px;overflow-x:auto;flex-wrap:nowrap}.quick-tag{flex:0 0 auto}.order-note{display:none}\n  .card{margin-bottom:8px}.card-head{padding:10px;flex-wrap:wrap}.world-card .world-title-input{order:10;flex:1 1 100%;width:100%;min-width:0;height:30px}.world-card .world-meta{margin-left:auto}.world-highlight,.persona-highlight{font-size:15px;line-height:1.8;padding:18px 16px 28px}.world-editor,.persona-editor{min-height:120px;font-size:15px;line-height:1.8;padding:18px 16px 28px}.backtop{right:18px;bottom:18px}\n  .persona-editor{min-height:120px;font-size:15px;line-height:1.8}\n  .section{padding:12px}.card-preview{padding:14px}.avatar{width:62px;height:62px}.field textarea{min-height:110px}\n  .greeting-body textarea{min-height:35dvh}.toast{right:12px;bottom:12px}\n  .topbar{height:46px;flex-basis:46px;padding:0 9px;gap:6px}.brand{gap:7px}.logo{width:28px;height:28px;border-radius:8px;font-size:14px}.brand strong{font-size:13px}.brand span{display:none}.actions{gap:4px;max-width:70%;overflow-x:auto;scrollbar-width:none}.actions::-webkit-scrollbar{display:none}.actions .btn{height:30px;padding:0 9px;font-size:10px;white-space:nowrap}\n  .mobile-tabs{padding:5px 7px}.mobile-tabs button{height:29px;font-size:10px}\n  .main{height:calc(100dvh - 81px);padding:6px;gap:7px}.pane-head{height:40px;flex-basis:40px;padding:0 10px}.pane-title{font-size:11px}.pane-sub{font-size:9px}.pane-head .actions-small{gap:4px}.pane-head .btn-small{height:27px;padding:0 7px;font-size:10px}\n  .prompt-sticky-tools{padding:5px 7px 4px;margin:-10px -10px 6px}.prompt-toolbar{gap:5px;margin-bottom:4px}.search input{height:29px;font-size:10px}.search span{left:9px;top:7px}.quick-tags{gap:4px;padding-bottom:1px}.quick-tag{height:24px;padding:0 7px;font-size:9px}.quick-tag code{font-size:9px}\n  .collection-head{height:auto;min-height:56px;padding:9px 10px;gap:8px}.collection-head strong{font-size:14px}.collection-actions{gap:4px;overflow-x:auto}.collection-actions .btn{height:29px;padding:0 8px;font-size:9px;white-space:nowrap}.collection-list{padding:0;gap:7px;grid-template-columns:repeat(2,minmax(0,1fr))}.collection-tools{margin-bottom:7px}.collection-select{width:96px}.collection-card-actions{display:none}.collection-card.editing .collection-card-actions{display:flex;flex:1;flex-wrap:wrap}.collection-card.editing .collection-card-actions input{display:block;flex:1;min-width:90px}.collection-scroll{padding:9px}\n}\n\n\n.current-tags-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:0 2px 12px;margin-top:-3px}\n.current-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap}\n.current-tag-input{height:24px;min-width:120px;flex:1 1 120px;border:1px solid transparent;border-radius:6px;background:transparent;padding:0 5px;outline:0;font-size:10px;color:#666}\n.current-tag-input:focus{border-color:var(--line);background:#fbfaf8}\n.current-tag-chip{display:inline-flex;align-items:center;gap:4px;height:23px;padding:0 6px;border:1px solid var(--line);border-radius:999px;background:#f7f5f2;font-size:9px;color:#666}\n.current-tag-chip .tag-dot{width:8px;height:8px;border:0;border-radius:50%;padding:0;cursor:pointer}\n.current-tag-chip .tag-remove{border:0;background:transparent;color:#aaa;padding:0 1px;cursor:pointer;font-size:10px}\n@media(max-width:900px){.current-tags-row{padding-bottom:9px}.current-tag-input{min-width:90px}}\n/* 竖屏主编辑区：一列连续滚动，折叠区始终位于底部。 */\n.other-section{border-top:1px solid var(--line);background:#fff}.other-section>summary{padding:17px 18px;font-size:12px;font-weight:650;cursor:pointer;list-style:none}.other-section>summary:after{content:'⌄';float:right;color:#999}.other-section[open]>summary:after{content:'⌃'}.other-section .section{border-top:1px solid var(--line);border-bottom:0}\n@media(max-width:900px){.topbar{min-height:51px;flex-basis:51px}.brand{flex:0 0 auto}.actions{max-width:none;flex:1;justify-content:flex-start}.actions .btn{min-width:44px}.mobile-tabs button{min-width:0;line-height:1.2}.main{height:auto;flex:1;min-height:0}.section{padding:14px}.field textarea{font-size:15px}.greeting-body textarea{font-size:15px}.other-section>summary{font-size:13px}}\n\n/* 最终单列布局；固定工具栏仅用于编辑，不参与卡片排序。 */\nhtml,body,.app{height:100%;overflow:hidden}.topbar{position:relative;z-index:12;flex:0 0 auto;min-height:54px;height:auto;padding:8px 12px;gap:8px}.brand{flex:none;gap:7px}.brand strong{font-size:13px}.actions{flex:1;justify-content:flex-end;overflow-x:auto;max-width:none}.actions .btn{height:34px;flex:none;white-space:nowrap}.main,.main.prompt-focus{display:block;flex:1;min-height:0;height:auto;overflow:hidden;padding:0;width:100%;max-width:760px;margin:0 auto}.pane,.main.prompt-focus>.pane{display:flex!important;height:100%;width:100%;border-radius:0;box-shadow:none}.scroll{padding:0 12px 22px;overflow-y:auto;overscroll-behavior:contain}.prompt-sticky-tools{position:sticky;top:0;margin:0 -12px 0;padding:10px 12px 8px;z-index:11;background:white}.prompt-toolbar{margin:0 0 7px}.prompt-toolbar .btn-small{height:35px;white-space:nowrap}.quick-tags{margin:0}.card-preview{padding:15px 4px 10px;border-bottom:0}.avatar-row{gap:12px}.avatar{width:82px;height:82px;cursor:pointer;flex:none}.char-name{font-size:19px;cursor:pointer}.char-name:hover{text-decoration:underline}#nameInput:not([hidden]){height:38px;border:1px solid var(--line);border-radius:7px;padding:0 9px;font-size:17px;min-width:0;width:min(300px,60vw)}.current-tags-row{padding:4px 4px 10px;margin:0}.current-tag-input{flex:1;min-width:100px}#promptList{margin:0}#promptList .card{margin-bottom:0;border-radius:9px}.card-head .drag{display:none}.card-head .num{font-size:11px}.card-head .type{font-size:10px}.section{padding:17px 4px;border-bottom:1px solid var(--line)}.book-section{padding-top:20px}.section-title{font-size:14px;margin-bottom:12px}.section-count{color:#999;font-size:11px}.book-list{margin-bottom:7px}.book-list:empty{display:none}.entry-head{min-height:45px}.book-drag{font-size:19px;color:#aaa;cursor:grab;touch-action:none;padding:4px}.entry.dragging{opacity:.55}.entry.drop-target{border-color:#9d978f;box-shadow:0 0 0 2px #eeeae5}.entry.open .entry-body{display:block}.entry-body .kv:has(.world-editor){display:block}.entry-body .kv:has(.world-editor)>label{display:block;margin-bottom:4px}.entry-body .world-editor{font-size:15px;min-height:150px;line-height:1.7;padding:10px;resize:vertical;border:1px solid var(--line)}.greeting-list:empty{display:none}.other-section{margin:0 -12px;border-top:0}.other-section>summary{padding:17px 16px;font-size:14px}.other-section .section{padding:14px 16px}.other-section textarea{min-height:110px}.backtop{right:15px;bottom:15px}.mobile-tabs{display:none!important}\n@media(max-width:900px){.topbar{min-height:49px;height:auto;padding:6px}.actions{gap:4px}.actions .btn{height:32px;padding:0 9px}.main{padding:0;height:auto}.scroll{padding:0 10px 20px}.prompt-sticky-tools{margin:0 -10px;padding:10px 10px 7px}.prompt-toolbar{gap:5px}.prompt-toolbar .btn-small{font-size:11px;padding:0 8px}.search input{height:35px;font-size:12px}.search span{top:9px}.quick-tag{height:31px;font-size:11px;padding:0 9px}.quick-tag code{font-size:11px}.card-head{flex-wrap:nowrap}.card-preview{padding:12px 4px}.avatar{width:82px;height:82px}.section{padding:17px 4px}.field textarea{font-size:15px}.greeting-body textarea{min-height:160px}.other-section .field textarea{min-height:100px}}\n\n.format-tools{display:flex;gap:5px;align-items:center;overflow-x:auto;padding:5px 0 1px;scrollbar-width:none}.format-tools::-webkit-scrollbar{display:none}.format-tools .quick-tag{white-space:nowrap;flex:none}.format-tools .quick-tag.active{background:#2f2d2b;color:#fff}.format-tools select{height:30px;border:1px solid var(--line);border-radius:7px;background:white;color:#555;font-size:11px;padding:0 6px;flex:none}.visual-editor{padding:18px 16px 28px;font:15px/1.8 ui-monospace,SFMono-Regular,Consolas,'Noto Sans Mono',monospace;min-height:130px;outline:none;white-space:pre-wrap;overflow-wrap:anywhere}.visual-editor[hidden],textarea[hidden],.persona-highlight[hidden]{display:none!important}.visual-line{min-height:1.8em}.visual-line.h1{font-size:1.75em;font-weight:750;line-height:1.35;margin:7px 0}.visual-line.h2{font-size:1.4em;font-weight:700;line-height:1.45;margin:5px 0}.visual-line.h3{font-size:1.18em;font-weight:650;margin:4px 0}.visual-line.bullet{padding-left:1.3em;position:relative}.visual-line.bullet:before{content:'•';position:absolute;left:.25em}.visual-line.number{padding-left:1.6em;list-style:decimal;display:list-item;list-style-position:inside}.visual-line.quote{padding-left:12px;border-left:3px solid #b9b3ac;color:#777}.visual-line code{background:#f3f1ee;border-radius:3px;padding:1px 3px}.entry-body .visual-editor{border:1px solid var(--line);border-radius:6px;padding:10px;font-family:inherit}.visual-editor strong{font-weight:750}\n:root{--bg:#f6f4f1;--panel:#fff;--ink:#343434;--muted:#8d8a88;--line:#e5e0db;--soft:#f7f5f2}.topbar,.prompt-sticky-tools{display:none!important}.other-section,#greetingList,#greetingCount,.section:has(#greetingList){display:none!important}\n/* 面面编辑区：统一标题、字段字号和板块分隔 */\n.card-preview .char-name{font-weight:600!important;font-size:19px!important;line-height:1.35!important}\n.section-title,.field>label,.card .card-title,.card .card-head,.entry .entry-title{font-size:14px!important;font-weight:600!important;line-height:1.5!important}\n.section,.book-section,.field{border-color:var(--line)!important}\n.section+.section,details.other-section{border-top:1px solid var(--line)!important;margin-top:16px!important;padding-top:16px!important}\n.section-title{padding-bottom:9px!important;margin-bottom:12px!important;border-bottom:1px solid var(--line)!important}\n.section-count{font-size:12px!important;font-weight:400!important}\n.mm-name-wrap{min-width:0;flex:1}.mm-name-wrap #nameInput:not([hidden]){width:100%;max-width:320px;height:36px;border:1px solid var(--line);border-radius:7px;padding:0 8px}.section-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mm-user-tag-row{display:flex;align-items:center;gap:7px;padding:5px 7px}.mm-user-tag-row input{min-width:0;flex:1;border:1px solid var(--line);border-radius:7px;padding:6px}</style>\n<style>.mm-search-hit{background:rgba(245,202,104,.23)!important;box-shadow:inset 3px 0 #e7b849!important}mark{background:#f5ca68!important;color:#25211a!important}</style>\n<style>\n.card-preview .avatar-row{align-items:stretch;min-height:82px}.card-preview .mm-name-wrap{min-width:0;flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:1px}.card-preview .char-name{line-height:1.15!important}.card-preview #nameInput:not([hidden]){height:26px;width:100%;font-size:13px}.card-preview .current-tags-row{margin:0;padding:0;min-height:22px;display:flex;flex-wrap:nowrap;overflow:hidden;align-items:center}.card-preview .current-tags{display:flex;gap:3px;max-width:65%;overflow-x:auto;flex:none}.card-preview .current-tag-input{min-width:40px;width:100%;height:23px;font-size:11px}.card-preview .mm-inline-actions{display:flex;gap:4px;align-items:end}.card-preview .mm-inline-actions button{font:inherit;font-size:11px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:5px;padding:2px 6px;cursor:pointer}.entry-head .entry-name-input{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;outline:none}.entry-body .kv{display:block}.entry-body .kv>label{display:block;margin-bottom:4px}.book-section,.book-list,.entry.open,.entry-body{max-height:none!important;overflow:visible!important}.entry-head .merge-check{flex:none;margin:0 4px}.entry-head>span:last-child{display:inline-flex;width:18px;justify-content:center;align-items:center}.mm-busy .card-preview{opacity:.75}\n</style><style>.world-card .card-head>.iconbtn{flex:0 0 28px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;margin:0;padding:0;line-height:1}.card-preview .current-tags-row{display:block;overflow:visible}.card-preview .current-tags{display:flex;flex-wrap:wrap;max-width:none;overflow:visible;gap:4px}.card-preview .current-tag-input{display:block;flex:none;width:100%;margin-top:4px}.card-preview .mm-name-wrap{justify-content:flex-start}.card-preview .mm-inline-actions{margin-top:auto}.entry-head{display:flex;align-items:center;gap:7px}.entry-head .entry-name-input{flex:1;min-width:0}.entry-fold{flex:none;width:25px;height:30px;border:0;background:transparent;color:inherit;cursor:pointer}.section-title #bookName{border:0;background:transparent;color:inherit;font:inherit;font-weight:700;min-width:0;flex:1;outline:none}.section-title #bookName:focus{border-bottom:1px solid var(--line)}.persona-wrap,.world-wrap{height:auto!important;min-height:0!important}.scroll{padding-bottom:75px!important}.entry-head .iconbtn,.entry-head .entry-fold{flex:0 0 28px!important;width:28px!important;height:28px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:0!important;margin:0!important;line-height:1!important;vertical-align:middle!important}</style><style id=\"mm-contrast-style\">\n.card,.card-head,.card-body,.entry,.entry-head,.entry-body,.greeting,.greeting-head,.greeting-body,.other-section,.editor-tools,.type,.btn,.btn-small,.quick-tag,.add,.field input,.field textarea,.kv input,.kv textarea,.kv select,.greeting-body textarea{background:var(--panel);color:var(--ink)}\n.editor,.persona-editor,.world-editor,.world-title-input,.current-tag-input,.char-name,.field label,.kv label,.iconbtn,.section-count,.entry-order,.num{color:var(--ink)}\n.current-tag-input:focus{background:var(--panel)}\ninput::placeholder,textarea::placeholder{color:var(--ink);opacity:.65}\n.entry.open .world-editor{overflow:hidden!important;resize:none!important;max-height:none!important}\n.mm-title-status-row{display:flex;align-items:flex-start;gap:7px;min-width:0;width:100%}.mm-title-status-row .char-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mm-title-status-row #nameInput:not([hidden]){flex:1 1 auto;min-width:0}.mm-title-status-row #mmOperationStatus{margin-left:auto;flex:0 1 auto;min-width:0;text-align:right;font-size:11px;line-height:1.35;overflow-wrap:anywhere}</style>\n<style id=\"mm-no-horizontal-scroll\">.scroll{overflow-x:hidden;overflow-y:auto;overflow-wrap:anywhere}.scroll .card,.scroll .entry,.scroll .section{min-width:0;max-width:100%}.scroll textarea,.scroll input,.scroll [contenteditable]{max-width:100%}#pairTags{display:none}</style><style>.mm-inline-actions{gap:clamp(5px,1.8vw,14px)!important;flex-wrap:nowrap!important}.mm-inline-actions button{padding-left:0!important;padding-right:0!important;white-space:nowrap!important;flex:0 0 auto}.mm-name-wrap{min-width:0!important}</style><style>/* V10.16 whole-button wrapping */\n.card-preview .mm-inline-actions{display:flex!important;flex-wrap:wrap!important;gap:8px 12px!important;min-width:0;max-width:100%}\n.card-preview .mm-inline-actions button{flex:0 0 auto!important;width:auto!important;min-width:36px!important;min-height:40px;padding:6px 2px!important;white-space:nowrap!important;word-break:normal!important;writing-mode:horizontal-tb!important}\n.card-preview .mm-name-wrap{min-width:0}\n</style><style>/* V10.16 single-row toolbar */\n.card-preview .mm-inline-actions{display:grid!important;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);flex-wrap:nowrap!important;gap:clamp(2px,.7vw,6px)!important;width:100%;min-width:0;max-width:100%;align-items:center}\n.card-preview .mm-inline-actions button{box-sizing:border-box!important;min-width:0!important;width:100%!important;max-width:100%;margin:0!important;padding:6px 0!important;min-height:40px;font-size:clamp(12px,3.3vw,16px)!important;white-space:nowrap!important;word-break:normal!important;writing-mode:horizontal-tb!important}\n@media(max-width:380px){.card-preview .avatar-row{gap:8px}.card-preview .avatar{width:72px!important;height:72px!important;min-width:72px!important;flex:0 0 72px!important}}\n</style></head>\n<body>\n<div class=\"app\">\n<header class=\"topbar\"><div class=\"brand\"><div class=\"logo\">✦</div><strong>面面</strong></div>\n<div class=\"actions\"><button class=\"btn primary\" onclick=\"savePreviewDraft()\">保存</button><button class=\"btn\" onclick=\"requestTavernWrite('overwrite')\">覆盖</button><button class=\"btn\" onclick=\"newCard()\">新建</button><button class=\"btn\" onclick=\"openExportDialog()\">导出</button><button class=\"btn\" onclick=\"undo()\" title=\"撤销\">↶</button><button class=\"btn\" onclick=\"redo()\" title=\"重做\">↷</button></div></header>\n<main class=\"main\"><section class=\"pane\"><div class=\"scroll\" id=\"promptScroll\">\n  <div class=\"prompt-sticky-tools\"><div class=\"prompt-toolbar\"><div class=\"search\"><span>⌕</span><input id=\"promptSearch\" type=\"search\" placeholder=\"搜索人设 / 世界书…\" oninput=\"renderPrompt();renderBook()\"></div><button class=\"btn-small\" onclick=\"openReplace()\">替换</button><button class=\"btn-small\" onclick=\"foldCurrentCard()\">折叠当前</button></div>\n      <div class=\"quick-tags\" id=\"quickTags\" aria-label=\"常用标签\">\n        <button class=\"quick-tag\" data-tag=\"{{user}}\" onclick=\"insertQuickTag('{{user}}')\"><code>{{user}}</code></button>\n        <button class=\"quick-tag\" data-tag=\"{{char}}\" onclick=\"insertQuickTag('{{char}}')\"><code>{{char}}</code></button>\n        <button class=\"quick-tag\" data-tag=\"quote\" data-pair-open=\"&quot;\" data-pair-close=\"&quot;\"><code>\"\"</code></button>\n        <button class=\"quick-tag\" data-tag=\":\" onclick=\"insertQuickTag(':')\"><code>:</code></button>\n        <button class=\"quick-tag\" data-tag=\",\" onclick=\"insertQuickTag(',')\"><code>,</code></button>\n        <button class=\"quick-tag\" data-tag=\".\" onclick=\"insertQuickTag('.')\"><code>.</code></button>\n        <button class=\"quick-tag\" data-tag=\";\" onclick=\"insertQuickTag(';')\"><code>;</code></button>\n        <button class=\"quick-tag\" data-tag=\"- \" onclick=\"insertQuickTag('- ')\"><code>-</code></button>\n        <button class=\"quick-tag\" data-tag=\"【】\" data-pair-open=\"【\" data-pair-close=\"】\"><code>【】</code></button>\n        <button class=\"quick-tag\" data-tag=\"[]\" data-pair-open=\"[\" data-pair-close=\"]\"><code>[]</code></button>\n        <button class=\"quick-tag\" data-tag=\"<>\" data-pair-open=\"&lt;\" data-pair-close=\"&gt;\"><code>&lt;&gt;</code></button>\n        <button class=\"quick-tag\" data-tag=\"()\" data-pair-open=\"(\" data-pair-close=\")\"><code>()</code></button>\n        <span id=\"pairTags\" class=\"pair-tags\" aria-label=\"未闭合标签\"></span>\n      </div>\n      <div class=\"format-tools\" id=\"formatTools\" aria-label=\"文字格式\">\n        <button class=\"quick-tag\" type=\"button\" onclick=\"toggleVisualEditor()\" id=\"visualToggle\" title=\"可视编辑与纯文本编辑切换\">可视编辑</button>\n        <select id=\"blockStyle\" aria-label=\"段落格式\" onchange=\"applyBlockStyle(this.value);this.value=''\">\n          <option value=\"\">正文 / 标题</option><option value=\"h1\">大标题 #</option><option value=\"h2\">中标题 ##</option><option value=\"h3\">小标题 ###</option><option value=\"p\">正文</option>\n        </select>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyInlineStyle('bold')\" title=\"加粗，实际保存为 **文字**\"><b>B</b></button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyInlineStyle('italic')\" title=\"斜体，实际保存为 *文字*\"><i>I</i></button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyBlockStyle('bullet')\" title=\"无序列表，实际保存为 - 条目\">• 列表</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyBlockStyle('number')\" title=\"有序列表，实际保存为 1. 条目\">1. 列表</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"applyBlockStyle('quote')\" title=\"引用，实际保存为 > 文字\">❞ 引用</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"copyFormat()\" title=\"复制当前段落格式\">格式刷</button>\n        <button class=\"quick-tag\" type=\"button\" onclick=\"pasteFormat()\" title=\"把复制的格式应用于目标段落\">应用格式</button>\n      </div>\n      <div class=\"replace-bar\" id=\"replaceBar\">\n        <input id=\"replaceFind\" placeholder=\"查找\">\n        <span>→</span><input id=\"replaceWith\" placeholder=\"替换为\">\n        <div class=\"replace-actions\"><button class=\"btn-small\" onclick=\"replaceOne()\">替换</button><button class=\"btn-small\" onclick=\"replaceAllText()\">全部替换</button><button class=\"btn-small\" onclick=\"closeReplace()\">×</button></div>\n        <span class=\"replace-info\" id=\"replaceInfo\"></span>\n      </div>\n  </div>\n  <div class=\"card-preview\"><div class=\"avatar-row\"><div id=\"avatarBox\" class=\"avatar avatar-empty\" role=\"button\" tabindex=\"0\" title=\"更换头像\">＋</div><div class=\"mm-name-wrap\"><div class=\"mm-title-status-row\"><div id=\"nameView\" class=\"char-name\" role=\"button\" tabindex=\"0\" title=\"点击改名\">User</div><input id=\"nameInput\" placeholder=\"填写姓名\" hidden></div><div class=\"current-tags-row\" id=\"currentTagsRow\"><div class=\"current-tags\" id=\"currentTags\"></div><input id=\"currentTagInput\" class=\"current-tag-input\" placeholder=\"添加 Tag\" onkeydown=\"handleCurrentTagKeydown(event)\"></div><div class=\"mm-inline-actions\"><button data-mm-inline=\"convertUserCard\" title=\"保存为酒馆角色卡\">转卡</button><button type=\"button\" data-mm-inline=\"overwrite\">覆盖</button><button type=\"button\" data-mm-inline=\"new\">新建</button><button type=\"button\" data-mm-inline=\"importUserCard\">导入</button><button type=\"button\" data-mm-inline=\"exportUserCard\">导出</button></div></div></div><input id=\"avatar\" type=\"file\" accept=\"image/*\" hidden onchange=\"loadAvatar(event)\"></div>\n  \n  <div id=\"promptList\"></div>\n  <div class=\"section book-section\"><div class=\"section-title\"><input id=\"bookName\" aria-label=\"点击修改世界书名称\" placeholder=\"世界书\" title=\"点击修改世界书名称\" oninput=\"state.data.character_book.name=this.value;recordHistory()\"><span id=\"bookCount\" class=\"section-count\">0 entries</span><button class=\"btn-small\" type=\"button\" onclick=\"mergeSelected()\">合并所选</button></div><div id=\"bookList\" class=\"book-list\"></div><button class=\"add\" data-mm-add-entry>＋ 新增世界书条目</button></div>\n  <div class=\"section\"><div class=\"section-title\"><span>First Messages</span><span id=\"greetingCount\" class=\"section-count\">0</span></div><div id=\"greetingList\"></div><button class=\"add\" onclick=\"addGreeting()\">＋ 新增开场白</button></div>\n    <details class=\"other-section\"><summary>Other</summary>    <div class=\"section\">\n      \n      <div class=\"field\"><label>Personality</label><textarea id=\"personality\" placeholder=\"角色性格……\" oninput=\"state.data.personality=this.value;recordHistory()\"></textarea></div>\n      <div class=\"field\"><label>Scenario</label><textarea id=\"scenario\" placeholder=\"故事背景 / 当前场景……\" oninput=\"state.data.scenario=this.value;recordHistory()\"></textarea></div>\n      <div class=\"field\"><label>Creator Notes</label><textarea id=\"creatorNotes\" placeholder=\"作者备注……\" oninput=\"state.data.creator_notes=this.value;recordHistory()\"></textarea></div>\n    </div>\n\n    <div class=\"section\">\n      <div class=\"section-title\"><span>Example Dialogue</span></div>\n      <div class=\"field\"><textarea id=\"mesExample\" placeholder=\"示例对话……\" oninput=\"state.data.mes_example=this.value;recordHistory()\"></textarea></div>\n    </div>\n\n</details>\n</div></section></main>\n<div class=\"modal-back\" id=\"modal\">\n <div class=\"modal\">\n  <div class=\"modal-head\"><strong>粘贴角色卡 JSON</strong><button class=\"iconbtn\" onclick=\"closeModal()\">×</button></div>\n  <div class=\"modal-body\"><textarea id=\"jsonInput\" placeholder='粘贴 chara_card_v2 JSON……'></textarea><div style=\"display:flex;justify-content:flex-end;gap:8px;margin-top:10px\"><button class=\"btn\" onclick=\"closeModal()\">取消</button><button class=\"btn primary\" onclick=\"applyJSON()\">导入</button></div></div>\n </div>\n</div>\n<div class=\"modal-back\" id=\"exportModal\">\n <div class=\"modal confirm-modal\">\n  <div class=\"modal-head\"><strong>选择导出格式</strong><button class=\"iconbtn\" onclick=\"closeExportDialog()\">×</button></div>\n  <div class=\"modal-body\"><div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:10px\">\n   <button class=\"btn\" onclick=\"exportJSON();closeExportDialog()\">JSON</button>\n   <button class=\"btn\" onclick=\"exportPNG();closeExportDialog()\">PNG</button>\n   <button class=\"btn\" onclick=\"exportTXT();closeExportDialog()\">TXT</button>\n  </div></div>\n </div>\n</div>\n\n<div class=\"modal-back\" id=\"confirmModal\">\n <div class=\"modal confirm-modal\">\n  <div class=\"modal-head\"><strong id=\"confirmTitle\">确认操作</strong><button class=\"iconbtn\" onclick=\"closeConfirm()\">×</button></div>\n  <div class=\"modal-body\"><div id=\"confirmMessage\" class=\"confirm-message\"></div><div style=\"display:flex;justify-content:flex-end;gap:8px;margin-top:16px\"><button class=\"btn\" onclick=\"closeConfirm()\">取消</button><button class=\"btn primary\" id=\"confirmOK\">确定</button></div></div>\n </div>\n</div>\n<button class=\"backtop\" id=\"backtop\" title=\"回到顶部\" onclick=\"scrollPromptTop()\">↑</button>\n<div class=\"toast\" id=\"toast\"></div>\n\n<script>\nconst PERSONA_TEMPLATE = `char_name:\n  Chinese name: \n  Nickname: \n  age: \n  gender: \n  height: \n  identity:\n    - \n  background_story:\n    童年(0-12岁):\n    少年(13-18岁):\n    青年(19-35岁):\n    中年(35-至今):\n    现状:\n\n  social_status: \n    - \n\n  appearance:\n    hair: \n    eyes: \n    skin:\n    face_style: \n    build: \n      - \n  attire:\n    business_formal:\n    business_casual:\n    casual_wear:\n    home_wear:\n\n  archetype: \n\n  personality:\n    core_traits: \n      - : \"\"\n    romantic_traits: \n      - : \"\"\n\n\n  lifestyle_behaviors:\n    - \n    - \n\n  work_behaviors:\n    - \n\n  emotional_behaviors:\n    angry:\n    happy: \n\n  goals:\n    - \n\n  weakness:\n    - \n\n  likes:\n    - \n\n  dislikes:\n    - \n\n  skills:\n    - 工作: [\"\",\"\"]\n    - 生活: [\"\",\"\"]\n    - 爱好: [\"\",\"\"]\n\n  NSFW_information:\n    Sex_related traits:\n      experiences: \n      sexual_orientation: \n      sexual_role: \n      sexual_habits: \n        - \n    Kinks: \n    Limits:`;\n\nlet state = {\n  avatarData:\"\",\n  collectionMeta:{tags:[],folder:\"\"},\n  data:{\n    name:\"\",description:\"\",personality:\"\",scenario:\"\",first_mes:\"\",\n    mes_example:\"\",creator_notes:\"\",system_prompt:\"\",post_history_instructions:\"\",\n    alternate_greetings:[],\n    character_book:{name:\"\",description:\"\",scan_depth:4,token_budget:0,recursive_scanning:false,entries:[]}\n  },\n  promptOrder:[]\n};\n\nlet historyStack=[], redoStack=[], historyBusy=false, editSession=null, saveTimer=null;\nfunction getFocusState(){\n  const el=document.activeElement;\n  if(!el || !el.matches?.('textarea,input,select,[contenteditable=\"true\"]')) return null;\n  const info={id:el.id||'',historyKey:el.dataset?.historyKey||'',dataId:el.dataset?.id||'',selectionStart:null,selectionEnd:null,scrollTop:el.scrollTop||0,scrollLeft:el.scrollLeft||0};\n  if(typeof el.selectionStart==='number'){info.selectionStart=el.selectionStart;info.selectionEnd=el.selectionEnd;}\n  return info;\n}\nfunction getViewState(){\n  const ps=document.getElementById('promptScroll'), rs=document.querySelector('.right-scroll');\n  return {promptTop:ps?.scrollTop||0,promptLeft:ps?.scrollLeft||0,rightTop:rs?.scrollTop||0,rightLeft:rs?.scrollLeft||0};\n}\nfunction snapshot(){ return JSON.stringify({avatarData:state.avatarData,collectionMeta:state.collectionMeta||{tags:[],folder:\"\"},data:state.data,promptOrder:state.promptOrder,__focus:getFocusState(),__view:getViewState()}); }\nfunction restoreSnapshot(raw){\n  const x=JSON.parse(raw);\n  const focus=x.__focus||null;\n  const view=x.__view||null;\n  delete x.__focus; delete x.__view;\n  state=x;\n  renderAll();\n  markDirty(false);\n  requestAnimationFrame(()=>{\n    restoreFocus(focus);\n    if(view){\n      requestAnimationFrame(()=>{\n        const ps=document.getElementById('promptScroll'),rs=document.querySelector('.right-scroll');\n        if(ps){ps.scrollTop=view.promptTop||0;ps.scrollLeft=view.promptLeft||0}\n        if(rs){rs.scrollTop=view.rightTop||0;rs.scrollLeft=view.rightLeft||0}\n      });\n    }\n  });\n}\nfunction restoreFocus(info){\n  if(!info)return;\n  let el=null;\n  if(info.historyKey) el=document.querySelector(`[data-history-key=\"${CSS.escape(info.historyKey)}\"]`);\n  if(!el && info.dataId) el=document.querySelector(`[data-id=\"${CSS.escape(info.dataId)}\"]`);\n  if(!el && info.id) el=document.getElementById(info.id);\n  if(!el)return;\n  el.focus({preventScroll:true});\n  if(typeof el.setSelectionRange==='function' && typeof info.selectionStart==='number'){\n    const max=el.value?.length||0;\n    const a=Math.min(info.selectionStart,max),b=Math.min(info.selectionEnd??a,max);\n    el.setSelectionRange(a,b);\n  }\n  if(typeof info.scrollTop==='number')el.scrollTop=info.scrollTop;\n  if(typeof info.scrollLeft==='number')el.scrollLeft=info.scrollLeft;\n}\nfunction recordHistory(){\n  if(historyBusy)return;\n  const snap=snapshot();\n  if(historyStack[historyStack.length-1]!==snap){\n    historyStack.push(snap);\n    if(historyStack.length>300)historyStack.shift();\n  }\n  redoStack=[];markDirty(true);\n}\nfunction pushHistory(){recordHistory()}\nfunction beginEditSession(el){editSession=el?.dataset?.historyKey||el?.id||''}\nfunction endEditSession(){editSession=null}\nfunction undo(){\n  if(historyStack.length<2)return;\n  historyBusy=true;\n  const current=historyStack.pop();\n  redoStack.push(current);\n  restoreSnapshot(historyStack[historyStack.length-1]);\n  historyBusy=false;toast(\"已撤销上一步\");\n}\nfunction redo(){\n  if(!redoStack.length)return;\n  historyBusy=true;\n  const next=redoStack.pop();\n  historyStack.push(next);\n  restoreSnapshot(next);\n  historyBusy=false;toast(\"已重做上一步\");\n}\nfunction markDirty(dirty=true){clearTimeout(saveTimer);if(dirty)saveTimer=setTimeout(()=>saveLocal(true),600)}\nfunction saveLocal(silent=false){try{if(window.parent!==window)window.parent.postMessage({source:'mianmian-editor',action:'draftChanged',card:cardRaw(),avatarData:state.avatarData,userTags:window.__mmUserTags?.()},'*');markDirty(false)}catch(e){if(!silent)toast('草稿同步失败')}}\nfunction restoreLocal(){return false}\nfunction uid(){return Math.random().toString(36).slice(2,10)}\nfunction toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1500)}\nfunction esc(s){return String(s??\"\").replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]))}\nfunction entryTitle(e){return e.comment||\"未命名世界书条目\"}\nfunction renderName(){document.getElementById('nameView').textContent=state.data.name||\"User\";document.getElementById('nameInput').value=state.data.name||\"\"}\nfunction editName(){const view=document.getElementById('nameView'),input=document.getElementById('nameInput');view.hidden=true;input.hidden=false;input.value=state.data.name||'';input.focus();input.select()}\nfunction finishName(){const view=document.getElementById('nameView'),input=document.getElementById('nameInput');state.data.name=input.value.trim();view.hidden=false;input.hidden=true;renderName();recordHistory()}\ndocument.getElementById('nameView').addEventListener('click',editName);\ndocument.getElementById('nameView').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();editName()}});\ndocument.getElementById('nameInput').addEventListener('blur',finishName);\ndocument.getElementById('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur()}});\ndocument.querySelector('.card-preview').addEventListener('click',e=>{if(e.target.closest('#avatarBox'))document.getElementById('avatar').click()});\ndocument.querySelector('.card-preview').addEventListener('keydown',e=>{if(e.target.id==='avatarBox'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();document.getElementById('avatar').click()}});\n\nfunction makeEntry(){\n  return {id:uid(),comment:\"新世界书条目\",keys:[],secondary_keys:[],content:\"\",\n    constant:false,selective:false,selectiveLogic:\"AND\",insertion_order:1,position:\"before_char\",\n    depth:undefined,activation:{mode:\"keyword\",probability:100,weight:1,pool:\"default\"},\n    importance:\"medium\",persistence:false,dependencies:[],participants:[],enabled:true,\n    prevent_recursion:false}\n}\nfunction normalizeEntry(e,i){\n  e={...makeEntry(),...e,id:e.id||uid()};\n  if(!Array.isArray(e.keys))e.keys=typeof e.keys===\"string\"?e.keys.split(/[,，]/).map(x=>x.trim()).filter(Boolean):[];\n  if(!Array.isArray(e.secondary_keys))e.secondary_keys=[];\n  e.insertion_order=Number.isFinite(Number(e.insertion_order))?Number(e.insertion_order):(i+1);\n  return e;\n}\nfunction emptyState(){\n  return {avatarData:\"\",collectionMeta:{tags:[],folder:\"\"},data:{name:\"\",description:\"\",personality:\"\",scenario:\"\",first_mes:\"\",\n    mes_example:\"\",creator_notes:\"\",system_prompt:\"\",post_history_instructions:\"\",alternate_greetings:[],\n    character_book:{name:\"\",description:\"\",scan_depth:4,token_budget:0,recursive_scanning:false,entries:[]}},promptOrder:[]}\n}\nfunction initialState(){\n  // HTML 刚打开、以及「清空」后的真正初始状态：只保留一张完全空白的人设卡。\n  const s=emptyState();\n  s.promptOrder=[{id:uid(),type:\"description\",ref:null,collapsed:false}];\n  return s;\n}\nfunction templateState(){\n  // 「新建」专用：只有点击新建时才加载人设模板。\n  const s=initialState();\n  s.data.description=PERSONA_TEMPLATE;\n  return s;\n}\nlet pendingConfirmAction=null;\nfunction showConfirm(title,message,action){\n  pendingConfirmAction=action;\n  document.getElementById('confirmTitle').textContent=title;\n  document.getElementById('confirmMessage').textContent=message;\n  document.getElementById('confirmOK').onclick=()=>{const fn=pendingConfirmAction;pendingConfirmAction=null;closeConfirm();if(fn)fn()};\n  document.getElementById('confirmModal').style.display='flex';\n}\nfunction closeConfirm(){pendingConfirmAction=null;document.getElementById('confirmModal').style.display='none'}\nfunction replaceStateAndRecord(next,label){\n  // 先保留当前状态，再替换为新状态；新状态本身作为一条历史记录。\n  if(historyStack.length===0)historyStack=[snapshot()];\n  state=next;\n  renderAll();\n  recordHistory();\n  saveLocal(true);\n  toast(label);\n}\nfunction newCard(){\n  showConfirm('新建角色卡','当前编辑内容将被替换为空白角色卡。\\n\\n确定新建吗？',()=>{\n    const fileInputs=document.querySelectorAll('input[type=\"file\"]');fileInputs.forEach(x=>x.value='');\n    const search=document.getElementById('promptSearch');if(search)search.value='';\n    replaceStateAndRecord(initialState(),'已新建空白角色卡');\n  });\n}\nfunction clearAll(){\n  showConfirm('清空角色卡','这会清除角色名、头像、人设内容、世界书、开场白、示例对话以及所有其他数据。\\n\\n清空后只保留一张完全空白的人设卡，不会载入模板。\\n\\n确定清空吗？',()=>{\n    const fileInputs=document.querySelectorAll('input[type=\"file\"]');fileInputs.forEach(x=>x.value='');\n    const search=document.getElementById('promptSearch');if(search)search.value='';\n    replaceStateAndRecord(initialState(),'已全部清空');\n  });\n}\nfunction addPromptBlock(type=\"world\"){\n  if(type!==\"world\")return;\n  const e=makeEntry();e.insertion_order=Math.max(0,...state.data.character_book.entries.map(x=>Number(x.insertion_order)||0))+1;state.data.character_book.entries.push(e);\n  state.promptOrder.splice(1,0,{id:uid(),type:'world',ref:e.id,collapsed:false});recordHistory();renderAll()\n}\nfunction addEntry(){\n  if(document.body.classList.contains('mm-busy'))return;\n  const search=document.getElementById('promptSearch');if(search)search.value='';\n  addPromptBlock(\"world\");\n  const entry=state.data.character_book.entries.at(-1);\n  const node=[...document.querySelectorAll('#bookList .entry')].find(e=>e.dataset.id===entry.id);\n  if(node){node.classList.add('open');node.querySelector('.entry-fold').textContent='−';node.scrollIntoView({block:'nearest'});}\n  window.parent.postMessage({source:'mianmian-editor',action:'bookAdded',...window.__mmSnapshot()},'*');\n}\nfunction removeBlock(id){ const i=state.promptOrder.findIndex(x=>x.id===id);if(i<0)return;\n  const b=state.promptOrder[i];\n  if(b.type===\"world\")state.data.character_book.entries=state.data.character_book.entries.filter(e=>e.id!==b.ref);\n  state.promptOrder.splice(i,1);recordHistory();renderAll()\n}\nfunction syncOrders(){\n  let n=Math.max(state.data.character_book.entries.length,...state.data.character_book.entries.map(e=>Number(e.insertion_order)||0));state.promptOrder.forEach(b=>{if(b.type==='world'){const e=state.data.character_book.entries.find(x=>x.id===b.ref);if(e)e.insertion_order=n--}})\n}\nfunction moveBlock(from,to){\n  if(from===to)return;const [x]=state.promptOrder.splice(from,1);state.promptOrder.splice(to,0,x);syncOrders();recordHistory();renderAll()\n}\nfunction toggleBlock(id){const b=state.promptOrder.find(x=>x.id===id);if(b){b.collapsed=!b.collapsed;renderPrompt()}}\nfunction collapseAll(){state.promptOrder.forEach(b=>b.collapsed=true);renderPrompt()}\nfunction expandAll(){state.promptOrder.forEach(b=>b.collapsed=false);renderPrompt()}\n\nfunction textFromHTML(el){const clone=el.cloneNode(true);clone.querySelectorAll('mark').forEach(m=>m.replaceWith(document.createTextNode(m.textContent)));clone.querySelectorAll('br').forEach(b=>b.replaceWith('\\n'));return (clone.innerText||clone.textContent||\"\").replace(/\\u00a0/g,' ')}\nfunction highlightText(text,q){if(!q)return esc(text).replace(/\\n/g,'<br>');const safe=esc(text).replace(/\\n/g,'<br>');const re=new RegExp('('+q.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+')','gi');return safe.replace(re,'<mark>$1</mark>')}\nfunction updateEntryFromEditor(el){const e=state.data.character_book.entries.find(x=>x.id===el.dataset.id);if(e)e.content=el.value;updateEditorHighlight(el);autoGrowTextarea(el)}\nfunction syncEditor(el){const e=state.data.character_book.entries.find(x=>x.id===el.dataset.id);if(e)e.content=el.value}\nfunction updateEditorHighlight(el){const box=el.parentElement?.querySelector(el.classList.contains('persona-editor')?'.persona-highlight':'.world-highlight');if(!box)return;const q=(document.getElementById('promptSearch')?.value||'').trim();box.innerHTML=highlightText(el.value,q);box.style.height=Math.max(el.offsetHeight,120)+'px';box.scrollTop=el.scrollTop;box.scrollLeft=el.scrollLeft;el.classList.remove('search-transparent')}\nfunction updateWorldHighlight(el){updateEditorHighlight(el)}\nfunction captureScrollState(el){const states=[];let p=el;while(p){states.push([p,p.scrollTop,p.scrollLeft]);p=p.parentElement}return states}\nfunction restoreScrollState(states){states.forEach(([p,top,left])=>{p.scrollTop=top;p.scrollLeft=left})}\nfunction growTextarea(el,min=120){const ps=document.getElementById('promptScroll'),rs=document.querySelector('.right-scroll');const pt=ps?.scrollTop||0,rt=rs?.scrollTop||0;const a=el.selectionStart,b=el.selectionEnd;const states=captureScrollState(el);el.style.height='auto';el.style.height=Math.max(min,el.scrollHeight)+'px';restoreScrollState(states);if(ps)ps.scrollTop=pt;if(rs)rs.scrollTop=rt;if(document.activeElement===el&&typeof a==='number')el.setSelectionRange(a,b)}\nfunction autoGrowEditor(el){growTextarea(el,120)}\nfunction autoGrowTextarea(el){growTextarea(el,120)}\nfunction autoGrowAll(){document.querySelectorAll('.world-editor,.persona-editor').forEach(el=>growTextarea(el,120));}\nfunction growOpenBookEntries(){document.querySelectorAll('#bookList .entry.open .world-editor').forEach(el=>autoGrowTextarea(el))}\nfunction toggleBookEntry(button){const entry=button.closest('.entry');entry.classList.toggle('open');button.textContent=entry.classList.contains('open')?'−':'＋';if(entry.classList.contains('open'))requestAnimationFrame(()=>growOpenBookEntries())}\nlet mmEditorResizeObserver;\nfunction watchEditorWidth(){const scroller=document.getElementById('promptScroll');if(!scroller||mmEditorResizeObserver)return;let width=scroller.clientWidth;mmEditorResizeObserver=new ResizeObserver(()=>{const next=scroller.clientWidth;if(next===width)return;width=next;requestAnimationFrame(()=>{autoGrowAll();document.querySelectorAll('.persona-editor,.world-editor').forEach(updateEditorHighlight)})});mmEditorResizeObserver.observe(scroller)}\nfunction scrollPromptTop(){document.getElementById('promptScroll')?.scrollTo({top:0,behavior:'smooth'})}\nfunction scrollFirstSearchMatch(){\n  requestAnimationFrame(()=>{\n    const q=(document.getElementById('promptSearch')?.value||'').trim();\n    if(!q)return;\n    const first=document.querySelector('#promptList .world-highlight mark, #promptList .persona-highlight mark');\n    if(first)first.parentElement?.scrollIntoView({behavior:'smooth',block:'center'});\n  });\n}\nfunction updateSearchCount(){}\nfunction updatePersonaHighlight(){}\nfunction mergeSelected(){const ids=[...document.querySelectorAll('#bookList .merge-check:checked')].map(x=>x.dataset.mergeId);if(ids.length<2){toast('至少选择 2 个世界书条目');return;}const ordered=state.promptOrder.filter(b=>b.type==='world'&&ids.includes(b.ref)).map(b=>state.data.character_book.entries.find(e=>e.id===b.ref)).filter(Boolean);const merged={...normalizeEntry({...ordered[0],id:uid(),comment:''},0),comment:'',content:ordered.map(e=>`【${e.comment||'未命名世界书条目'}】\\n${e.content||''}`).join('\\n\\n'),keys:[...new Set(ordered.flatMap(e=>e.keys||[]))]};const firstId=ordered[0].id;state.data.character_book.entries=state.data.character_book.entries.filter(e=>!ids.includes(e.id));state.data.character_book.entries.push(merged);const firstIndex=state.promptOrder.findIndex(b=>b.type==='world'&&b.ref===firstId);state.promptOrder=state.promptOrder.filter(b=>!(b.type==='world'&&ids.includes(b.ref)));state.promptOrder.splice(firstIndex,0,{id:uid(),type:'world',ref:merged.id,collapsed:false});recordHistory();renderAll();toast(`已合并 ${ordered.length} 个世界书条目`)}\nfunction getTextareaLineInfo(el){\n  const start=el.selectionStart,value=el.value;\n  const lineStart=value.lastIndexOf('\\n',start-1)+1;\n  const lineEnd0=value.indexOf('\\n',start);\n  const lineEnd=lineEnd0<0?value.length:lineEnd0;\n  const line=value.slice(lineStart,lineEnd);\n  const m=line.match(/^(\\s*)(-\\s+|\\*\\s+|\\d+[.)]\\s+)(.*)$/);\n  const indent=(line.match(/^\\s*/)||[''])[0];\n  return {value,start,lineStart,lineEnd,line,m,indent,marker:m?.[2]||'',content:m?.[3]||''};\n}\nfunction findPreviousNonEmptyLine(value,lineStart){\n  let end=lineStart-1;\n  while(end>=0){\n    const start=value.lastIndexOf('\\n',end-1)+1;\n    const line=value.slice(start,end).replace(/\\r$/,'');\n    if(line.trim())return {start,line};\n    if(start===0)break;\n    end=start-1;\n  }\n  return null;\n}\nfunction parentIndentForLine(value,lineStart,currentIndent){\n  const prev=findPreviousNonEmptyLine(value,lineStart);\n  if(!prev)return '';\n  const prevIndent=(prev.line.match(/^\\s*/)||[''])[0];\n  if(prevIndent.length<currentIndent.length)return prevIndent;\n  let end=prev.start;\n  while(end>0){\n    const p=findPreviousNonEmptyLine(value,end);\n    if(!p)break;\n    const pi=(p.line.match(/^\\s*/)||[''])[0];\n    if(pi.length<currentIndent.length)return pi;\n    end=p.start;\n  }\n  return currentIndent.length>=4?currentIndent.slice(0,-4):'';\n}\nfunction indentUnit(){return '    ';}\nfunction handleSmartListKeydown(e){\n  const el=e.target;\n  if(!el.matches?.('textarea')||!['Enter','Backspace','Tab'].includes(e.key))return;\n  if(e.isComposing)return;\n  const value=el.value,start=el.selectionStart,end=el.selectionEnd;\n  if(start!==end)return;\n  const info=getTextareaLineInfo(el);\n  const {lineStart,line,m,indent,marker,content}=info;\n\n  if(e.key==='Enter'){\n    e.preventDefault();\n    // 列表回车：严格复制当前行的缩进和项目符号，保持同一级。\n    if(m){\n      el.setRangeText('\\n'+indent+marker,start,start,'end');\n    }else{\n      // 普通 YAML 键在冒号后进入下一层；普通文本保持当前缩进。\n      const trimmed=line.trimEnd();\n      const nextIndent=/[:：]$/.test(trimmed)?indent+indentUnit():indent;\n      el.setRangeText('\\n'+nextIndent,start,start,'end');\n    }\n    el.dispatchEvent(new Event('input',{bubbles:true}));\n    return;\n  }\n\n  if(e.key==='Backspace'){\n    // 只有“刚生成的空列表项、光标停在项目符号末尾”才退出列表层级。\n    // 一旦用户已经把这一行原有内容删空，Backspace 必须恢复办公软件原生行为，\n    // 允许继续删除换行并与上一行合并。\n    const isEmptyList=m && content.trim()==='' && start===lineStart+indent.length+marker.length;\n    if(isEmptyList && lineStart>0){\n      e.preventDefault();\n      const parent=parentIndentForLine(value,lineStart,indent);\n      // 删除当前行的缩进和项目符号，并保留一个可继续输入的位置。\n      el.setRangeText(parent,lineStart,start,'end');\n      el.dispatchEvent(new Event('input',{bubbles:true}));\n    }\n    return;\n  }\n\n  if(e.key==='Tab'){\n    e.preventDefault();\n    if(e.shiftKey){\n      if(indent.length){\n        const remove=Math.min(indentUnit().length,indent.length);\n        el.setRangeText('',lineStart,lineStart+remove,'start');\n      }\n    }else{\n      el.setRangeText(indentUnit(),lineStart,lineStart,'end');\n    }\n    el.dispatchEvent(new Event('input',{bubbles:true}));\n  }\n}\nfunction bindSmartListEditing(){\n  document.querySelectorAll('textarea,[contenteditable=\"true\"]').forEach(el=>{if(el.dataset.mmSmartListBound)return;el.dataset.mmSmartListBound='1';el.addEventListener('keydown',handleSmartListKeydown)});\n  document.querySelectorAll('.quick-tag[data-pair-open]').forEach(btn=>{\n    if(btn.dataset.bound==='1')return;\n    btn.dataset.bound='1';\n    btn.addEventListener('mousedown',ev=>ev.preventDefault());\n    btn.addEventListener('click',()=>insertQuickPair(btn.dataset.pairOpen||'',btn.dataset.pairClose||''));\n  });\n}\nlet lastEditor=null,lastSelectionStart=0,lastSelectionEnd=0;\nfunction rememberEditor(el){if(!el?.matches?.('.persona-editor,.world-editor'))return;lastEditor=el;lastSelectionStart=el.selectionStart??0;lastSelectionEnd=el.selectionEnd??lastSelectionStart;updatePairTag()}\nfunction insertQuickTag(tag){\n  if(visualMode&&activeVisualEditor?.isConnected){insertVisualText(tag);return}\n  const el=lastEditor?.isConnected?lastEditor:(document.activeElement?.matches?.('.persona-editor,.world-editor')?document.activeElement:document.querySelector('.persona-editor,.world-editor'));\n  if(!el){toast('请先点进人设或世界书正文');return}\n  const start=lastEditor===el?lastSelectionStart:(el.selectionStart??el.value.length),end=lastEditor===el?lastSelectionEnd:(el.selectionEnd??start);\n  el.focus(); el.setRangeText(tag,start,end,'end');\n  lastEditor=el; lastSelectionStart=start+tag.length; lastSelectionEnd=start+tag.length;\n  el.dispatchEvent(new Event('input',{bubbles:true})); rememberEditor(el);\n}\nfunction insertQuickPair(open,close){\n  if(visualMode&&activeVisualEditor?.isConnected){\n    const editor=activeVisualEditor,selection=window.getSelection();editor.focus();\n    if(selection?.rangeCount){\n      const range=selection.getRangeAt(0);\n      if(editor.contains(range.commonAncestorContainer)){\n        range.deleteContents();const text=document.createTextNode(open+close);range.insertNode(text);\n        const caret=document.createRange();caret.setStart(text,open.length);caret.collapse(true);\n        selection.removeAllRanges();selection.addRange(caret);syncVisualEditor(editor);return;\n      }\n    }\n    insertVisualText(open+close);return;\n  }\n  const el=lastEditor?.isConnected?lastEditor:(document.activeElement?.matches?.('.persona-editor,.world-editor')?document.activeElement:document.querySelector('.persona-editor,.world-editor'));\n  if(!el){toast('请先点进人设或世界书正文');return}\n  const start=lastEditor===el?lastSelectionStart:(el.selectionStart??el.value.length),end=lastEditor===el?lastSelectionEnd:(el.selectionEnd??start);\n  const text=open+close; el.focus(); el.setRangeText(text,start,end,'end');\n  const pos=start+open.length; el.setSelectionRange(pos,pos);\n  lastEditor=el; lastSelectionStart=pos; lastSelectionEnd=pos;\n  el.dispatchEvent(new Event('input',{bubbles:true})); rememberEditor(el);\n}\nconst dismissedPairs=new Map();\nfunction findUnmatchedTags(text){\n  // 扫描当前卡片里的所有 XML/HTML 风格标签；导入和手动输入一视同仁。\n  const re=/<\\/?([^<>\\s/]+)(?:\\s[^<>]*)?>/g;\n  const stack=[], unmatchedClose=[];\n  let m;\n  while((m=re.exec(text||''))){\n    const full=m[0], name=m[1];\n    const closing=full.startsWith('</');\n    const self=/\\/\\s*>$/.test(full);\n    if(self) continue;\n    if(!closing) stack.push({name,pos:m.index});\n    else{\n      let idx=-1;\n      for(let i=stack.length-1;i>=0;i--){ if(stack[i].name===name){idx=i;break} }\n      if(idx>=0) stack.splice(idx,1);\n      else unmatchedClose.push({name,pos:m.index});\n    }\n  }\n  const out=[], seen=new Set();\n  stack.forEach(x=>{\n    const label='</'+x.name+'>';\n    if(!seen.has(label)){seen.add(label);out.push({label,open:'',close:label});}\n  });\n  unmatchedClose.forEach(x=>{\n    const label='<'+x.name+'>';\n    if(!seen.has(label)){seen.add(label);out.push({label,open:label,close:''});}\n  });\n  return out;\n}\nfunction updatePairTag(){\n  const box=document.getElementById('pairTags'); if(!box)return;\n  const el=lastEditor?.isConnected?lastEditor:null;\n  if(!el){box.innerHTML='';return}\n  const key=el.dataset.historyKey||el.dataset.id||el.id||'editor';\n  const pairs=findUnmatchedTags(el.value);\n  const seen=new Set();\n  box.innerHTML=pairs.filter(p=>{\n    const k=p.label+'|'+p.open+'|'+p.close;\n    if(seen.has(k)||dismissedPairs.get(key)?.has(k))return false;\n    seen.add(k);return true;\n  }).map(p=>`<button class=\"quick-tag pair-tag\" type=\"button\" data-pair-open=\"${esc(p.open)}\" data-pair-close=\"${esc(p.close)}\" data-pair-key=\"${esc(p.label+'|'+p.open+'|'+p.close)}\"><code>${esc(p.label)}</code></button>`).join('');\n  box.querySelectorAll('.pair-tag').forEach(btn=>{\n    btn.addEventListener('mousedown',ev=>ev.preventDefault());\n    btn.addEventListener('click',()=>insertQuickPair(btn.dataset.pairOpen||'',btn.dataset.pairClose||''));\n    btn.addEventListener('dblclick',ev=>{\n      ev.preventDefault();\n      const set=dismissedPairs.get(key)||new Set(); set.add(btn.dataset.pairKey); dismissedPairs.set(key,set); btn.remove();\n    });\n  });\n}\nfunction insertMatchingPair(){const first=document.querySelector('#pairTags .pair-tag');if(first)first.click()}\nfunction openReplace(){if(visualMode)toggleVisualEditor();document.getElementById('replaceBar').classList.add('open');document.getElementById('replaceFind').focus();updateReplaceInfo()}\nfunction closeReplace(){document.getElementById('replaceBar').classList.remove('open')}\nfunction getEditableElements(){return [...document.querySelectorAll('.persona-editor,.world-editor')].filter(e=>e.isConnected)}\nfunction replaceCount(find){if(!find)return 0;let n=0;for(const el of getEditableElements()){let i=0;while((i=el.value.indexOf(find,i))!==-1){n++;i+=Math.max(1,find.length)}}return n}\nfunction updateReplaceInfo(){const find=document.getElementById('replaceFind')?.value||'';const info=document.getElementById('replaceInfo');if(info)info.textContent=find?`共 ${replaceCount(find)} 处`:''}\nfunction replaceOne(){const find=document.getElementById('replaceFind').value;if(!find)return;const withv=document.getElementById('replaceWith').value;const el=lastEditor?.isConnected?lastEditor:getEditableElements()[0];if(!el)return;const start=el.selectionStart??0;const idx=el.value.indexOf(find,start);const idx2=idx<0?el.value.indexOf(find):idx;if(idx2<0){toast('没有找到');return}el.focus();el.setRangeText(withv,idx2,idx2+find.length,'end');el.dispatchEvent(new Event('input',{bubbles:true}));lastEditor=el;lastSelectionStart=idx2+withv.length;lastSelectionEnd=lastSelectionStart;updateReplaceInfo()}\nfunction replaceAllText(){const find=document.getElementById('replaceFind').value;if(!find)return;const withv=document.getElementById('replaceWith').value;let total=0;for(const el of getEditableElements()){const n=(el.value.match(new RegExp(find.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'g'))||[]).length;if(n){el.value=el.value.split(find).join(withv);el.dispatchEvent(new Event('input',{bubbles:true}));total+=n}}toast(`已全部替换 ${total} 处`);updateReplaceInfo()}\n\nfunction foldCurrentCard(){\n  const ae=document.activeElement;\n  let el=ae?.closest?.('#promptList .card');\n  if(!el && lastEditor?.isConnected)el=lastEditor.closest?.('#promptList .card');\n  if(!el){toast('请先点一下要折叠的卡片');return}\n  const b=state.promptOrder[Number(el.dataset.i)];\n  if(b){b.collapsed=true;renderPrompt();}\n}\nfunction renderPrompt(){\n  const box=document.getElementById('promptList'),q=(document.getElementById('promptSearch')?.value||\"\").trim().toLowerCase();\n  const filtered=state.promptOrder.map((b,i)=>({b,i})).filter(({b})=>{\n    if(b.type!=='description')return false;\n    if(!q)return true;\n    if(b.type===\"description\")return (\"description 人设 \"+state.data.description).toLowerCase().includes(q);\n    const e=state.data.character_book.entries.find(x=>x.id===b.ref);\n    return e && (entryTitle(e)+\" \"+e.content).toLowerCase().includes(q)\n  });\n  if(!state.promptOrder.length){box.innerHTML='<div class=\"empty\">还没有 Prompt 内容。<br><br>点击「＋ 世界书」新增条目。</div>';return}\n  if(!filtered.length){box.innerHTML='<div class=\"empty\">没有找到匹配的卡片。</div>';return}\n  box.innerHTML=filtered.map(({b,i})=>{\n    if(b.type===\"description\"){\n      return `<div class=\"card ${b.collapsed?'collapsed':''}\" data-i=\"${i}\">\n        <div class=\"card-head\"><span class=\"drag\" draggable=\"true\">≡</span><span class=\"num\">${String(i+1).padStart(2,\"0\")}</span>\n        <span class=\"type\">PERSONA</span><span class=\"card-title\">Description</span>\n        <button class=\"iconbtn\" onclick=\"toggleBlock('${b.id}')\" title=\"折叠/展开\">${b.collapsed?'＋':'−'}</button></div>\n        <div class=\"card-body\"><div class=\"persona-wrap\"><div class=\"persona-highlight\">${highlightText(state.data.description,q)}</div><div class=\"visual-editor\" data-field=\"description\" contenteditable=\"true\" spellcheck=\"false\" hidden></div><textarea class=\"editor persona-editor\" data-history-key=\"description\" onfocus=\"beginEditSession(this);rememberEditor(this)\" onscroll=\"updateEditorHighlight(this)\" oninput=\"state.data.description=this.value;updateEditorHighlight(this);autoGrowTextarea(this);recordHistory()\">${esc(state.data.description)}</textarea></div></div>\n      </div>`\n    }\n    const e=state.data.character_book.entries.find(x=>x.id===b.ref);if(!e)return \"\";\n    return `<div class=\"card world-card ${b.collapsed?'collapsed':''}\" data-i=\"${i}\">\n      <div class=\"card-head\"><span class=\"drag\" draggable=\"true\">≡</span><span class=\"num\">${String(i+1).padStart(2,\"0\")}</span>\n      <input class=\"merge-check\" type=\"checkbox\" data-merge-id=\"${e.id}\" title=\"选择后可合并\"><span class=\"type\">WORLD BOOK</span><input class=\"world-title-input\" value=\"${esc(e.comment)}\" placeholder=\"世界书标题\" oninput=\"updateEntry('${e.id}','comment',this.value);syncTitle('${e.id}',this.value);recordHistory()\">\n      <span class=\"world-meta\">order ${e.insertion_order}</span><button class=\"iconbtn\" onclick=\"toggleBlock('${b.id}')\">${b.collapsed?'＋':'−'}</button>\n      <button class=\"iconbtn\" onclick=\"removeBlock('${b.id}')\">×</button></div>\n      <div class=\"card-body\">\n        <div class=\"world-wrap\"><div class=\"world-highlight\">${highlightText(e.content,q)}</div><textarea class=\"world-editor\" data-id=\"${e.id}\" data-history-key=\"world:${e.id}\" placeholder=\"世界书正文……\" onfocus=\"beginEditSession(this);rememberEditor(this)\" onscroll=\"updateWorldHighlight(this)\" oninput=\"updateEntryFromEditor(this);recordHistory()\">${esc(e.content)}</textarea></div>\n        \n      </div>\n    </div>`\n  }).join('');\n  attachDrag();refreshVisualEditors(); autoGrowAll(); document.querySelectorAll(\".persona-editor,.world-editor\").forEach(updateEditorHighlight); updateSearchCount(); bindSmartListEditing(); if(lastEditor?.isConnected)updatePairTag();\n}\nfunction getEditor(id){return document.querySelector('.world-editor[data-id=\"'+id+'\"]')}\nfunction syncTitle(id,v){document.querySelectorAll('#promptList .world-card').forEach(c=>{const b=state.promptOrder[Number(c.dataset.i)];if(b?.ref===id)c.querySelector('.world-title-input').value=v||''})}\nfunction attachDrag(){\n  document.querySelectorAll('#promptList .card').forEach(el=>{\n    const handle=el.querySelector('.drag'); if(!handle)return;\n    handle.draggable=true;\n    handle.addEventListener('dragstart',ev=>{el.classList.add('dragging');ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',el.dataset.i)});\n    handle.addEventListener('dragend',()=>el.classList.remove('dragging'));\n    el.addEventListener('dragover',ev=>{ev.preventDefault();el.classList.add('drop-target')});\n    el.addEventListener('dragleave',()=>el.classList.remove('drop-target'));\n    el.addEventListener('drop',ev=>{ev.preventDefault();el.classList.remove('drop-target');const from=Number(ev.dataTransfer.getData('text/plain')),to=Number(el.dataset.i);if(Number.isInteger(from)&&Number.isInteger(to)&&from!==to)moveBlock(from,to)});\n  });\n}\nfunction updateEntry(id,k,v){const e=state.data.character_book.entries.find(x=>x.id===id);if(!e)return;e[k]=v;if(k==='comment'){document.querySelectorAll('.entry[data-id=\\\"'+id+'\\\"] .entry-name').forEach(x=>x.textContent=v||'未命名世界书条目')}}\nfunction updateKeys(id,v){const e=state.data.character_book.entries.find(x=>x.id===id);if(e)e.keys=v.split(/[,，]/).map(x=>x.trim()).filter(Boolean);recordHistory()}\nfunction updateActivation(id,v){const e=state.data.character_book.entries.find(x=>x.id===id);if(!e)return;e.constant=v===\"constant\";e.activation=e.activation||{};e.activation.mode=v}\n\nfunction renderBook(keepOpen=true){\n  const list=document.getElementById('bookList'),es=state.data.character_book.entries;\n  document.getElementById('bookCount').textContent=es.length+\" entries\";\n  if(!es.length){list.innerHTML='';return}\n  const openIds=[...document.querySelectorAll('.entry.open')].map(x=>x.dataset.id);\n  const query=(document.getElementById('promptSearch')?.value||'').trim().toLowerCase();\n  list.innerHTML=es.filter(e=>!query||(`${e.comment} ${e.content}`).toLowerCase().includes(query)).map(e=>`\n    <div class=\"entry ${openIds.includes(e.id)&&keepOpen?'open':''}\" data-id=\"${e.id}\">\n      <div class=\"entry-head\"><span class=\"book-drag\" draggable=\"true\" title=\"拖动排序\" onclick=\"event.stopPropagation()\">≡</span>\n      <input class=\"merge-check\" type=\"checkbox\" data-merge-id=\"${e.id}\" title=\"选择合并\" onclick=\"event.stopPropagation()\" ><input class=\"entry-name-input\" aria-label=\"修改条目标题\" value=\"${esc(entryTitle(e))}\" onclick=\"event.stopPropagation()\" oninput=\"updateEntry('${e.id}','comment',this.value);recordHistory()\"><button class=\"iconbtn\" title=\"删除世界书条目\" onclick=\"event.stopPropagation();removeBookEntry('${e.id}')\">×</button><button type=\"button\" class=\"entry-fold\" title=\"展开或收起\" onclick=\"event.stopPropagation();toggleBookEntry(this)\">${openIds.includes(e.id)&&keepOpen?'−':'＋'}</button></div>\n      <div class=\"entry-body\">\n\n        <div class=\"kv\"><label>Primary Keys</label><input value=\"${esc(e.keys.join(', '))}\" oninput=\"updateKeys('${e.id}',this.value)\"></div>\n        <div class=\"kv\"><label>Content</label><div class=\"visual-editor\" data-field=\"world\" data-id=\"${e.id}\" contenteditable=\"true\" spellcheck=\"false\" hidden></div><textarea class=\"world-editor\" data-id=\"${e.id}\" oninput=\"updateEntry('${e.id}','content',this.value);autoGrowTextarea(this);recordHistory()\">${esc(e.content)}</textarea></div>\n\n      </div>\n    </div>`).join('');document.querySelectorAll('#bookList .world-editor').forEach(field=>{const item=es.find(e=>e.id===field.dataset.id);if(item)field.value=String(item.content||'')});attachBookDrag();refreshVisualEditors();bindSmartListEditing();requestAnimationFrame(growOpenBookEntries)\n}\nfunction attachBookDrag(){\n  document.querySelectorAll('#bookList .entry').forEach(el=>{\n    const h=el.querySelector('.book-drag');\n    h.addEventListener('dragstart',e=>{e.stopPropagation();e.dataTransfer.setData('text/plain',el.dataset.id);el.classList.add('dragging')});\n    h.addEventListener('dragend',()=>el.classList.remove('dragging'));\n    el.addEventListener('dragover',e=>e.preventDefault());\n    el.addEventListener('drop',e=>{e.preventDefault();moveBookEntry(e.dataTransfer.getData('text/plain'),el.dataset.id)});\n    let touch=null;\n    h.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touch={id:el.dataset.id,x:e.clientX,y:e.clientY,active:false,timer:setTimeout(()=>{if(touch){touch.active=true;h.setPointerCapture(e.pointerId);el.classList.add('dragging')}},450)}});\n    h.addEventListener('pointermove',e=>{if(!touch)return;if(!touch.active){if(Math.abs(e.clientX-touch.x)+Math.abs(e.clientY-touch.y)>12){clearTimeout(touch.timer);touch=null}return}e.preventDefault();const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('#bookList .entry');document.querySelectorAll('#bookList .entry').forEach(x=>x.classList.toggle('drop-target',x===target&&x!==el))});\n    h.addEventListener('pointerup',e=>{if(!touch)return;clearTimeout(touch.timer);if(touch.active){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('#bookList .entry');el.classList.remove('dragging');document.querySelectorAll('#bookList .entry').forEach(x=>x.classList.remove('drop-target'));if(target)moveBookEntry(touch.id,target.dataset.id)}touch=null});\n    h.addEventListener('pointercancel',()=>{if(touch)clearTimeout(touch.timer);touch=null;el.classList.remove('dragging')});\n  })\n}\nfunction removeBookEntry(id){\n  const scroller=document.getElementById('promptScroll');\n  const previous=scroller.scrollTop;\n  const anchor=[...document.querySelectorAll('#bookList .entry')].find(el=>el.dataset.id!==id && el.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top);\n  const anchorId=anchor?.dataset.id, anchorTop=anchor?.getBoundingClientRect().top;\n  const index=state.promptOrder.findIndex(b=>b.type==='world'&&b.ref===id);\n  if(index<0)return;\n  state.promptOrder.splice(index,1);\n  state.data.character_book.entries=state.data.character_book.entries.filter(e=>e.id!==id);\n  recordHistory();renderBook();\n  scroller.scrollTop=previous;\n  requestAnimationFrame(()=>{\n    const next=anchorId&&[...document.querySelectorAll('#bookList .entry')].find(el=>el.dataset.id===anchorId);\n    if(next)scroller.scrollTop+=next.getBoundingClientRect().top-anchorTop;\n  });\n}\nfunction moveBookEntry(from,to){if(from===to)return;const entries=state.data.character_book.entries;const a=entries.findIndex(x=>x.id===from),b=entries.findIndex(x=>x.id===to);if(a<0||b<0)return;entries.splice(b,0,entries.splice(a,1)[0]);state.promptOrder=[...state.promptOrder.filter(x=>x.type==='description'),...entries.map(e=>state.promptOrder.find(x=>x.type==='world'&&x.ref===e.id)||{id:uid(),type:'world',ref:e.id,collapsed:false})];recordHistory();renderBook();}\n\nfunction addGreeting(){\n  if(!state.data.first_mes){state.data.first_mes=''}\n  else {if(!Array.isArray(state.data.alternate_greetings))state.data.alternate_greetings=[];state.data.alternate_greetings.push('')}\n  recordHistory();renderGreetings();\n  setTimeout(()=>{const x=document.querySelectorAll('.greeting textarea');x[x.length-1]?.focus()},0)\n}\nfunction removeGreeting(i){\n  if(i===0)state.data.first_mes='';\n  else state.data.alternate_greetings.splice(i-1,1);\n  recordHistory();renderGreetings();\n}\nfunction renderGreetings(){\n  const list=document.getElementById('greetingList'),gs=[state.data.first_mes||'',...(state.data.alternate_greetings||[])];\n  document.getElementById('greetingCount').textContent=(gs[0]?gs.length:gs.length-1)+' 个';\n  list.innerHTML=gs.map((g,i)=>`<div class=\"greeting collapsed\" data-greeting=\"${i}\">\n    <div class=\"greeting-head\" onclick=\"this.parentElement.classList.toggle('collapsed')\"><span>OPENING ${i+1}</span><strong>${i===0?'主开场白':'备用开场白 '+i}</strong><span class=\"fold-label\">点击展开</span>${i===0?'':`<button class=\"iconbtn\" onclick=\"event.stopPropagation();removeGreeting(${i})\">×</button>`}</div>\n    <div class=\"greeting-body\"><textarea oninput=\"${i===0?'state.data.first_mes=this.value':`state.data.alternate_greetings[${i-1}]=this.value`};recordHistory()\">${esc(g)}</textarea></div>\n  </div>`).join('');\n}\n\nconst COLLECTION_KEY='mianmian_character_collection_v3';\nconst COLLECTION_KEY_OLD='mianmian_character_collection_v2';\nlet collection=[];\nlet collectionDragMode=false;\nlet collectionSelectMode=false;\nlet collectionSelected=new Set();\nlet collectionActiveTag='';\nlet collectionActiveFolder='';\nlet collectionTagColors={};\nlet collectionFolders=[];\nfunction loadCollection(){collection=[];collectionFolders=[];collectionTagColors={}}\nfunction saveCollection(){if(window.parent!==window)window.parent.postMessage({source:'mianmian-editor',action:'collectionChanged',collection:{items:collection,folders:collectionFolders,tagColors:collectionTagColors}},'*')}\nfunction randomTagColor(){const colors=['#F3B6B6','#F3C78E','#E7D38E','#BFD7B5','#AFCFE8','#C8B9E8','#D9B4D8','#B8D8D8','#D8C2A8','#C7CED6'];return colors[Math.floor(Math.random()*colors.length)]}\nfunction ensureTagColor(tag){if(tag&&!collectionTagColors[tag])collectionTagColors[tag]=randomTagColor();return collectionTagColors[tag]||'#c7ced6'}\nfunction collectionItemFromState(){return {id:uid(),name:state.data.name||'未命名角色',avatarData:state.avatarData||'',card:cardRaw(),tags:[...(state.collectionMeta?.tags||[])],folder:state.collectionMeta?.folder||''}}\nfunction saveCurrentToCollection(){loadCollection();const item=collectionItemFromState();const same=collection.findIndex(x=>x.name===item.name);if(same>=0){item.id=collection[same].id;item.tags=[...(state.collectionMeta?.tags||collection[same].tags||[])];item.folder=(state.collectionMeta?.folder ?? collection[same].folder ?? '')}if(same>=0)collection[same]=item;else collection.push(item);state.collectionMeta={tags:[...(item.tags||[])],folder:item.folder||''};saveCollection();renderCollection();renderCurrentTags();toast('已保存到合集')}\nfunction openCollection(){const pane=document.querySelector('.collection-pane');if(!pane)return;if(window.matchMedia('(max-width:900px)').matches){showMobilePane('collection');return}pane.classList.add('collection-modal-open');renderCollection()}\nfunction closeCollection(){document.querySelector('.collection-pane')?.classList.remove('collection-modal-open')}\nfunction toggleCollectionDrag(){if(collectionSelectMode)toggleSelectMode();collectionDragMode=!collectionDragMode;if(!collectionDragMode)saveCollection();const pane=document.querySelector('.collection-pane');pane?.classList.toggle('drag-mode',collectionDragMode);const btn=document.getElementById('collectionDragBtn');if(btn)btn.textContent=collectionDragMode?'完成调整':'调整位置';renderCollection()}\nfunction toggleSelectMode(){if(collectionDragMode)toggleCollectionDrag();collectionSelectMode=!collectionSelectMode;if(!collectionSelectMode)collectionSelected.clear();document.querySelector('.collection-pane')?.classList.toggle('select-mode',collectionSelectMode);const btn=document.getElementById('collectionSelectBtn');if(btn)btn.textContent=collectionSelectMode?'完成归类':'多选归类';renderCollection()}\nfunction toggleCollectionSelection(i){if(collectionSelected.has(i))collectionSelected.delete(i);else collectionSelected.add(i);renderCollection()}\nfunction clearSelection(){collectionSelected.clear();renderCollection()}\nfunction createFolder(){const box=document.getElementById('folderCreateBox');if(!box)return;box.style.display=box.style.display==='none'?'flex':'none';if(box.style.display!=='none'){const input=document.getElementById('newFolderName');input.value='';input.focus()}}\nfunction confirmCreateFolder(){const input=document.getElementById('newFolderName');const name=(input?.value||'').trim();if(!name){toast('请输入文件夹名称');return}if(collectionFolders.includes(name)||collection.some(x=>(x.folder||'')===name)){toast('这个文件夹已经存在');return}collectionFolders.push(name);const selected=[...collectionSelected];if(selected.length){selected.forEach(i=>{if(collection[i])collection[i].folder=name});collectionSelected.clear();toast(`已将 ${selected.length} 个角色归入「${name}」`)}else toast(`已创建文件夹「${name}」`);saveCollection();const box=document.getElementById('folderCreateBox');if(box)box.style.display='none';renderCollection()}\nfunction applySelectedFolder(){const select=document.getElementById('bulkFolderSelect');const folder=select?.value||'';const selected=[...collectionSelected];if(!folder){toast('请选择文件夹');return}if(!selected.length){toast('请先选择角色');return}selected.forEach(i=>{if(collection[i])collection[i].folder=folder});collectionSelected.clear();saveCollection();renderCollection();toast(`已归类 ${selected.length} 个角色`)}\nfunction deleteSelectedFolder(){const select=document.getElementById('collectionFolderFilter');const folder=select?.value||'';if(!folder){toast('请先在文件夹筛选中选择要删除的文件夹');return}showConfirm('删除文件夹',`确定删除文件夹「${folder}」吗？\\n\\n文件夹中的角色不会被删除，只会变成「未分类」。`,()=>{collectionFolders=collectionFolders.filter(f=>f!==folder);collection.forEach(x=>{if((x.folder||'')===folder)x.folder=''});if(select)select.value='';if(document.getElementById('bulkFolderSelect'))document.getElementById('bulkFolderSelect').value='';saveCollection();renderCollection();toast(`已删除文件夹「${folder}」`)})}\nfunction collectionTags(){return [...new Set(collection.flatMap(x=>x.tags||[]).filter(Boolean))]}\nfunction setCollectionTag(tag){collectionActiveTag=tag||'';renderCollection()}\nfunction addTagToCollectionItem(i,tag){if(!collection[i])return;tag=String(tag||'').trim();if(!tag)return;if(!(collection[i].tags||[]).includes(tag))collection[i].tags=[...(collection[i].tags||[]),tag];ensureTagColor(tag);saveCollection();renderCollection()}\nfunction removeTagFromCollectionItem(i,tag){if(!collection[i])return;collection[i].tags=(collection[i].tags||[]).filter(t=>t!==tag);saveCollection();renderCollection()}\nfunction changeTagColor(tag,color){if(!tag)return;collectionTagColors[tag]=color||randomTagColor();saveCollection();renderCollection()}\nfunction updateCollectionFolder(i,value){if(!collection[i])return;collection[i].folder=String(value||'').trim();saveCollection();renderCollection()}\nfunction ensureCurrentTagState(){if(!state.collectionMeta)state.collectionMeta={tags:[],folder:\"\"};if(!Array.isArray(state.collectionMeta.tags))state.collectionMeta.tags=[]}\nfunction renderCurrentTags(){\n  ensureCurrentTagState();\n  const box=document.getElementById('currentTags'); if(!box)return;\n  box.innerHTML=state.collectionMeta.tags.map(t=>`<span class=\"current-tag-chip\" style=\"${/^@/.test(t)?'background:#f7b5b5;color:#6e1111':t.toUpperCase()==='NSFW'?'background:#ffe184;color:#513800':''}\"><button type=\"button\" class=\"tag-dot\" style=\"background:${esc(ensureTagColor(t))}\" title=\"修改颜色\" onclick=\"changeCurrentTagColor('${esc(t)}')\"></button><span>${esc(t)}</span><button type=\"button\" class=\"tag-remove\" title=\"删除 Tag\" onclick=\"removeCurrentTag('${esc(t)}')\">×</button></span>`).join('');\n}\n    function mmParseTags(value) {\n        const values=Array.isArray(value)?value:[value];\n        return [...new Set(values.flatMap(x=>String(x||'').split(/[、,，\\r\\n]+/)).map(x=>x.trim()\n            .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g,'').trim()\n            .replace(/^[-*•]\\s*/, '').trim().replace(/\\s+/g,' ')).filter(Boolean))];\n    }\nfunction addCurrentTags(text){ensureCurrentTagState();for(const tag of mmParseTags(text)){if(!state.collectionMeta.tags.includes(tag))state.collectionMeta.tags.push(tag);ensureTagColor(tag)}document.getElementById('currentTagInput').value='';renderCurrentTags();recordHistory();}\nfunction handleCurrentTagKeydown(ev){if(ev.key==='Enter'){ev.preventDefault();addCurrentTags(ev.currentTarget.value)}}\ndocument.getElementById('currentTagInput').addEventListener('paste',ev=>{const text=ev.clipboardData?.getData('text/plain');if(text&&/[、,，\\r\\n]/.test(text)){ev.preventDefault();addCurrentTags(text)}});\nfunction removeCurrentTag(tag){ensureCurrentTagState();state.collectionMeta.tags=state.collectionMeta.tags.filter(t=>t!==tag);renderCurrentTags();recordHistory()}\nfunction changeCurrentTagColor(tag){const color=prompt('输入颜色，例如 #8B7E74',ensureTagColor(tag));if(color&&/^#[0-9a-fA-F]{6}$/.test(color)){collectionTagColors[tag]=color;saveCollection();renderCurrentTags();recordHistory()}}\n\nfunction renderCollection(){\n  const box=document.getElementById('collectionList');if(!box)return;loadCollection();\n  const search=(document.getElementById('collectionSearch')?.value||'').trim().toLowerCase();\n  const folder=collectionActiveFolder||'';\n  const folders=[...new Set([...collectionFolders,...collection.map(x=>x.folder||'')].filter(Boolean))];\n  // 文件夹是第一层筛选；未选择文件夹 = 全部角色。\n  // Tag 是第二层筛选，只显示当前文件夹中实际存在的 Tag；不再提供“全部”按钮，未选择 Tag 就表示全部。\n  const folderItems=folder?collection.filter(x=>x.folder===folder):collection;\n  const tags=[...new Set(folderItems.flatMap(x=>x.tags||[]).filter(Boolean))];\n  if(collectionActiveTag && !tags.includes(collectionActiveTag)) collectionActiveTag='';\n  const tagBox=document.getElementById('collectionTags');\n  if(tagBox){\n    tagBox.innerHTML=tags.map(t=>`<button class=\"collection-filter-tag ${collectionActiveTag===t?'active':''}\" data-collection-tag=\"${esc(t)}\"><span class=\"collection-tag-filter-dot\" style=\"background:${esc(ensureTagColor(t))}\"></span>${esc(t)}</button>`).join('');\n    tagBox.querySelectorAll('[data-collection-tag]').forEach(btn=>btn.addEventListener('click',()=>setCollectionTag(btn.dataset.collectionTag||'')));\n  }\n  const folderTabs=document.getElementById('collectionFolderTabs');\n  if(folderTabs){\n    folderTabs.innerHTML='<button class=\"collection-folder-tab '+(!folder?'active':'')+'\" data-folder=\"\">全部</button>'+folders.map(f=>`<button class=\"collection-folder-tab ${folder===f?'active':''}\" data-folder=\"${esc(f)}\">${esc(f)}</button>`).join('')+(folder?'<button class=\"collection-folder-delete\" onclick=\"deleteSelectedFolder()\" title=\"删除当前文件夹\">×</button>':'');\n    folderTabs.querySelectorAll('[data-folder]').forEach(btn=>btn.addEventListener('click',()=>{collectionActiveFolder=btn.dataset.folder||'';collectionActiveTag='';renderCollection()}));\n  }\n\n  const bulk=document.getElementById('bulkFolderSelect');if(bulk){bulk.innerHTML='<option value=\"\">选择文件夹</option>'+folders.map(f=>`<option value=\"${esc(f)}\">${esc(f)}</option>`).join('')}\n  const items=collection.map((x,i)=>({x,i})).filter(({x})=>{const hay=((x.name||'')+' '+(x.tags||[]).join(' ')+' '+(x.folder||'')).toLowerCase();return (!search||hay.includes(search))&&(!folder||x.folder===folder)&&(!collectionActiveTag||(x.tags||[]).includes(collectionActiveTag))});\n  if(!items.length){box.innerHTML='<div class=\"collection-empty\">还没有符合条件的角色。<br><br>在当前角色完成后，点击「保存」。</div>';return}\n  box.innerHTML=items.map(({x,i})=>{\n    const selected=collectionSelected.has(i);\n    const tagsHtml=(x.tags||[]).map(t=>`<span class=\"collection-tag-chip\" title=\"点击 Tag 筛选，点击色点修改颜色\"><button type=\"button\" class=\"tag-dot\" style=\"background:${esc(ensureTagColor(t))}\" onclick=\"event.stopPropagation();document.getElementById('tagColor-${i}-${encodeURIComponent(t)}').click()\"></button><input id=\"tagColor-${i}-${encodeURIComponent(t)}\" class=\"tag-color-input\" type=\"color\" value=\"${esc(ensureTagColor(t))}\" onchange=\"changeTagColor('${esc(t)}',this.value)\" onclick=\"event.stopPropagation()\"><button type=\"button\" class=\"tag-text\" onclick=\"event.stopPropagation();setCollectionTag('${esc(t)}')\">${esc(t)}</button><button type=\"button\" class=\"tag-remove\" onclick=\"event.stopPropagation();removeTagFromCollectionItem(${i},'${esc(t)}')\">×</button></span>`).join('');\n    return `<div class=\"collection-card ${selected?'selected':''}\" data-index=\"${i}\" draggable=\"${collectionDragMode}\" onclick=\"handleCollectionClick(this,${i})\"><input class=\"collection-select-box\" type=\"checkbox\" ${selected?'checked':''} onclick=\"event.stopPropagation();toggleCollectionSelection(${i})\"><span class=\"collection-drag-handle\">≡</span>${x.avatarData?`<img class=\"collection-avatar\" src=\"${x.avatarData}\">`:'<div class=\"collection-avatar empty\">＋</div>'}<div class=\"collection-info\"><div class=\"collection-name\">${esc(x.name||'未命名角色')}</div><div class=\"collection-meta-folder\">${esc(x.folder||'未分类')}</div><div class=\"collection-tag-editor\">${tagsHtml}<input class=\"collection-tag-input\" placeholder=\"添加 Tag\" onkeydown=\"if(event.key==='Enter'){event.preventDefault();addTagToCollectionItem(${i},this.value);this.value=''}\" onclick=\"event.stopPropagation()\"></div></div><button class=\"iconbtn\" onclick=\"event.stopPropagation();removeCollectionItem(${i})\" title=\"删除\">×</button></div>`\n  }).join('');\n  attachCollectionLongPress();attachCollectionDrag();\n}\nfunction handleCollectionClick(el,i){if(collectionDragMode)return;if(collectionSelectMode){toggleCollectionSelection(i);return}openCollectionItem(i)}\nfunction attachCollectionLongPress(){/* 合集不再通过长按编辑文件夹/Tag，统一使用选择归类与卡片内 Tag 输入 */}\nfunction attachCollectionDrag(){if(!collectionDragMode)return;document.querySelectorAll('.collection-card[draggable=true]').forEach(el=>{el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.index);el.classList.add('collection-dragging')});el.addEventListener('dragend',()=>el.classList.remove('collection-dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain')),to=Number(el.dataset.index);if(from===to)return;const [item]=collection.splice(from,1);collection.splice(to,0,item);saveCollection();renderCollection()})})}\n\nfunction openCollectionItem(i){const x=collection[i];if(!x?.card)return;parseCard(x.card);state.avatarData=x.avatarData||'';state.collectionMeta={tags:[...(x.tags||[])],folder:x.folder||''};historyStack=[snapshot()];redoStack=[];renderAll();saveLocal(true);showMobilePane('prompt');toast('已打开：'+(x.name||'未命名角色'))}\nfunction removeCollectionItem(i){showConfirm('删除合集角色','只会删除合集里的这一份保存，不会删除当前正在编辑的角色。\\n\\n确定删除吗？',()=>{collection.splice(i,1);saveCollection();renderCollection()})}\n\nfunction showMobilePane(which){\n  const panes=[...document.querySelectorAll('.main > .pane')];\n  panes.forEach(p=>p.classList.add('mobile-hidden'));\n  const map={prompt:panes[0],card:panes[1],collection:panes[2]};\n  map[which]?.classList.remove('mobile-hidden');\n  ['Prompt','Card','Collection'].forEach(k=>{const b=document.getElementById('tab'+k);if(b)b.classList.toggle('active',k.toLowerCase()===which)});\n}\n\n\nfunction togglePromptFocus(){\n  const main=document.querySelector('.main');\n  if(!main)return;\n  const active=main.classList.toggle('prompt-focus');\n  const btn=document.getElementById('promptFocusBtn');\n  if(btn)btn.textContent=active?'退出展开':'展开编辑';\n  if(active) showMobilePane('prompt');\n  else document.querySelectorAll('.main > .pane').forEach(p=>p.classList.remove('mobile-hidden'));\n}\nfunction exportCollection(){\n  loadCollection();\n  const payload={format:'mianmian_collection',version:2,characters:structuredClone(collection),folders:structuredClone(collectionFolders),tagColors:structuredClone(collectionTagColors)};\n  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'面面-角色合集.json');\n  toast('合集已导出');\n}\nfunction importCollection(ev){\n  const f=ev.target.files?.[0]; ev.target.value=''; if(!f)return;\n  const r=new FileReader();\n  r.onload=()=>{try{\n    const payload=JSON.parse(r.result);\n    if(payload?.format!=='mianmian_collection'||!Array.isArray(payload.characters))throw new Error('这不是面面导出的合集文件');\n    const next=payload.characters.map(x=>({...x,id:x.id||uid(),tags:Array.isArray(x.tags)?x.tags:[],folder:x.folder||''}));const nextFolders=Array.isArray(payload.folders)?payload.folders:[];const nextColors=payload.tagColors&&typeof payload.tagColors==='object'?payload.tagColors:{};\n    showConfirm('导入角色合集','导入会替换当前「面面」里的整个合集，不会影响当前正在编辑的角色卡。\\n\\n确定导入吗？',()=>{collection=next;collectionFolders=nextFolders;collectionTagColors=nextColors;collection.forEach(x=>(x.tags||[]).forEach(t=>ensureTagColor(t)));collectionActiveTag='';collectionActiveFolder='';saveCollection();renderCollection();toast('合集已导入')});\n  }catch(e){alert('合集导入失败：'+e.message)}};\n  r.readAsText(f);\nrenderCurrentTags();\n}\nfunction renderAll(){\n  const otherWasOpen=document.querySelector('.other-section')?.open||false;\n  renderName();\n  document.getElementById('bookName').value=state.data.character_book.name||'';\n  document.getElementById('personality').value=state.data.personality||\"\";\n  document.getElementById('scenario').value=state.data.scenario||\"\";\n  document.getElementById('creatorNotes').value=state.data.creator_notes||\"\";\n  document.getElementById('mesExample').value=state.data.mes_example||\"\";\n  renderPrompt();renderGreetings();renderBook(true);refreshVisualEditors();watchEditorWidth();\n  const mainDescription=document.querySelector('#promptList textarea[data-history-key=\"description\"]');\n  if(mainDescription)mainDescription.value=String(state.data.description||'');\n  const box=document.getElementById('avatarBox');\n  if(state.avatarData)box.outerHTML=`<img id=\"avatarBox\" class=\"avatar\" role=\"button\" tabindex=\"0\" title=\"更换头像\" src=\"${state.avatarData}\">`;\n  else box.outerHTML='<div id=\"avatarBox\" class=\"avatar avatar-empty\" role=\"button\" tabindex=\"0\" title=\"更换头像\">＋</div>';\n  renderCurrentTags();\n  document.querySelector('.other-section').open=otherWasOpen;\n}\nfunction loadAvatar(ev){const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{state.avatarData=r.result;recordHistory();renderAll()};r.readAsDataURL(f)}\nfunction parseCard(raw){\n  let root=raw;if(root?.data)root=root.data;\n  if(root?.data?.data)root=root.data;\n  const d={...state.data,...(root.data||root)};\n  const book={...state.data.character_book,...(d.character_book||{})};\n  book.entries=(book.entries||[]).map(normalizeEntry);\n  d.character_book=book;d.alternate_greetings=Array.isArray(d.alternate_greetings)?d.alternate_greetings:[];\n  state.data=d;state.promptOrder=[];\n  state.promptOrder.push({id:uid(),type:\"description\",ref:null,collapsed:false});\n  book.entries.forEach(e=>state.promptOrder.push({id:uid(),type:\"world\",ref:e.id,collapsed:false}));\n}\nfunction loadFile(ev){const f=ev.target.files[0];if(!f)return;if(f.type==='image/png'||/\\.png$/i.test(f.name)){loadTavernPNG(f);return}const r=new FileReader();r.onload=()=>{try{parseCard(JSON.parse(r.result));recordHistory();renderAll();toast(\"JSON 已导入\")}catch(e){alert(\"JSON 解析失败：\"+e.message)}};r.readAsText(f)}\nfunction decodeBase64UTF8(str){const bin=atob(str.trim());const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder('utf-8').decode(bytes)}\nfunction loadTavernPNG(file){const r=new FileReader();r.onload=()=>{try{const bytes=new Uint8Array(r.result);const json=extractPNGCharacterJSON(bytes);if(!json)throw new Error('PNG 中没有找到角色卡 JSON（需要是酒馆角色卡 PNG）');parseCard(json);state.avatarData=r.result;recordHistory();renderAll();toast('酒馆 PNG 角色卡已导入')}catch(e){alert('PNG 导入失败：'+e.message)}};r.readAsArrayBuffer(file)}\nfunction extractPNGCharacterJSON(bytes){\n  const sig=[137,80,78,71,13,10,26,10];\n  for(let i=0;i<8;i++) if(bytes[i]!==sig[i]) throw new Error('不是有效 PNG');\n  let p=8;\n  while(p+8<=bytes.length){\n    const len=new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0);\n    const type=String.fromCharCode(...bytes.slice(p+4,p+8));\n    const data=bytes.slice(p+8,p+8+len);\n    if(type==='tEXt'){\n      const zero=data.indexOf(0);\n      if(zero>0){\n        const key=new TextDecoder('latin1').decode(data.slice(0,zero));\n        const val=new TextDecoder('latin1').decode(data.slice(zero+1));\n        if(key==='chara'){\n          try{return JSON.parse(decodeBase64UTF8(val))}catch(e){}\n        }\n      }\n    }\n    if(type==='iTXt'){\n      const zero=data.indexOf(0);\n      if(zero>0){\n        const key=new TextDecoder('utf-8').decode(data.slice(0,zero));\n        let o=zero+1;\n        if(key==='chara' && o+2<data.length){\n          const compressionFlag=data[o];\n          o+=2; // compression flag + compression method\n          for(let n=0;n<2;n++){const z=data.indexOf(0,o);if(z<0){o=data.length;break}o=z+1}\n          if(compressionFlag===0){\n            const text=new TextDecoder('utf-8').decode(data.slice(o));\n            try{return JSON.parse(text)}catch(e){\n              try{return JSON.parse(decodeBase64UTF8(text))}catch(e2){}\n            }\n          }\n        }\n      }\n    }\n    p+=12+len;\n    if(type==='IEND') break;\n  }\n  return null;\n}\nfunction importDialog(){document.getElementById('jsonInput').value=\"\";document.getElementById('modal').style.display=\"flex\"}\nfunction closeModal(){document.getElementById('modal').style.display=\"none\"}\nfunction applyJSON(){try{parseCard(JSON.parse(document.getElementById('jsonInput').value));recordHistory();renderAll();closeModal();toast(\"JSON 已导入\")}catch(e){alert(\"JSON 解析失败：\"+e.message)}}\nfunction cardRaw(){ const d=structuredClone(state.data); d._mmUserTags=[...(state.collectionMeta?.tags||[])]; return {spec:\"chara_card_v2\",spec_version:\"2.0\",data:d}; }\nfunction downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}\nfunction openExportDialog(){document.getElementById('exportModal').style.display='flex'}\nfunction closeExportDialog(){document.getElementById('exportModal').style.display='none'}\nfunction exportTXT(){\n  const parts=[];\n  for(const b of state.promptOrder){\n    if(b.type==='description') parts.push(state.data.description||'');\n    else if(b.type==='world'){\n      const e=state.data.character_book.entries.find(x=>x.id===b.ref);\n      if(e) parts.push(e.content||'');\n    }\n  }\n  const text=parts.filter(x=>x!==undefined).join('\\n\\n');\n  downloadBlob(new Blob([text],{type:'text/plain;charset=utf-8'}),(state.data.name||'character_card')+'.txt');\n  toast('已导出 TXT');\n}\nfunction exportJSON(){ const raw=cardRaw(),name=(raw.data.name||\"character_card\")+\".json\"; downloadBlob(new Blob([JSON.stringify(raw,null,2)],{type:\"application/json\"}),name); toast(\"已导出 JSON\"); }\nfunction b64utf8(str){const bytes=new TextEncoder().encode(str);let bin=\"\";for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin)}\nfunction crc32(bytes){let table=crc32.table;if(!table){table=crc32.table=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0}}let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}\nfunction pngChunk(type,data){const te=new TextEncoder();const tb=te.encode(type),out=new Uint8Array(12+data.length),dv=new DataView(out.buffer);dv.setUint32(0,data.length);out.set(tb,4);out.set(data,8);dv.setUint32(8+data.length,crc32(new Uint8Array([...tb,...data])));return out}\nfunction injectCharaPNG(bytes,json){const sig=bytes.slice(0,8),chunks=[];let p=8;while(p+8<=bytes.length){const len=new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0),type=new TextDecoder(\"latin1\").decode(bytes.slice(p+4,p+8)),data=bytes.slice(p+8,p+8+len);if(type!==\"tEXt\" || new TextDecoder(\"latin1\").decode(data.slice(0,Math.max(0,data.indexOf(0))))!==\"chara\")chunks.push(bytes.slice(p,p+12+len));p+=12+len;if(type===\"IEND\")break;}const val=new TextEncoder().encode(\"chara\\0\"+b64utf8(JSON.stringify(json)));const meta=pngChunk(\"tEXt\",val);let total=sig.length+meta.length+chunks.reduce((n,c)=>n+c.length,0),out=new Uint8Array(total);let o=0;out.set(sig,o);o+=8;out.set(meta,o);o+=meta.length;for(const c of chunks){out.set(c,o);o+=c.length}return out}\nfunction dataURLBytes(dataURL){const b=dataURL.split(\",\")[1];const bin=atob(b);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}\nfunction exportPNG(){const json=cardRaw(); if(state.avatarData && /^data:image\\/png;base64,/i.test(state.avatarData)){const out=injectCharaPNG(dataURLBytes(state.avatarData),json);downloadBlob(new Blob([out],{type:\"image/png\"}),(json.data.name||\"character_card\")+\".png\");toast(\"已导出酒馆 PNG\");return;}\n  const canvas=document.createElement(\"canvas\");canvas.width=512;canvas.height=512;const ctx=canvas.getContext(\"2d\");ctx.fillStyle=\"#f1efec\";ctx.fillRect(0,0,512,512);const finish=()=>{const bytes=dataURLBytes(canvas.toDataURL(\"image/png\"));const out=injectCharaPNG(bytes,json);downloadBlob(new Blob([out],{type:\"image/png\"}),(json.data.name||\"character_card\")+\".png\");toast(\"已导出酒馆 PNG\")};\n  if(state.avatarData){const img=new Image();img.onload=()=>{const r=Math.max(512/img.width,512/img.height),w=img.width*r,h=img.height*r;ctx.drawImage(img,(512-w)/2,(512-h)/2,w,h);finish()};img.src=state.avatarData;}else finish();}\nlet visualMode=false,activeVisualEditor=null,copiedFormat='p';\nconst visualBlockPrefix={p:'',h1:'# ',h2:'## ',h3:'### ',bullet:'- ',number:'1. ',quote:'> '};\nfunction editorDataValue(el){return el.dataset.field==='description'?state.data.description:(state.data.character_book.entries.find(e=>e.id===el.dataset.id)?.content||'')}\nfunction setEditorDataValue(el,value){if(el.dataset.field==='description')state.data.description=value;else {const e=state.data.character_book.entries.find(x=>x.id===el.dataset.id);if(e)e.content=value}}\nfunction escapeHTML(s){return esc(s)}\nfunction inlineToHTML(s){return escapeHTML(s).replace(/\\*\\*([^*\\n]+)\\*\\*/g,'<strong>$1</strong>').replace(/(^|[^*])\\*([^*\\n]+)\\*/g,'$1<em>$2</em>').replace(/`([^`\\n]+)`/g,'<code>$1</code>')}\nfunction lineInfo(line){let m;if((m=/^(#{1,3})\\s+(.*)$/.exec(line)))return {kind:'h'+m[1].length,text:m[2]};if((m=/^[-*]\\s+(.*)$/.exec(line)))return {kind:'bullet',text:m[1]};if((m=/^\\d+\\.\\s+(.*)$/.exec(line)))return {kind:'number',text:m[1]};if((m=/^>\\s?(.*)$/.exec(line)))return {kind:'quote',text:m[1]};return {kind:'p',text:line}}\nfunction renderVisualEditor(el){el.innerHTML=editorDataValue(el).split('\\n').map(line=>{const b=lineInfo(line);return `<div class=\"visual-line ${b.kind}\" data-kind=\"${b.kind}\">${inlineToHTML(b.text)||'<br>'}</div>`}).join('')}\nfunction refreshVisualEditors(){document.querySelectorAll('.visual-editor').forEach(el=>{if(!visualMode){el.hidden=true;el.nextElementSibling.hidden=false;const highlight=el.previousElementSibling;if(highlight?.classList.contains('persona-highlight'))highlight.hidden=false;return}el.hidden=false;el.nextElementSibling.hidden=true;const highlight=el.previousElementSibling;if(highlight?.classList.contains('persona-highlight'))highlight.hidden=true;renderVisualEditor(el);bindVisualEditor(el)})}\nfunction richText(node){if(node.nodeType===3)return node.nodeValue;if(node.nodeName==='BR')return '';const text=[...node.childNodes].map(richText).join('');if(node.nodeName==='STRONG'||node.nodeName==='B')return '**'+text+'**';if(node.nodeName==='EM'||node.nodeName==='I')return '*'+text+'*';if(node.nodeName==='CODE')return '`'+text+'`';return text}\nfunction visualToMarkdown(el){const nodes=[...el.childNodes];return nodes.map(node=>{if(node.nodeType===3)return node.nodeValue;const kind=node.dataset?.kind||'p',prefix=visualBlockPrefix[kind]??'';const content=[...node.childNodes].map(richText).join('');return content?prefix+content:''}).join('\\n')}\nfunction syncVisualEditor(el){const value=visualToMarkdown(el);setEditorDataValue(el,value);const textarea=el.nextElementSibling;textarea.value=value;recordHistory()}\nfunction bindVisualEditor(el){if(el.dataset.visualBound)return;el.dataset.visualBound='1';el.addEventListener('focus',()=>activeVisualEditor=el);el.addEventListener('pointerup',()=>activeVisualEditor=el);el.addEventListener('keyup',()=>activeVisualEditor=el);el.addEventListener('input',()=>syncVisualEditor(el));el.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});el.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.execCommand('insertParagraph');setTimeout(()=>syncVisualEditor(el),0)}})}\nfunction toggleVisualEditor(){if(visualMode&&activeVisualEditor?.isConnected)syncVisualEditor(activeVisualEditor);visualMode=!visualMode;document.getElementById('visualToggle').textContent=visualMode?'纯文本编辑':'可视编辑';document.getElementById('visualToggle').classList.toggle('active',visualMode);refreshVisualEditors();toast(visualMode?'正在可视编辑；保存时写入 Markdown 文本':'正在编辑实际文本')}\nfunction currentRawEditor(){return lastEditor?.isConnected?lastEditor:(document.activeElement?.matches?.('.persona-editor,.world-editor')?document.activeElement:document.querySelector('.persona-editor'))}\nfunction editSelectedRawLines(el,kind){const start=el.selectionStart,end=el.selectionEnd,text=el.value;const begin=text.lastIndexOf('\\n',start-1)+1;let finish=text.indexOf('\\n',end);if(finish<0)finish=text.length;const lines=text.slice(begin,finish).split('\\n');const next=lines.map((line,i)=>{const old=lineInfo(line);return old.text?(kind==='p'?'':kind==='number'?`${i+1}. `:visualBlockPrefix[kind])+old.text:''}).join('\\n');el.focus();el.setRangeText(next,begin,finish,'select');el.dispatchEvent(new Event('input',{bubbles:true}));rememberEditor(el)}\nfunction selectedVisualLines(el){const sel=getSelection();if(!sel.rangeCount)return [];const range=sel.getRangeAt(0);return [...el.querySelectorAll('.visual-line')].filter(line=>range.intersectsNode(line))}\nfunction applyBlockStyle(kind){if(!visualMode){const el=currentRawEditor();if(el)editSelectedRawLines(el,kind);return}const el=activeVisualEditor;if(!el?.isConnected)return;const lines=selectedVisualLines(el);if(!lines.length)return;lines.forEach(line=>{line.dataset.kind=kind;line.className='visual-line '+kind});syncVisualEditor(el)}\nfunction applyInlineStyle(kind){if(!visualMode){const el=currentRawEditor();if(!el)return;const a=el.selectionStart,b=el.selectionEnd,mark=kind==='bold'?'**':'*';el.focus();el.setRangeText(mark+el.value.slice(a,b)+mark,a,b,'select');el.setSelectionRange(a+mark.length,b+mark.length);el.dispatchEvent(new Event('input',{bubbles:true}));rememberEditor(el);return}const el=activeVisualEditor;if(!el?.isConnected)return;el.focus();document.execCommand(kind==='bold'?'bold':'italic',false);syncVisualEditor(el)}\nfunction copyFormat(){if(visualMode){const el=activeVisualEditor;copiedFormat=el?selectedVisualLines(el)[0]?.dataset.kind||'p':'p'}else {const el=currentRawEditor();copiedFormat=el?lineInfo(el.value.slice(el.value.lastIndexOf('\\n',el.selectionStart-1)+1).split('\\n')[0]).kind:'p'}toast('已复制段落格式')}\nlet mmBrushOn=false,mmBrushPrefix='';\nfunction mmBrushToggle(){\n  if(mmBrushOn){mmBrushOn=false;document.querySelectorAll('[data-mm-brush]').forEach(b=>b.classList.remove('active'));return false}\n  const el=currentRawEditor();if(!el)return false;\n  const line=el.value.slice(el.value.lastIndexOf('\\n',Math.max(0,el.selectionStart-1))+1).split('\\n')[0];\n  mmBrushPrefix=(line.match(/^([ \\t]*)(?:((?:#{1,6}|[-*+]|\\d+\\.|>) )|)/)||[])[0]||'';\n  mmBrushOn=true;document.querySelectorAll('[data-mm-brush]').forEach(b=>b.classList.add('active'));return true;\n}\ndocument.addEventListener('pointerup',event=>{if(!mmBrushOn)return;const el=event.target.closest?.('textarea.persona-editor,textarea.world-editor');if(!el)return;\n  setTimeout(()=>{if(!mmBrushOn||!el.isConnected)return;const pos=el.selectionStart,start=el.value.lastIndexOf('\\n',Math.max(0,pos-1))+1,end=el.value.indexOf('\\n',start);\n    const line=el.value.slice(start,end<0?el.value.length:end),old=(line.match(/^([ \\t]*)(?:((?:#{1,6}|[-*+]|\\d+\\.|>) )|)/)||[])[0]||'';\n    if(old===mmBrushPrefix)return;el.setRangeText(mmBrushPrefix,start,start+old.length,'preserve');el.dispatchEvent(new Event('input',{bubbles:true}));rememberEditor(el);\n  },0);\n});\nwindow.__mmBrushToggle=mmBrushToggle;\nwindow.__mmBrushClear=()=>{if(mmBrushOn)mmBrushToggle()};\nfunction pasteFormat(){applyBlockStyle(copiedFormat)}\nfunction insertVisualText(text){const el=activeVisualEditor;if(!el?.isConnected)return;el.focus();document.execCommand('insertText',false,text);syncVisualEditor(el)}\ndocument.getElementById('formatTools').addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});\ndocument.addEventListener(\"focusin\",e=>{window.parent.postMessage({source:\"mianmian-editor\",action:\"focus\"},\"*\");\n  if(e.target.matches?.(\"input,textarea,select,[contenteditable=true]\")) beginEditSession(e.target);\n  if(e.target.matches?.('.persona-editor,.world-editor')) rememberEditor(e.target);\n});\ndocument.addEventListener('keyup',e=>{if(e.target.matches?.('.persona-editor,.world-editor')){rememberEditor(e.target)}});\ndocument.addEventListener('select',e=>{if(e.target.matches?.('.persona-editor,.world-editor'))rememberEditor(e.target)});\ndocument.addEventListener('mouseup',e=>{if(e.target.matches?.('.persona-editor,.world-editor'))rememberEditor(e.target)});\ndocument.addEventListener('touchend',e=>{if(e.target.matches?.('.persona-editor,.world-editor'))setTimeout(()=>rememberEditor(e.target),0)},{passive:true});\ndocument.addEventListener(\"focusout\",e=>{\n  if(e.target.matches?.(\"input,textarea,select,[contenteditable=true]\")) endEditSession();\n});\ndocument.addEventListener(\"keydown\",e=>{\n  if((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase()===\"z\"){e.preventDefault();undo();}\n  else if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()===\"y\" || (e.shiftKey&&e.key.toLowerCase()===\"z\"))){e.preventDefault();redo();}\n  else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='h'){e.preventDefault();openReplace();}\n  else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='f'){e.preventDefault();document.getElementById('promptSearch')?.focus();document.getElementById('promptSearch')?.select();}\n});\ndocument.addEventListener('input',e=>{if(e.target.matches?.('.persona-editor,.world-editor')){lastEditor=e.target;lastSelectionStart=e.target.selectionStart??0;lastSelectionEnd=e.target.selectionEnd??lastSelectionStart;updatePairTag()}});\ndocument.addEventListener('selectionchange',()=>{const el=document.activeElement;if(el?.matches?.('.persona-editor,.world-editor'))rememberEditor(el)});\n\ndocument.getElementById('promptScroll').addEventListener('scroll',()=>document.getElementById('backtop').classList.toggle('show',document.getElementById('promptScroll').scrollTop>500));\ndocument.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});\nfunction savePreviewDraft(){window.parent.postMessage({source:\"mianmian-editor\",action:\"saveDraft\",card:cardRaw(),avatarData:state.avatarData,userTags:window.__mmUserTags?.()},\"*\")}\nfunction requestTavernWrite(action){\n  if(window.parent===window){toast('请从酒馆插件入口打开');return}\n  if(action==='overwrite')window.parent.postMessage({source:'mianmian-editor',action:'overwriteClick',time:Date.now()},'*');\n  window.parent.postMessage({source:'mianmian-editor',action,card:cardRaw(),avatarData:state.avatarData,userTags:window.__mmUserTags?.()},\"*\");\n}\nwindow.__mmRunTool=(command,value)=>{if(command==='brush')return mmBrushToggle();if(command==='tag')return insertQuickTag(value||'');if(command==='pair')return insertQuickPair(value?.open||'',value?.close||'');if(command==='inline')return applyInlineStyle(value);if(command==='block')return applyBlockStyle(value);};\nfunction mmHostAction(command){window.parent.postMessage({source:'mianmian-editor',action:'inlineAction',command},'*')}\nwindow.__mmStartNew=()=>{window.__mmNamingNew=true;const input=document.getElementById('nameInput'),view=document.getElementById('nameView');view.hidden=true;input.hidden=false;input.value='';input.placeholder='填写姓名';input.focus();};\nwindow.__mmNewName=()=>document.getElementById('nameInput').value.trim();\nwindow.__mmTemplate=name=>{const card=templateState();card.data.name=name;return {spec:'chara_card_v2',data:card.data};};\nwindow.__mmBusy=(busy)=>{document.body.classList.toggle('mm-busy',busy);document.querySelectorAll('input,textarea,button,[contenteditable]').forEach(el=>{if(el.matches('[contenteditable]'))el.contentEditable=busy?'false':'true';else el.disabled=busy})};\nwindow.__mmReceive=data=>{\n  const event={data};\n  if(data?.source!=='mianmian-host')return;\n  if(event.data.action==='collectionLoad'){const c=event.data.collection||{};collection=Array.isArray(c.items)?c.items:[];collectionFolders=Array.isArray(c.folders)?c.folders:[];collectionTagColors=c.tagColors||{};renderAll();return}\n  if(event.data.action==='hostCommand'){if(event.data.command==='saveDraft')savePreviewDraft();if(event.data.command==='overwrite')requestTavernWrite('overwrite');return}\n  if(event.data.action==='templateNew'){replaceStateAndRecord(templateState(),'已载入面面内置模板');state.data.name=event.data.name||state.data.name;renderAll();return}\n  if(event.data.action==='tool'){const m=event.data;try{if(m.command==='tag')insertQuickTag(m.value||'');else if(m.command==='pair')insertQuickPair(m.open||'',m.end||'');else if(m.command==='visual')toggleVisualEditor();else if(m.command==='block')applyBlockStyle(m.value);else if(m.command==='inline')applyInlineStyle(m.value);else if(m.command==='copyFormat')copyFormat();else if(m.command==='pasteFormat')pasteFormat();else if(m.command==='fold')foldCurrentCard();else if(m.command==='find'){document.getElementById('promptSearch').value=m.find||'';renderPrompt();renderBook()}else if(m.command==='replaceOne'||m.command==='replaceAll'){document.getElementById('replaceFind').value=m.find||'';document.getElementById('replaceWith').value=m.replace||'';if(m.command==='replaceOne')replaceOne();else replaceAllText()}}catch(e){toast('编辑操作失败：'+e.message)}return}\n  if(event.data.action==='load'&&event.data.card){try{window.__mmLoad(event.data.card,event.data.avatarData)}catch(error){window.parent.postMessage({source:'mianmian-editor',action:'loadError',error:String(error.message||error).slice(0,150)},'*')}}\n  if(event.data.action==='result')toast(event.data.message);\n};\nwindow.addEventListener('message',event=>{if(event.source===window.parent)window.__mmReceive(event.data)});\n// 每次直接打开 HTML 都从空白初始状态开始；「新建」才加载人设模板.\nstate=initialState();\nhistoryStack=[snapshot()];\nredoStack=[];\nrenderAll();\nif(window.parent!==window)window.parent.postMessage({source:\"mianmian-editor\",action:\"ready\"},\"*\");\n// 面面当前打开的编辑稿：两栏分别在各自 iframe 内搜索与替换。\nwindow.__mmSearchAll=function(query){\n  const q=String(query||'').trim().toLowerCase();\n  const textFields=['description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions'];\n  const values=textFields.map(k=>String(state.data[k]||''))\n    .concat(Array.isArray(state.data.alternate_greetings)?state.data.alternate_greetings:[])\n    .concat((state.data.character_book?.entries||[]).flatMap(e=>[e.comment||'',e.content||'',...(e.keys||[])]));\n  const hits=q?values.reduce((n,v)=>n+(v.toLowerCase().split(q).length-1),0):0;\n  const input=document.getElementById('promptSearch');if(input)input.value=query||'';\n  renderPrompt();renderBook();\n  document.querySelectorAll('.card,.entry,.field,details.other-section').forEach(el=>{\n    const content=[el.textContent,...[...el.querySelectorAll('textarea,input')].map(x=>x.value)].join(' ').toLowerCase();\n    el.classList.toggle('mm-search-hit',!!q&&content.includes(q));\n  });\n  return hits;\n};\nwindow.__mmReplaceAll=function(find,replacement){\n  find=String(find||'');replacement=String(replacement??'');if(!find)return 0;\n  let total=0;\n  const apply=v=>{const source=String(v||'');const n=source.split(find).length-1;total+=n;return n?source.split(find).join(replacement):source};\n  for(const k of ['description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions'])state.data[k]=apply(state.data[k]);\n  if(Array.isArray(state.data.alternate_greetings))state.data.alternate_greetings=state.data.alternate_greetings.map(apply);\n  for(const e of state.data.character_book?.entries||[]){e.comment=apply(e.comment);e.content=apply(e.content);if(Array.isArray(e.keys))e.keys=e.keys.map(apply)}\n  if(total){recordHistory();renderAll();saveLocal(true)}\n  return total;\n};\n\nwindow.__mmUserTags=()=>[...(state.collectionMeta?.tags||[])];\nwindow.__mmLoad=(card,avatarData)=>{\n  if(!card?.data||!Array.isArray(card.data.character_book?.entries))throw Error('载入资料结构不完整');\n  window.__mmNamingNew=false;parseCard(card);state.avatarData=avatarData||'';historyStack=[snapshot()];redoStack=[];renderAll();\n  state.collectionMeta={...state.collectionMeta,tags:[...(card.data._mmUserTags||[])]};renderCurrentTags();\n  const field=document.querySelector('#promptList textarea[data-history-key=\"description\"]');\n  if(!field)throw Error('编辑器没有生成人设文本框');\n  const expected=String(card.data.description||'').replace(/\\r\\n?/g,'\\n');\n  if(field.value!==expected){field.value=expected;updateEditorHighlight(field);autoGrowTextarea(field)}\n  if(field.value!==expected)throw Error('人设正文渲染不一致');\n  const greetings=Array.isArray(card.data.alternate_greetings)?card.data.alternate_greetings.length:0;\n  const receipt={name:state.data.name,descriptionLength:field.value.length,firstMessageLength:String(state.data.first_mes||'').length,\n    greetingCount:greetings,bookCount:state.data.character_book.entries.length};\n  window.parent.postMessage({source:'mianmian-editor',action:'loaded',receipt},'*');\n  return receipt;\n};\nwindow.__mmSnapshot=()=>({card:cardRaw(),avatarData:state.avatarData,userTags:window.__mmUserTags?.()});\nwindow.__mmBookSaved=book=>{\n  state.data.character_book.name=book.name;\n  for(const e of state.data.character_book.entries){const saved=book.entries.find(x=>x.id===e.id);if(saved?._mmRaw)e._mmRaw=saved._mmRaw;}\n  const name=document.getElementById('bookName');if(name)name.value=book.name;\n};\ndocument.addEventListener('click',event=>{\n  const button=event.target.closest('[data-mm-inline],[data-mm-add-entry]');if(!button||button.disabled)return;\n  if(button.hasAttribute('data-mm-add-entry'))addEntry();else mmHostAction(button.dataset.mmInline);\n});\nwindow.addEventListener('error',event=>window.parent.postMessage({source:'mianmian-editor',action:'editorError',error:String(event.message).slice(0,200)},'*'));\nwindow.addEventListener('unhandledrejection',event=>window.parent.postMessage({source:'mianmian-editor',action:'editorError',error:String(event.reason?.message||event.reason).slice(0,200)},'*'));\n</script>\n</body>\n</html>\n";
    const mmRuntime = {
        frames: {}, ready: { char: false, user: false }, target: { char: null, user: null },
        pendingLoad: { char: null, user: null }, rawCards: { char: null }, loadedTarget: { char: null, user: null }, loadedWorldbooks: { char: null, user: null }, preserveWorldbookDraft: { char: false, user: false }, active: 'char', loading: { char: false, user: false },
        requestSeq: { char: 0, user: 0 }, loadWaiters: { char: null, user: null }, autosaveTimers: {}, pendingWrite: null,
        activeOperation: { char: null, user: null }, lastOperation: { char: null, user: null }, operationSequence: 0, currentDraft: {}, bookClaims: new Set(), status: {}, statusTimers: {}
    };
    const MM_DIAGNOSTICS_KEY='鲜虾鱼板面.diagnostics.session.v1';
    const mmDiagnostics = (()=>{try{const saved=JSON.parse(hostWindow.sessionStorage.getItem(MM_DIAGNOSTICS_KEY)||'[]');return Array.isArray(saved)?saved.slice(-400):[];}catch{return [];}})();
    let mmDiagnosticsTimer;
    function mmPersistDiagnostics(){try{hostWindow.sessionStorage.setItem(MM_DIAGNOSTICS_KEY,JSON.stringify(mmDiagnostics));}catch{}}

    function mmLog(stage, side, status, error, began, details = null) {
        const safe = error ? String(error.message || error).replace(/https?:\/\/\S+/g, '[url]').slice(0, 200) : '';
        const previous = mmDiagnostics[mmDiagnostics.length - 1];
        if (status === 'failed' && previous?.stage === stage && previous?.side === side && previous?.status === status && previous?.error === safe) { previous.repeats = (previous.repeats || 1) + 1; previous.time = new Date().toISOString(); return; }
        const operation = mmRuntime.activeOperation?.[side] || (stage === 'write' && status === 'failed' ? mmRuntime.lastOperation?.[side] : null);
        mmDiagnostics.push({ time: new Date().toISOString(), session: mmRuntime.sessionId, operationId: operation?.id || '',
            stage, side, targetKind: (operation?.target || mmRuntime.target[side])?.kind || '', targetId: (operation?.target || mmRuntime.target[side])?.id || '',
            targetName: (operation?.target || mmRuntime.target[side])?.name || '', status, elapsedMs: began ? Date.now() - began : 0,
            details: details || undefined, error: safe });
        if (mmDiagnostics.length > 400) mmDiagnostics.shift();
        hostWindow.clearTimeout(mmDiagnosticsTimer);if(status==='failed')mmPersistDiagnostics();else mmDiagnosticsTimer=hostWindow.setTimeout(mmPersistDiagnostics,500);
    }
    mmRuntime.sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    function mmBeginOperation(side, target, kind) {
        const operation = { id: mmRuntime.sessionId + '-' + (++mmRuntime.operationSequence), kind, target: { ...target }, began: Date.now() };
        mmRuntime.activeOperation[side] = operation;
        return operation;
    }
    function mmEndOperation(side, operation) {
        if (mmRuntime.activeOperation[side] === operation) { mmRuntime.lastOperation[side] = operation; mmRuntime.activeOperation[side] = null; }
    }
    hostWindow.addEventListener('pagehide', mmPersistDiagnostics);
    const MM_DIAG_DAY_KEY = '鲜虾鱼板面.logExportDay.v1';
    function mmNextLogName() {
        const today = new Date();
        const day = [today.getFullYear(), today.getMonth() + 1, today.getDate()].join('-');
        let stored;
        try { stored = JSON.parse(hostWindow.localStorage.getItem(MM_DIAG_DAY_KEY) || '{}'); } catch (_) { stored = {}; }
        const number = stored.day === day ? (Number(stored.number) || 0) + 1 : 1;
        try { hostWindow.localStorage.setItem(MM_DIAG_DAY_KEY, JSON.stringify({ day, number })); } catch (_) {}
        return '鱼板' + (today.getMonth() + 1) + '.' + today.getDate() + '.' + number + '.json';
    }
    function mmExportDiagnostics() {
        mmLog('ui', 'settings', 'export-log');
        const blob = new Blob([JSON.stringify({ version: '10.16', events: mmDiagnostics }, null, 2)], { type: 'application/json' });
        const link = root.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = mmNextLogName(); link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    }
    // Record actions across the whole panel without reading user-entered text or selector values.
    function mmTrackPanelActions(panel) {
        if (panel.dataset.mmDiagBound) return;
        panel.dataset.mmDiagBound = '1';
        panel.addEventListener('click', e => {
            const control = e.target.closest('button,[role="button"],label.awm-btn');
            if (!control || !panel.contains(control)) return;
            const page = panel.querySelector('.awm-tab.active')?.dataset.page || 'panel';
            const type = control.id === 'awmExportMmLog' ? 'export-log-click'
                : control.id === 'awmClearMmLog' ? 'clear-log-click'
                : control.dataset.page ? 'navigation'
                : control.dataset.mmNew !== undefined ? 'new-click'
                : control.dataset.mmSave !== undefined ? 'save-click'
                : control.dataset.mmOverwrite !== undefined ? 'overwrite-click'
                : control.id === 'iRandom' || control.id === 'iManual' ? 'inject-click'
                : 'button-click';
            mmLog('ui', page, type);
        }, true);
        let editTimer = 0;
        panel.addEventListener('input', e => {
            if (!e.target.matches('input,textarea,[contenteditable]')) return;
            clearTimeout(editTimer);
            editTimer = hostWindow.setTimeout(() => {
                const page = panel.querySelector('.awm-tab.active')?.dataset.page || 'panel';
                mmLog('ui', page, 'edit');
            }, 850);
        }, true);
        panel.addEventListener('change', e => {
            if (e.target.matches('input,select')) {
                const page = panel.querySelector('.awm-tab.active')?.dataset.page || 'panel';
                mmLog('ui', page, 'control-change');
            }
        }, true);
    }
    function mmApi(name) {
        const fn = mmHelperFn(name);
        if (typeof fn !== 'function') throw new Error('酒馆助手未提供 ' + name + ' 接口');
        return fn;
    }
    const MM_PERSONA_TAG_KEY = '鲜虾鱼板面.personaTags.v1';
    function mmTagMap() {
        try { return JSON.parse(hostWindow.localStorage.getItem(MM_PERSONA_TAG_KEY) || '{}'); }
        catch (_) { return {}; }
    }
    function mmPersonaTags(id) { const map=mmTagMap();return Array.isArray(map[id]) ? [...map[id]] : []; }
    // 酒馆本地标签归属于头像文件名；角色卡 data.tags 是导出时的副本。
    function mmNativeCharTags(avatarId) {
        const ctx = hostWindow.SillyTavern?.getContext?.();
        const ids = ctx?.tagMap?.[avatarId];
        if (!Array.isArray(ids) || !Array.isArray(ctx?.tags)) return null;
        return [...new Set(ids.map(id => ctx.tags.find(tag => tag.id === id)?.name).filter(Boolean))];
    }
    function mmSaveNativeCharTags(avatarId, wanted) {
        const ctx = hostWindow.SillyTavern?.getContext?.();
        if (!avatarId || !Array.isArray(ctx?.tags) || !ctx.tagMap || typeof ctx.saveSettingsDebounced !== 'function')
            throw new Error('酒馆标签接口不可用，未能覆盖角色标签');
        const names = [...new Set(wanted.map(tag => String(tag).trim()).filter(Boolean))];
        // 在保存前准备定义，避免把新标签名误当成 tag ID。
        for (const name of names) {
            if (ctx.tags.some(tag => tag.name === name)) continue;
            ctx.tags.push({ id: hostWindow.crypto?.randomUUID?.() || String(Date.now()) + Math.random(),
                name, color: '', color2: '', folder_type: '', sort_order: ctx.tags.length, create_date: Date.now() });
        }
        ctx.tagMap[avatarId] = names.map(name => ctx.tags.find(tag => tag.name === name).id);
        ctx.saveSettingsDebounced();
        const actual = mmNativeCharTags(avatarId);
        if (JSON.stringify(actual) !== JSON.stringify(names)) throw new Error('酒馆角色标签回读校验失败');
        mmLog('writeTags', 'char', 'saved', '', mmRuntime.activeOperation?.char?.began,
            { avatar: avatarId, count: names.length });
    }

    function mmSavePersonaTags(id, tags) {
        if (!id) throw new Error('缺少 User 头像 ID，标签未保存');
        const map = mmTagMap();
        const wanted=[...new Set((tags || []).map(x => String(x).trim()).filter(Boolean))];
        if(JSON.stringify(map[id])===JSON.stringify(wanted))return;
        map[id] = wanted;
        hostWindow.localStorage.setItem(MM_PERSONA_TAG_KEY, JSON.stringify(map));
        if (JSON.stringify(mmPersonaTags(id)) !== JSON.stringify(map[id])) throw new Error('User 标签保存校验失败');
        mmRefreshPersonaTags();
    }
    function mmRefreshPersonaTags() {
        const map = mmTagMap();
        // The original persona cards carry their avatar identifier on data-avatar-id.
        root.querySelectorAll('.avatar-container[data-avatar-id]').forEach(card => {
            if (card.closest('#awm-panel-v03')) return;
            const id = card.getAttribute('data-avatar-id');
            if (!Object.hasOwn(map,id)) return;
            let box = card.querySelector('.awm-persona-tags');
            if (!box) { box = root.createElement('div'); box.className = 'awm-persona-tags'; (card.querySelector('.character_select_container') || card).appendChild(box); }
            const wanted = Array.isArray(map[id])?map[id]:[];
            if (JSON.stringify([...box.children].map(node => node.textContent)) === JSON.stringify(wanted)) return;
            box.replaceChildren();
            for (const tag of wanted) {
                const label = root.createElement('span'); label.className = 'awm-persona-tag'; label.textContent = tag; box.appendChild(label);
            }
        });
    }
    function mmWatchPersonaTags() {
        if (hostWindow.__awmPersonaTagObserver) return;
        const relevant=node=>node?.nodeType===1 && (node.matches('.avatar-container[data-avatar-id]')||node.querySelector('.avatar-container[data-avatar-id]'));
        const observer = new MutationObserver(records => {
            const changed=records.some(record=>{
                const target=record.target.nodeType===1?record.target:record.target.parentElement;
                if(target?.closest('.awm-persona-tags,#awm-panel-v03,#awmChatBackupDialog'))return false;
                return !!target?.closest('.avatar-container[data-avatar-id]') || [...record.addedNodes].some(relevant);
            });
            if(!changed)return;
            clearTimeout(hostWindow.__awmPersonaTagTimer);hostWindow.__awmPersonaTagTimer=hostWindow.setTimeout(mmRefreshPersonaTags,90);
        });
        observer.observe(root.body || root.documentElement, { childList: true, subtree: true });
        hostWindow.__awmPersonaTagObserver = observer;
        mmRefreshPersonaTags();
    }
    function mmStorageMode() {
        try { return hostWindow.localStorage.getItem(MM_STORAGE_CHOICE) === 'browser' ? 'browser' : 'tavern'; }
        catch (_) { return 'tavern'; }
    }
    function mmNormalize(x) {
        const data = normalizeData(x);
        const old = x && typeof x.mianmian === 'object' ? x.mianmian : {};
        data.mianmian = {
            drafts: {
                char: old.drafts && typeof old.drafts.char === 'object' && old.drafts.char ? old.drafts.char : {},
                user: old.drafts && typeof old.drafts.user === 'object' && old.drafts.user ? old.drafts.user : {}
            },
            active: {
                char: typeof old.active?.char === 'string' ? old.active.char : '',
                user: typeof old.active?.user === 'string' ? old.active.user : ''
            },
            collections: old.collections && typeof old.collections === 'object' ? old.collections : { char: { items: [], folders: [], tagColors: {} }, user: { items: [], folders: [], tagColors: {} } }
        };
        return data;
    }
    function mmReadBrowser() {
        try { const text = mmStorageMode()==='tavern' && mmRetiredLocal(MM_LOCAL_KEY) ? null : hostWindow.localStorage.getItem(MM_LOCAL_KEY); return text ? mmNormalize(JSON.parse(text)) : null; }
        catch (_) { return null; }
    }
    function mmReadSelected() {
        if (mmStorageMode() === 'browser') return mmReadBrowser() || loadLocalData();
        return readTavernData() || mmReadBrowser() || loadLocalData();
    }
    function mmWriteData(data) {
        const value = mmNormalize(data);
        if (mmStorageMode() === 'browser') {
            hostWindow.localStorage.setItem(MM_LOCAL_KEY, JSON.stringify(value));
        } else {
            if (!canUseTavernStorage()) throw new Error('酒馆变量接口不可用，数据未写入；可在设置切换为浏览器');
            writeTavernData(value);
        }
        runtimeData = value;
        tavernDataReady = true;
        return true;
    }
    async function mmSwitchStorage(mode) {
        if (mode === mmStorageMode()) return;
        const original = mmStorageMode(), value = mmNormalize(load());
        if (mode === 'tavern') {
            if (!canUseTavernStorage()) throw new Error('酒馆变量接口不可用');
            writeTavernData(value);
            const check = readTavernData();
            if (!check || JSON.stringify(mmNormalize(check)) !== JSON.stringify(value)) throw new Error('酒馆存储校验失败');
        } else {
            hostWindow.localStorage.setItem(MM_LOCAL_KEY, JSON.stringify(value));
            if (JSON.stringify(mmReadBrowser()) !== JSON.stringify(value)) throw new Error('浏览器存储校验失败');
        }
        hostWindow.localStorage.setItem(MM_STORAGE_CHOICE, mode);
        runtimeData = value;
        tavernDataReady = true;
        // 原位置保留副本；切换成功后新写入只到所选位置。
        toast('已切换为' + (mode === 'tavern' ? '酒馆' : '浏览器') + '存储', 'success');
    }
    function mmHighlight(value, query) {
        const raw = String(value ?? ''), q = String(query || '').trim();
        if (!q) return esc(raw);
        const low = raw.toLowerCase(), needle = q.toLowerCase();
        let out = '', pos = 0, index;
        while ((index = low.indexOf(needle, pos)) >= 0) {
            out += esc(raw.slice(pos, index)) + '<mark class="awm-mm-mark">' + esc(raw.slice(index, index + q.length)) + '</mark>';
            pos = index + q.length;
        }
        return out + esc(raw.slice(pos));
    }
    function mmSearchBoth(query) {
        let total = 0;
        for (const side of ['char', 'user']) {
            try { total += Number(mmFrame(side)?.contentWindow?.__mmSearchAll?.(query) || 0); }
            catch (_) {}
        }
        const count = root.querySelector('#awmMian [data-mm-count]');
        if (count) count.textContent = query ? '当前两栏 ' + total + ' 处' : '';
    }
    function mmReplaceBoth(find, replacement) {
        if (!find) return toast('请先输入要替换的词', 'warning');
        let hits = 0;
        for (const side of ['char', 'user']) {
            try {
                const card = mmFrame(side)?.contentWindow?.__mmSnapshot?.()?.card?.data;
                if (!card) continue;
                const values = ['description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions'].map(k => String(card[k] || ''))
                    .concat(card.alternate_greetings || []).concat((card.character_book?.entries || []).flatMap(e => [e.comment || '', e.content || '', ...(e.keys || [])]));
                hits += values.reduce((n, v) => n + (String(v).split(find).length - 1), 0);
            } catch (_) {}
        }
        if (!hits) return toast('当前打开的两栏没有找到这个词', 'warning');
        mmOpenConfirm('替换面面当前两栏', '在当前打开的 Character 和 User 编辑稿中，将「' + find + '」替换为「' + replacement + '」，共 ' + hits + ' 处。只保存到面面草稿，不覆盖酒馆原卡。', () => {
            let replaced = 0;
            for (const side of ['char', 'user']) {
                try { replaced += Number(mmFrame(side)?.contentWindow?.__mmReplaceAll?.(find, replacement) || 0); mmPersistCurrent(side); }
                catch (err) { toast(side + ' 替换失败：' + err.message, 'error'); }
            }
            mmSearchBoth(root.querySelector('#awmMian [data-mm-find]')?.value || '');
            toast('面面草稿已替换 ' + replaced + ' 处', 'success');
        });
    }
    function mmEsc(value) { return esc(value); }
    function mmDraftKey(side, target) { return (target?.kind || 'new') + ':' + (target?.id || target?.name || ''); }
    function mmClearSideDraftCache(side) {
        clearTimeout(mmRuntime.autosaveTimers[side]);
        const value = mmNormalize(load());
        value.mianmian.drafts[side] = {};
        value.mianmian.active[side] = '';
        mmRuntime.currentDraft[side] = null;
        mmWriteData(value);
        mmLog('draftCache', side, 'cleared');
    }
    function mmIsEmptyDraft(d) { return !d || !d.card || !d.card.data; }
    function mmFrame(side) { return mmRuntime.frames[side]; }
    function mmPost(side, msg) {
        const f = mmFrame(side);
        if (!f?.contentWindow || !mmRuntime.ready[side]) return;
        // The helper script and editor are sibling frames. A postMessage from the
        // helper is not from window.parent; invoke the explicit same-origin bridge.
        try {
            if (typeof f.contentWindow.__mmReceive !== 'function') throw new Error('编辑器通信尚未就绪');
            f.contentWindow.__mmReceive({ source: 'mianmian-host', ...msg });
        } catch (error) { mmLog('bridge', side, 'failed', error); mmStatus(side, '操作未送达：' + error.message, true); }
    }
    function mmDraftSave(side, message, silent = false, capturedTarget = mmRuntime.target[side]) {
        const card = message?.card;
        if (!card?.data || !capturedTarget) return false;
        if (capturedTarget.name && card.data.name !== capturedTarget.name) return false;
        const key = mmDraftKey(side, capturedTarget);
        if(key!==mmDraftKey(side,mmRuntime.target[side]))return false;
        try{if(side==='user'&&capturedTarget.kind==='existing'&&Array.isArray(message.userTags))mmSavePersonaTags(capturedTarget.id,message.userTags);}catch(err){mmStatus(side,'标签未保存：'+err.message,true);}
        const current=load(), previous=current.mianmian?.drafts?.[side]?.[key];
        if(previous && current.mianmian?.active?.[side]===key && (silent||previous.confirmed)
            && JSON.stringify(previous.target)===JSON.stringify(capturedTarget)
            && JSON.stringify(previous.card)===JSON.stringify(card)
            && previous.avatarData===(message.avatarData||'')){
            if(!silent){if(side==='user'&&capturedTarget.kind==='existing'&&Array.isArray(message.userTags))mmSavePersonaTags(capturedTarget.id,message.userTags);toast('面面草稿已保存','success');}
            return true;
        }
        const value = mmNormalize(current);
        value.mianmian.drafts[side][key] = {
            target: { ...capturedTarget }, card,
            avatarData: message.avatarData || '', modified: Date.now(),
            confirmed: !silent || !!value.mianmian.drafts[side][key]?.confirmed
        };
        if (mmDraftKey(side, mmRuntime.target[side]) === key) {
            value.mianmian.active[side] = key;
            mmRuntime.currentDraft[side] = structuredClone(message);
        }
        try { mmWriteData(value);
            if (!silent && side === 'user' && capturedTarget.kind === 'existing' && Array.isArray(message.userTags)) mmSavePersonaTags(capturedTarget.id, message.userTags);
            mmLog('saveDraft', side, 'success'); if (!silent) toast('面面草稿已保存', 'success'); return true; }
        catch (err) { mmLog('saveDraft', side, 'failed', err); toast('草稿保存失败：' + err.message, 'error'); return false; }
    }
    function mmPersistCurrent(side) {
        try {
            const snapshot = mmFrame(side)?.contentWindow?.__mmSnapshot?.();
            if (snapshot) { clearTimeout(mmRuntime.autosaveTimers[side]); mmDraftSave(side, snapshot, true); return; }
        } catch (_) {}
        mmPost(side, { action: 'hostCommand', command: 'saveDraft' });
    }
    function mmDebounceDraft(side, msg) {
        clearTimeout(mmRuntime.autosaveTimers[side]);
        const capturedTarget = mmRuntime.target[side] && { ...mmRuntime.target[side] };
        mmRuntime.autosaveTimers[side] = hostWindow.setTimeout(() => mmDraftSave(side, msg, true, capturedTarget), 300);
    }
    function mmCheckReceipt(card, receipt) {
        const d = card.data;
        if (!receipt || receipt.name !== d.name || receipt.descriptionLength !== String(d.description || '').replace(/\r\n?/g, '\n').length ||
            receipt.firstMessageLength !== String(d.first_mes || '').length ||
            receipt.greetingCount !== (d.alternate_greetings || []).length ||
            receipt.bookCount !== (d.character_book?.entries || []).length)
            throw new Error('编辑器显示的资料与酒馆读取结果不一致');
    }
    function mmApplyData(side, target, card, avatarData = '') {
        clearTimeout(mmRuntime.autosaveTimers[side]);
        mmRuntime.target[side] = target;
        mmRuntime.currentDraft[side] = structuredClone({card, avatarData});
        if (side === 'user' && !Array.isArray(card.data._mmUserTags)) card.data._mmUserTags = target.kind === 'existing' ? mmPersonaTags(target.id) : [];
        if (side === 'char' && !Array.isArray(card.data._mmCharTags)) card.data._mmCharTags = mmNativeCharTags(target.id) ?? (Array.isArray(mmRuntime.rawCards.char?.data?.tags) ? [...mmRuntime.rawCards.char.data.tags] : []);
        if (mmRuntime.ready[side]) {
            try {
                const win = mmFrame(side)?.contentWindow;
                if (typeof win?.__mmLoad !== 'function') throw new Error('编辑器加载接口未就绪');
                const receipt = win.__mmLoad(card, avatarData);
                mmCheckReceipt(card, receipt);
                mmRuntime.loadWaiters[side]?.resolve(receipt);
                mmRuntime.loadWaiters[side] = null;
            } catch (err) {
                mmRuntime.loadWaiters[side]?.reject(err);
                mmRuntime.loadWaiters[side] = null;
                if (!mmRuntime.loadWaiters[side]) mmLog('render', side, 'failed', err);
                mmRuntime.rawCards[side] = null;
                // mmSelect owns the single user-facing error for this read.
            }
        } else mmRuntime.pendingLoad[side] = { target, card, avatarData };
        const pane = root.querySelector('#awmMian [data-mm-pane="' + side + '"]');
        if (pane) {
            pane.querySelector('[data-mm-title]').textContent = target.name || (side === 'char' ? 'CHAR' : 'User');
            pane.querySelector('[data-mm-search]').value = '';
        }
    }
    function mmEditorCard(name, data, book) {
        const d = { name, description: data?.description || '', personality: data?.personality || '',
            scenario: data?.scenario || '', first_mes: data?.first_mes || data?.first_messages?.[0] || '',
            alternate_greetings: data?.alternate_greetings || data?.first_messages?.slice(1) || [],
            mes_example: data?.mes_example || '', creator_notes: data?.creator_notes || '',
            system_prompt: data?.system_prompt || '', post_history_instructions: data?.post_history_instructions || '',
            character_book: book || { name: '', entries: [] } };
        return { spec: 'chara_card_v2', spec_version: '2.0', data: d };
    }
    function mmBookFingerprint(book) {
        return JSON.stringify({name:book?.name||'',entries:(book?.entries||[]).map(e=>({
            id:e._mmRaw?.uid ?? e.id, name:e.comment||'', content:e.content||'',
            keys:e.keys||[], order:e.insertion_order||1
        }))});
    }
    function mmBookName(side, source) {
        return side === 'user' ? (source?.lorebook || '') : (source?.worldbook || '');
    }
    function mmToEditorEntry(entry) {
        const raw = JSON.parse(JSON.stringify(entry));
        return {
            id: 'wb_' + entry.uid, comment: entry.name || '',
            keys: entry.strategy?.keys || [], secondary_keys: entry.strategy?.keys_secondary?.keys || [],
            content: entry.content || '', enabled: entry.enabled !== false,
            constant: entry.strategy?.type === 'constant',
            selective: entry.strategy?.type === 'selective',
            insertion_order: entry.position?.order || 1,
            _mmRaw: raw
        };
    }
    function mmReadEmbeddedBook(book, name) {
        const entries = Array.isArray(book.entries) ? book.entries : Object.values(book.entries || {});
        return { name: String(book.name || name + ' 世界书'), entries: entries.map((entry, index) => ({
            id: 'embedded_' + index, comment: String(entry.comment || entry.name || ''),
            content: String(entry.content || ''),
            keys: Array.isArray(entry.keys) ? entry.keys : entry.strategy?.keys || [],
            secondary_keys: Array.isArray(entry.secondary_keys) ? entry.secondary_keys : entry.strategy?.keys_secondary?.keys || [],
            enabled: entry.enabled !== false, constant: entry.constant === true || entry.strategy?.type === 'constant',
            selective: entry.selective === true || entry.strategy?.type === 'selective',
            insertion_order: entry.insertion_order || entry.position?.order || index + 1, _mmEmbeddedRaw: structuredClone(entry)
        })), _mmEmbedded: true };
    }
    async function mmReadBook(name) {
        if (!name) return { name: '', entries: [] };
        try { const entries = await mmApi('getWorldbook')(name); return { name, entries: Array.isArray(entries) ? entries.map(mmToEditorEntry) : [] }; }
        catch (err) { mmLog('readBook', '', 'failed', err); return { name, entries: [], _mmBookReadFailed: true }; }
    }
    function mmNames(side) {
        const names = mmApi(side === 'char' ? 'getCharacterNames' : 'getPersonaNames')();
        if (!Array.isArray(names)) throw new Error('酒馆返回的名称列表无效');
        return names;
    }
    function mmCharacterChoices() {
        const cards = hostWindow.SillyTavern?.getContext?.()?.characters || hostWindow.characters || [];
        const indexed = cards.filter(card => card?.name && /\.png$/i.test(card.avatar || ''));
        const choices = indexed.map(card => ({ name: card.name, id: card.avatar }));
        const counts = new Map();
        for (const card of indexed) counts.set(card.name, (counts.get(card.name) || 0) + 1);
        for (const name of mmNames('char')) {
            const remaining = counts.get(name) || 0;
            if (remaining) counts.set(name, remaining - 1);
            else choices.push({ name, id: '' });
        }
        return choices;
    }
    function mmPersonaIdentity(name) {
        const ids = mmApi('getPersonaIds')();
        const matching = ids.filter(id => mmApi('getPersona')(id)?.name === name);
        if (matching.length !== 1) throw new Error(matching.length ? '有同名 User，请从列表指定资料' : '无法定位 User 的头像 ID');
        return matching[0];
    }
    async function mmCharacterIdentity(name) {
        const cards = hostWindow.SillyTavern?.getContext?.()?.characters || hostWindow.characters || [];
        const matching = cards.filter(card => card?.name === name && /\.png$/i.test(card.avatar || ''));
        if (matching.length > 1) throw new Error('有同名 Character，请从列表指定角色');
        if (matching.length === 1) return matching[0].avatar;
        const ids = mmHelperFn('getCharacterIds')?.() || null;
        if (Array.isArray(ids)) {
            const found = [];
            for (const id of ids) {
                if (!/\.png$/i.test(id)) continue;
                const card = await mmApi('getCharacter')(id);
                if (card?.name === name) found.push(id);
                if (found.length > 1) break;
            }
            if (found.length > 1) throw new Error('有同名 Character，请从列表指定角色');
            if (found.length === 1) return found[0];
        }
        const card = await mmApi('getCharacter')(name);
        if (!card || (card.name && card.name !== name) || !/\.png$/i.test(card.avatar || '')) throw new Error('酒馆未返回该角色的头像 ID');
        return card.avatar;
    }
    // Same raw character endpoint and FormData fields used by the supplied character manager.
    async function mmRawFetch(path, body) {
        const headerProvider = hostWindow.getRequestHeaders || hostWindow.SillyTavern?.getContext?.()?.getRequestHeaders;
        const headers = typeof headerProvider === 'function'
            ? { ...headerProvider() } : { 'Content-Type': 'application/json' };
        if (body instanceof FormData) delete headers['Content-Type'];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let response;
        try { response = await hostWindow.fetch(path, { method: 'POST', credentials: 'same-origin', headers, body, signal: controller.signal }); }
        catch (error) { if (controller.signal.aborted) throw new Error('酒馆请求超过15秒，写入结果待核对；编辑稿已保留'); throw error; }
        finally { clearTimeout(timer); }
        if (!response.ok) throw new Error('酒馆角色卡接口 ' + response.status + '：' + (await response.text()).slice(0,160));
        return response;
    }
    async function mmReadRawCharacter(avatarId) {
        if (typeof avatarId !== 'string' || !/\.png$/i.test(avatarId)) throw new Error('无法取得角色卡头像 ID，已阻止不完整读取');
        const full = await (await mmRawFetch('/api/characters/get', JSON.stringify({ avatar_url: avatarId }))).json();
        const card = full?.data?.name ? full.data : full;
        if (!card || typeof card !== 'object' || !Object.hasOwn(card,'description')) throw new Error('酒馆未返回完整角色卡正文');
        return { full, data: card, avatarId };
    }
    async function mmWriteRawCharacter(avatarId, edited, expectedName, worldbookName, embeddedBook, preRead = null) {
        const raw = preRead || await mmReadRawCharacter(avatarId);
        const card = raw.data;
        if (card.name !== expectedName) throw new Error('原始角色卡不是当前编辑的角色，已停止覆盖');
        const before = structuredClone(card);
        const keys = ['description','first_mes','personality','scenario','mes_example','creator_notes','system_prompt','post_history_instructions'];
        for (const key of keys) card[key] = String(edited[key] || '');
        card.alternate_greetings = Array.isArray(edited.alternate_greetings) ? edited.alternate_greetings.map(String) : [];
        if(Array.isArray(edited.tags))card.tags=[...edited.tags];
        if (worldbookName) {
            card.worldbook = worldbookName;
            card.extensions = { ...(card.extensions || {}), world: worldbookName };
        }
        if (embeddedBook && Array.isArray(embeddedBook.entries)) {
            card.character_book = { ...(card.character_book || {}), name: embeddedBook.name || worldbookName,
                entries: embeddedBook.entries.map(e => ({ ...(e._mmEmbeddedRaw || {}),
                    comment: e.comment || '', keys: Array.isArray(e.keys) ? e.keys : [],
                    content: e.content || '', insertion_order: Number(e.insertion_order) || 1,
                    enabled: e.enabled !== false })) };
        }
        const dataKeys = [...keys,'alternate_greetings','tags','worldbook','extensions','character_book'];
        const changed = Object.fromEntries(dataKeys.filter(key => Object.hasOwn(card,key) &&
            JSON.stringify(card[key]) !== JSON.stringify(before[key])).map(key => [key,card[key]]));
        const legacyKeys = ['description','personality','scenario','first_mes','mes_example'];
        const v1 = Object.fromEntries(legacyKeys.filter(key => JSON.stringify(card[key]) !== JSON.stringify(before[key])).map(key => [key,card[key]]));
        if (Object.keys(changed).length || Object.keys(v1).length) {
            const patch = {avatar:avatarId,...v1,data:changed};
            mmLog('writeCharacter', 'char', 'patch-start', '', mmRuntime.activeOperation?.char?.began,
                { fields:[...Object.keys(v1),...Object.keys(changed)], payloadChars:JSON.stringify(patch).length });
            await mmRawFetch('/api/characters/merge-attributes',JSON.stringify(patch));
            mmLog('writeCharacter', 'char', 'patch-done', '', mmRuntime.activeOperation?.char?.began);
        } else mmLog('writeCharacter', 'char', 'no-changes');
        const check = (await mmReadRawCharacter(avatarId)).data;
        mmLog('writeCharacter', 'char', 'readback', '', mmRuntime.activeOperation?.char?.began);
        const wrong = [...keys,'alternate_greetings'].filter(key => JSON.stringify(check[key] ?? (key === 'alternate_greetings' ? [] : '')) !== JSON.stringify(card[key]));
        if (embeddedBook && Array.isArray(embeddedBook.entries) &&
            JSON.stringify((check.character_book?.entries || []).map(e => e.content || '')) !==
            JSON.stringify(embeddedBook.entries.map(e => e.content || '')))
            throw new Error('角色卡内嵌世界书没有保存新正文');
        if (wrong.length) throw new Error('酒馆原始角色卡未保存：' + wrong.join('、'));
        // write-work refreshes both caches after merging, or the native editor may save stale content back.
        const ctx = hostWindow.SillyTavern?.getContext?.();
        mmLog('refreshCharacter', 'char', 'start', '', mmRuntime.activeOperation?.char?.began);
        try {
            await ctx?.getOneCharacter?.(avatarId);
            mmLog('refreshCharacter', 'char', 'card-refreshed', '', mmRuntime.activeOperation?.char?.began);
            if (ctx?.characters?.[ctx.characterId]?.avatar === avatarId) {
                mmLog('refreshCharacter', 'char', 'active-chat-refresh-start', '', mmRuntime.activeOperation?.char?.began);
                await ctx.selectCharacterById?.(ctx.characterId, { switchMenu: false });
                mmLog('refreshCharacter', 'char', 'active-chat-refreshed', '', mmRuntime.activeOperation?.char?.began);
            }
        } catch (error) { mmLog('refreshCharacter', 'char', 'failed-after-save', error, mmRuntime.activeOperation?.char?.began); }
        return { ...raw, data: check };
    }
    async function mmSelect(side, name, explicitId, forceFresh = false) {
        if (mmWriteLocked()) return false;
        const previousTarget = mmRuntime.target[side] && { ...mmRuntime.target[side] };
        mmInlineBusy(side,'read',true);
        const seq = ++mmRuntime.requestSeq[side];
        mmRuntime.loadedTarget[side] = null;
        const selectedPane = root.querySelector('#awmMian [data-mm-pane="' + side + '"]');
        if (selectedPane) { selectedPane.dataset.mmConnected = 'false'; selectedPane.querySelector('[data-mm-title]').title = '正在连接酒馆资料'; }
        mmRuntime.loadWaiters[side]?.reject(new Error('已切换读取目标'));
        mmRuntime.loadWaiters[side] = null;
        const began = Date.now();
        mmPersistCurrent(side);
        try {
            if (!(side === 'char' ? mmCharacterChoices().some(card => card.name === name) : mmNames(side).includes(name)))
                throw new Error('酒馆中找不到 ' + name);
            const id = (side === 'char' && /\.png$/i.test(explicitId || '') ? explicitId : side === 'user' && explicitId ? explicitId :
                side === 'user' ? mmPersonaIdentity(name) : await mmCharacterIdentity(name));
            const target = { kind: 'existing', name, id };
            const previousKey = previousTarget ? mmDraftKey(side, previousTarget) : '';
            const nextKey = mmDraftKey(side, target);
            if (forceFresh || (previousTarget && previousKey !== nextKey)) mmClearSideDraftCache(side);
            mmRuntime.target[side] = target;
            const drafts = mmNormalize(load()).mianmian.drafts[side];
            const saved = forceFresh ? null : (drafts[nextKey] ||
                (side === 'char' && mmNames('char').filter(value => value === name).length === 1 ? drafts['existing:' + name] : null));
            let card, avatarData = '';
            const source = await mmApi(side === 'char' ? 'getCharacter' : 'getPersona')(id);
            if (!source) throw new Error('酒馆未返回所选资料');
            if ((source.name && source.name !== name) || (side === 'user' && source.name !== name) ||
                (side === 'char' && source.avatar && source.avatar !== id) ||
                (side === 'user' && source.avatar_id !== id && source.avatar !== id))
                throw new Error('酒馆返回的资料与所选头像 ID 不一致');
            let cardData = source?.data?.data || source?.data || source || {};
            if (side === 'char') {
                const avatarId = id;
                const raw = await mmReadRawCharacter(avatarId);
                if(seq!==mmRuntime.requestSeq[side])return false;
                if (raw.data.name && raw.data.name !== name) throw new Error('原始角色卡与所选角色名称不一致');
                const typed = cardData;
                cardData = { ...raw.data, ...typed };
                if (!String(typed.description || '').trim()) cardData.description = raw.data.description || '';
                if (!Array.isArray(typed.first_messages) || !typed.first_messages.length || typed.first_messages.every(x => !String(x || '').trim()))
                    cardData.first_messages = [raw.data.first_mes || '', ...(raw.data.alternate_greetings || [])];
                // The helper's projected worldbook may be stale after an import or a chat switch.
                cardData.worldbook = raw.data.extensions?.world || raw.data.worldbook || '';
                cardData.first_mes = cardData.first_messages?.[0] || raw.data.first_mes || '';
                cardData.alternate_greetings = cardData.first_messages?.slice(1) || raw.data.alternate_greetings || [];
                mmRuntime.rawCards.char = raw;
            }
            const embedded = side === 'char' ? mmRuntime.rawCards.char?.data?.character_book : null;
            const hasEmbedded = embedded && (Array.isArray(embedded.entries) ? embedded.entries.length > 0 : embedded.entries && typeof embedded.entries === 'object' && Object.keys(embedded.entries).length > 0);
            let boundName = '';
            if (side === 'char') {
                try { boundName = mmApi('getCharWorldbookNames')(name)?.primary || ''; }
                catch (error) { mmLog('readBook',side,'binding-unavailable',error,began); }
            }
            const rawName = side === 'char' ? mmRuntime.rawCards.char?.data?.extensions?.world || mmRuntime.rawCards.char?.data?.worldbook || '' : '';
            const bookName = side === 'char'
                ? rawName || (hasEmbedded ? '' : boundName || mmBookName(side, source))
                : mmBookName(side, cardData) || mmBookName(side, source);
            if (side === 'char') mmLog('readBook',side,'source-names','',began,
                {bound:boundName,raw:rawName,helper:mmBookName(side,source),embedded:embedded?.name||'',selected:bookName});
            const standaloneBook = bookName && mmApi('getWorldbookNames')().includes(bookName);
            const book = standaloneBook ? await mmReadBook(bookName) : hasEmbedded ? mmReadEmbeddedBook(embedded, name) : bookName ? await mmReadBook(bookName) : { name: '', entries: [] };
            mmLog('readBook',side,standaloneBook?'tavern-worldbook':hasEmbedded?'embedded-character-card':bookName?'missing-linked-book':'no-book','',began,
                {name:book.name||bookName||'',entries:book.entries.length});
            if(seq!==mmRuntime.requestSeq[side])return false;
            mmLog('readFields', side, `description:${String(cardData.description||'').length};greetings:${(cardData.first_messages||[]).length};entries:${book.entries.length}`);
            const fromTavern = mmEditorCard(name, cardData, book);
            if (side === 'char') fromTavern.data._mmCharTags = mmNativeCharTags(id) ?? (Array.isArray(mmRuntime.rawCards.char?.data?.tags) ? [...mmRuntime.rawCards.char.data.tags] : []);
            let sourceAvatar = '';
            try { sourceAvatar = side === 'char' ? await mmApi('getCharAvatarPath')(id) : mmApi('getPersonaAvatarPath')(id); }
            catch (_) {}
            fromTavern.data.name = name;
            mmRuntime.loadedWorldbooks[side] = { name: book.name, entries: structuredClone(book.entries), failed: !!book._mmBookReadFailed, embedded: !!book._mmEmbedded };
            const savedName = String(saved?.card?.data?.name || '').trim();
            const savedHasBody = !!saved?.card?.data && savedName === name;
            card = savedHasBody ? saved.card : fromTavern;
            if (side === 'char' && !card.data._mmCharTagsDirty) card.data._mmCharTags = [...fromTavern.data._mmCharTags];
            mmRuntime.preserveWorldbookDraft[side] = savedHasBody;
            avatarData = savedHasBody ? saved.avatarData || sourceAvatar || '' : sourceAvatar || '';
            if (!card.data.name) card.data.name = name;
            if (seq !== mmRuntime.requestSeq[side]) return;
            const waiter = new Promise((resolve, reject) => {
                const timer = hostWindow.setTimeout(() => {
                    if (mmRuntime.loadWaiters[side]?.seq === seq) mmRuntime.loadWaiters[side] = null;
                    try { const snapshot=mmFrame(side)?.contentWindow?.__mmSnapshot?.();
                        if(snapshot?.card&&JSON.stringify(snapshot.card.data)===JSON.stringify(card.data)){resolve({name:card.data.name});return;}
                    }catch(_){}
                    reject(new Error('编辑器等待超过 30 秒，请稍后刷新这一栏'));
                }, 30000);
                mmRuntime.loadWaiters[side] = { seq,
                    resolve: value => { clearTimeout(timer); resolve(value); },
                    reject: error => { clearTimeout(timer); reject(error); } };
            });
            mmApplyData(side, target, card, avatarData);
            const receipt = await waiter;
            if (seq !== mmRuntime.requestSeq[side]) return false;
            mmRuntime.loadedTarget[side] = id;
            if (selectedPane) { selectedPane.dataset.mmConnected = 'true'; selectedPane.querySelector('[data-mm-title]').title = '已连接酒馆资料：' + id; }
            const sourceHasContent = ['description','personality','scenario','first_mes','mes_example','creator_notes'].some(k => !!String(fromTavern.data[k]||'').trim()) ||
                fromTavern.data.alternate_greetings.length > 0 || book.entries.length > 0;
            mmLog('read', side, book._mmBookReadFailed ? 'bookFailed' : sourceHasContent ? 'rendered' : 'sourceEmpty',
                book._mmBookReadFailed ? '关联世界书未读取成功' : sourceHasContent ? '' : '酒馆接口返回空设定、空开场白和空世界书', began);

            mmStatus(side,book._mmBookReadFailed?'正文已读取，世界书未读到，可稍后刷新':'',!!book._mmBookReadFailed);
            return !book._mmBookReadFailed;
        } catch (err) { if (seq === mmRuntime.requestSeq[side]) {
            const pane = root.querySelector('#awmMian [data-mm-pane="' + side + '"]');
            if (pane) { pane.querySelector('[data-mm-title]').textContent = (side === 'char' ? 'CHAR' : 'User') + ' · 读取失败'; pane.querySelector('[data-mm-title]').title = '尚未连接酒馆资料'; }
            mmLog('read', side, 'failed', err, began);
            mmStatus(side,'读取未完成：' + err.message, true);
            return false;
        } } finally { if (seq === mmRuntime.requestSeq[side]) mmInlineBusy(side,'read',false); }
    }
    function mmNew(side, name) {
        const clean = String(name || '').trim();
        if (!clean || clean === 'current') return toast('请输入有效名称', 'warning');
        if (mmNames(side).includes(clean)) return toast('酒馆已有同名项目，请在搜索框选择', 'warning');
        mmPersistCurrent(side);
        ++mmRuntime.requestSeq[side];
        const target = { kind: 'new', name: clean, id: clean };
        mmRuntime.rawCards[side] = null;
        mmRuntime.loadedTarget[side] = null;
        mmRuntime.loadedWorldbooks[side] = null;
        mmRuntime.preserveWorldbookDraft[side] = false;
        const saved = mmNormalize(load()).mianmian.drafts[side][mmDraftKey(side, target)];
        mmApplyData(side, target, saved?.card || mmEditorCard(clean, {}, null), saved?.avatarData || '');
        if (!saved) {
            if (mmRuntime.ready[side]) mmPost(side, { action: 'templateNew', name: clean });
            else mmRuntime.pendingTemplate = { side, name: clean };
        }
        toast('已建立面面模板稿；尚未写入酒馆', 'success');
    }
    function mmOpenConfirm(title, detail, action, confirmLabel = '确认写入') {
        const box = root.getElementById('awmMianConfirm');
        if (!box) return;
        box.querySelector('[data-mm-confirm-title]').textContent = title;
        box.querySelector('[data-mm-confirm-detail]').textContent = detail;
        box.style.display = 'flex';
        const ok = box.querySelector('[data-mm-confirm-ok]');
        const cancel = box.querySelector('[data-mm-confirm-cancel]');
        ok.textContent = confirmLabel;
        cancel.onclick = () => {
            box.style.display = 'none';
            const side = ['char','user'].find(s => mmRuntime.activeOperation[s]);
            if (side) { const operation = mmRuntime.activeOperation[side]; mmLog('overwrite', side, 'cancelled'); mmEndOperation(side, operation); }
            mmRuntime.pendingWrite?.(); mmRuntime.pendingWrite = null;
        };
        ok.onclick = async () => {
            if (ok.disabled) return;
            ok.disabled = true; const label = ok.textContent; ok.textContent = '……';
            try { await action(); box.style.display = 'none'; }
            catch (err) { toast('写入或核对未完成：' + err.message, 'error'); }
            finally { ok.disabled = false; ok.textContent = label; mmRuntime.pendingWrite?.(); mmRuntime.pendingWrite = null; }
        };
    }
    async function mmStoreBook(side, book, target, oldBookName) {
        let name = String(book.name || (book.entries?.length ? target.name+' 世界书' : '')).trim();
        if (!name) return '';
        if (book._mmBookReadFailed) throw new Error('世界书读取失败，不能覆盖');
        const known = mmApi('getWorldbookNames')();
        let exists = known.includes(name);
        if (exists && name !== oldBookName && !mmRuntime.bookClaims.has(side+':'+target.id+':'+name)) {
            const original = mmRuntime.loadedWorldbooks[side];
            if (original?.embedded && original.name === name) {
                const previous = await mmApi('getWorldbook')(name);
                const same = Array.isArray(previous) && previous.length === original.entries.length &&
                    previous.every((entry,i) => entry.name === original.entries[i].comment &&
                        String(entry.content||'').replace(/\r\n?/g,'\n') === String(original.entries[i].content||'').replace(/\r\n?/g,'\n'));
                if (!same) {
                    const base = name; let number = 2;
                    while (known.includes(name)) name = base+' ('+(number++)+')';
                    book.name = name; exists = false;
                    mmLog('writeBook',side,'import-name-collision','',mmRuntime.activeOperation[side]?.began,{original:base,created:name});
                }
            } else throw new Error('世界书名称与其他世界书重名，请修改名称');
        }
        const native=await import('/scripts/world-info.js');
        if(typeof native.createWorldInfoEntry!=='function'||typeof native.saveWorldInfo!=='function')
            throw Error('酒馆原生世界书接口不可用，未覆盖');
        const edits=book.entries||[];
        const live=exists?await (await mmSettingsFetch('/api/worldinfo/get',{name})).json():{entries:{}};
        if(!live.entries||Array.isArray(live.entries)||typeof live.entries!=='object')throw Error('世界书原始数据无法读取，未覆盖');
        const before=structuredClone(live.entries),written=[];
        const snapshot=mmRuntime.loadedWorldbooks[side];
        const knownUids=new Set((snapshot?.name===name?snapshot.entries:[]).map(e=>e._mmRaw?.uid).filter(Number.isInteger));
        const retained=new Set();
        for(const e of edits){
            const uid=e._mmRaw?.uid ?? (/^wb_\d+$/.test(String(e.id))?Number(String(e.id).slice(3)):null);
            let entry;
            if(uid!==null){
                entry=live.entries[uid];
                if(!entry)throw Error('世界书条目已在酒馆删除，请重新读取后再保存');
                if(retained.has(uid))throw Error('世界书条目 ID 重复，未覆盖');
            }else{
                entry=native.createWorldInfoEntry(name,live);
                if(!entry)throw Error('世界书默认条目创建失败');
                entry.comment=String(e.comment||'');
            }
            entry.content=String(e.content||'');entry.key=Array.isArray(e.keys)?e.keys:[];
            retained.add(entry.uid);written.push(entry.uid);
        }
        for(const uid of knownUids)if(!retained.has(uid))delete live.entries[uid];
        if(!exists){const created=await mmApi('createWorldbook')(name,[]);if(!created)throw Error('世界书未创建成功：'+name);}
        await native.saveWorldInfo(name,live,true);
        mmRuntime.bookClaims.add(side+':'+target.id+':'+name);
        const check=await (await mmSettingsFetch('/api/worldinfo/get',{name})).json();
        const norm=v=>String(v||'').replace(/\r\n?/g,'\n');
        if(edits.some((e,i)=>{const a=check.entries?.[written[i]];return !a||norm(a.content)!==norm(e.content)||JSON.stringify(a.key||[])!==JSON.stringify(e.keys||[]);}))
            throw Error('世界书写入回读不一致：'+name);
        for(const [uid,original] of Object.entries(before)){
            const a=check.entries?.[uid];if(!a)continue;
            const metadata=e=>({...e,content:undefined,key:undefined});
            if(JSON.stringify(metadata(a))!==JSON.stringify(metadata(original)))throw Error('世界书原条目参数核对不一致：'+uid);
        }
        const actual=await mmApi('getWorldbook')(name);
        book.name=name;
        edits.forEach((e,i)=>{e._mmRaw=structuredClone(actual.find(a=>a.uid===written[i]));});
        mmRuntime.loadedWorldbooks[side] = {name,entries:structuredClone(book.entries||[]),failed:false,embedded:false};
        mmLog('writeBook',side,'verified',null,null,{name,count:actual.length,uids:actual.map(e=>e.uid)});
        return name;
    }
    function mmBoundCharBook(target, raw) {
        const linked = raw?.data?.extensions?.world || raw?.data?.worldbook || '';
        if (linked) return linked;
        try { return mmApi('getCharWorldbookNames')(target.name)?.primary || ''; }
        catch (error) {
            mmLog('bindWorldbook','char','helper-unavailable',error);
            return '';
        }
    }
    async function mmEnsureCharBookLink(target, name, raw) {
        let card = raw || await mmReadRawCharacter(target.id);
        if (card.data.extensions?.world !== name || card.data.worldbook !== name) {
            mmLog('bindWorldbook','char','card-link-start','',mmRuntime.activeOperation.char?.began,{name});
            await mmRawFetch('/api/characters/merge-attributes',JSON.stringify({
                avatar:target.id,data:{worldbook:name,extensions:{...(card.data.extensions||{}),world:name}}
            }));
            card = await mmReadRawCharacter(target.id);
        }
        if (card.data.extensions?.world !== name && card.data.worldbook !== name)
            throw new Error('角色卡世界书关联未写入：'+name);
        mmLog('bindWorldbook','char','verified','',mmRuntime.activeOperation.char?.began,
            {name,cardWorldbook:card.data.worldbook||'',cardExtensionWorld:card.data.extensions?.world||''});
        return card;
    }
    async function mmConfirmPersona(id, expected) {
        const ctx=hostWindow.SillyTavern?.getContext?.();
        if(typeof ctx?.saveSettingsDebounced?.flush==='function')await ctx.saveSettingsDebounced.flush();
        const end=Date.now()+15000;let pause=300;
        while(true){
            const saved=await mmBackupServerSettings(),descriptor=saved.power_user?.persona_descriptions?.[id];
            if(descriptor && Object.entries(expected).every(([key,value])=>descriptor[key]===value))break;
            if(Date.now()>=end)throw Error('User 人设尚未通过服务器保存核验，编辑稿已保留');
            await new Promise(r=>hostWindow.setTimeout(r,pause));pause=Math.min(2000,pause*2);
        }
        if(mmApi('getCurrentPersonaId')()===id){
            const field=root.getElementById('persona_description');
            if(field && expected.description!==undefined)field.value=expected.description;
            // Native helper refreshes the avatar list, but not this description control.
            try{const native=await import('/scripts/personas.js');if(native.user_avatar===id)native.setPersonaDescription();}
            catch(error){mmLog('writePersona','user','native-ui-refresh-unavailable',error.message);}
        }
    }
    async function mmWriteBookOnly(side, message, target) {
        const book=message.card.data.character_book;
        let oldName='';
        if (side==='char') {
            const raw=await mmReadRawCharacter(target.id);
            oldName=mmBoundCharBook(target,raw);
        } else oldName=mmApi('getPersona')(target.id)?.lorebook || '';
        const name=await mmStoreBook(side,book,target,oldName);
        if (!name) throw new Error('没有可写入的世界书');
        if (side==='char') {
            mmRuntime.rawCards.char=await mmEnsureCharBookLink(target,name);
        } else {
            await mmApi('updatePersonaWith')(target.id,p=>({...p,lorebook:name}),{render:'none'});
            await mmConfirmPersona(target.id,{lorebook:name});
            if (mmApi('getPersona')(target.id)?.lorebook!==name) throw new Error('User 世界书关联未保存');
        }
        mmFrame(side)?.contentWindow?.__mmBookSaved?.(book);
        mmLog('bindWorldbook',side,'verified',null,null,{name});
    }
    async function mmWrite(side, message, target) {
        const began = mmRuntime.activeOperation?.[side]?.began || Date.now();
        mmLog('write', side, 'precheck', '', began);
        const data = message.card?.data;
        if (!data || !target) throw new Error('编辑内容或目标为空');
        const isChar = side === 'char';
        const editedName = String(data.name || '').trim();
        if (editedName !== target.name) throw new Error('编辑器名称与所选目标不一致，请重新选择或新建');
        const name = target.name;
        if (!name || name === 'current') throw new Error('目标名称无效');
        const book = data.character_book || { name:'', entries:[] };
        let bookName = String(book.name || (book.entries?.length ? name+' 世界书' : '')).trim();
        if (book._mmBookReadFailed || (mmRuntime.loadedWorldbooks[side]?.failed && mmRuntime.loadedWorldbooks[side]?.name === bookName))
            throw new Error('关联世界书读取失败，请先重新读取，不能覆盖');
        const existingRaw = isChar && target.kind === 'existing' ? await mmReadRawCharacter(target.id) : null;
        const existing = target.kind === 'existing'
            ? (isChar ? { ...existingRaw.data, avatar: existingRaw.avatarId,
                worldbook: existingRaw.data.worldbook || existingRaw.data.extensions?.world || null }
                : await mmApi('getPersona')(target.id)) : null;
        mmLog(isChar ? 'writeCharacter' : 'writePersona', side, existing ? 'live-read' : 'new-target', '', began);
        if (!isChar && existing && existing.avatar_id !== target.id && existing.avatar !== target.id)
            throw new Error('User 头像 ID 与所选资料不一致，已停止覆盖');
        if (target.kind === 'existing' && !existing) throw new Error('酒馆中找不到所选资料');
        if (target.kind === 'existing' && mmRuntime.loadedTarget[side] !== target.id)
            throw new Error('请先重新选择并成功读取该资料，再覆盖酒馆原资料');
        if (target.kind === 'existing' && (!isChar || existing.name) && existing.name !== target.name)
            throw new Error('酒馆返回的资料名称与所选目标不同，已停止覆盖');
        if (isChar && target.kind === 'existing' && mmRuntime.rawCards.char?.avatarId !== target.id)
            throw new Error('原始角色卡头像 ID 与所选目标不同，已停止覆盖');
        if (isChar && target.kind === 'existing' && !mmRuntime.rawCards.char?.data)
            throw new Error('完整原始角色卡尚未读取，已阻止覆盖');
        const oldBookName = existing ? (isChar ? mmBoundCharBook(target,existingRaw) : mmBookName(side,existing)) : '';
        const embeddedSource = isChar && mmRuntime.loadedWorldbooks.char?.embedded;
        const avatar = String(message.avatarData || '');
        let avatarBlob = null;
        if (avatar.startsWith('data:image/')) avatarBlob = await (await fetch(avatar)).blob();
        const textFields = ['description','personality','scenario','mes_example','creator_notes','system_prompt','post_history_instructions'];
        const applyChar = current => {
            for (const key of textFields) current[key] = String(data[key] || '');
            const greetings = [String(data.first_mes || ''), ...(Array.isArray(data.alternate_greetings) ? data.alternate_greetings.map(String) : [])];
            current.first_messages = greetings.length === 1 && !greetings[0] ? [] : greetings;
            current.worldbook = bookName || null;
            if (avatarBlob) current.avatar = avatarBlob;
            return current;
        };
        const applyUser = current => {
            current.description = String(data.description || '');
            current.lorebook = bookName;
            if (avatarBlob) current.avatar = avatarBlob;
            return current;
        };
        if(!isChar && target.kind==='existing'){
            await mmApi('updatePersonaWith')(target.id,current=>({...current,description:String(data.description||'')}),{render:'none'});
            await mmConfirmPersona(target.id,{description:String(data.description||'')});
        }
        bookName = await mmStoreBook(side, book, target, oldBookName);
        if (target.kind === 'new') {
            if (mmNames(side).includes(name)) throw new Error('酒馆中已存在同名资料');
            const created = await mmApi(isChar ? 'createCharacter' : 'createPersona')(name, isChar ? applyChar({}) : applyUser({}));
            if (!created) throw new Error('酒馆没有确认创建成功');
        } else if (!isChar) {
            mmLog('writePersona', side, 'patch-start', '', began);
            await mmApi('updatePersonaWith')(target.id, applyUser, { render:'none' });
            await mmConfirmPersona(target.id,{description:String(data.description||''),lorebook:bookName});
            mmLog('writePersona', side, 'patch-done', '', began);
        }
        let writeTargetId = target.id, writtenRawCharacter = null;
        if (isChar) {
            const avatarId = target.kind === 'existing' ? target.id : await mmCharacterIdentity(name);
            writeTargetId = avatarId;
            mmLog('writeCharacter', side, 'patch-start', '', began);
            writtenRawCharacter = await mmWriteRawCharacter(avatarId, {
                ...data, tags: Array.isArray(data._mmCharTags) ? data._mmCharTags : undefined, first_mes: String(data.first_mes || ''),
                alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings : []
            }, name, bookName, embeddedSource ? book : null, existingRaw);
            if (bookName) {
                mmLog('bindWorldbook', side, 'begin', '', began);
                const linked=await mmEnsureCharBookLink({id:avatarId,name},bookName,writtenRawCharacter);
                writtenRawCharacter=linked;
            }
        }
        // Verify core fields immediately. If an API rejects extra character fields, report it.
        mmLog(isChar ? 'writeCharacter' : 'writePersona', side, 'saved', '', began);
        mmLog(isChar ? 'verifyCharacter' : 'verifyPersona', side, 'start', '', began);
        const newId = target.kind === 'new' && !isChar ? mmPersonaIdentity(name) : writeTargetId;
        if(!isChar && target.kind==='new')await mmConfirmPersona(newId,{description:String(data.description||''),lorebook:bookName});
        const after = isChar ? null : await mmApi('getPersona')(newId);
        mmLog(isChar ? 'verifyCharacter' : 'verifyPersona', side, 'readback', '', began);
        const expected = isChar ? applyChar({}) : applyUser({});
        const keys = isChar ? ['description','creator_notes','first_messages','worldbook'] : ['description','lorebook'];
        const rawAfter = isChar ? writtenRawCharacter.data : null;
        const actual = isChar ? { ...after, description: rawAfter.description, creator_notes: rawAfter.creator_notes,
            first_messages: (rawAfter.first_mes || (rawAfter.alternate_greetings || []).length)
                ? [rawAfter.first_mes || '', ...(rawAfter.alternate_greetings || [])] : [],
            worldbook: rawAfter.worldbook || rawAfter.extensions?.world || after?.worldbook || null } : after;
        const mismatch = keys.filter(k => JSON.stringify(actual?.[k] ?? (k === 'worldbook' ? null : '')) !== JSON.stringify(expected[k]));
        if (mismatch.length) throw new Error('酒馆未保存这些字段：' + mismatch.join('、') + '；请核对酒馆原资料');
        mmLog(isChar ? 'verifyCharacter' : 'verifyPersona', side, 'verified', '', began);
        mmFrame(side)?.contentWindow?.__mmBookSaved?.(book);
        if (side === 'char') mmSaveNativeCharTags(newId, Array.isArray(data._mmCharTags) ? data._mmCharTags : []);
        if (side === 'user') {
            const id = newId;
            mmSavePersonaTags(id, Array.isArray(message.userTags) ? message.userTags : data._mmUserTags || []);
        }
        if (target.kind === 'new') {
            const value = mmNormalize(load()), oldKey = mmDraftKey(side, target);
            const nextTarget = { kind:'existing', name, id:newId };
            const draft = value.mianmian.drafts[side][oldKey];
            delete value.mianmian.drafts[side][oldKey];
            if (draft) value.mianmian.drafts[side][mmDraftKey(side,nextTarget)] = { ...draft,target:nextTarget };
            value.mianmian.active[side] = mmDraftKey(side,nextTarget);
            mmWriteData(value); mmRuntime.target[side] = nextTarget;
            mmRuntime.loadedTarget[side] = newId;
        }
        mmLog('write', side, 'verified', '', began);
        toast(target.kind === 'new' ? '已在酒馆新建并核对' : '已覆盖并核对酒馆资料','success');
    }
    function mmStatus(side, text, failed = false) {
        clearTimeout(mmRuntime.statusTimers[side]);
        mmRuntime.status[side] = {text, failed};
        const doc = mmFrame(side)?.contentDocument;
        let el = doc?.getElementById('mmOperationStatus');
        if (!el && doc?.querySelector('.mm-title-status-row')) {
            el = doc.createElement('div'); el.id = 'mmOperationStatus';
            el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
            el.style.cssText = 'font-size:11px;line-height:1.35;text-align:right;overflow-wrap:anywhere';
            doc.querySelector('.mm-title-status-row').appendChild(el);
        }
        if (el) { el.textContent = text; el.style.color = failed ? '#b94040' : 'inherit'; }
        if (text && text !== '……' && !text.startsWith('等待酒馆回执')) {
            const status = mmRuntime.status[side];
            mmRuntime.statusTimers[side] = hostWindow.setTimeout(() => {
                if (mmRuntime.status[side] !== status) return;
                mmRuntime.status[side] = null;
                mmFrame(side)?.contentDocument?.getElementById('mmOperationStatus')?.replaceChildren();
            },60000);
        }
    }
    function mmWriteLocked() { return ['char','user'].some(s => mmRuntime.activeOperation[s]); }
    async function mmRunWrite(side, message, bookOnly = false) {
        if (mmWriteLocked()) return;
        const target = mmRuntime.target[side] && {...mmRuntime.target[side]};
        if (!target || target.kind === 'placeholder' || !message?.card) {
            mmInlineBusy(side,'overwrite',false);
            mmStatus(side,'请先选择酒馆资料或新建',true); return;
        }
        if (target.kind === 'existing' && mmRuntime.loadedTarget[side] !== target.id) {
            mmInlineBusy(side,'overwrite',false); mmStatus(side,'尚未连接此资料，请重新选择',true); return;
        }
        const operation = mmBeginOperation(side, target, bookOnly ? 'add-world-entry' : 'overwrite');
        const snapshot = structuredClone(message);
        mmDraftSave(side, snapshot, true);
        mmLog(operation.kind,side,'button-clicked');
        mmInlineBusy(side,'overwrite',true);
        mmStatus(side,'……');
        root.querySelectorAll('#'+PANEL_ID+' .awm-tab').forEach(el=>el.disabled=true);
        const slow = setTimeout(()=>{mmStatus(side,'等待酒馆回执，编辑稿已保留');mmLog('write',side,'waiting',null,operation.began)},8000);
        try {
            if (bookOnly) await mmWriteBookOnly(side,snapshot,target);
            else await mmWrite(side,snapshot,target);
            if (side === 'char' && !bookOnly) {
                snapshot.card.data._mmCharTagsDirty = false;
                mmFrame(side)?.contentWindow?.__mmTagsSaved?.();
            }
            mmDraftSave(side,snapshot,true,target);
            mmStatus(side,(bookOnly?'世界书已写入':'已覆盖')+' · '+target.name);
        } catch(error) {
            mmLog('write',side,'failed',error,operation.began);
            mmStatus(side,'未完成：'+error.message,true);
            toast('写入未完成：'+error.message,'error');
        } finally {
            clearTimeout(slow); mmInlineBusy(side,'overwrite',false); mmEndOperation(side,operation);
            root.querySelectorAll('#'+PANEL_ID+' .awm-tab').forEach(el=>el.disabled=false);
        }
    }
    function mmHandleWrite(side,message) { return mmRunWrite(side,message); }
    function mmOnMessage(event) {
        const msg = event.data;
        if (!msg || msg.source !== 'mianmian-editor') return;
        const side = Object.keys(mmRuntime.frames).find(s => mmRuntime.frames[s]?.contentWindow === event.source);
        if (!side) return;
        if (msg.action === 'ready') {
            mmRuntime.ready[side] = true;
            if (mmRuntime.status[side]) mmStatus(side,mmRuntime.status[side].text,mmRuntime.status[side].failed);
            mmPost(side, { action: 'collectionLoad', collection: mmNormalize(load()).mianmian.collections[side] });
            if (mmRuntime.pendingLoad[side]) {
                const pending = mmRuntime.pendingLoad[side];
                mmRuntime.pendingLoad[side] = null;
                mmApplyData(side, pending.target, pending.card, pending.avatarData);
            }
            if (mmRuntime.pendingTemplate?.side === side) {
                const name = mmRuntime.pendingTemplate.name;
                mmRuntime.pendingTemplate = null;
                mmPost(side, { action: 'templateNew', name });
            }
        } else if (msg.action === 'inlineAction') {
            if(side==='user'&&msg.command==='importUserCard')mmImportUserCard();
            if(side==='user'&&msg.command==='exportUserCard')mmExportUserCard();
            if(side==='user'&&msg.command==='convertUserCard')mmConvertUserCard();
            if (msg.command === 'new') root.querySelector('#awmMian [data-mm-pane="'+side+'"] [data-mm-new]')?.click();
            if (msg.command === 'save') root.querySelector('#awmMian [data-mm-pane="'+side+'"] [data-mm-save]')?.click();
            if (msg.command === 'overwrite') mmHandleWrite(side, mmFrame(side)?.contentWindow?.__mmSnapshot?.());
        }
        else if (msg.action === 'saveDraft') mmDraftSave(side, msg);
        else if (msg.action === 'draftChanged') mmDebounceDraft(side, msg);
        else if (msg.action === 'collectionChanged') {
            const value = mmNormalize(load());
            value.mianmian.collections[side] = msg.collection;
            try { mmWriteData(value); } catch (err) { toast('合集保存失败：' + err.message, 'error'); }
        }
        else if (msg.action === 'overwriteClick') mmLog('overwrite', side, 'editor-request');
        else if (msg.action === 'bookAdded') mmRunWrite(side, msg, true);
        else if (msg.action === 'editorError') mmLog('editor',side,'failed',msg.error);
        else if (msg.action === 'overwrite') mmHandleWrite(side, msg);
        else if (msg.action === 'loaded') {
            const target = mmRuntime.target[side];
            if (target?.name && msg.receipt?.name && msg.receipt.name !== target.name) { mmLog('render',side,'stale-receipt'); return; }
            // Keep the original worldbook snapshot for the next overwrite comparison.
        }
        else if (msg.action === 'focus') mmSetActive(side);
    }
    function mmSetActive(side) {
        if (mmRuntime.active !== side) {
            try { mmFrame(mmRuntime.active)?.contentWindow?.__mmBrushClear?.(); } catch (_) {}
            root.querySelector('#awmMian [data-mm-brush]')?.classList.remove('active');
        }
        mmRuntime.active = side;
        const host = root.getElementById('awmMian');
        if (!host) return;
        host.dataset.active = side;
        host.querySelectorAll('[data-mm-pane]').forEach(p => p.classList.toggle('awm-mm-active', p.dataset.mmPane === side));
        mmRenderPendingTags();
        awmSyncNav();
    }
    const mmPendingEditors = { char: null, user: null };
    const mmDismissedTags = new WeakMap();
    function mmUnclosedTags(value) {
        const stack = [];
        const tags = /<\/?([^\s<>/]+)(?:\s[^<>]*?)?\s*\/?>/g;
        const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
        for (const match of String(value || '').matchAll(tags)) {
            const full = match[0], name = match[1];
            if (full.startsWith('</')) {
                const index = stack.findLastIndex(item => item.name === name);
                if (index >= 0) stack.splice(index, 1);
            } else if (!full.endsWith('/>') && !voidTags.has(name.toLowerCase())) {
                stack.push({ name, at: match.index });
            }
        }
        return stack;
    }
    function mmRenderPendingTags() {
        const host = root.getElementById('awmMian');
        const box = host?.querySelector('[data-mm-pending-tags]');
        if (!box) return;
        const state = mmPendingEditors[mmRuntime.active];
        box.replaceChildren();
        if (!state?.editor?.isConnected) return;
        const hidden = mmDismissedTags.get(state.editor) || new Set();
        for (const item of mmUnclosedTags(state.editor.value)) {
            const key = item.name + ':' + item.at;
            if (hidden.has(key)) continue;
            const button = root.createElement('button');
            button.type = 'button'; button.className = 'awm-btn';
            button.textContent = '</' + item.name + '>';
            button.title = '点击插入；双击从工具栏隐藏';
            let timer = null;
            button.addEventListener('click', event => {
                if (event.detail > 1) { clearTimeout(timer); return; }
                if (event.detail === 0) { mmInsertPendingTag(state, button.textContent); return; }
                timer = setTimeout(() => mmInsertPendingTag(state, button.textContent), 450);
            });
            button.addEventListener('dblclick', event => {
                event.preventDefault();
                clearTimeout(timer);
                hidden.add(key); mmDismissedTags.set(state.editor, hidden);
                button.remove();
            });
            box.appendChild(button);
        }
    }
    function mmInsertPendingTag(state, tag) {
        const editor = state.editor;
        if (!editor?.isConnected) return;
        const start = Math.min(state.start ?? editor.value.length, editor.value.length);
        const end = Math.min(state.end ?? start, editor.value.length);
        editor.focus(); editor.setRangeText(tag, start, end, 'end');
        state.start = state.end = start + tag.length;
        editor.dispatchEvent(new editor.ownerDocument.defaultView.Event('input', { bubbles: true }));
        mmRenderPendingTags();
    }
    function mmTrackPendingTags(side, frame) {
        const doc = frame.contentDocument;
        if (!doc) return;
        const capture = editor => {
            if (!editor?.matches?.('textarea')) return;
            const previous = mmPendingEditors[side];
            mmPendingEditors[side] = { editor, start: editor.selectionStart, end: editor.selectionEnd };
            if (previous?.editor !== editor) mmSetActive(side);
            else if (mmRuntime.active === side) mmRenderPendingTags();
        };
        for(const type of ['pointerdown','keydown','input','wheel','touchmove','scroll'])doc.addEventListener(type,mmBackupActivity,{capture:true,passive:true});
        for (const type of ['focusin','input','keyup','mouseup'])
            doc.addEventListener(type, event => capture(event.target), true);
        doc.addEventListener('selectionchange', () => capture(doc.activeElement));
    }
    function mmRefreshList(side) {
        const input = root.querySelector('#awmMian [data-mm-search="' + side + '"]');
        const list = root.querySelector('#awmMian [data-mm-list="' + side + '"]');
        if (!input || !list) return;
        try {
            list.replaceChildren();
            mmNames(side).forEach(name => {
                const option = root.createElement('option'); option.value = name; list.appendChild(option);
            });
        } catch (err) { toast('读取列表失败：' + err.message, 'warning'); }
    }
    function mmInlineBusy(side,command,busy) {
        const win=mmFrame(side)?.contentWindow; const button=win?.document?.querySelector('[data-mm-inline="'+command+'"]');
        if(button)button.textContent=busy?'……':({save:'保存',overwrite:'覆盖',new:'新建',convertUserCard:'转卡',importUserCard:'导入',exportUserCard:'导出'})[command];
        if(command==='read') {
            const search=root.querySelector('#awmMian [data-mm-search="'+side+'"]');
            if(search){search.placeholder=busy?'……':'搜索酒馆资料';search.disabled=busy;}
        }
        win?.__mmBusy?.(busy);
        const pane = root.querySelector('#awmMian [data-mm-pane="'+side+'"]');
        pane?.querySelectorAll('[data-mm-search],[data-mm-picker]').forEach(el=>el.disabled=busy);
    }
    function mmCurrentTarget(side) {
        const ctx = hostWindow.SillyTavern?.getContext?.() || {};
        if (side === 'char') {
            const index = ctx.characterId ?? ctx.character_id ?? hostWindow.this_chid;
            const c = !ctx.groupId && index !== undefined && index !== null && index !== '' ?
                (ctx.characters || hostWindow.characters || [])[index] : null;
            return c?.avatar ? {kind:'existing',id:c.avatar,name:c.name} : null;
        }
        let id;
        try { id = mmApi('getCurrentPersonaId')(); }
        catch (_) { id = ctx.user_avatar || hostWindow.user_avatar || ''; }
        if (!id) return null;
        try { const p = mmApi('getPersona')(id); return p ? {kind:'existing',id,name:p.name} : null; } catch (_) { return null; }
    }
    function mmSetupPane(side) {
        const pane = root.querySelector('#awmMian [data-mm-pane="' + side + '"]');
        if (!pane) return;
        const frame = pane.querySelector('iframe');
        mmRuntime.frames[side] = frame;
        frame.addEventListener('load', () => {
            try {
                const theme = hostWindow.getComputedStyle(root.documentElement);
                const body = frame.contentDocument?.body;
                if (body) {
                    for (const [prop, cssVar] of Object.entries({
                        '--bg': '--SmartThemeBlurTintColor', '--panel': '--SmartThemeBlurTintColor',
                        '--ink': '--SmartThemeBodyColor', '--line': '--SmartThemeBorderColor',
                        '--soft': '--SmartThemeQuoteColor', '--accent': '--SmartThemeBodyColor'
                    })) {
                        const value = theme.getPropertyValue(cssVar).trim();
                        if (value) body.style.setProperty(prop, value);
                    }
                }
            } catch (_) {}
        });
        frame.addEventListener('load', () => {mmBindExpandFields(side, frame);mmTrackPendingTags(side, frame);awmFixContrast();});
        frame.srcdoc = side === 'char' ? MM_EDITOR_HTML : MM_USER_HTML;
        const input = pane.querySelector('[data-mm-search]');
        const picker = pane.querySelector('[data-mm-picker]');
        const choices = pane.querySelector('[data-mm-choices]');
        const newButton = pane.querySelector('[data-mm-new]');
        let creating = false;
        const hideChoices = () => { choices.hidden = true; };
        const currentId = () => mmCurrentTarget(side)?.id || '';
        const drawChoices = () => {
            if (creating) return hideChoices();
            choices.replaceChildren();
            try {
                const all = side === 'char'
                    ? mmCharacterChoices()
                    : mmApi('getPersonaIds')().map(id => ({ id, name: mmApi('getPersona')(id)?.name || '' }));
                const activeId = currentId();
                const activeName = mmCurrentTarget(side)?.name || '';
                all.sort((a,b) => Number(b.id === activeId || (!b.id && b.name === activeName)) -
                    Number(a.id === activeId || (!a.id && a.name === activeName)));
                const matches = all.filter(x => x.name.toLowerCase().includes(input.value.trim().toLowerCase()));
                for (const entry of matches) {
                    const item = root.createElement('button');
                    item.type = 'button'; item.className = 'awm-mm-choice';
                    item.textContent = entry.name + (all.filter(x => x.name === entry.name).length > 1 ? ' · ' + entry.id : '');
                    item.onclick = () => { input.value = ''; hideChoices(); mmSelect(side, entry.name, entry.id || undefined); };
                    choices.appendChild(item);
                }
                if (!matches.length) choices.textContent = !all.length && side === 'char' ? '正在读取酒馆角色列表…' : '没有匹配的酒馆资料';
                choices.hidden = false;
            } catch (err) { hideChoices(); toast('读取列表失败：' + err.message, 'warning'); }
        };
        picker.onclick = () => { mmSetActive(side); choices.hidden ? drawChoices() : hideChoices(); };
        input.onfocus = () => { mmSetActive(side); if (!creating) drawChoices(); };
        input.oninput = drawChoices;
        input.onkeydown = e => { if (e.key === 'Enter') {
            e.preventDefault();
            if ((side === 'char' ? mmCharacterChoices().some(card=>card.name===input.value.trim()) : mmNames(side).includes(input.value.trim()))) {
                const name = input.value.trim(); input.value = ''; hideChoices(); mmSelect(side, name);
            }
        } };
        input.onchange = () => { if (!creating && (side === 'char' ? mmCharacterChoices().some(card=>card.name===input.value.trim()) : mmNames(side).includes(input.value.trim()))) {
            const name = input.value.trim(); input.value = ''; hideChoices(); mmSelect(side, name);
        } };
        pane.querySelector('[data-mm-refresh]').onclick = () => {
            const target = mmRuntime.target[side];
            if (!target || target.kind !== 'existing') return toast('当前没有可刷新的酒馆资料', 'warning');
            mmOpenConfirm(
                '重新读取' + (side === 'char' ? ' CHAR' : ' User'),
                '将丢弃鱼板面里当前这一栏尚未覆盖到酒馆的临时编辑，并重新读取酒馆中的最新资料' + (side === 'char' ? '与当前绑定世界书。' : '。') + '不会修改或清空酒馆本体。',
                () => mmSelect(side, target.name, target.id, true),
                '确认刷新'
            );
        };
        pane.querySelector('[data-mm-save]').onclick = () => {
            const button = pane.querySelector('[data-mm-save]'); button.disabled = true; mmInlineBusy(side,'save',true);
            const snapshot = mmFrame(side)?.contentWindow?.__mmSnapshot?.();
            const ok = mmDraftSave(side, snapshot, false);
            setTimeout(() => { button.disabled = false; mmInlineBusy(side,'save',false); }, 250);
        };
        pane.querySelector('[data-mm-overwrite]').onclick = () => mmHandleWrite(side, frame.contentWindow?.__mmSnapshot?.());
        newButton.onclick = async () => {
            const win = mmFrame(side)?.contentWindow;
            if (!creating) { creating = true; hideChoices(); win?.__mmStartNew?.(); return; }
            const name = win?.__mmNewName?.() || '';
            if (!name) { win?.document?.getElementById('nameInput')?.focus(); return; }
            newButton.disabled = true; mmInlineBusy(side,'new',true); const began = Date.now();
            let createdInTavern = false;
            try {
                if (mmNames(side).includes(name)) throw new Error('酒馆里已存在同名资料');
                const template = win?.__mmTemplate?.(name);
                if (!template?.data?.description) throw new Error('内置模板没有加载，已停止新建');
                const created = side === 'char'
                    ? await mmApi('createCharacter')(name, { description: template.data.description, creator_notes: '', first_messages: [''] })
                    : await mmApi('createPersona')(name, { description: template.data.description });
                if (!created) throw new Error('酒馆未确认创建成功');
                createdInTavern = true; mmLog('create', side, 'success', '', began);

                if (!root.contains(pane)) return;
                creating = false; input.value = '';
                const createdId = side === 'char' ? await mmCharacterIdentity(name) : mmPersonaIdentity(name);
                if (!(await mmSelect(side, name, createdId))) throw new Error('资料已在酒馆创建，但编辑器尚未完成读取');
            } catch (err) { mmLog('create', side, 'failed', err, began); toast((createdInTavern ? '已创建，但后续读取失败：' : '新建失败：') + err.message, 'error'); }
            finally { newButton.disabled = false; mmInlineBusy(side,'new',false); }
        };
    }
    function mmBindExpandFields(side, frame) {
        const doc = frame.contentDocument;
        if (!doc?.body || doc.body.dataset.mmExpandBound) return;
        doc.body.dataset.mmExpandBound = '1';
        const bind = () => {
            for (const field of doc.querySelectorAll('textarea')) {
                if (field.dataset.mmExpandReady) continue;
                const section = field.closest('.field,.kv,.card,.entry,.greeting');
                if (!section) continue;
                let title = null;
                if (section.matches('.field,.kv')) {
                    const label = section.querySelector('label');
                    if (label) {
                        title = doc.createElement('div'); title.className = 'mm-field-head';
                        label.before(title); title.appendChild(label);
                    }
                } else title = section.querySelector('.card-head,.entry-head,.greeting-head');
                if (!title) continue;
                field.dataset.mmExpandReady = '1';
                const button = doc.createElement('button');
                button.type = 'button'; button.className = 'mm-field-expand';
                button.textContent = '⤢'; button.title = '放大当前文本框';
                button.onclick = e => { e.preventDefault(); e.stopPropagation(); mmExpandField(side, field); };
                const fold = title.querySelector('button.iconbtn');
                if (fold) fold.before(button); else title.appendChild(button);
            }
        };
        const style = doc.createElement('style');
        style.textContent = '.mm-field-head{display:flex;align-items:center;gap:5px;min-width:0;margin-bottom:5px}.field .mm-field-head label,.kv .mm-field-head label{display:block;min-width:0;margin:0}.mm-field-expand{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;border:1px solid var(--line,#ddd);background:transparent;color:var(--ink,#333);border-radius:5px;margin-left:auto;padding:0;font-size:13px;cursor:pointer}.card-head>.mm-field-expand,.entry-head>.mm-field-expand,.greeting-head>.mm-field-expand{margin-left:auto}.card-head>.mm-field-expand+.iconbtn,.greeting-head>.mm-field-expand+.iconbtn{margin-left:0}.kv:has(.mm-field-head){grid-template-columns:minmax(0,1fr)}.kv:has(.mm-field-head)>textarea{grid-column:1}.field,.card-body{min-width:0}.field textarea,.card-body textarea{width:100%}';
        doc.head.appendChild(style);
        bind();
        new MutationObserver(bind).observe(doc.body, { childList: true, subtree: true });
        doc.body.addEventListener('click', e => {
            if (e.target.closest('button,.iconbtn')) mmLog('ui', side, 'editor-button');
        }, true);
        let editTimer = 0;
        doc.body.addEventListener('input', e => {
            if (!e.target.matches('input,textarea,[contenteditable]')) return;
            clearTimeout(editTimer);
            editTimer = hostWindow.setTimeout(() => mmLog('ui', side, 'edit'), 850);
        }, true);
    }
    function mmExpandField(side, field) {
        const panel = root.getElementById(PANEL_ID);
        if (!panel || !field?.isConnected) return;
        let overlay = panel.querySelector('#awmMmExpand');
        if (!overlay) {
            overlay = root.createElement('div'); overlay.id = 'awmMmExpand';
            overlay.innerHTML = '<div class="awm-mm-expand-top"><strong data-mm-expand-title></strong><button class="awm-btn" data-mm-expand-close type="button">完成</button></div><div class="awm-mm-expand-tools"></div><div class="awm-mm-expand-find" hidden><input class="awm-input" placeholder="查找当前文本框"><input class="awm-input" placeholder="替换为"><button class="awm-btn" type="button">全部替换</button></div><textarea class="awm-mm-expand-input" spellcheck="false"></textarea>';
            panel.appendChild(overlay);
        }
        const title = field.closest('.field')?.querySelector('label')?.textContent?.trim() || field.getAttribute('placeholder') || (side === 'char' ? 'Char' : 'User');
        overlay.querySelector('[data-mm-expand-title]').textContent = title;
        const area = overlay.querySelector('textarea');
        area.value = field.value;
        const tools = overlay.querySelector('.awm-mm-expand-tools');
        tools.replaceChildren();
        let brushOn = false, brushPrefix = '';
        const prefixAt = pos => {
            const start = area.value.lastIndexOf('\n', Math.max(0,pos-1))+1;
            const end = area.value.indexOf('\n',start);
            const line = area.value.slice(start,end<0?area.value.length:end);
            return { start, prefix:(line.match(/^([ \t]*)(?:((?:#{1,6}|[-*+]|\d+\.|>) )|)/)||[])[0]||'' };
        };
        area.onpointerup = () => { if (!brushOn) return; setTimeout(() => {
            if (!brushOn) return;
            const line = prefixAt(area.selectionStart);
            area.setRangeText(brushPrefix,line.start,line.start+line.prefix.length,'preserve');
            area.dispatchEvent(new Event('input',{bubbles:true}));
        },0); };
        const sourceTools = panel.querySelector('#awmMian .awm-mm-tools');
        sourceTools?.querySelectorAll('button').forEach(original => {
            const copy = original.cloneNode(true);
            copy.onclick = () => {
                const command = original.dataset.mmTool;
                if (command === 'brush') {
                    brushOn = !brushOn;
                    if (brushOn) brushPrefix = prefixAt(area.selectionStart).prefix;
                    copy.classList.toggle('active',brushOn); area.focus(); return;
                }
                if (command === 'toggleFind') {
                    const row = overlay.querySelector('.awm-mm-expand-find'); row.hidden = !row.hidden;
                    tools.style.display = row.hidden ? 'flex' : 'none';
                    if (!row.hidden) row.querySelector('input').focus(); return;
                }
                const start = area.selectionStart, end = area.selectionEnd;
                const selected = area.value.slice(start, end);
                let insertion = selected;
                if (command === 'tag') insertion = original.dataset.value || '';
                else if (command === 'inline') { const marker = original.dataset.value === 'bold' ? '**' : '*'; insertion = marker + selected + marker; }
                else if (command === 'block') {
                    const type = original.dataset.value;
                    const prefix = type === 'h1' ? '# ' : type === 'h2' ? '## ' : type === 'number' ? '1. ' : '- ';
                    insertion = prefix + selected;
                } else { area.focus(); return; }
                area.setRangeText(insertion, start, end, 'end');
                area.dispatchEvent(new Event('input', { bubbles: true })); area.focus();
            };
            tools.appendChild(copy);
        });
        const sync = () => {
            if (!field.isConnected) return;
            field.value = area.value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
        };
        area.oninput = sync;
        const findRow = overlay.querySelector('.awm-mm-expand-find');
        const [queryInput, replacement] = findRow.querySelectorAll('input');
        queryInput.oninput = () => { const index = area.value.indexOf(queryInput.value); if (queryInput.value && index >= 0) area.setSelectionRange(index, index + queryInput.value.length); };
        findRow.querySelector('button').onclick = () => { if (!queryInput.value) return; area.value = area.value.split(queryInput.value).join(replacement.value); sync(); area.focus(); };
        overlay.querySelector('[data-mm-expand-close]').onclick = () => {
            brushOn = false; sync(); overlay.style.display = 'none';
            if (field.isConnected) field.focus();
        };
        tools.style.display = 'flex'; overlay.querySelector('.awm-mm-expand-find').hidden = true;
        overlay.style.display = 'flex'; area.focus();
    }
    function mmAddStyle() {
        if (root.getElementById('awm-mian-style-v42')) return;
        const style = root.createElement('style');
        style.id = 'awm-mian-style-v42';
        style.textContent = "\n/* 面面主界面：继承鲜虾鱼板面主题，弹窗相对于面板而非整个酒馆 */\n.awm-inject-section{min-width:0;padding:0;border:0;background:transparent}.awm-inject-section>#awmInjectSettings{display:grid;gap:8px;min-width:0;margin-top:8px}.awm-inject-section>#awmInjectSettings>.awm-card{margin:0;min-width:0}.awm-inject-section .awm-toolbar{flex-wrap:wrap}\n#awmMian{display:flex;flex-direction:column;height:100%;min-height:0;width:100%;overflow:hidden}\n.awm-mm-tools{display:flex;gap:4px;overflow-x:auto;flex:none;padding:2px 0 7px;scrollbar-width:thin}\n.awm-mm-tools .awm-btn{white-space:nowrap;flex:none}\n.awm-mm-find{display:flex;gap:4px;flex:none;padding:2px 0 7px}.awm-mm-find[hidden]{display:none}.awm-mm-find .awm-input{min-width:0}.awm-mm-find .awm-btn{flex:none}.awm-mm-mark{background:#f5ca68;color:#25211a;border-radius:2px}.awm-mm-style-replace{display:flex;gap:5px;margin:3px 0 7px}.awm-mm-style-replace .awm-input{min-width:0}.awm-mm-style-replace .awm-btn{flex:none}\n.awm-mm-tabs{display:none;gap:5px;padding-bottom:5px}.awm-mm-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;flex:1;min-height:0}\n.awm-mm-pane{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,7px);overflow:hidden}\n.awm-mm-pane-head{display:flex;align-items:center;gap:3px;padding:5px;flex-wrap:wrap;border-bottom:1px solid var(--SmartThemeBorderColor)}\n.awm-mm-pane-head strong{font-size:.9em;overflow:hidden;text-overflow:ellipsis;max-width:100%}.awm-mm-pane-head .awm-input{flex:1 1 100%;width:100%;padding:5px}\n.awm-mm-pane-head .awm-btn{flex:1;padding:4px 2px;white-space:nowrap}.awm-mm-pane iframe{width:100%;flex:1;min-height:0;border:0;background:var(--SmartThemeBlurTintColor)}\n#awmMianConfirm{position:absolute;inset:0;z-index:40;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:14px}\n.awm-mm-dialog{width:min(360px,100%);padding:16px;background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor);border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,9px);box-shadow:0 8px 30px rgba(0,0,0,.3)}\n.awm-mm-dialog p{white-space:pre-wrap;overflow-wrap:anywhere}.awm-mm-dialog>div{display:flex;justify-content:flex-end;gap:8px}\n@media(max-width:600px){.awm-mm-tabs{display:flex}.awm-mm-tabs .awm-btn{flex:1}.awm-mm-grid{display:block}.awm-mm-pane{height:100%}#awmMian[data-active=\"char\"] [data-mm-pane=\"user\"],#awmMian[data-active=\"user\"] [data-mm-pane=\"char\"]{display:none}}\n\n/* V4.3: main navigation shares the title row; settings fits the panel width. */\n#awm-panel-v03 .awm-head{gap:6px;padding-left:9px;padding-right:9px}\n#awm-panel-v03 .awm-title{white-space:nowrap;flex:none}\n#awm-panel-v03 .awm-head-nav{display:flex;align-items:center;justify-content:flex-end;min-width:0;flex:1;gap:3px}\n#awm-panel-v03 .awm-head-nav .awm-tabs{display:flex;gap:2px;border:0;padding:0;min-width:0;flex-wrap:wrap;justify-content:flex-end}\n#awm-panel-v03 .awm-head-nav .awm-tab{white-space:nowrap;padding:3px 6px}\n#awm-panel-v03 .awm-head-nav #awmClose{flex:none}\n#awm-panel-v03 .awm-main{height:calc(100% - 44px)}\n#awm-panel-v03:has(#awmStorageMode) .awm-form,#awm-panel-v03:has(#awmStorageMode) .awm-card{max-width:100%;min-width:0;overflow-wrap:anywhere}\n#awm-panel-v03:has(#awmStorageMode) .awm-toolbar{flex-wrap:wrap;overflow-x:visible}\n#awm-panel-v03:has(#awmStorageMode) .awm-toolbar>*{max-width:100%;min-width:0}\n#awm-panel-v03:has(#awmStorageMode) #awmStorageMode{max-width:100%;min-width:0}\n.awm-mm-data-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.awm-mm-data-actions .awm-btn{flex:1;min-width:85px}\n.awm-mm-select{position:relative;display:flex;flex:1 1 auto;min-width:0}.awm-mm-select>.awm-input{flex:1;min-width:0;width:100%;padding:5px}.awm-mm-select>[data-mm-picker]{flex:none;padding:3px 8px}\n.awm-mm-choices{position:absolute;left:0;right:0;top:100%;max-height:min(230px,40dvh);overflow-y:auto;z-index:10;background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor);border:1px solid var(--SmartThemeBorderColor);border-radius:var(--mainBorderRadius,7px);box-shadow:0 5px 20px #0003;padding:4px}\n.awm-mm-choices[hidden]{display:none}.awm-mm-choice{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:7px 6px;overflow-wrap:anywhere}.awm-mm-choice:hover{background:var(--SmartThemeQuoteColor)}\n.awm-mm-tools{scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:3px}.awm-mm-tools::-webkit-scrollbar{display:none}\n.awm-mm-pane-head .awm-mm-select .awm-input{flex:1;width:auto}\n#awmMmExpand{position:absolute;z-index:35;inset:0;display:none;flex-direction:column;gap:5px;padding:9px;background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor)}\n.awm-mm-expand-top{display:flex;align-items:center;gap:8px}.awm-mm-expand-top strong{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.awm-mm-expand-tools{display:flex;overflow-x:auto;scrollbar-width:none;gap:4px;flex:none}.awm-mm-expand-tools::-webkit-scrollbar{display:none}.awm-mm-expand-tools .awm-btn{flex:none;white-space:nowrap}\n.awm-mm-expand-find{display:flex;gap:4px}.awm-mm-expand-find[hidden]{display:none}.awm-mm-expand-find input{min-width:0;flex:1}.awm-mm-expand-find button{flex:none}\n.awm-mm-expand-input{width:100%;flex:1;min-height:0;border:1px solid var(--SmartThemeBorderColor);background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor);border-radius:var(--mainBorderRadius,7px);padding:12px;font:inherit;line-height:1.55;resize:none;outline:none}\n@media(max-width:600px){#awm-panel-v03 .awm-title{font-size:.86em}#awm-panel-v03 .awm-head-nav .awm-tab{padding:2px 4px;font-size:.78em}#awm-panel-v03 .awm-main{padding:4px}#awm-panel-v03 .awm-head{gap:2px;padding-left:5px;padding-right:5px}.awm-mm-tabs{display:none}.awm-mm-pane-head{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,minmax(0,auto));padding:4px;gap:3px}.awm-mm-pane-head strong{grid-column:1;white-space:nowrap;max-width:100%}.awm-mm-pane-head .awm-mm-select{grid-column:2/5}.awm-mm-pane-head>.awm-btn{grid-row:2;padding:3px 5px;min-width:0}.awm-mm-pane-head>[data-mm-save]{grid-column:1/3}.awm-mm-pane-head>[data-mm-overwrite]{grid-column:3}.awm-mm-pane-head>[data-mm-new]{grid-column:4}#awm-panel-v03:has(#awmStorageMode) .awm-card>div[style*=\"justify-content:space-between\"]{flex-wrap:wrap}#awm-panel-v03:has(#awmStorageMode) .awm-form{overflow-x:hidden}}\n";
        style.textContent += `
        .awm-persona-tags{display:flex;gap:4px;flex-wrap:wrap;margin:4px 4px 4px 72px}.awm-persona-tag{border:1px solid var(--SmartThemeBorderColor,#aaa);border-radius:8px;padding:1px 6px;font-size:11px;background:var(--SmartThemeBlurTintColor,#eee);color:var(--SmartThemeBodyColor,#333)}
        @media(min-width:601px){#awmMian .awm-mm-grid{display:flex;min-width:0}#awmMian .awm-mm-pane{min-width:160px;flex:1 1 50%;overflow:hidden}#awmMian .awm-column-divider{width:8px;flex:0 0 8px;cursor:ew-resize;touch-action:none;background:var(--SmartThemeBorderColor,#bbb);border-radius:5px;opacity:.65}#awmMian[data-mm-focus=char] [data-mm-pane=user],#awmMian[data-mm-focus=user] [data-mm-pane=char]{display:none}#awmMian[data-mm-focus] .awm-mm-pane{flex:1 1 100%}#awmMian[data-mm-focus] .awm-column-divider{display:none}}
        
        /* V4.6: the card already displays its name; picker gets the whole row. */
        #awmMian .awm-mm-pane-head>[data-mm-title]{display:none}
        #awmMian .awm-mm-pane-head>[data-mm-save],#awmMian .awm-mm-pane-head>[data-mm-overwrite],#awmMian .awm-mm-pane-head>[data-mm-new]{display:none!important}
        #awmMian .awm-mm-pane-head{display:flex;flex-wrap:nowrap;align-items:center}
        #awmMian .awm-mm-pane-head .awm-mm-select{flex:1 1 auto;min-width:0}
        #awmMian .awm-mm-pane-head>.awm-btn{flex:0 0 auto;white-space:nowrap}
        @media(max-width:600px){#awmMian .awm-mm-pane-head{gap:2px;padding:3px}#awmMian .awm-mm-pane-head>.awm-btn{padding:3px 2px;font-size:.8em}#awmMian .awm-mm-pane-head .awm-mm-select>.awm-input{padding:4px 2px;font-size:.82em}}
        #awm-panel-v03 .awm-head-nav .awm-tabs{flex-wrap:nowrap}
        #awm-panel-v03 .awm-head-nav [data-mm-side]{min-width:22px;text-align:center}
        #awm-panel-v03 .awm-layout-handle{position:absolute;z-index:55;touch-action:none;display:none;background:var(--SmartThemeQuoteColor);border:1px solid var(--SmartThemeBorderColor);opacity:.75;border-radius:9px}
        #awm-panel-v03 .awm-layout-handle-left{position:absolute;z-index:55;touch-action:none;display:none;background:var(--SmartThemeQuoteColor);border:1px solid var(--SmartThemeBorderColor);opacity:.75;border-radius:9px}
        #awm-panel-v03 .awm-drag-cue{display:none;padding:2px 8px;border:1px solid var(--SmartThemeBorderColor);border-radius:6px;cursor:move;touch-action:none}
        #awm-panel-v03.awm-layout-unlocked .awm-drag-cue{display:block}
        #awm-panel-v03.awm-layout-unlocked .awm-layout-handle-left{display:block}
        #awm-panel-v03.awm-layout-unlocked .awm-layout-handle{display:block}
        @media(min-width:601px){#awm-panel-v03 .awm-layout-handle{right:0;top:46%;width:12px;height:46px;cursor:ew-resize}#awm-panel-v03 .awm-layout-handle-left{left:0;top:46%;width:12px;height:46px;cursor:ew-resize}}
        @media(max-width:600px){#awm-panel-v03 .awm-layout-handle{left:calc(50% - 24px);bottom:0;width:48px;height:12px;cursor:ns-resize}#awm-panel-v03 .awm-layout-handle-left{display:none!important}}
        .awm-layout-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px}
        .awm-layout-controls .awm-select{min-width:0;max-width:100%}
        .awm-layout-controls .awm-btn{flex:0 1 auto}
        #awmMian [data-mm-brush].active{background:var(--SmartThemeQuoteColor);border-color:var(--SmartThemeBodyColor)}
        .awm-mm-commandbar{display:flex;align-items:center;flex:none;width:100%;min-width:0;min-height:32px}
        .awm-mm-commandbar .awm-mm-tools{width:100%;min-width:0;padding:0;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}
        .awm-mm-commandbar .awm-mm-find{width:100%;min-width:0;padding:0;align-items:center}
        .awm-mm-commandbar .awm-mm-find[hidden]{display:none}
        .awm-mm-commandbar .awm-mm-find .awm-input{min-width:0;flex:1 1 28%;width:0;padding:4px}
        .awm-mm-commandbar .awm-mm-find [data-mm-count]{white-space:nowrap;font-size:.75em}
        #awmMian[data-find-open] .awm-mm-tools{display:none}
        .awm-mm-pane-head{flex-wrap:nowrap;gap:3px}
        .awm-mm-pane-head strong{flex:0 1 auto;max-width:25%;white-space:nowrap}
        .awm-mm-pane-head .awm-mm-select{flex:1 1 0;min-width:40px}
        .awm-mm-pane-head>.awm-btn{flex:0 0 auto;min-width:0;white-space:nowrap}
        @media(max-width:600px){
          .awm-mm-pane-head{display:flex;flex-wrap:nowrap;gap:2px;padding:3px}
          .awm-mm-pane-head strong{grid-column:auto;max-width:20%;font-size:.8em}
          .awm-mm-pane-head .awm-mm-select{grid-column:auto;flex:1 1 0;min-width:38px}
          .awm-mm-pane-head .awm-mm-select .awm-input{font-size:12px;padding:3px}
          .awm-mm-pane-head .awm-mm-select [data-mm-picker]{padding:2px 4px}
          .awm-mm-pane-head>.awm-btn{grid-column:auto;grid-row:auto;font-size:11px;padding:3px 3px;flex:0 0 auto}
          .awm-mm-commandbar .awm-mm-find .awm-btn{font-size:11px;padding:3px}
          .awm-mm-commandbar .awm-mm-find .awm-input{font-size:12px}
        }`;
        style.textContent += `
#awm-panel-v03{max-width:calc(100vw - 16px)}
#awmMian.awm-mm-narrow .awm-mm-grid{display:block;min-width:0;overflow:hidden}
#awmMian.awm-mm-narrow .awm-mm-pane{height:100%;width:100%;min-width:0}
#awmMian.awm-mm-narrow[data-active="char"] [data-mm-pane="user"],
#awmMian.awm-mm-narrow[data-active="user"] [data-mm-pane="char"]{display:none!important}
#awmMian.awm-mm-narrow .awm-column-divider{display:none!important}
#awmMian.awm-mm-narrow .awm-mm-pane-head .awm-mm-select{min-width:0}
#awm-panel-v03 .awm-card,#awm-panel-v03 .awm-form{max-width:100%;min-width:0}
#awm-panel-v03 .awm-layout-controls>*{max-width:100%}
`;
        style.textContent += '.awm-mm-pending-tags{display:flex;align-items:center;gap:4px;flex:none}.awm-mm-pending-tags:empty{display:none}.awm-mm-pending-tags .awm-btn{flex:none;white-space:nowrap}';
        style.textContent += `
        #awm-panel-v03 .awm-head{min-width:0;flex-wrap:nowrap}
        #awm-panel-v03 .awm-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
        #awm-panel-v03 .awm-head-nav{flex:0 1 auto;min-width:0;max-width:100%;flex-wrap:nowrap}
        #awm-panel-v03 .awm-head-nav .awm-tabs{flex:0 1 auto;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
        #awm-panel-v03 .awm-head-nav .awm-tab{flex:0 0 auto}
        #awm-panel-v03 .awm-head-nav #awmClose{flex:0 0 auto}
        `;
        root.head.appendChild(style);
    }
    function mmMountConfirm() {
        const panel = root.getElementById(PANEL_ID);
        if (!panel || panel.querySelector('#awmMianConfirm')) return;
        const modal = root.createElement('div');
        modal.id = 'awmMianConfirm';
        modal.style.display = 'none';
        modal.innerHTML = '<div class="awm-mm-dialog"><strong data-mm-confirm-title></strong><p data-mm-confirm-detail></p><div><button class="awm-btn" data-mm-confirm-cancel>取消</button><button class="awm-btn" data-mm-confirm-ok>确认写入</button></div></div>';
        panel.appendChild(modal);
    }
    function renderMian(main) {
        mmAddStyle();
        mmMountConfirm();
        if (root.getElementById('awmMian') && mmRuntime.frames.char) {
            for (const side of ['char','user']) { try { mmFrame(side)?.contentWindow?.__mmBrushClear?.(); } catch (_) {} }
            mmPersistCurrent('char'); mmPersistCurrent('user');
        }
        mmRuntime.ready = { char: false, user: false };
        mmRuntime.frames = {};
        mmPendingEditors.char = mmPendingEditors.user = null;
        const tabs = root.getElementById(PANEL_ID)?.querySelector('.awm-tabs');
        if (tabs && !tabs.dataset.mmSaveBound) {
            tabs.dataset.mmSaveBound = '1';
            tabs.addEventListener('click', e => {
                if (e.target.closest('[data-page]')?.dataset.page !== 'mianmian' && root.getElementById('awmMian')) {
                    for (const side of ['char','user']) { try { mmFrame(side)?.contentWindow?.__mmBrushClear?.(); } catch (_) {} }
                    mmPersistCurrent('char'); mmPersistCurrent('user');
                }
            }, true);
        }
        if (!mmRuntime.listenerInstalled) { hostWindow.addEventListener('message', mmOnMessage); mmRuntime.listenerInstalled = true; }
        main.innerHTML = `<div id="awmMian" data-active="char">
            <div class="awm-mm-commandbar"><div class="awm-mm-tools"><span class="awm-mm-pending-tags" data-mm-pending-tags></span>
                <button class="awm-btn" data-mm-tool="tag" data-value="{{user}}">{{user}}</button>
                <button class="awm-btn" data-mm-tool="tag" data-value="{{char}}">{{char}}</button>
                <button class="awm-btn" data-mm-tool="tag" data-value="," title="英文逗号">,</button>
                <button class="awm-btn" data-mm-tool="tag" data-value="." title="英文句号">.</button>
                <button class="awm-btn" data-mm-tool="tag" data-value=":" title="英文冒号">:</button>
                <button class="awm-btn" data-mm-tool="tag" data-value=";" title="英文分号">;</button>
                <button class="awm-btn" data-mm-tool="tag" data-value="!" title="英文感叹号">!</button>
                <button class="awm-btn" data-mm-tool="tag" data-value="?" title="英文问号">?</button>
                <button class="awm-btn" data-mm-tool="tag" data-value="-" title="英文连字符">-</button>
                <button class="awm-btn" data-mm-tool="tag" data-value="/" title="斜杠">/</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="&quot;" data-close="&quot;" title="英文双引号，光标留在中间">&quot;&quot;</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="'" data-close="'" title="英文单引号，光标留在中间">''</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="（" data-close="）" title="中文括号">（）</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="(" data-close=")" title="英文括号">()</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="[" data-close="]" title="英文方括号">[]</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="{" data-close="}" title="英文花括号">{}</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="&lt;" data-close="&gt;" title="英文尖括号">&lt;&gt;</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="《" data-close="》" title="书名号">《》</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="“" data-close="”" title="中文双引号">“”</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="‘" data-close="’" title="中文单引号">‘’</button>
                <button class="awm-btn" data-mm-tool="pair" data-open="【" data-close="】" title="方头括号">【】</button>
                <button class="awm-btn" data-mm-tool="inline" data-value="bold"><b>B</b></button>
                <button class="awm-btn" data-mm-tool="inline" data-value="italic"><i>I</i></button>
                <button class="awm-btn" data-mm-tool="block" data-value="h1">H1</button>
                <button class="awm-btn" data-mm-tool="block" data-value="h2">H2</button>
                <button class="awm-btn" data-mm-tool="block" data-value="bullet">•</button>
                <button class="awm-btn" data-mm-tool="block" data-value="number">1.</button>
                <button class="awm-btn" data-mm-tool="brush" data-mm-brush type="button">格式刷</button>
                
                <button class="awm-btn" data-mm-tool="toggleFind">查找替换</button>
            </div><div class="awm-mm-find" hidden><input class="awm-input" data-mm-find placeholder="搜索当前两栏"><input class="awm-input" data-mm-replace placeholder="替换为"><button class="awm-btn" data-mm-replace-both>批量替换</button><button class="awm-btn" data-mm-find-close type="button" aria-label="返回编辑工具">×</button><span class="awm-meta" data-mm-count></span></div></div>
            <div class="awm-mm-grid" data-mm-grid>
                ${['char','user'].map(side => `<section class="awm-mm-pane" data-mm-pane="${side}"><div class="awm-mm-pane-head"><strong data-mm-title>${side === 'char' ? 'CHAR' : 'User'}</strong><button class="awm-btn" data-mm-refresh type="button" title="从酒馆重新读取当前资料" aria-label="从酒馆重新读取当前资料">↻</button><div class="awm-mm-select"><input class="awm-input" data-mm-search="${side}" placeholder="搜索酒馆资料" autocomplete="off"><button class="awm-btn" data-mm-picker type="button" aria-label="查看酒馆全部资料">▾</button><div class="awm-mm-choices" data-mm-choices hidden></div><datalist id="awm-mm-list-${side}" data-mm-list="${side}"></datalist></div><button class="awm-btn" data-mm-save hidden>保存</button><button class="awm-btn" data-mm-overwrite hidden>覆盖</button><button class="awm-btn" data-mm-new hidden>新建</button></div><iframe title="${side === 'char' ? '角色编辑器' : 'User 编辑器'}" data-mm-frame="${side}"></iframe></section>`).join('')}
            </div></div>`;
        for (const side of ['char', 'user']) mmSetupPane(side);
        const host = main.querySelector('#awmMian');
        // The punctuation row stays usable with a normal mouse wheel in a narrow panel.
        // Its scrollbar is hidden in CSS, so do not depend on dragging a scrollbar thumb.
        const toolRow = host.querySelector('.awm-mm-tools');
        toolRow.addEventListener('wheel', event => {
            if (toolRow.scrollWidth <= toolRow.clientWidth || !event.deltaY || event.ctrlKey) return;
            event.preventDefault();
            toolRow.scrollLeft += event.deltaY;
        }, { passive: false });
        mmRuntime.layoutObserver?.disconnect();
        const updateNarrow = () => {
            const narrow = root.getElementById(PANEL_ID).getBoundingClientRect().width < 760;
            host.classList.toggle('awm-mm-narrow', narrow);
            if (narrow) host.removeAttribute('data-mm-focus');
            awmSyncNav();
        };
        mmRuntime.layoutObserver = new ResizeObserver(updateNarrow);
        mmRuntime.layoutObserver.observe(root.getElementById(PANEL_ID));
        updateNarrow();
        const grid = host.querySelector('[data-mm-grid]');
        const divider = root.createElement('div'); divider.className = 'awm-column-divider';
        divider.title = '拖动调整 C / U 两栏宽度';
        grid.querySelector('[data-mm-pane="char"]').after(divider);
        let split = null;
        divider.addEventListener('pointerdown', e => {
            if (host.dataset.mmFocus) return;
            e.preventDefault();
            const rect = grid.getBoundingClientRect();
            split = { left: rect.left, width: rect.width };
            divider.setPointerCapture(e.pointerId);
        });
        divider.addEventListener('pointermove', e => {
            if (!split) return;
            const pct = Math.max(20, Math.min(80, (e.clientX - split.left) / split.width * 100));
            grid.querySelector('[data-mm-pane="char"]').style.flex = '0 0 calc(' + pct + '% - 4px)';
        });
        for (const type of ['pointerup','pointercancel']) divider.addEventListener(type, () => { split = null; });
        for (const side of ['char','user']) {
            const pane = host.querySelector('[data-mm-pane="' + side + '"]');
            const button = root.createElement('button'); button.className = 'awm-btn awm-column-focus';
            button.type = 'button'; button.textContent = '⤢'; button.title = '放大此栏，再点恢复双栏';
            pane.querySelector('.awm-mm-pane-head').appendChild(button);
            button.onclick = () => { host.dataset.mmFocus = host.dataset.mmFocus === side ? '' : side;
                host.querySelectorAll('.awm-column-focus').forEach(b => b.textContent = '⤢');
                if (host.dataset.mmFocus) button.textContent = '⤡'; awmSyncNav(); };
        }
        host.querySelectorAll('[data-mm-tool]').forEach(b => b.onclick = () => {
            const command = b.dataset.mmTool;
            if (command === 'toggleFind') { const row = host.querySelector('.awm-mm-find'); row.hidden = false; host.dataset.findOpen = '1'; row.querySelector('[data-mm-find]').focus(); return; }
            const activeSide = mmRuntime.active, win = mmFrame(activeSide)?.contentWindow;
            if (typeof win?.__mmRunTool === 'function') {
                const value=command==='pair'?{open:b.dataset.open||'',close:b.dataset.close||''}:b.dataset.value;
                const on = win.__mmRunTool(command,value);
                if (command === 'brush') b.classList.toggle('active',!!on);
            } else toast('编辑器尚未准备好，请稍后再试','warning');
        });
        host.querySelector('[data-mm-find-close]').onclick = () => { host.querySelector('.awm-mm-find').hidden = true; delete host.dataset.findOpen; };
        host.querySelector('[data-mm-find]').oninput = e => mmSearchBoth(e.target.value);
        host.querySelector('[data-mm-replace-both]').onclick = () => mmReplaceBoth(host.querySelector('[data-mm-find]').value, host.querySelector('[data-mm-replace]').value);
        mmSetActive(mmRuntime.active);
        for (const side of ['char', 'user']) {
            mmRefreshList(side);
            const snapshot = mmRuntime.currentDraft[side];
            const target = mmRuntime.target[side];
            if (target && snapshot?.card) {
                mmApplyData(side,target,structuredClone(snapshot.card),snapshot.avatarData || '');
                continue;
            }
            const data = mmNormalize(load()).mianmian;
            const saved = data.drafts[side][data.active[side]];
            const selected = saved?.target || mmCurrentTarget(side);
            if (selected?.kind === 'existing') mmSelect(side, selected.name, selected.id).then(ok => {
                if (!ok && saved?.card && root.getElementById('awmMian') === host &&
                    mmRuntime.target[side]?.id === selected.id) mmApplyData(side,selected,saved.card,saved.avatarData||'');
            });
            else if (saved?.card) mmApplyData(side,selected,saved.card,saved.avatarData || '');
            else mmApplyData(side,{kind:'placeholder',name:side==='user'?'{{user}}':'',id:side},mmEditorCard(side==='user'?'{{user}}':'',{},null));
        }
    }


    // 12. 菜单 / 初始化
    // ============================================================
    // Independent transparent launcher, with size and position persisted per browser.
    const MM_LAUNCHER_IMAGE = 'data:image/png;base64,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';
    const MM_LAUNCHER_KEY = '鲜虾鱼板面.launcher.v1';
    function mmLauncherSize(size) {
        const value = Math.max(32, Math.min(120, Number(size) || 56));
        const button = root.getElementById('awm-launcher-v54');
        if (button) { button.style.width = value + 'px'; button.style.height = value + 'px'; hostWindow.requestAnimationFrame(()=>mmLauncherClamp(button)); }
        try { hostWindow.localStorage.setItem(MM_LAUNCHER_KEY + '.size', String(value)); } catch (_) {}
        return value;
    }
    function mmLauncherVisible() {
        try { return hostWindow.localStorage.getItem(MM_LAUNCHER_KEY + '.visible') !== 'false'; }
        catch (_) { return true; }
    }
    function mmSetLauncherVisible(visible) {
        try { hostWindow.localStorage.setItem(MM_LAUNCHER_KEY + '.visible', String(!!visible)); } catch (_) {}
        const button = root.getElementById('awm-launcher-v54');
        if (button) { button.style.display = visible ? '' : 'none'; if(visible)hostWindow.requestAnimationFrame(()=>mmLauncherClamp(button)); }
    }
    function mmLauncherViewport() {
        const vv=hostWindow.visualViewport;
        return {left:vv?.offsetLeft||0,top:vv?.offsetTop||0,width:vv?.width||hostWindow.innerWidth,height:vv?.height||hostWindow.innerHeight};
    }
    function mmLauncherClamp(button) {
        if(!button?.isConnected||button.style.display==='none')return;
        const vp=mmLauncherViewport(),size=button.getBoundingClientRect();
        if(!vp.width||!vp.height)return;
        const rect=button.getBoundingClientRect(),margin=8;
        const x=Number.isFinite(rect.left)?rect.left:vp.left+vp.width-size.width-margin;
        const y=Number.isFinite(rect.top)?rect.top:vp.top+vp.height-size.height-95;
        button.style.left=Math.max(vp.left+margin,Math.min(vp.left+vp.width-size.width-margin,x))+'px';
        button.style.top=Math.max(vp.top+margin,Math.min(vp.top+vp.height-size.height-margin,y))+'px';
        button.style.right=button.style.bottom='auto';
    }
    function mmCreateLauncher() {
        if (root.getElementById('awm-launcher-v54')) return;
        const button = root.createElement('button'); button.id = 'awm-launcher-v54'; button.type = 'button';
        button.title = '打开鲜虾鱼板面'; button.setAttribute('aria-label', '打开鲜虾鱼板面');
        button.style.cssText = 'position:fixed;z-index:2147483000;right:18px;bottom:95px;padding:0;border:0;background:transparent;box-shadow:none;cursor:grab;touch-action:none;overflow:visible;display:block';
        const picture = root.createElement('img'); picture.src = MM_LAUNCHER_IMAGE; picture.alt = ''; picture.draggable = false;
        picture.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none'; button.appendChild(picture);
        (root.body || root.documentElement).appendChild(button);
        mmLauncherSize(hostWindow.localStorage.getItem(MM_LAUNCHER_KEY + '.size'));
        button.style.display=mmLauncherVisible()?'':'none';
        try { const position = JSON.parse(hostWindow.localStorage.getItem(MM_LAUNCHER_KEY + '.position') || 'null');
            if (position && Number.isFinite(+position.x) && Number.isFinite(+position.y)) { button.style.left = position.x + 'px'; button.style.top = position.y + 'px'; button.style.right = button.style.bottom = 'auto'; }
        } catch (_) {}
        const keepVisible=()=>mmLauncherClamp(button);
        hostWindow.requestAnimationFrame(keepVisible);
        hostWindow.addEventListener('resize',keepVisible,{passive:true});
        hostWindow.visualViewport?.addEventListener('resize',keepVisible,{passive:true});
        hostWindow.visualViewport?.addEventListener('scroll',keepVisible,{passive:true});
        let drag = null;
        button.addEventListener('pointerdown', e => { drag = { id:e.pointerId,x:e.clientX,y:e.clientY,left:button.getBoundingClientRect().left,top:button.getBoundingClientRect().top,moved:false }; button.setPointerCapture(e.pointerId); });
        button.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx=e.clientX-drag.x,dy=e.clientY-drag.y; if (Math.abs(dx)+Math.abs(dy)>6) drag.moved=true; if (!drag.moved) return; button.style.left=drag.left+dx+'px';button.style.top=drag.top+dy+'px';button.style.right=button.style.bottom='auto';mmLauncherClamp(button); });
        button.addEventListener('pointerup', e => { if (!drag || drag.id!==e.pointerId) return; if (drag.moved) { try { hostWindow.localStorage.setItem(MM_LAUNCHER_KEY+'.position', JSON.stringify({x:button.offsetLeft,y:button.offsetTop})); } catch (_) {} } else open(); drag=null; });
        button.addEventListener('pointercancel', () => { drag=null; });
    }
    function createMenuButton() {
        if (root.getElementById('awm-menu-button-v04')) return;

        const menu = root.querySelector('#extensionsMenu') || root.querySelector('#extensions_menu');
        if (!menu) {
            setTimeout(createMenuButton, 1000);
            return;
        }

        const b = root.createElement('div');
        b.id = 'awm-menu-button-v04';
        b.className = 'list-group-item flex-container flexGap5 interactable';
        b.innerHTML = '<span>🍥 鲜虾鱼板面</span>';
        b.onclick = open;
        menu.prepend(b);
    }

    const MM_EXTENSION_SETTINGS_ID='awm-extension-settings';
    let mmSettingsAttempts=0;
    async function mmInjectExtensionSettings() {
        if(root.getElementById(MM_EXTENSION_SETTINGS_ID))return;
        const target=root.querySelector('#extensions_settings2')||root.querySelector('#extensions_settings');
        if(!target){if(++mmSettingsAttempts<30)hostWindow.setTimeout(mmInjectExtensionSettings,1000);return;}
        try{
            const script=root.currentScript?.src||[...root.scripts].map(s=>s.src)
                .find(src=>/\/(?:鲜虾鱼板面|mianmianmianmianmian)\/index\.js(?:\?|$)/.test(decodeURI(src)));
            const urls=[script&&new URL('settings.html',script),
                '/scripts/extensions/third-party/mianmianmianmianmian/settings.html',
                '/scripts/extensions/third-party/鲜虾鱼板面/settings.html'].filter(Boolean);
            let response;
            for(const url of urls){try{const result=await hostWindow.fetch(url,{credentials:'same-origin'});if(result.ok){response=result;break;}}catch(_){}}
            if(!response)throw new Error('settings.html 无法读取');
            const wrapper=root.createElement('div');wrapper.id=MM_EXTENSION_SETTINGS_ID;
            wrapper.innerHTML=await response.text();
            if(root.getElementById(MM_EXTENSION_SETTINGS_ID))return;
            target.appendChild(wrapper);
            bindExtensionSettings(wrapper);
        }catch(error){console.warn('[鲜虾鱼板面] 扩展设置未加载',error);}
    }
    // V10.16 portable persona cards. Original raw world-info is retained in the extension envelope.
    const MM_USER_CARD_KEY = 'mianmian_user_card';
    function mmUniqueName(base, names) {
        let name=base, i=2; const used=new Set(names.map(n=>String(n).toLowerCase()));
        while(used.has(name.toLowerCase()))name=base+' ('+(i++)+')'; return name;
    }
    function mmPortableBook(raw, name) {
        return {name,extensions:{},entries:Object.values(raw.entries||{}).map((e,i)=>({
            id:Number.isInteger(e.uid)?e.uid:i,keys:e.key||[],secondary_keys:e.keysecondary||[],
            comment:e.comment||'',content:e.content||'',enabled:!e.disable,constant:!!e.constant,
            selective:!!e.selective,insertion_order:e.order??100,position:e.position===0?'before_char':'after_char',
            case_sensitive:e.caseSensitive??false,extensions:{...structuredClone(e),position:e.position??0}
        }))};
    }
    function mmNativeBook(book) {
        return {entries:Object.fromEntries((book.entries||[]).map((e,i)=>[i,{
            ...(e.extensions||{}),uid:i,key:e.keys||[],keysecondary:e.secondary_keys||[],comment:e.comment||e.name||'',
            content:e.content||'',disable:e.enabled===false,constant:!!e.constant,selective:e.selective!==false,
            order:e.insertion_order??100,position:e.extensions?.position??(e.position==='before_char'?0:1),
            caseSensitive:e.case_sensitive??e.extensions?.caseSensitive??null
        }]))};
    }
    async function mmAvatarData(value) {
        if(!value)throw Error('头像未读取成功');
        const url=new URL(value,hostWindow.location.href);
        if(url.protocol!=='data:'&&url.origin!==hostWindow.location.origin)throw Error('头像必须来自当前酒馆');
        if(url.protocol==='data:'&&!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value))throw Error('头像格式不支持');
        if(url.protocol==='data:'){if(value.length>28*1024*1024)throw Error('头像超过20MB');return value;}
        const response=await hostWindow.fetch(value);if(!response.ok)throw Error('头像读取失败');
        const blob=await response.blob();if(blob.size>20*1024*1024)throw Error('头像超过20MB');
        return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
    }
    function mmCardDownload(blob,name) {const url=URL.createObjectURL(blob),a=root.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();hostWindow.setTimeout(()=>URL.revokeObjectURL(url),30000);}
    function mmCardDialog(title) {
        root.getElementById('awmUserCardDialog')?.remove();
        const doc=root,d=doc.createElement('dialog');d.id='awmUserCardDialog';d.setAttribute('aria-label',title);
        d.style.cssText='box-sizing:border-box;width:min(420px,calc(100vw - 24px));max-height:80dvh;overflow:auto;margin:auto;padding:16px;border:1px solid var(--SmartThemeBorderColor,#aaa);border-radius:10px;background:var(--SmartThemeBlurTintColor,#f7f5ed);color:var(--SmartThemeBodyColor,#333);font:inherit;overflow-wrap:anywhere';
        const h=doc.createElement('strong');h.textContent=title;d.append(h);
        const actions=doc.createElement('div');actions.style.cssText='display:flex;flex-wrap:nowrap;gap:12px;align-items:center;margin-top:12px';d.append(actions);d._actions=actions;
        doc.body.append(d);d.addEventListener('close',()=>{mmLog('cardDialog','user','closed','',undefined,{title});d.remove();});d.showModal();
        mmLog('cardDialog','user','opened','',undefined,{title});return d;
    }
    function mmCardButton(d,label,fn){const b=d.ownerDocument.createElement('button');b.type='button';b.className='awm-card-action';b.textContent=label;b.style.cssText='box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:auto;min-width:48px;min-height:44px;margin:0;padding:8px 12px;white-space:nowrap;word-break:normal;writing-mode:horizontal-tb;font:inherit;color:inherit;background:transparent;border:1px solid var(--line,#aaa);border-radius:6px;cursor:pointer';b.onclick=fn;d._actions.append(b);return b;}
    function mmCardText(d,text){const p=d.ownerDocument.createElement('p');p.textContent=text;p.style.cssText='margin:8px 0;line-height:1.5';d.insertBefore(p,d._actions);return p;}
    function mmCardProgress(d,text){mmLog('cardProgress','user','progress','',undefined,{step:text});}
    function mmCardNotice(text,type='success'){
        try{if(hostWindow.toastr?.[type]){hostWindow.toastr[type](text,'',{timeOut:type==='error'?7000:3500,extendedTimeOut:1000,closeButton:true,tapToDismiss:true});return;}}catch(_){}
        toast(text,type);
    }
    function mmCardFailure(d,stage,error,began,details,message){mmLog(stage,'user','failed',error,began,details);mmCardNotice(message||error.message||String(error),'error');}
    function mmCardConfirm(d,text,accept){
        if(d._confirm)return;const area=d.ownerDocument.createElement('div');d._confirm=area;area.style.cssText='display:flex;flex-wrap:wrap;gap:12px;align-items:center';
        d._actions.hidden=true;d._actions.style.display='none';d.append(area);
        const p=d.ownerDocument.createElement('p');p.textContent=text;p.style.flexBasis='100%';area.append(p);
        const wrap={ownerDocument:d.ownerDocument,_actions:area};
        const back=()=>{area.remove();d._confirm=null;d._actions.hidden=false;d._actions.style.display='flex';};
        mmCardButton(wrap,'确认',()=>{back();accept();});mmCardButton(wrap,'返回',back);
    }
    function mmCardEqual(a,b){const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
    async function mmCardTimed(step,fn){const began=Date.now();try{const result=await fn();mmLog('cardStep','user','completed','',began,{step});return result;}catch(error){mmLog('cardStep','user','failed',error,began,{step});throw error;}}
    async function mmCreateCardBook(book,fallback,created){
        const began=Date.now(),native=await import('/scripts/world-info.js'),utils=await import('/scripts/utils.js');
        if(typeof native.saveWorldInfo!=='function')throw Error('原生世界书保存接口不可用');
        const base=(await utils.getSanitizedFilename(book.name||fallback)).trim();if(!base)throw Error('世界书名称无效');
        const same=(a,b)=>utils.equalsIgnoreCaseAndAccents?utils.equalsIgnoreCaseAndAccents(a,b):a.toLowerCase()===b.toLowerCase();
        let name='',ok=false;const attempted=[];
        for(let retry=0;retry<3;retry++){
            const names=[...mmApi('getWorldbookNames')(),...attempted];name=base;let n=2;
            while(names.some(old=>same(old,name)))name=base+' ('+(n++)+')';
            mmLog('cardWorldbook','user','create','',began,{name});
            ok=await mmCardTimed('创建世界书',()=>mmApi('createWorldbook')(name,[]));if(ok)break;
            attempted.push(name);await native.updateWorldInfoList?.();
            if(!mmApi('getWorldbookNames')().some(old=>same(old,name)))throw Error('世界书「'+name+'」创建接口返回失败，未确认重名');
        }
        if(!ok)throw Error('世界书名称连续冲突，请稍后重试');
        created(name);await mmCardTimed('写入世界书',()=>native.saveWorldInfo(name,structuredClone(book.data),true));
        const read=await (await mmSettingsFetch('/api/worldinfo/get',{name})).json();
        if(!mmCardEqual(read.entries,book.data.entries))throw Error('世界书「'+name+'」保存回读不一致');
        mmLog('cardWorldbook','user','verified','',began,{name});return name;
    }
    async function mmOverwriteCardBook(book,target,changed){
        const began=Date.now(),native=await import('/scripts/world-info.js'),utils=await import('/scripts/utils.js');
        const bound=String(mmApi('getPersona')(target.id)?.lorebook||'').trim();
        const wanted=bound||(await utils.getSanitizedFilename(book.name||target.name+' 世界书')).trim();
        if(!wanted)throw Error('世界书名称无效');
        const same=(a,b)=>utils.equalsIgnoreCaseAndAccents?utils.equalsIgnoreCaseAndAccents(a,b):a.toLowerCase()===b.toLowerCase();
        const existing=mmApi('getWorldbookNames')().find(n=>same(n,wanted));
        if(!existing)return mmCreateCardBook({...book,name:wanted},wanted,name=>changed(name,'created'));
        mmLog('cardWorldbook','user','overwrite-start','',began,{name:existing});
        changed(existing,'overwrite-attempted');
        await mmCardTimed('覆盖世界书',()=>native.saveWorldInfo(existing,structuredClone(book.data),true));
        const read=await (await mmSettingsFetch('/api/worldinfo/get',{name:existing})).json();
        if(!mmCardEqual(read.entries,book.data.entries))throw Error('世界书「'+existing+'」覆盖后回读不一致');
        changed(existing,'overwritten');mmLog('cardWorldbook','user','overwrite-verified','',began,{name:existing});return existing;
    }
    let mmCardBusy=false;
    async function mmBuildUserCard(target,snapshot) {
        if(!snapshot?.card?.data||!target||target.kind==='placeholder')throw Error('请先选择 U');
        const data=structuredClone(snapshot.card.data);
        const persona=target.kind==='existing'?structuredClone(mmApi('getPersona')(target.id)):{name:data.name,description:data.description};
        if(target.kind==='existing'&&persona.avatar_id!==target.id)throw Error('U 身份不一致');
        const name=String(data.name||persona.name||'').trim();if(!name)throw Error('User 名称为空');
        persona.name=name;persona.description=String(data.description||'');
        const book=data.character_book;
        if(book?._mmBookReadFailed||mmRuntime.loadedWorldbooks.user?.failed)throw Error('世界书读取失败，请重新读取后导出');
        const linked=String(persona.lorebook||''); let raw=null,bookName=linked||book?.name||'';
        const began=Date.now();
        const [bookRaw,avatar]=await Promise.all([linked?mmCardTimed('读取世界书',()=>mmSettingsFetch('/api/worldinfo/get',{name:linked}).then(r=>r.json())):Promise.resolve(null),mmCardTimed('读取头像',()=>mmAvatarData(snapshot.avatarData||(target.kind==='existing'?mmApi('getPersonaAvatarPath')(target.id):'')))]);raw=bookRaw;
        mmLog('cardRead','user','completed','',began,{worldbook:linked,avatarBytes:avatar.length});
        if(raw&&(!raw.entries||typeof raw.entries!=='object'))throw Error('世界书数据不完整');
        // Preserve native settings and merge editor text changes by stable uid.
        if(book?.entries?.length||book?.name){
            if(linked&&book.name!==linked)throw Error('编辑中的世界书与绑定名称不同，请先保存关联再导出');
            const old=raw||{entries:{}},merged={...old,entries:{}};
            for(let i=0;i<(book.entries||[]).length;i++){
                const e=book.entries[i],uid=e._mmRaw?.uid??i;
                const base=old.entries[uid]||mmNativeBook({entries:[e]}).entries[0];
                merged.entries[uid]={...base,uid,comment:e.comment||'',content:e.content||'',key:e.keys||[],keysecondary:e.secondary_keys||[],disable:e.enabled===false};
            } raw=merged;
        }
        const portable={spec:'chara_card_v2',spec_version:'2.0',data:{...data,name,description:persona.description,tags:snapshot.userTags||[],creator:'鲜虾鱼板面',character_version:'1.0',extensions:{}}};
        delete portable.data._mmUserTags;
        if(raw){portable.data.character_book=mmPortableBook(raw,bookName);persona.lorebook=bookName;}
        else delete portable.data.character_book;
        portable.data.extensions[MM_USER_CARD_KEY]={version:1,persona,avatar,worldbooks:raw?[{name:bookName,data:raw}]:[]};
        return portable;
    }
    function mmExportUserCard() {
        if(mmCardBusy||mmWriteLocked())return;
        const target=structuredClone(mmRuntime.target.user),snapshot=mmFrame('user')?.contentWindow?.__mmSnapshot?.();
        const d=mmCardDialog('导出用户卡');mmCardText(d,'导出：'+(snapshot?.card?.data?.name||'未选择')+' · 包含头像、设定和关联世界书');
        const perform=async format=>{if(mmCardBusy)return;d.close();const began=Date.now();mmLog('exportUserCard','user','started','',began,{format});mmCardProgress(d,'正在读取头像和世界书…');mmCardBusy=true;d.querySelectorAll('button').forEach(b=>b.disabled=true);
            try{const card=await mmBuildUserCard(target,snapshot),name=card.data.name;
                if(format==='json')mmCardDownload(new Blob([JSON.stringify(card,null,2)],{type:'application/json'}),name+'.json');
                else {const img=new hostWindow.Image();img.src=card.data.extensions[MM_USER_CARD_KEY].avatar;await img.decode();
                    const canvas=root.createElement('canvas');const scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
                    const frame=mmFrame('user')?.contentWindow;if(!frame?.injectCharaPNG)throw Error('编辑器尚未准备好');
                    const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));
                    mmCardDownload(new Blob([frame.injectCharaPNG(bytes,card)],{type:'image/png'}),name+'.png');}
                mmLog('exportUserCard','user','completed','',began,{format});mmCardNotice('已导出用户卡');
            }catch(e){mmCardFailure(d,'exportUserCard',e,began);}finally{mmCardBusy=false;d.querySelectorAll('button').forEach(b=>b.disabled=false);}};
        mmCardButton(d,'PNG',()=>perform('png'));mmCardButton(d,'JSON',()=>perform('json'));mmCardButton(d,'取消',()=>d.close());
    }
    function mmReadCardPNG(bytes) {
        if(bytes.length<20||[137,80,78,71,13,10,26,10].some((b,i)=>bytes[i]!==b))throw Error('不是有效 PNG');
        const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let found=null;
        for(let p=8;p+12<=bytes.length;){const n=view.getUint32(p),type=new TextDecoder().decode(bytes.slice(p+4,p+8));if(n>bytes.length-p-12)throw Error('PNG 数据损坏');
            if(type==='tEXt'){const chunk=bytes.slice(p+8,p+8+n),zero=chunk.indexOf(0),key=new TextDecoder().decode(chunk.slice(0,zero));
                if(zero>=0&&(key==='chara'||key==='ccv3')){const encoded=new TextDecoder().decode(chunk.slice(zero+1));const parsed=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))));if(key==='ccv3'||!found)found=parsed;}}
            p+=n+12;if(type==='IEND')break;
        }if(!found)throw Error('PNG 中没有角色卡数据');return found;
    }
    function mmValidateUserCard(card) {
        const data=card?.data||card;if(!data||typeof data.name!=='string'||typeof data.description!=='string')throw Error('卡片缺少名称或正文');
        if(!data.name.trim()||data.name==='current')throw Error('卡片名称无效');
        const extra=data.extensions?.[MM_USER_CARD_KEY];if(extra&&extra.version!==1)throw Error('暂不支持此用户卡版本');
        if(extra?.worldbooks&&(!Array.isArray(extra.worldbooks)||extra.worldbooks.length>1))throw Error('用户卡世界书结构不支持');
        const books=extra?.worldbooks|| (data.character_book? [{name:data.character_book.name||data.name+' 世界书',data:mmNativeBook(data.character_book)}]:[]);
        for(const b of books){if(typeof b.name!=='string'||!b.data?.entries||typeof b.data.entries!=='object'||Array.isArray(b.data.entries))throw Error('世界书结构不完整');for(const e of Object.values(b.data.entries)){if(!e||typeof e.content!=='string')throw Error('世界书条目正文无效');}}
        if(extra?.persona?.lorebook&&!books.some(b=>b.name===extra.persona.lorebook))throw Error('卡片缺少所绑定世界书，未导入');
        return {data,extra,books};
    }
    async function mmImportUserCardFile(file) {
        if(file.size>50*1024*1024)throw Error('卡片超过50MB');
        const png=/\.png$/i.test(file.name),card=png?mmReadCardPNG(new Uint8Array(await file.arrayBuffer())):JSON.parse(await file.text());
        const parsed=mmValidateUserCard(card);let avatar=parsed.extra?.avatar||'';
        if(avatar&&!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(avatar))throw Error('卡片头像格式不支持');
        if(!avatar&&png)avatar=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
        const target=mmRuntime.target.user?.kind==='existing'?structuredClone(mmRuntime.target.user):null;
        const d=mmCardDialog('导入用户卡');mmCardText(d,parsed.data.name+' · '+parsed.books.length+' 本世界书'+(avatar?' · 含头像':' · 无头像'));
        mmCardText(d,'新建会另存同名世界书。覆盖会替换当前 User 及其绑定世界书的内容；未绑定时覆盖导入卡的同名世界书。共用该书的角色也会使用更新后的内容。');
        async function apply(overwrite){if(mmCardBusy||mmWriteLocked())return;d.close();const began=Date.now();let step='准备';mmCardProgress(d,'正在准备导入…');mmLog('importUserCard','user','started','',began,{overwrite});mmCardBusy=true;d.querySelectorAll('button').forEach(b=>b.disabled=true);let bookCreated='',bookChange='';const operation=mmBeginOperation('user',target||{kind:'new'},'import-user-card');
            try {
                if(overwrite&&(!target||mmRuntime.target.user?.id!==target.id))throw Error('当前 U 已变化，请重新导入');
                const names=mmNames('user'),name=overwrite?parsed.data.name:mmUniqueName(parsed.data.name,names);
                if(overwrite&&mmApi('getPersonaIds')().some(id=>id!==target.id&&mmApi('getPersona')(id).name===name))throw Error('已有其他同名 User，请选择新建导入');
                const patch={name,description:parsed.data.description,lorebook:''};
                for(const k of ['title','position','depth','role'])if(parsed.extra?.persona?.[k]!==undefined)patch[k]=parsed.extra.persona[k];
                if(avatar){const image=new hostWindow.Image();image.src=avatar;await image.decode();patch.avatar=await (await hostWindow.fetch(avatar)).blob();}
                if(parsed.books.length){step='世界书';mmCardProgress(d,'正在保存并核验世界书…');patch.lorebook=overwrite?await mmOverwriteCardBook(parsed.books[0],target,(name,change)=>{bookCreated=name;bookChange=change;}):await mmCreateCardBook(parsed.books[0],patch.name+' 世界书',name=>{bookCreated=name;bookChange='created';});}
                step='User';mmCardProgress(d,'正在保存 User…');
                let id;
                if(overwrite){await mmApi('updatePersonaWith')(target.id,p=>({...p,...patch}),{render:'immediate'});id=target.id;}
                else {if(!await mmApi('createPersona')(name,patch,{render:'immediate'}))throw Error('User 创建未确认');id=mmPersonaIdentity(name);}
                step='保存核验';mmCardProgress(d,'正在核验 User 保存结果…');await mmCardTimed('核验User保存',()=>mmConfirmPersona(id,{description:patch.description,lorebook:patch.lorebook}));
                if(Array.isArray(parsed.data.tags))mmSavePersonaTags(id,parsed.data.tags);
                if(mmApi('getPersona')(id).name!==name)throw Error('User 名称回读不一致');
                mmEndOperation('user',operation);mmClearSideDraftCache('user');await mmSelect('user',name,id,true);
                mmLog('importUserCard','user','completed','',began,{overwrite,bookCreated,bookChange});mmCardNotice('已导入：'+name);
            }catch(e){mmCardFailure(d,'importUserCard',e,began,{step,overwrite,bookCreated,bookChange},'导入未完成（'+step+'）：'+e.message+(bookCreated?'；世界书「'+bookCreated+'」'+(bookChange==='created'?'已创建':bookChange==='overwritten'?'已覆盖':'写入结果待核对'):'')+'。详情已记入操作记录。');}
            finally{mmEndOperation('user',operation);mmCardBusy=false;d.querySelectorAll('button').forEach(b=>b.disabled=false);}
        }
        mmCardButton(d,'新建',()=>apply(false));if(target)mmCardButton(d,'覆盖',()=>apply(true));mmCardButton(d,'取消',()=>d.close());
    }
    function mmImportUserCard(){if(mmCardBusy||mmWriteLocked())return;const input=root.createElement('input');input.type='file';input.accept='.png,.json';input.onchange=()=>{if(input.files?.[0])mmImportUserCardFile(input.files[0]).catch(e=>{mmCardFailure(null,'importUserCard',e,undefined,{step:'解析文件'});});};input.click();}
    async function mmConvertUserCard(){
        if(mmCardBusy||mmWriteLocked())return;
        const target=structuredClone(mmRuntime.target.user),snapshot=mmFrame('user')?.contentWindow?.__mmSnapshot?.();
        mmCardBusy=true;const operation=mmBeginOperation('user',target,'convert-user-card');mmInlineBusy('user','convertUserCard',true);
        const began=Date.now(),d=null;let step='读取';mmCardProgress(d,'正在读取头像和世界书…');mmLog('convertUserCard','user','started','',began);
        let createdName='',createdBook='';
        try{
            const card=await mmBuildUserCard(target,snapshot),extra=card.data.extensions[MM_USER_CARD_KEY];
            const name=mmUniqueName(card.data.name,mmNames('char'));
            const image=new hostWindow.Image();image.src=extra.avatar;await image.decode();
            const avatar=await (await hostWindow.fetch(extra.avatar)).blob();
            if(extra.worldbooks.length){step='世界书';mmCardProgress(d,'正在保存并核验世界书…');await mmCreateCardBook(extra.worldbooks[0],name+' 世界书',n=>createdBook=n);}
            step='角色卡';mmCardProgress(d,'正在创建角色卡：'+name+'…');
            const data=structuredClone(card.data);data.name=name;
            if(data.character_book)data.character_book.name=createdBook;
            data.extensions.world=createdBook;
            if(!await mmApi('createCharacter')(name,{description:data.description,avatar,worldbook:createdBook||null,first_messages:[''],extensions:data.extensions}))throw Error('角色卡创建未确认');
            createdName=name;
            const id=await mmCharacterIdentity(name);
            await mmRawFetch('/api/characters/merge-attributes',JSON.stringify({avatar:id,data}));
            const check=(await mmReadRawCharacter(id)).data;
            if(check.description!==data.description||!mmCardEqual(check.character_book,data.character_book))throw Error('角色卡回读不一致');
            await hostWindow.SillyTavern?.getContext?.()?.getOneCharacter?.(id);
            mmLog('convertUserCard','user','completed','',began,{createdName,createdBook});mmCardNotice('已保存为角色卡：'+name);
        }catch(e){mmCardFailure(d,'convertUserCard',e,began,{step,createdName,createdBook},'转卡未完成（'+step+'）：'+e.message+(createdName?'；已创建「'+createdName+'」，请先核对后再重试':'')+(createdBook?'；世界书「'+createdBook+'」已保留':'')+'。详情已记入操作记录。');}
        finally{mmEndOperation('user',operation);mmCardBusy=false;mmInlineBusy('user','convertUserCard',false);}
    }
    // Exact source replacement: never serialize rendered HTML back over an entire message.
    function mmLocateSelection(source, selected, before='', after='') {
        if(!selected||!selected.trim())return null;
        const hits=[];let from=0;
        while(from<=source.length){const at=source.indexOf(selected,from);if(at<0)break;
            // Matches inside HTML attributes, comments, scripts, or styles are not prose.
            const prefix=source.slice(0,at),lt=prefix.lastIndexOf('<'),gt=prefix.lastIndexOf('>');
            const hidden=/<(script|style)\b[^>]*>[^]*$/i.exec(prefix);
            if(!(lt>gt)&&!(prefix.lastIndexOf('<!--')>prefix.lastIndexOf('-->'))&&!(hidden&&!new RegExp('</'+hidden[1]+'\\s*>','i').test(hidden[0]))){
                let score=0;
                for(let n=1;n<=Math.min(100,before.length,at);n++)if(source.slice(at-n,at)===before.slice(-n))score=n;else break;
                for(let n=1;n<=Math.min(100,after.length,source.length-at-selected.length);n++)if(source.slice(at+selected.length,at+selected.length+n)===after.slice(0,n))score++;else break;
                hits.push({start:at,end:at+selected.length,score});
            }from=at+Math.max(1,selected.length);
        }
        hits.sort((a,b)=>b.score-a.score);
        if(!hits.length||hits.length>1&&hits[0].score===hits[1].score)return null;
        return hits[0];
    }
    function mmInitInlineEditing() {
        hostWindow.__awmInlineCleanup?.();
        let selection=null,active=null,timer=0,writing=false,undo=null;
        const bar=root.createElement('div');bar.id='awmInlineSelection';bar.hidden=true;
        bar.style.cssText='position:fixed;z-index:2147483646;padding:0;border:1px solid var(--SmartThemeBorderColor,#aaa);border-radius:7px;background:var(--SmartThemeBlurTintColor,#eee);color:var(--SmartThemeBodyColor,#333);box-shadow:0 3px 12px #0003';
        const edit=root.createElement('button');edit.innerHTML='<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>';edit.type='button';edit.title='编辑选中文字';edit.setAttribute('aria-label','编辑选中文字');edit.style.cssText='display:grid;place-items:center;background:transparent;border:0;color:inherit;width:40px;height:40px;padding:8px;touch-action:manipulation';bar.append(edit);root.body.append(bar);
        const ctx=()=>hostWindow.SillyTavern?.getContext?.()||{};
        const key=()=>{const c=ctx();return [c.characterId,c.groupId,c.chatId,typeof c.getCurrentChatId==='function'?c.getCurrentChatId():''].join('|');};
        const read=id=>mmApi('getChatMessages')(id)[0];
        const generating=()=>{const c=ctx();if(typeof c.isGenerating==='function'&&c.isGenerating())return true;if(c.isGenerating===true)return true;const stop=root.getElementById('mes_stop');return !!(stop&&stop.getClientRects().length&&hostWindow.getComputedStyle(stop).display!=='none');};
        function point(){
            if(!selection)return;
            const range=selection.range,end=range.cloneRange();end.collapse(false);
            const lines=[...range.getClientRects()].filter(r=>r.width||r.height);
            const caret=end.getBoundingClientRect(),last=lines[lines.length-1]||range.getBoundingClientRect();
            const r=caret.height?caret:last,v=hostWindow.visualViewport;
            const left=v?.offsetLeft||0,top=v?.offsetTop||0,right=left+(v?.width||hostWindow.innerWidth),bottom=top+(v?.height||hostWindow.innerHeight);
            const width=42,height=42,gap=6;
            let x=r.right+gap,y=r.top+(r.height-height)/2;
            if(x+width>right-gap){x=right-width-gap;y=r.bottom+gap;}
            bar.style.left=Math.max(left+gap,Math.min(x,right-width-gap))+'px';
            bar.style.top=Math.max(top+gap,Math.min(y,bottom-height-gap))+'px';
        }
        function check(s){if(key()!==s.key||ctx().chat!==s.chat||ctx().chat?.[s.id]!==s.ref)throw Error('聊天或楼层已变化，请取消后重选');if(generating())throw Error('请等生成结束再编辑');const now=read(s.id);if(!now||now.message!==s.source||(ctx().chat?.[s.id]?.swipe_id??0)!==s.swipe)throw Error('原消息已修改或切换版本，请取消后重选');}
        function capture(){if(!mmFeatures().inlineEdit){bar.hidden=true;selection=null;return;}if(active||writing)return;const sel=hostWindow.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount){bar.hidden=true;return;}
            const r=sel.getRangeAt(0),el=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement,end=r.endContainer.nodeType===1?r.endContainer:r.endContainer.parentElement;
            const text=el?.closest('.mes_text');if(!text||!text.contains(end)||el.closest('a,button,input,textarea,[contenteditable=true],pre,code,details,table')||end.closest('a,button,input,textarea,[contenteditable=true],pre,code,details,table')){bar.hidden=true;return;}
            const frag=r.cloneContents();if(frag.querySelector('iframe,script,style,details,table,button,pre,code')){bar.hidden=true;return;}
            const message=text.closest('.mes[mesid]'),id=Number(message?.getAttribute('mesid'));if(!Number.isInteger(id)){bar.hidden=true;return;}
            let raw;try{raw=read(id);}catch{return;}if(!raw||!['assistant','user'].includes(raw.role))return;
            const left=r.cloneRange();left.selectNodeContents(text);left.setEnd(r.startContainer,r.startOffset);
            const right=r.cloneRange();right.selectNodeContents(text);right.setStart(r.endContainer,r.endOffset);
            selection={container:text,range:r.cloneRange(),text:r.toString(),before:left.toString().slice(-100),after:right.toString().slice(0,100),id,source:raw.message,key:key(),chat:ctx().chat,ref:ctx().chat?.[id],swipe:ctx().chat?.[id]?.swipe_id??0};
            if(!selection.text.trim()){bar.hidden=true;return;}bar.hidden=false;point();
        }
        function queue(){clearTimeout(timer);timer=hostWindow.setTimeout(()=>{try{capture();}catch(e){bar.hidden=true;selection=null;mmLog('inlineCapture','chat','failed',e);}},140);}
        function cancel(){if(writing||!active)return;const s=active;s.editor?.remove();s.recovery?.remove();mmLog('inlineEdit','chat','cancelled','',undefined,{messageId:s.id});active=null;selection=null;bar.hidden=true;}
        function notice(s,msg){s.note.textContent=msg;}
        async function save(){if(!active||writing)return;const s=active,began=Date.now();mmLog('inlineSave','chat','started','',began,{messageId:s.id});
            try{check(s);const replacement=s.span.value.replace(/\r\n?/g,'\n');if(replacement===s.text){cancel();return;}
                const next=s.source.slice(0,s.loc.start)+replacement+s.source.slice(s.loc.end);writing=true;s.span.readOnly=true;s.tools.querySelectorAll('button').forEach(b=>b.disabled=true);notice(s,'保存中…');
                await mmApi('setChatMessages')([{message_id:s.id,message:next}],{refresh:'affected'});
                if(key()!==s.key||ctx().chat!==s.chat)throw Error('聊天已切换，请在原聊天核对保存结果');
                if(read(s.id)?.message!==next)throw Error('保存回读不一致');
                mmLog('inlineSave','chat','completed','',began,{messageId:s.id});undo={...s,source:next,previous:s.source,ref:ctx().chat?.[s.id]};s.editor.remove();s.recovery?.remove();active=null;selection=null;if(mmFeatures().inlineEdit)showUndo(s.id);
            }catch(e){mmLog('inlineSave','chat','failed',e,began,{messageId:s.id});notice(s,'未完成：'+e.message);if(!s.span.isConnected){toast('保存结果待核对，编辑内容已保留在页面底部','error');s.span.readOnly=false;const recovery=root.createElement('div');recovery.style.cssText='position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow:auto;z-index:2147483646;background:var(--SmartThemeBlurTintColor,#eee);padding:12px';recovery.append(s.editor);root.body.append(recovery);s.recovery=recovery;}}
            finally{writing=false;if(active){s.span.readOnly=false;s.tools.querySelectorAll('button').forEach(b=>b.disabled=false);}}
        }
        function showUndo(id){const mes=root.querySelector('.mes[mesid="'+id+'"] .mes_text');if(!mes)return;root.getElementById('awmInlineUndo')?.remove();const b=root.createElement('button');b.id='awmInlineUndo';b.textContent='↺';b.title='撤回刚才保存的修改';b.setAttribute('aria-label',b.title);b.className='menu_button';b.style.cssText='min-width:44px;min-height:44px;font-size:26px;font-weight:800;line-height:1;margin:6px;touch-action:manipulation';b.onclick=async()=>{if(!undo||writing||active)return;try{check(undo);writing=true;await mmApi('setChatMessages')([{message_id:undo.id,message:undo.previous}],{refresh:'affected'});if(read(undo.id)?.message!==undo.previous)throw Error('撤回后回读不一致');mmLog('inlineUndo','chat','completed','',undefined,{messageId:undo.id});undo=null;b.remove();}catch(e){mmLog('inlineUndo','chat','failed',e);toast('无法撤销：'+e.message,'error');}finally{writing=false;}};mes.after(b);}
        edit.addEventListener('pointerdown',e=>e.preventDefault());
        edit.onclick=()=>{if(!mmFeatures().inlineEdit||!selection||active||writing)return;const s=selection;try{check(s);s.loc=mmLocateSelection(s.source,s.text,s.before,s.after);if(!s.loc)throw Error('选文无法唯一对应原文，请多选几个字，或用原来的小铅笔');
            if(!s.container?.isConnected||!s.container.contains(s.range.startContainer)||!s.container.contains(s.range.endContainer)||s.range.toString()!==s.text)throw Error('选区已被刷新或其他插件改变，请重新选择');
            const endNode=s.range.endContainer.nodeType===1?s.range.endContainer:s.range.endContainer.parentElement;
            const paragraph=endNode.closest('p');const anchor=paragraph&&s.container.contains(paragraph)?paragraph:s.container;
            s.editor=root.createElement('div');s.editor.className='awm-inline-editor';s.editor.setAttribute('data-awm-editor','true');s.editor.style.cssText='display:block;box-sizing:border-box;width:100%;max-width:100%;min-width:0;clear:both;margin:8px 0';
            s.span=root.createElement('textarea');s.span.className='awm-inline-text';s.span.setAttribute('aria-label','编辑选中文字');s.span.rows=Math.max(3,Math.min(10,s.text.split('\n').length+1));s.span.value=s.text;
            s.span.style.cssText='display:block;box-sizing:border-box;width:100%;max-width:100%;min-width:0;min-height:96px;margin:0;padding:10px 12px;font:inherit;color:inherit;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;resize:vertical;border:1px solid var(--SmartThemeQuoteColor,#9a9);outline:none;background:var(--SmartThemeBlurTintColor,#eee);border-radius:6px';
            s.editor.append(s.span);
            s.tools=root.createElement('span');s.tools.contentEditable='false';s.tools.style.cssText='display:inline-flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:12px;vertical-align:middle;padding:6px 8px;max-width:100%;user-select:none';
            s.history=[s.text];s.historyIndex=0;
            const record=()=>{const value=s.span.value.replace(/\r\n?/g,'\n');if(value===s.history[s.historyIndex])return;s.history=s.history.slice(0,s.historyIndex+1);s.history.push(value);if(s.history.length>100)s.history.shift();s.historyIndex=s.history.length-1;};
            const rollback=()=>{if(writing||s.historyIndex<1)return;s.span.value=s.history[--s.historyIndex];s.span.focus({preventScroll:true});s.span.setSelectionRange(s.span.value.length,s.span.value.length);};
            s.span.addEventListener('input',record);
            for(const [label,title,color,fn] of [['✓','保存修改','#287a3e',save],['×','取消编辑','#bd3636',cancel],['↺','撤回上一步编辑','inherit',rollback]]){
                const b=root.createElement('button');b.textContent=label;b.type='button';b.title=title;b.setAttribute('aria-label',title);
                b.style.cssText='display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;min-width:44px;min-height:44px;font-family:Arial,sans-serif;font-size:28px;font-weight:900;line-height:1;color:'+color+';background:transparent;border:1px solid transparent;border-radius:7px;padding:6px;touch-action:manipulation;cursor:pointer';
                b.addEventListener('pointerdown',e=>e.preventDefault());b.onclick=fn;s.tools.append(b);
            }
            s.note=root.createElement('span');s.note.setAttribute('role','status');s.tools.append(s.note);s.editor.append(s.tools);
            hostWindow.getSelection()?.removeAllRanges();anchor.after(s.editor);active=s;bar.hidden=true;
            s.editor.addEventListener('pointerup',e=>e.stopPropagation());s.editor.addEventListener('click',e=>e.stopPropagation());
            s.span.focus({preventScroll:true});s.span.setSelectionRange(s.span.value.length,s.span.value.length);
            mmLog('inlineEdit','chat','opened','',undefined,{messageId:s.id,selectedLength:s.text.length});
            s.span.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();rollback();}if(e.key==='Escape'){e.preventDefault();cancel();}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();save();}});
        }catch(e){s.editor?.remove();if(active===s)active=null;selection=null;mmLog('inlineEdit','chat','failed',e,undefined,{messageId:s.id});bar.hidden=true;toast(e.message,'warning');}};
        function scroll(){if(!active)bar.hidden=true;}
        function unload(e){if(active){e.preventDefault();e.returnValue='';}}
        root.addEventListener('selectionchange',queue);root.addEventListener('pointerup',queue);root.addEventListener('scroll',scroll,true);hostWindow.addEventListener('beforeunload',unload);
        hostWindow.__awmInlineFeatureSync=()=>{if(!mmFeatures().inlineEdit){bar.hidden=true;selection=null;root.getElementById('awmInlineUndo')?.remove();if(active)notice(active,'功能已关闭，本次编辑仍可保存或取消');}else if(!active)queue();};
        hostWindow.__awmInlineCleanup=()=>{delete hostWindow.__awmInlineFeatureSync;root.getElementById('awmInlineUndo')?.remove();cancel();clearTimeout(timer);bar.remove();root.removeEventListener('selectionchange',queue);root.removeEventListener('pointerup',queue);root.removeEventListener('scroll',scroll,true);hostWindow.removeEventListener('beforeunload',unload);};
    }

    let mmInitialized=false;
    function init() {
        if(mmInitialized||!root.body)return;
        mmInitialized=true;
        addStyle();
        mmAddStyle();
        makePanel();
        createMenuButton();
        mmCreateLauncher();
        mmWatchPersonaTags();
        mmInitInlineEditing();
        mmPresetSearchWatch();
        mmInjectExtensionSettings();
        mmBackupIdleInit();
        mmBackupSchedule(true);
        console.log('[鲜虾鱼板面] V10.16 loaded');
    }

    if(root.readyState==='loading')root.addEventListener('DOMContentLoaded',init,{once:true});
    else hostWindow.setTimeout(init,0);
})();
