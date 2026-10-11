import { clone, uid } from './core.js?v=10.8';
import { features, publisherKey, followPublisher, sanitizePublisher, activePublishers } from './features.js?v=10.8';
import { ctx, storyKey, storyName, storyContext, promptRows } from './bridge.js?v=10.8';
import { convertText } from './text-script.js?v=10.8';

export function featureMethods({ esc, btn, field, check }) {
    return {
        async chooseOption(id) {
            const c = this.conversation(), m = c?.messages.find(x => x.id === id);
            if (m?.kind !== 'option' || !m.contextRef) return;
            if (storyKey() !== m.contextRef.key) throw new Error('这条候选属于另一个酒馆聊天，请切回原故事再填入');
            const current = await storyContext(this.state.settings, m.contextRef.floor);
            if (current.signature !== m.contextRef.signature || (m.contextRef.latest && ctx().chat.length - 1 !== m.contextRef.floor)) {
                if (!confirm('这条候选生成后，酒馆正文已经变化。仍要填入输入框吗？')) return;
            }
            const input = document.querySelector('#send_textarea');
            if (!input || input.disabled) throw new Error('未找到可用的酒馆聊天输入框');
            if (input.value.trim()) {
                this.modal('酒馆输入框已有文字',`<p>请选择如何放入候选，取消会保留原输入。</p><div class="shr-pre">${esc(m.insertText||m.text)}</div>`,btn('dismiss','取消')+btn('injectReplace','替换现有输入')+btn('injectAppend','追加到末尾','','shr-primary'),{ text:m.insertText||m.text, key:storyKey(), original:input.value });
                return;
            }
            this.injectOption(m.insertText||m.text, storyKey(), input.value, false);
        },
        injectOption(text,key,original,append) {
            if (storyKey() !== key) throw new Error('已切换酒馆聊天，未填入');
            const el = document.querySelector('#send_textarea');
            if (!el || el.disabled) throw new Error('酒馆输入框暂不可用');
            if (el.value !== original) throw new Error('输入框内容刚刚发生变化，请重新点选候选');
            const value = append && original ? original + '\n' + text : text;
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
            if (setter && el instanceof HTMLTextAreaElement) setter.call(el,value); else el.value = value;
            el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
            this.closeModal(); this.close(); el.focus(); el.setSelectionRange?.(value.length,value.length); this.status('已填入酒馆输入框，尚未发送');
        },
        renderPublisherMessage(m) {
            const p=m.publisher, existing=this.state.publishers.find(x=>publisherKey(x)===publisherKey(p));
            return `<div class="shr-publisher-card"><button data-action="publisherSuggestion" data-id="${esc(m.id)}"><small>公众号推荐 · 虚构世界</small><b>▤ ${esc(p.name)}</b><p>${esc(p.intro)}</p><small>${esc(p.topics)}</small></button>${btn('followSuggested',existing?.followed ? '已关注 · 查看' : '关注',m.id,existing?.followed?'':'shr-primary')}</div>`;
        },
        publisherSuggestion(id) {
            const m=this.conversation()?.messages.find(x=>x.id===id); if(!m?.publisher)return;
            const p=m.publisher;
            this.modal('推荐公众号',`<h2>${esc(p.name)}</h2><p>${esc(p.intro)}</p><h4>关注主题</h4><p>${esc(p.topics)}</p><h4>文章口吻</h4><p>${esc(p.style)}</p><small>关注后才参与刷新 · 可继续让人格调整推荐</small>`,btn('followSuggested','关注',id,'shr-primary'));
        },
        async followSuggested(id) {
            if(this.sending || this.gen.busy)throw new Error('请等当前生成结束后再关注');
            const m=this.conversation()?.messages.find(x=>x.id===id); if(!m?.publisher)return;
            const already=this.state.publishers.find(x=>publisherKey(x)===publisherKey(m.publisher))?.followed;
            const p=followPublisher(this.state,m.publisher);await this.save();this.closeModal();if(already){this.tab='chats';this.detail=true;this.activePublisher=p.id;}this.render();this.status(`已关注「${p.name}」`);
        },
        publishers() {
            const key=storyKey(), list=this.state.publishers.filter(p=>p.scope==='*'||p.scope===key);
            this.modal('公众号订阅',`<p class="shr-note">各公众号按自己的主题和口吻，从当前正文、历史记录和世界资料中选择内容。未关注的号不生成文章。</p>${list.map(p=>`<div class="shr-subscription"><div><b>${esc(p.name)}</b><small>${p.followed?'已关注':'未关注'} · ${p.script==='traditional'?'繁体':'简体'} · ${p.scope==='*'?'各故事通用':'当前故事'}</small><p>${esc(p.intro)}</p></div><div>${btn('editPublisher','编辑',p.id)}${btn('togglePublisher',p.followed?'取消关注':'关注',p.id)}</div></div>`).join('')}`,btn('editPublisher','自定义公众号','','shr-primary'));
        },
        editPublisher(id) {
            const p=this.state.publishers.find(p=>p.id===id) || { name:'',intro:'',topics:'',style:'',script:'simplified',scope:storyKey()||'*',followed:true };
            this.modal(id?'编辑公众号':'自定义公众号',field('name','名称',p.name)+field('intro','简介',p.intro)+`<label class="shr-field">关注主题<textarea name="topics" rows="3">${esc(p.topics)}</textarea></label><label class="shr-field">文章口吻<textarea name="style" rows="4">${esc(p.style)}</textarea></label><label class="shr-field">文字<select name="script"><option value="simplified" ${p.script==='simplified'?'selected':''}>简体中文</option><option value="traditional" ${p.script==='traditional'?'selected':''}>繁体中文</option></select></label><label class="shr-field">订阅范围<select name="scope"><option value="*" ${p.scope==='*'?'selected':''}>各故事通用（内容仍按故事分别生成）</option>${storyKey()?`<option value="${esc(storyKey())}" ${p.scope===storyKey()?'selected':''}>仅当前故事</option>`:''}</select></label>${check('followed','关注这个公众号',p.followed)}<p class="shr-note">港媒口吻和文字简繁独立。推荐名片默认简体。</p>`,btn('savePublisher','保存','','shr-primary'),{id,key:storyKey()});
        },
        async savePublisher() {
            if(this.gen.busy || this.refreshing)throw new Error('请等当前生成结束再修改订阅');
            const v=this.values(),d=this.modalData;
            if(d.key!==storyKey())throw new Error('故事已切换，请重新打开公众号设置');
            const p=sanitizePublisher(v,v.scope);p.followed=!!v.followed;
            p.name=await convertText(p.name,p.script);p.intro=await convertText(p.intro,p.script);
            if(this.state.publishers.some(x=>x.id!==d.id && publisherKey(x)===publisherKey(p)))throw new Error('该范围内已有同名公众号，请编辑已有名片');
            if(d.id)Object.assign(this.state.publishers.find(x=>x.id===d.id),p);else this.state.publishers.push({...p,id:uid(),createdAt:Date.now()});
            await this.save();this.render();this.publishers();
        },
        async togglePublisher(id) {
            if(this.gen.busy || this.refreshing)throw new Error('请等当前生成结束再修改订阅');
            const p=this.state.publishers.find(x=>x.id===id);if(!p)return;p.followed=!p.followed;await this.save();this.render();this.publishers();
        },
        publisherFilter() {
            const all=this.state.publishers.filter(p=>p.scope==='*'||p.scope===storyKey());
            if(this.newsFilter && !all.some(p=>p.id===this.newsFilter))this.newsFilter='';
            return `<div class="shr-publisher-filter">${btn('filterNews','全部文章','',!this.newsFilter?'selected':'')}${all.map(p=>btn('filterNews',esc(p.name),p.id,this.newsFilter===p.id?'selected':'')).join('')}${btn('publishers','管理订阅')}</div>`;
        },
    };
}
