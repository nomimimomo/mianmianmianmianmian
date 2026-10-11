// Reader messages are accepted only from the open frame and matching platform origin.
export function readerLocation(value){
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='jjwxc.net'||u.hostname.endsWith('.jjwxc.net')))throw Error('不支持的阅读来源');
 const path=u.pathname.match(/^\/book2\/(\d+)(?:\/(\d+))?\/?$/),novelId=path?.[1]||u.searchParams.get('novelid'),chapterId=path?path[2]:u.searchParams.get('chapterid');if(!/^\d+$/.test(novelId||''))return null;
 const clean=new URL(u.origin+u.pathname);if(!path){clean.searchParams.set('novelid',novelId);if(/^\d+$/.test(chapterId||''))clean.searchParams.set('chapterid',chapterId);}
 return {url:clean.href,novelId,chapterId:chapterId||'',bookKey:'jjwxc:'+novelId};
}
export function validateReaderMessage(event,frame,token){
 if(!frame||event.source!==frame.contentWindow||event.data?.type!=='shrimp.reader.location'||event.data?.token!==token)return null;
 try{const value=readerLocation(event.data.url);if(!value||new URL(value.url).origin!==event.origin)return null;return {...value,title:String(event.data.title||'').slice(0,160),bookTitle:String(event.data.bookTitle||'').slice(0,100)};}catch{return null;}
}
