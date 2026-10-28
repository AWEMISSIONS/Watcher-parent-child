import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false}});
const allowed="https://awemissions.github.io";
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const random=()=>{const a=new Uint8Array(32);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,"0")).join("")};
async function hash(v:string){const bytes=new TextEncoder().encode(v);return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("")}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 try{
  const body=await req.json();
  const action=body?.action;
  if(action==="create"){
   const bearer=req.headers.get("authorization")||"";
   if(!bearer.startsWith("Bearer "))return respond({error:"Login required"},401);
   const {data:{user},error}=await admin.auth.getUser(bearer.slice(7));
   if(error||!user)return respond({error:"Invalid parent session"},401);
   const name=String(body.name||"Child device").trim().slice(0,100);
   if(!name)return respond({error:"Device name required"},400);
   const {count}=await admin.from("child_devices").select("id",{count:"exact",head:true}).eq("guardian_id",user.id);
   if((count||0)>=20)return respond({error:"Device limit reached"},429);
   const {data:device,error:insertError}=await admin.from("child_devices").insert({guardian_id:user.id,display_name:name}).select("id").single();
   if(insertError)return respond({error:"Unable to create device"},500);
   const code=random();
   const {error:pairError}=await admin.from("device_pairing").insert({device_id:device.id,pairing_hash:await hash(code),expires_at:new Date(Date.now()+10*60*1000).toISOString()});
   if(pairError){await admin.from("child_devices").delete().eq("id",device.id);return respond({error:"Unable to create pairing code"},500)}
   return respond({deviceId:device.id,code,expiresInSeconds:600});
  }
  if(action==="claim"){
   const code=String(body.code||"");
   if(!/^[0-9a-f]{64}$/.test(code))return respond({error:"Invalid pairing code"},400);
   const {data:pair}=await admin.from("device_pairing").select("device_id,expires_at,claimed_at").eq("pairing_hash",await hash(code)).maybeSingle();
   if(!pair||pair.claimed_at||Date.parse(pair.expires_at)<Date.now())return respond({error:"Code expired or invalid"},403);
   // Atomic claim prevents simultaneous enrollment using one code.
   const {data:claimed}=await admin.from("device_pairing").update({claimed_at:new Date().toISOString()}).eq("device_id",pair.device_id).is("claimed_at",null).gt("expires_at",new Date().toISOString()).select("device_id").maybeSingle();
   if(!claimed)return respond({error:"Code already used"},409);
   const token=random();
   const {error}=await admin.from("device_credentials").upsert({device_id:pair.device_id,token_hash:await hash(token),revoked_at:null},{onConflict:"device_id"});
   if(error)return respond({error:"Device enrollment failed"},500);
   return respond({deviceId:pair.device_id,deviceToken:token});
  }
  if(action==="sync"){
   const deviceId=String(body.deviceId||"");
   const token=String(body.deviceToken||"");
   if(!/^[0-9a-f-]{36}$/.test(deviceId)||!/^[0-9a-f]{64}$/.test(token))return respond({error:"Unauthorized device"},401);
   const {data:credential}=await admin.from("device_credentials").select("device_id,revoked_at").eq("device_id",deviceId).eq("token_hash",await hash(token)).maybeSingle();
   if(!credential||credential.revoked_at)return respond({error:"Unauthorized device"},401);
   if(!Array.isArray(body.events)||body.events.length>500)return respond({error:"Maximum 500 events per sync"},400);
   const now=Date.now();
   const events=[];
   for(const e of body.events){
    const name=e?.packageName;
    const ts=e?.timestamp;
    if(typeof name!=="string"||name.length<1||name.length>300||!Number.isFinite(ts)||ts<now-8*86400000||ts>now+60000)return respond({error:"Invalid activity event"},400);
    events.push({device_id:deviceId,package_name:name,occurred_at:new Date(ts).toISOString()});
   }
   if(events.length){
    const {error}=await admin.from("activity_events").upsert(events,{onConflict:"device_id,package_name,occurred_at",ignoreDuplicates:true});
    if(error)return respond({error:"Activity sync failed"},500);
   }
   await admin.from("child_devices").update({last_seen_at:new Date().toISOString()}).eq("id",deviceId);
   return respond({ok:true,accepted:events.length});
  }
  return respond({error:"Unknown action"},400);
 }catch{return respond({error:"Invalid request"},400)}
});

