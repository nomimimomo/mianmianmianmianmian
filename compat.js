// Keep compatibility local to this extension; never replace browser or Tavern globals.
export function timeoutSignal(milliseconds){
 if(typeof AbortSignal.timeout==='function')return AbortSignal.timeout(milliseconds);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new DOMException('请求超时','TimeoutError')),milliseconds);
 controller.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
 return controller.signal;
}
export const copyData=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
