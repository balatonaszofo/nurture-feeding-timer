const CACHE = 'content-board-shell-v1';
const SHELL = ['./','./index.html','./styles.css?v=2','./board.js?v=1','./install.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','../firebase-config.js?v=27'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('content-board-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Only public shell assets are cached; project data stays in its own storage.
  const shellUrls=SHELL.map(asset=>new URL(asset,self.registration.scope).href);
  if(!shellUrls.includes(url.href)&&event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request).catch(async()=>{
    const saved=await caches.match(event.request);
    if(saved)return saved;
    if(event.request.mode==='navigate')return (await caches.match(new URL('./',self.registration.scope)))||Response.error();
    return Response.error();
  }));
});
