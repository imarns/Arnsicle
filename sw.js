const CACHE='arnsicle-v1';
const ASSETS=['./','index.html','style.css','app.js','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))) });
self.addEventListener('fetch',e=>{
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
      const copy = res.clone();
      if(e.request.method==='GET' && e.request.url.startsWith(self.location.origin)){
        caches.open(CACHE).then(c=> c.put(e.request, copy));
      }
      return res;
    }).catch(()=> caches.match('index.html')))
  );
});