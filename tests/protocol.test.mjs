import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WatcherClient} from '../sdk/javascript/watcher.mjs';
test('sync batches without losing records and retains identity on retry',async()=>{
 const sent=[];
 const client=new WatcherClient('https://example.com/sync',{fetch:async(u,r)=>{sent.push(JSON.parse(r.body));return new Response('{"ok":true}');}});
 const events=Array.from({length:1201},(_,i)=>({packageName:'test.app',timestamp:i}));
 await client.sync({deviceId:'device',deviceToken:'token'},events);
 assert.deepEqual(sent.map(x=>x.events.length),[500,500,201]);
 assert.deepEqual(sent.flatMap(x=>x.events),events);
 assert.ok(sent.every(x=>x.action==='sync'&&x.deviceId==='device'));
});
test('empty heartbeat is sent; authorization failures propagate',async()=>{
 let count=0;
 const client=new WatcherClient('https://example.com',{fetch:async()=>{count++;return new Response('{"error":"Revoked"}',{status:401});}});
 await assert.rejects(client.sync({},[]),e=>e.status===401);assert.equal(count,1);
});
test('pair codes and transport are validated',()=>{
 assert.throws(()=>new WatcherClient('http://example.com'));
 assert.throws(()=>new WatcherClient('https://example.com').claim('short'));
});
