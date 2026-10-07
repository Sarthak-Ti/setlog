import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve('dist'),base='/setlog/';
const walk=d=>readdirSync(d).flatMap(n=>{const p=path.join(d,n);return statSync(p).isDirectory()?walk(p):[p];});
const files=walk(root).filter(p=>!p.endsWith('sw.js'));
const assets=files.map(p=>base+path.relative(root,p).split(path.sep).join('/'));
const hash=createHash('sha256');for(const f of files)hash.update(readFileSync(f));
const version=hash.digest('hex').slice(0,16);
const sw=`const CACHE='setlog-pwa-${version}';
const BASE=${JSON.stringify(base)},ASSETS=${JSON.stringify([base,...assets])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('setlog-pwa-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
 if(req.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(BASE))||fetch(req)));return;}
 if(ASSETS.includes(url.pathname)){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(req)));}
});`;
writeFileSync(path.join(root,'sw.js'),sw);writeFileSync(path.join(root,'.nojekyll'),'');
console.log(JSON.stringify({offlineAssets:assets.length,cacheVersion:version,scope:base}));
