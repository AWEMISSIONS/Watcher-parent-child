// Parent account data stays on the server. Never cache authenticated responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><title>Watcher offline</title><meta name="viewport" content="width=device-width"><h1>Watcher is offline</h1><p>Reconnect to load your parent dashboard. Private family activity is not cached on this device.</p>',{headers:{'Content-Type':'text/html'}})));});
