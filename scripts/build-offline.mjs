import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { URL } from 'node:url'
const root = resolve('dist')
const files = (await readdir(root, { recursive: true }))
  .filter((file) => /\.(?:html|js|css|svg|webmanifest)$/.test(file) && file !== 'sw.js')
  .sort()
const hash = createHash('sha256')
// A cache-policy change must get a separate cache even when assets stay identical.
hash.update(await readFile(new URL(import.meta.url)))
for (const file of files) {
  hash.update(file)
  hash.update(await readFile(resolve(root, file)))
}
const version = hash.digest('hex').slice(0, 16)
const source = `// Generated from production assets. No diagnostic data is cached.
const files=${JSON.stringify(files)};
const scope=self.registration.scope;
const prefix='it-workbench-static:'+encodeURIComponent(scope)+':';
const name=prefix+'${version}';
const urls=new Set(files.map(file=>new URL(file,scope).href));
const shell=new URL('index.html',scope).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try {const cache=await caches.open(name);await cache.addAll([...urls].map(url=>new Request(url,{cache:'reload',credentials:'omit'})));}
  catch(error){await caches.delete(name);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(prefix)&&key!==name).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;const url=new URL(request.url);url.hash='';
  if(request.method!=='GET'||url.search||url.origin!==new URL(scope).origin)return;
  const rootNavigation=request.mode==='navigate'&&(url.href===scope||url.href===shell);
  if(!rootNavigation&&!urls.has(url.href))return;
  // Only immutable build assets are allowed here. Hosts may add Vary: Origin;
  // module requests include different Origin headers than install-time fetches.
  event.respondWith((async()=>{const cache=await caches.open(name);return (await cache.match(rootNavigation?shell:url.href,{ignoreVary:true}))||fetch(request);})());
});
self.addEventListener('message',event=>{if(event.data?.type==='GET_VERSION'&&event.ports[0])event.ports[0].postMessage({version:'${version}',assets:files.length});});
// Updates wait for all existing tabs to close. No automatic reload/skipWaiting.
`
await writeFile(resolve(root, 'sw.js'), source)
globalThis.console.log(`Offline asset manifest: ${files.length} files, version ${version}`)
