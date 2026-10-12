import {HostStorage} from './host-storage.js?v=11.1';
import {showTokenCount} from './token-count.js?v=11.1';
export const storage=new HostStorage();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tokenTexts=new Map();let tokenId=0,host,app,pending;
export function tokenMarkup(text){const id=String(++tokenId);tokenTexts.set(id,text);return `<span data-fb-token="${id}">…</span>`;}
export function countInto(el,text){showTokenCount(el,text,()=>window.SillyTavern?.getContext?.(),e=>host?.log('token','failed',{message:e.message}));}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.download=name;a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function showFailure(){let box=document.getElementById('fishboard-recovery');if(!box){box=document.createElement('section');box.id='fishboard-recovery';document.body.append(box);}box.innerHTML=`<b>鱼板面资料暂未读取成功</b><p>请稍后重新读取。现有资料不会被空白内容覆盖。</p><p data-message role="status"></p><button data-retry>重新读取</button><button data-export>导出排查记录</button><button data-close>关闭</button>`;box.querySelector('[data-close]').onclick=()=>box.remove();box.querySelector('[data-retry]').onclick=async()=>{const button=box.querySelector('[data-retry]');button.disabled=true;button.textContent='读取中…';try{await host.retryStartup();await openChat();}catch(e){box.querySelector('[data-message]').textContent=storage.initial?'保存已暂停，请先导出本页资料再核对。':'暂时未能连接，请检查连接后重试。';host.log('storage.retry','failed',{message:e.message});}finally{button.disabled=false;button.textContent='重新读取';}};box.querySelector('[data-export]').onclick=()=>{const local={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/^(鲜虾鱼板面\.|ame-style-management-v0[35])/.test(key))local[key]=localStorage.getItem(key);}download('鲜虾鱼板面_排查记录.json',{data:storage.initial,local,diagnostics:host?.report()});};}
export async function social(){if(app)return app;if(!pending){pending=(async()=>{const m=await import('./shrimp/index.js?v=11.1');const a=await m.mountShrimp();if(!a.state)throw a.loadError||Error('聊天资料未读完');app=a;return a;})().catch(e=>{pending=null;throw e;});}return pending;}
let opening;
export function openChat(){if(opening)return opening;opening=openChatOnce().finally(()=>opening=null);return opening;}
async function openChatOnce(){try{if(storage.error)await host.retryStartup();const a=await social();await a.open();host.close();}catch(e){if(document.getElementById('awm-panel-v03')?.style.display!=='block')host.open('mianmian');host.log('social.open','failed',{message:e.message});if(storage.error)showFailure();else{let box=document.getElementById('fishboard-chat-error');if(!box){box=document.createElement('section');box.id='fishboard-chat-error';box.className='fishboard-notice';document.body.append(box);}box.innerHTML='<b>聊天资料暂未读取成功</b><p>请稍后重试。</p><button data-retry>重新读取</button><button data-close>关闭</button>';box.querySelector('[data-retry]').onclick=()=>{box.remove();openChat();};box.querySelector('[data-close]').onclick=()=>box.remove();}}}
export async function viewer(options){const m=await import('./preset-viewer.js?v=11.1');return m.openPresetViewer(options);}
let attached=false;
export function attach(api){host=api;if(attached)return;attached=true;api.savedPresets=()=>structuredClone(Object.values(app?.state?.sources||{}));api.readShrimp=async()=>structuredClone((await social()).state);api.logShrimp=(stage,details)=>api.log(stage,'event',details);api.openChat=openChat;api.viewPresets=viewer;
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./wechat-shell.css?v=11.1',import.meta.url);document.head.append(css);
 function decorate(){
  for(const el of document.querySelectorAll('[data-fb-token]')){const text=tokenTexts.get(el.dataset.fbToken);if(text!==undefined){tokenTexts.delete(el.dataset.fbToken);delete el.dataset.fbToken;countInto(el,text);}}
  const panel=document.getElementById('awm-panel-v03');if(panel&&!panel.querySelector('[data-fb-home]')){const button=document.createElement('button');button.dataset.fbHome='';button.textContent='‹ 微信';button.onclick=openChat;panel.querySelector('.awm-head')?.prepend(button);}
  for(const el of document.querySelectorAll('.awm-tab[data-page="styles"]'))if(el.textContent==='文风')el.textContent='收藏';
  for(const el of document.querySelectorAll('.awm-tab[data-mm-side]')){const text=el.dataset.mmSide==='char'?'C 备忘录':'U 备忘录';if(el.textContent!==text)el.textContent=text;}
  const search=document.getElementById('awmPresetSearchDialog');if(search&&!search.querySelector('[data-fb-view]')){const button=document.createElement('button');button.dataset.fbView='';button.textContent='打开新窗口';button.onclick=()=>viewer().catch(e=>window.toastr?.error(e.message));search.querySelector('[data-save]')?.after(button);}

 }
 new MutationObserver(decorate).observe(document.documentElement,{childList:true,subtree:true});decorate();
 // Original launcher remains a usable fallback; only its click routing changes.
 document.addEventListener('click',e=>{if(e.target.closest('#awm-menu-button-v04')){e.preventDefault();e.stopImmediatePropagation();openChat();}},true);
 window.addEventListener('fishboard-storage-error',showFailure);
 // Load independently after the original fishboard initialized; no read/write calls to its data.
 if(!storage.error)social().catch(e=>api.log('social.init','failed',{message:e.message}));
}
export async function exportModules(){let a;try{a=await social();}catch(e){window.toastr?.warning('鱼板面资料照常导出；聊天未读取成功，未包含聊天备份');return {version:1,unavailable:true};}await a.store.chain;const state=structuredClone(a.state);state.settings.customKey='';let reading=null,readingUnavailable=false;try{await a.readingLoad();await a.reading.chain;reading=structuredClone(a.reading.data);}catch(e){readingUnavailable=true;window.toastr?.warning('文风、草稿和聊天已包含；书架未读到，请另行备份书架');}return {version:1,social:state,reading,readingUnavailable};}
export async function validateModules(modules){if(!modules||modules.unavailable)return;if(modules.version!==1)throw Error('附加模块备份版本不支持');const {validateState}=await import('./shrimp/core.js?v=11.1');validateState(modules.social);if(modules.reading)for(const value of Object.values(modules.reading)){if(value.schema!==1||!Array.isArray(value.items))throw Error('书架备份格式无效');}}
export async function importModules(modules){if(!modules||modules.unavailable)return;await validateModules(modules);const a=await social();await a.store.chain;const prior=structuredClone(a.state);download('鲜虾鱼板面_聊天导入前备份.json',prior);a.state=a.store.state=structuredClone(modules.social);await a.save();if(modules.reading){await a.readingLoad();for(const place of ['browser','tavern'])if(modules.reading[place])await a.reading.commit(place,modules.reading[place].items);}a.render();}

export async function preserveModules(){if(app?.state){await app.save();}}
