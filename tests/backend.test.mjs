import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleWatcher} from '../backend/sites/lib/watcher.mjs';
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync(new URL('../backend/sites/drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../backend/sites/drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(query){let values=[];return{bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return{results:sql.prepare(query).all(...values)};},async run(){return sql.prepare(query).run(...values);},query,values:()=>values};},async batch(list){sql.exec('BEGIN');try{const results=list.map(s=>({results:sql.prepare(s.query).all(...s.values())}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return{db,sql};
}
async function call(db,body,user='parent-a',origin='https://hub.test'){
 const r=await handleWatcher(new Request('https://hub.test/api/watcher',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)}),db,user);
 return{status:r.status,...await r.json()};
}
async function enroll(db,user='parent-a'){
 const pair=await call(db,{action:'create',name:'Test device'},user);assert.equal(pair.status,200);
 const device=await call(db,{action:'claim',code:pair.code},null,null);assert.equal(device.status,200);
 return{deviceId:device.deviceId,deviceToken:device.deviceToken,code:pair.code};
}
test('guardian authentication, CSRF, family isolation, one-time pairing and token secrecy',async()=>{
 const{db,sql}=database();
 assert.equal((await call(db,{action:'create',name:'x'},null)).status,401);
 assert.equal((await call(db,{action:'create',name:'x'},'parent-a','https://evil.test')).status,403);
 const d=await enroll(db);
 assert.equal((await call(db,{action:'claim',code:d.code},null,null)).status,403);
 const row=sql.prepare('SELECT * FROM watcher_devices').get();assert.notEqual(row.token_hash,d.deviceToken);assert.equal(row.pair_hash,null);
 assert.equal((await call(db,{action:'snapshot'},'parent-b')).devices.length,0);
 assert.equal((await call(db,{action:'revoke',deviceId:d.deviceId,guardianId:'parent-a'},'parent-b')).status,404);
 const snapshot=await call(db,{action:'snapshot'});assert.equal(snapshot.devices.length,1);assert.ok(!JSON.stringify(snapshot).includes(d.deviceToken));assert.ok(!JSON.stringify(snapshot).includes(row.token_hash));
 sql.close();
});
test('idempotent app events, daily estimates, bidirectional advisory policy and app decisions',async()=>{
 const{db,sql}=database();const d=await enroll(db),ts=Date.now();
 const packet={action:'sync',...d,events:[{packageName:'test.app',timestamp:ts}],platform:'android',monitoringEnabled:true,coverage:{appActivity:true,webHistory:true},dailyUsage:[{day:new Date(ts).toISOString().slice(0,10),packageName:'test.app',milliseconds:60000}]};
 assert.equal((await call(db,packet,null,null)).status,200);assert.equal((await call(db,packet,null,null)).status,200);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM watcher_events').get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM watcher_usage').get().n,1);
 assert.equal((await call(db,{action:'policy',deviceId:d.deviceId,allowedApps:['test.app'],note:'Homework first',retentionDays:7})).status,200);
 const sync=await call(db,{...packet,acknowledgedRevision:2},null,null);assert.equal(sync.revision,2);assert.equal(sync.policy.note,'Homework first');
 const request=await call(db,{action:'request',...d,packageName:'another.app',message:'May I use it?'},null,null);
 assert.equal((await call(db,{action:'decide',deviceId:d.deviceId,requestId:request.id,status:'approved'})).status,200);
 const result=await call(db,{...packet,events:[]},null,null);assert.equal(result.requests[0].status,'approved');
 const snapshot=await call(db,{action:'snapshot'});assert.equal(snapshot.devices[0].coverage.webHistory,false);assert.equal(snapshot.devices[0].acknowledged_revision,2);
 sql.close();
});
test('batch validation rejects malformed, oversized and unauthorized uploads without partial writes',async()=>{
 const{db,sql}=database(),d=await enroll(db);
 const e={packageName:'a',timestamp:Date.now()};
 assert.equal((await call(db,{action:'sync',...d,events:[e,{...e,timestamp:Date.now()+99999999}]},null,null)).status,400);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM watcher_events').get().n,0);
 assert.equal((await call(db,{action:'sync',...d,events:Array(501).fill(e)},null,null)).status,400);
 assert.equal((await call(db,{action:'sync',...d,deviceToken:'0'.repeat(64),events:[]},null,null)).status,401);
 sql.close();
});
test('retention, pagination, revocation and deletion',async()=>{
 const{db,sql}=database(),d=await enroll(db),ts=Date.now();
 const insert=sql.prepare('INSERT INTO watcher_events(device_id,package_name,timestamp) VALUES(?,?,?)');
 for(let i=0;i<1002;i++)insert.run(d.deviceId,'app.'+i,ts);
 insert.run(d.deviceId,'expired',ts-9*86400000);
 const first=await call(db,{action:'export',deviceId:d.deviceId});assert.equal(first.events.length,1000);
 const next=await call(db,{action:'export',deviceId:d.deviceId,beforeId:first.nextBeforeId});assert.equal(next.events.length,2);assert.equal(next.nextBeforeId,null);
 assert.equal(new Set([...first.events,...next.events].map(x=>x.id)).size,1002);
 await call(db,{action:'snapshot'});assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM watcher_events WHERE package_name='expired'").get().n,0);
 await call(db,{action:'revoke',deviceId:d.deviceId});assert.equal((await call(db,{action:'sync',...d,events:[]},null,null)).status,401);
 await call(db,{action:'delete',deviceId:d.deviceId});assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM watcher_devices').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM watcher_events').get().n,0);
 sql.close();
});
