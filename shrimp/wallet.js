import {ctx,storyKey} from './bridge.js?v=11.1';
import {uid} from './core.js?v=11.1';
import {diagnostics} from './diagnostics.js?v=11.1';
export function proseCount(chat,tag=''){
 let total=0;const floors=[];
 for(const [index,m] of (chat||[]).entries()){
  if(m.is_user||m.is_system)continue;
  let text=String(m.mes||'');
  if(tag){const safe=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');text=[...text.matchAll(new RegExp('<'+safe+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+safe+'>','gi'))].map(x=>x[1]).join('\n');}
  else {const body=[...text.matchAll(/<(?:正文|content|prose)(?:\s[^>]*)?>([\s\S]*?)<\/(?:正文|content|prose)>/gi)];if(body.length)text=body.map(x=>x[1]).join('\n');}
  text=text.replace(/<(think|analysis|reasoning|shrimp_social|status_app|status|prose_header|bilingual_note|epilogue_note|details|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/```[\s\S]*?```/g,'').replace(/<[^>]+>/g,'').replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi,' ');
  const count=(text.match(/[\p{L}\p{N}]/gu)||[]).length;floors.push({index,count});total+=count;
 }
 return {total,floors};
}
export function balanceFor(state,key,chat){
 const book=state.wallets?.[key]||{entries:[],income:[],tag:''};
 const total=(book.income||[]).reduce((sum,row)=>sum+row.amount,0);
 const spent=book.entries.reduce((sum,row)=>sum+row.amount,0);
 return {total,floors:book.income||[],spent,available:Math.max(0,total-spent),deficit:Math.max(0,spent-total),book};
}
export function creditFloor(book,message,index){
 const id=message.extra?.fishboardWalletId;if(!id)throw Error('楼层收入标识未保存');
 book.income||=[];if(book.income.some(row=>row.id===id))return false;
 book.income.push({id,index,amount:proseCount([message],book.tag).total,createdAt:Date.now()});return true;
}
export function walletMethods({esc,btn,field}){return {
 async walletSettle(type='normal',dryRun=false){
  if(dryRun||!['normal',undefined,null,''].includes(type)||this.gen.busy)return;
  const context=ctx(),key=storyKey(),chat=context?.chat;
  if(!key||!Array.isArray(chat)||this.store.blocked)return;
  const latest=chat.findLastIndex(m=>!m.is_user&&!m.is_system);
  if(latest<0)return;
  const run=async()=>{
   if(key!==storyKey()||chat!==ctx().chat)return;
   await this.walletMigrate(context,key,chat);
   const book=this.state.wallets[key],message=chat[latest];
   if(!message||message.is_user||message.is_system)return;
   if(!message.extra?.fishboardWalletId){
    message.extra||={};message.extra.fishboardWalletId=uid();
    try{if(typeof context.saveChat!=='function')throw Error('酒馆保存接口未就绪');await context.saveChat();}
    catch(error){delete message.extra.fishboardWalletId;throw error;}
   }
   if(key!==storyKey()||chat!==ctx().chat)return;
   if(!creditFloor(book,message,latest))return;
   try{await this.save();diagnostics.log('wallet.income',{count:book.income.at(-1).amount,stage:'saved'});}
   catch(error){this.store.blocked=true;diagnostics.log('wallet.income_failure',{stage:'save'});throw error;}
  };
  const task=(this.walletIncomeChain||Promise.resolve()).catch(()=>{}).then(run);this.walletIncomeChain=task;return task;
 },
 async walletMigrate(context=ctx(),key=storyKey(),chat=context?.chat||[]){
  if(!key)return;
  this.state.wallets||={};let book=this.state.wallets[key];
  if(!book){this.state.wallets[key]={entries:[],income:[],tag:''};return;}
  if(Array.isArray(book.income))return;
  // Freeze previously available 10.6 income once; never remove old transfer records.
  const marked=[];
  for(const message of chat){if(message.is_user||message.is_system)continue;if(!message.extra?.fishboardWalletId){message.extra||={};message.extra.fishboardWalletId=uid();marked.push(message);}}
  try{if(marked.length){if(typeof context.saveChat!=='function')throw Error('酒馆保存接口未就绪');await context.saveChat();}}
  catch(error){for(const m of marked)delete m.extra.fishboardWalletId;throw error;}
  if(key!==storyKey())throw Error('故事已切换，请重新打开钱包');
  book.income=[];chat.forEach((m,index)=>{if(!m.is_user&&!m.is_system)creditFloor(book,m,index)});
  try{await this.save();diagnostics.log('wallet.migrated',{count:book.income.length});}
  catch(error){this.store.blocked=true;throw error;}
 },
 walletSnapshot(){const key=storyKey();if(!key)throw Error('请先打开一个酒馆聊天');return {key,...balanceFor(this.state,key,ctx().chat)};},
 async walletAction(a,id){
  if(storyKey())await this.walletMigrate();
  if(a==='open'){const w=this.walletSnapshot();diagnostics.log('wallet.count',{count:w.total,spent:w.spent});this.modal('钱包',`<div class="shr-wallet-balance"><small>零钱 · 正文余额</small><h1>¥ ${w.available}</h1><p>累计收入 ${w.total} · 已转出 ${w.spent}</p></div><p class="shr-note">开始生成下一层时，上一层 AI 正文每字收入 1 元。每层结算一次，删除或修改已结算楼层不扣回收入，刷新不重复到账。标点、空白、思考及已识别的状态栏不计入。转账为故事内互动。</p>${w.deficit?`<p>历史账单超出已记录收入 ${w.deficit} 元，后续收入补足后恢复可用余额。</p>`:''}${field('bodyTag','正文标签（可留空自动识别）',w.book.tag||'')}<p class="shr-note">若预设有自定义状态栏，可填写正文外层标签名，让计数只取正文。规则变更仅影响后续入账。</p>${btn('wallet:rule','保存计数规则')}${btn('wallet:audit','查看收入明细')}<h3>账单</h3>${w.book.entries.slice().reverse().map(t=>btn('wallet:detail',`${esc(t.name)}　−${t.amount}　${new Date(t.createdAt).toLocaleString()}`,t.id)).join('')||'<p>暂无转账</p>'}`);return;}
  if(a==='rule'){const w=this.walletSnapshot(),tag=this.values().bodyTag.trim();if(tag&&!/^[\p{L}\p{N}_:-]+$/u.test(tag))throw Error('请只填写标签名称');this.state.wallets||={};const book=this.state.wallets[w.key]||={entries:[],tag:''};book.tag=tag;await this.save();diagnostics.log('wallet.rule',{count:tag.length});return this.walletAction('open');}
  if(a==='audit'){const w=this.walletSnapshot();this.modal('收入明细',w.floors.map(f=>`<p>入账时第 ${f.index+1} 楼：+${f.amount} 元</p>`).join('')||'<p>暂无正文</p>');return;}
  if(a==='transfer'){const c=this.conversation(),w=this.walletSnapshot();if(!c||c.left)throw Error('请先进入一个可用聊天');this.modal('转账',`<label class="shr-field">转给<select name="recipient">${c.members.map(id=>`<option value="${esc(id)}">${esc(c.nicknames?.[id]||this.contact(id)?.name||'成员')}</option>`).join('')}</select></label>${field('amount','转账金额','','number','min="1" step="1" inputmode="numeric"')}${field('note','添加转账说明','')}<p class="shr-note">可用余额 ¥ ${w.available} · 已入账收入</p>`,btn('wallet:commit','转账','','shr-primary'),{key:w.key,conversationId:c.id,transferId:uid()});return;}
  if(a==='commit'){
   const d=this.modalData;if(!d?.transferId)return;if(d.key!==storyKey())throw Error('故事已切换，请重新打开转账');if(this.mainBusy||this.gen.busy)throw Error('正文正在生成，请稍后转账');if(this.store.blocked)throw Error('保存存在冲突，请先处理保存提示');
   const c=this.state.conversations.find(c=>c.id===d.conversationId),v=this.values(),amount=Number(v.amount),w=this.walletSnapshot();if(!c||c.left||!c.members.includes(v.recipient))throw Error('收款成员已变化');if(!Number.isSafeInteger(amount)||amount<1||amount>w.available)throw Error('请输入不超过余额的正整数');
   this.state.wallets||={};const book=this.state.wallets[d.key]||={entries:[],tag:''};if(book.entries.some(t=>t.id===d.transferId))return;
   const tx={id:d.transferId,amount,recipient:v.recipient,name:this.contact(v.recipient)?.name||'成员',note:v.note.trim().slice(0,120),createdAt:Date.now(),conversationId:c.id};
   book.entries.push(tx);c.messages.push({id:uid(),side:'user',kind:'transfer',text:`向${tx.name}转账 ${amount}${tx.note?'：'+tx.note:''}`,transfer:{...tx},status:'pending',createdAt:tx.createdAt});c.updatedAt=tx.createdAt;
   diagnostics.log('wallet.transfer',{id:tx.id,count:amount,stage:'saving'});
   try{await this.save();}catch(e){/* Preserve the transaction and id on uncertain network results; never double-debit. */this.store.blocked=true;diagnostics.log('wallet.transfer_failure',{id:tx.id,stage:'save'});this.closeModal();this.render();this.status('转账记录保留在本页，保存未确认。请导出或重新读取核对后再操作。',true);throw e;}
   this.closeModal();this.render();this.status('已转账');diagnostics.log('wallet.transfer_saved',{id:tx.id,count:amount});return;
  }
  if(a==='detail'){const t=Object.values(this.state.wallets||{}).flatMap(b=>b.entries).find(t=>t.id===id);if(!t)return;this.modal('转账详情',`<div class="shr-wallet-balance"><h1>¥ ${t.amount}</h1><p>已转给 ${esc(t.name)}</p><p>${esc(t.note)}</p><small>${new Date(t.createdAt).toLocaleString()}</small></div><p class="shr-note">删除聊天气泡不会删除账单或退回余额。</p>`);}
 }
};}
