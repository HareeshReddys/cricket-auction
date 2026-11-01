import fs from "node:fs/promises";
import path from "node:path";
const root = new URL("../dashboard/dist/", import.meta.url);
async function files(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(new URL(e.name + "/", dir))
          : [path.relative(root.pathname, new URL(e.name, dir).pathname)],
      ),
    )
  ).flat();
}
const names = (await files(root)).filter((f) => f !== "sw.js");
const version = process.env.GITHUB_SHA || Date.now();
const source = `const CACHE='boundary-shell-${version}';const FILES=${JSON.stringify(names)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('boundary-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.includes('/api/'))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(async()=>await caches.match(e.request)||await caches.match(u.origin+u.pathname)||await caches.match(new URL('index.html',self.registration.scope))||Response.error()))});`;
await fs.writeFile(new URL("sw.js", root), source);
