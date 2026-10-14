import {ctx,characterItems} from './bridge.js?v=11.6';
export function currentCharacter(){
 const c=ctx(),ch=c?.characters?.[c.characterId];if(!ch)return null;
 return characterItems().find(x=>x.id===(ch.avatar||String(c.characterId)))||null;
}
export function apiEndpoint(address,resource){let u;try{u=new URL(String(address).trim());}catch{throw Error('请填写完整 API 地址');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('API 地址格式不支持');u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/(?:chat\/completions|models)$/,'')+'/'+resource;u.hash='';return u.href;}
export async function fetchModels(address,key,signal){
 const r=await fetch(apiEndpoint(address,'models'),{headers:key?{Authorization:`Bearer ${key}`}:{},signal,redirect:'error'});
 if(!r.ok)throw Error(`模型列表拉取失败（${r.status}）`);const x=await r.json();const rows=Array.isArray(x)?x:x.data||x.models;
 if(!Array.isArray(rows))throw Error('接口没有返回可识别的模型列表');const models=[...new Set(rows.map(m=>typeof m==='string'?m:m.id||m.name).filter(x=>typeof x==='string'&&x.trim()))].sort();if(!models.length)throw Error('接口返回的模型列表为空');return models;
}
export function fishboardStyles(){
 // Read-only bridge to the actual fishboard 10.30 storage keys. Never write or merge retired caches.
 const key='鲜虾鱼板面.data.v1',base='ame-style-management-v05';
 if(window.AmeFishboard?.getData)return (window.AmeFishboard.getData().styles||[]).map(s=>({...s,text:s.content||s.text||''}));
 const mode=localStorage.getItem(base+'_storage_choice_v1')||'tavern';let data=null;
 if(mode!=='browser'){
  const get=typeof window.getVariables==='function'?window.getVariables:window.TavernHelper?.getVariables?.bind(window.TavernHelper);
  if(get){const vars=get({type:'global'});if(vars instanceof Promise)throw Error('鱼板面变量接口尚未准备好');data=vars?.[key];}
  if(!data){const raw=ctx()?.accountStorage?.getItem(key);if(raw)data=JSON.parse(raw);}
 }
 if(!data){const retired=JSON.parse(localStorage.getItem('鲜虾鱼板面.retiredCopies.v1')||'{}');for(const k of [base+'_all_data_v2',base,'ame-style-management-v03']){if(retired[k]&&(k!==base+'_all_data_v2'||mode!=='browser'))continue;const raw=localStorage.getItem(k);if(raw){data=JSON.parse(raw);break;}}}
 if(!data)return [];
 return (Array.isArray(data.styles)?data.styles:[]).map((s,i)=>({id:String(s.id||i),name:String(s.name||'未命名文风'),text:String(s.content??s.text??''),author:String(s.author||''),note:String(s.note||''),tags:Array.isArray(s.tags)?s.tags:[]})).filter(s=>s.text.trim());
}
