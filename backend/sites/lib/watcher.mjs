const DAY=86400000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const secret=/^[0-9a-f]{64}$/;
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
export const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function name(value,max=300){if(typeof value!=='string'||!value.trim()||value.length>max)fail('Invalid text');return value.trim();}
const all=async stmt=>(await stmt.all()).results;
async function owned(db,id,user){if(!uuid.test(id||''))fail('Invalid device');const d=await db.prepare('SELECT * FROM watcher_devices WHERE id=? AND guardian_id=?').bind(id,user).first();if(!d)fail('Device not found',404);return d;}
async function device(db,b){
 if(!uuid.test(b.deviceId||'')||!secret.test(b.deviceToken||''))fail('Unauthorized device',401);
 const d=await db.prepare('SELECT * FROM watcher_devices WHERE id=? AND token_hash=? AND revoked=0').bind(b.deviceId,await digest(b.deviceToken)).first();
 if(!d)fail('Pairing revoked or invalid',401);return d;
}
async function purge(db){
 await db.batch([
  db.prepare('DELETE FROM watcher_events WHERE id IN (SELECT e.id FROM watcher_events e JOIN watcher_devices d ON d.id=e.device_id WHERE e.timestamp < ? - d.retention_days * ? LIMIT 2000)').bind(Date.now(),DAY),
  db.prepare('DELETE FROM watcher_usage WHERE rowid IN (SELECT u.rowid FROM watcher_usage u JOIN watcher_devices d ON d.id=u.device_id WHERE u.updated_at < ? - d.retention_days * ? LIMIT 2000)').bind(Date.now(),DAY),
  db.prepare('DELETE FROM watcher_requests WHERE id IN (SELECT r.id FROM watcher_requests r JOIN watcher_devices d ON d.id=r.device_id WHERE r.created_at < ? - d.retention_days * ? LIMIT 2000)').bind(Date.now(),DAY),
 ]);
}
export async function handleWatcher(req,db,userId){
 if(req.method!=='POST')return response({error:'POST required'},405);
 try{
  if(!req.headers.get('content-type')?.startsWith('application/json'))fail('JSON required',415);
  if(Number(req.headers.get('content-length')||0)>300000)fail('Request too large',413);
  const text=await req.text();if(text.length>300000)fail('Request too large',413);
  let b;try{b=JSON.parse(text);}catch{fail('Invalid JSON');}
  if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid request');
  const now=Date.now();
  if(b.action==='claim'){
   if(!secret.test(b.code||''))fail('Invalid pairing code');const token=random();
   const d=await db.prepare('UPDATE watcher_devices SET token_hash=?,pair_hash=NULL,pair_expires=NULL,revoked=0 WHERE pair_hash=? AND pair_expires>? AND token_hash IS NULL RETURNING id').bind(await digest(token),await digest(b.code),now).first();
   if(!d)fail('Pairing code expired or already used',403);
   return response({deviceId:d.id,deviceToken:token,protocolVersion:2});
  }
  if(['sync','request'].includes(b.action)){
   const d=await device(db,b);
   if(b.action==='request'){
    const pkg=name(b.packageName),message=name(b.message||'Please approve this application.',500);
    const existing=await db.prepare("SELECT id FROM watcher_requests WHERE device_id=? AND package_name=? AND status='pending'").bind(d.id,pkg).first();
    if(existing)return response({ok:true,id:existing.id});
    const count=await db.prepare('SELECT COUNT(*) AS n FROM watcher_requests WHERE device_id=? AND created_at>?').bind(d.id,now-DAY).first();
    if(count.n>=50)fail('Daily request limit reached',429);
    const id=crypto.randomUUID();await db.prepare('INSERT INTO watcher_requests(id,device_id,package_name,message,created_at) VALUES(?,?,?,?,?)').bind(id,d.id,pkg,message,now).run();return response({ok:true,id});
   }
   if(!Array.isArray(b.events)||b.events.length>500)fail('Maximum 500 events per sync');const statements=[];
   for(const e of b.events){
    const pkg=name(e?.packageName),ts=e?.timestamp;
    if(!Number.isSafeInteger(ts)||ts<now-8*DAY||ts>now+60000)fail('Invalid event timestamp');
    if(ts>=now-d.retention_days*DAY)statements.push(db.prepare('INSERT OR IGNORE INTO watcher_events(device_id,package_name,timestamp) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM watcher_devices WHERE id=? AND token_hash=? AND revoked=0)').bind(d.id,pkg,ts,d.id,d.token_hash));
   }
   if(b.dailyUsage!==undefined){
    if(!Array.isArray(b.dailyUsage)||b.dailyUsage.length>100)fail('Maximum 100 daily summaries');
    for(const u of b.dailyUsage){
     if(!/^\d{4}-\d{2}-\d{2}$/.test(u.day||'')||!Number.isFinite(Date.parse(u.day))||Math.abs(Date.parse(u.day)-now)>2*DAY||!Number.isSafeInteger(u.milliseconds)||u.milliseconds<0||u.milliseconds>DAY)fail('Invalid daily usage');
     statements.push(db.prepare('INSERT INTO watcher_usage(device_id,day,package_name,milliseconds,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM watcher_devices WHERE id=? AND token_hash=? AND revoked=0) ON CONFLICT(device_id,day,package_name) DO UPDATE SET milliseconds=excluded.milliseconds,updated_at=excluded.updated_at').bind(d.id,u.day,name(u.packageName),u.milliseconds,now,d.id,d.token_hash));
    }
   }
   const coverage={appActivity:b.coverage?.appActivity===true,webHistory:false,appBlocking:false,screenSharing:false,monitoringEnabled:b.monitoringEnabled===true};
   const platform=['android','windows'].includes(b.platform)?b.platform:d.platform;
   const ack=Number.isInteger(b.acknowledgedRevision)&&b.acknowledgedRevision>=0&&b.acknowledgedRevision<=d.revision?b.acknowledgedRevision:d.acknowledged_revision;
   statements.push(db.prepare('UPDATE watcher_devices SET last_seen=?,platform=?,coverage=?,acknowledged_revision=? WHERE id=? AND revoked=0 AND token_hash=? RETURNING id').bind(now,platform,JSON.stringify(coverage),ack,d.id,d.token_hash));
   const written=await db.batch(statements);if(!written.at(-1).results?.length)fail('Pairing revoked or invalid',401);await purge(db);
   const requests=await all(db.prepare('SELECT id,package_name,message,status,created_at,decided_at FROM watcher_requests WHERE device_id=? AND created_at>? ORDER BY created_at DESC LIMIT 100').bind(d.id,now-d.retention_days*DAY));
   return response({ok:true,accepted:b.events.length,serverTime:now,policy:JSON.parse(d.policy),revision:d.revision,requests});
  }
  if(!userId)fail('Sign in with ChatGPT',401);
  if(req.headers.get('origin')!==new URL(req.url).origin)fail('Same-origin request required',403);
  if(b.action==='create'){
   const id=crypto.randomUUID(),code=random();
   const inserted=await db.prepare('INSERT INTO watcher_devices(id,guardian_id,name,created_at,pair_hash,pair_expires) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM watcher_devices WHERE guardian_id=?)<20 RETURNING id').bind(id,userId,name(b.name,100),now,await digest(code),now+600000,userId).first();
   if(!inserted)fail('Maximum 20 devices; remove unused enrollments first',429);return response({deviceId:id,code,expiresInSeconds:600});
  }
  if(b.action==='snapshot'){
   await purge(db);
   const devices=await all(db.prepare('SELECT id,name,created_at,last_seen,platform,coverage,policy,revision,acknowledged_revision,retention_days,revoked FROM watcher_devices WHERE guardian_id=? ORDER BY created_at DESC').bind(userId));
   for(const d of devices){
    d.coverage=JSON.parse(d.coverage);d.policy=JSON.parse(d.policy);
    const records=await db.batch([
     db.prepare('SELECT package_name,timestamp FROM watcher_events WHERE device_id=? AND timestamp>=? ORDER BY timestamp DESC LIMIT 200').bind(d.id,now-d.retention_days*DAY),
     db.prepare('SELECT day,package_name,milliseconds FROM watcher_usage WHERE device_id=? AND updated_at>=? ORDER BY day DESC,milliseconds DESC LIMIT 100').bind(d.id,now-d.retention_days*DAY),
     db.prepare('SELECT id,package_name,message,status,created_at FROM watcher_requests WHERE device_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 100').bind(d.id,now-d.retention_days*DAY)]);
    [d.events,d.usage,d.requests]=records.map(r=>r.results);
   }
   return response({devices,serverTime:now,protocolVersion:2});
  }
  if(!['revoke','delete','clear','policy','decide','export'].includes(b.action))fail('Unknown action');
  const d=await owned(db,b.deviceId,userId);
  if(b.action==='revoke'){await db.prepare('UPDATE watcher_devices SET revoked=1,token_hash=NULL,pair_hash=NULL,pair_expires=NULL WHERE id=?').bind(d.id).run();return response({ok:true});}
  if(b.action==='delete'){
   await db.batch(['watcher_events','watcher_usage','watcher_requests'].map(t=>db.prepare(`DELETE FROM ${t} WHERE device_id=?`).bind(d.id)).concat([db.prepare('DELETE FROM watcher_devices WHERE id=?').bind(d.id)]));return response({ok:true});
  }
  if(b.action==='clear'){await db.batch(['watcher_events','watcher_usage','watcher_requests'].map(t=>db.prepare(`DELETE FROM ${t} WHERE device_id=?`).bind(d.id)));return response({ok:true});}
  if(b.action==='policy'){
   if(!Array.isArray(b.allowedApps)||b.allowedApps.length>100||typeof b.note!=='string'||b.note.length>500||![1,7,30].includes(b.retentionDays))fail('Invalid policy');
   const policy={allowedApps:[...new Set(b.allowedApps.map(p=>name(p)))],note:b.note,mode:'advisory'};
   await db.prepare('UPDATE watcher_devices SET policy=?,revision=revision+1,retention_days=? WHERE id=?').bind(JSON.stringify(policy),b.retentionDays,d.id).run();await purge(db);return response({ok:true});
  }
  if(b.action==='decide'){
   if(!uuid.test(b.requestId||'')||!['approved','denied'].includes(b.status))fail('Invalid decision');
   const changed=await db.prepare("UPDATE watcher_requests SET status=?,decided_at=? WHERE id=? AND device_id=? AND status='pending' RETURNING id").bind(b.status,now,b.requestId,d.id).first();
   if(!changed)fail('Pending request not found',404);return response({ok:true});
  }
  if(b.action==='export'){
   const before=b.beforeId??Number.MAX_SAFE_INTEGER;if(!Number.isSafeInteger(before)||before<0)fail('Invalid export cursor');
   const events=await all(db.prepare('SELECT id,package_name,timestamp FROM watcher_events WHERE device_id=? AND timestamp>=? AND id<? ORDER BY id DESC LIMIT 1000').bind(d.id,now-d.retention_days*DAY,before));
   return response({device:{id:d.id,name:d.name,platform:d.platform},events,nextBeforeId:events.length===1000?events.at(-1).id:null});
  }
 }catch(e){return response({error:e.status?e.message:'Server unavailable; retry later'},e.status||503);}
}
