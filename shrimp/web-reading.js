import {readerLocation,validateReaderMessage} from './reader-link.js?v=11.2';
import {uid} from './core.js?v=11.2';
import {diagnostics} from './diagnostics.js?v=11.2';
export function webURL(value){const u=new URL(value.trim());if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('请填写完整的 http / https 网页地址');return u.href;}
export function webBook(v,old={}){return {...old,id:old.id||uid(),kind:'book',sourceType:'web',title:v.title.trim()||new URL(webURL(v.url)).hostname,url:webURL(v.url),coverUrl:v.coverUrl?.trim()?webURL(v.coverUrl):'',group:v.group?.trim()||'',createdAt:old.createdAt||Date.now()};}
export function webReadingMethods({esc,btn,field}){return {
 bindReaderBridge(){window.addEventListener('message',e=>{const frame=this.root.querySelector('.shr-web iframe');if(frame&&e.source===frame.contentWindow&&e.data?.type==='shrimp.reader.ready'){try{const u=new URL(e.origin);if(u.protocol==='https:'&&(u.hostname==='jjwxc.net'||u.hostname.endsWith('.jjwxc.net')))frame.contentWindow.postMessage({type:'shrimp.reader.connect',token:this.readerToken},e.origin);}catch{}return;}const data=validateReaderMessage(e,frame,this.readerToken);if(!data)return;this.readerConnected=true;this.readerCurrentUrl=data.url;const key=this.webKey;
  this.readerSaveChain=(this.readerSaveChain||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(this.webKey!==key||!this.readingReady)return;
   const existing=this.reading.rows('book').find(r=>r.bookKey===data.bookKey),place=existing?.place||'tavern';
   if(!data.chapterId&&existing?.lastChapter)return;
   const row={...(existing||{}),id:existing?.id||uid(),kind:'book',sourceType:'web',sourceKind:'novel',bookKey:data.bookKey,title:data.bookTitle||existing?.title||'晋江 · 作品 '+data.novelId,url:data.url,lastUrl:data.url,lastChapter:data.chapterId,lastChapterTitle:data.title,createdAt:existing?.createdAt||Date.now(),lastRead:Date.now()};
   if(existing?.lastUrl===data.url&&existing?.lastChapterTitle===data.title)return;
   await this.reading.put(place,row);this.readerLastSaved=Date.now();diagnostics.log('reading.resume.saved',{count:1});
  }).catch(e=>{this.readerLastError=e.message;this.error(e);});
 });},
 connectReader(){const frame=this.root?.querySelector('.shr-web iframe');if(!frame||frame.dataset.connected)return;frame.dataset.connected='1';this.readerToken=uid();this.readerConnected=false;this.readerLastError='';const token=this.readerToken;

 },

 webRender(){const r=this.readingRow(this.webKey);return `<main class="shr-wide shr-web"><header class="shr-mini-head"><b>${esc(r.title)}</b><div class="shr-mini-capsule"><button type="button" data-action="web:menu" aria-label="更多">•••</button><span></span><button type="button" data-action="web:exit" aria-label="关闭小程序">◉</button></div></header><iframe title="${esc(r.title)}" data-reader-key="${esc(this.webKey)}" src="${esc(r.lastUrl||r.url)}" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe></main>`;},
 async webAction(a,id){
 diagnostics.log('reading.web',{operation:a});
 if(a==='platform'){
  const platforms={jinjiang:{title:'晋江文学城',url:'https://wap.jjwxc.net/'},quark:{title:'夸克网盘',url:'https://pan.quark.cn/'},weread:{title:'微信读书',url:'https://weread.qq.com/'}};
  const platform=platforms[id];if(!platform)throw Error('未知阅读应用');
  let row=this.reading.rows('book').find(r=>r.platformId===id);
  if(!row){row={...webBook(platform),platformId:id,sourceKind:'app'};const place=this.readingDefault||'browser';await this.reading.put(place,row);row={...row,place};}
  return this.webAction('open',row.place+':'+row.id);
 }
 if(a==='add'){this.modal('添加网站',`${field('url','网站地址','')}${field('title','名称（选填）','')}`,btn('web:save','添加'));return;}
 if(a==='save'){const v=this.values(),old=this.modalData,r=webBook(v,old||{});try{const point=readerLocation(r.url);if(point)Object.assign(r,{sourceKind:'novel',bookKey:point.bookKey,lastUrl:point.url,lastChapter:point.chapterId});}catch{}if(new URL(r.url).origin===location.origin)throw Error('请填写阅读平台地址，不能嵌入酒馆自身');if(this.reading.rows('book').some(x=>x.url===r.url&&x.id!==r.id))throw Error('这个网页已经在书架中');await this.reading.put(old?.place||v.place||this.readingDefault||'browser',r);this.closeModal();this.render();return;}
 if(a==='open'){this.readerCurrentUrl=null;this.readerLastSaved=0;this.webKey=id;this.webText='';this.render();return;}
 if(a==='exit'){this.closeModal();await this.readerSaveChain;this.webKey=null;this.readerToken=null;this.webText='';this.tab=this.webReturn||'reading';this.webReturn=null;this.render();return;}
 if(a==='menu'){this.modal('更多',`<div class="shr-mini-menu">${btn('web:reload','重新加载')}<a href="${esc(this.readerCurrentUrl||this.readingRow(this.webKey).lastUrl||this.readingRow(this.webKey).url)}" target="_blank" rel="noopener noreferrer">在平台打开</a></div><p class="shr-note">网页无法嵌入或登录时，请在平台打开。账号书架及云端进度由平台提供。</p><p class="shr-note">${this.readerLastError?'续读保存失败':this.readerLastSaved&&this.readerConnected?'已记录章节网址':'自动续读需安装配套脚本'}</p>`);return;}
 if(a==='reload'){this.closeModal();const frame=this.root.querySelector('.shr-web iframe');if(frame){const r=this.readingRow(this.webKey);frame.src=this.readerCurrentUrl||r.lastUrl||r.url;}return;}
 throw Error('此功能未提供');
 }
};}
