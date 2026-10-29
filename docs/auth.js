"use strict";
const authClient=window.supabase?.createClient?.(window.WATCHER_CONFIG?.supabaseUrl,window.WATCHER_CONFIG?.publishableKey);
const login=document.getElementById("github-login");
const logout=document.getElementById("github-logout");
const authStatus=document.getElementById("auth-status");
const devices=document.getElementById("remote-devices");
const refreshStatus=document.getElementById("refresh-status");
const refreshButton=document.getElementById("refresh-devices");
let generation=0, pending=false;
login.addEventListener("click",async()=>{
 try {
  if(!authClient)throw Error("Login library unavailable");
  const {error}=await authClient.auth.signInWithOAuth({provider:"github",options:{redirectTo:location.origin+location.pathname}});
  if(error)throw error;
 }catch(e){authStatus.textContent="Sign-in failed: "+e.message;}
});
logout.addEventListener("click",async()=>{
 ++generation;devices.replaceChildren();document.getElementById("pair-result").textContent="";
 try {const {error}=await authClient.auth.signOut();if(error)throw error;location.reload();}
 catch(e){authStatus.textContent="Sign out failed: "+e.message;}
});
async function refreshAuth(){
 if(pending||!authClient)return;
 pending=true;refreshButton.disabled=true;
 const sequence=generation;
 try {
  const {data:{user},error}=await authClient.auth.getUser();
  if(sequence!==generation)return;
  if(error||!user){authStatus.textContent="Not signed in";login.hidden=false;logout.hidden=true;devices.textContent="Sign in to see enrolled devices.";refreshStatus.textContent="Sign in to refresh activity.";return;}
  authStatus.textContent="Signed in as "+(user.email||user.id);login.hidden=true;logout.hidden=false;
  const {data,error:deviceError}=await authClient.from("child_devices").select("id,display_name,last_seen_at").order("created_at",{ascending:false});
  if(deviceError)throw deviceError;
  const now=Date.now(), rendered=document.createDocumentFragment();
  if(!data.length){const p=document.createElement("p");p.textContent="No devices paired yet. Generate a pairing code below.";rendered.append(p);}
  for(const d of data){
   if(sequence!==generation)return;
   const section=document.createElement("section");
   const title=document.createElement("h3");title.textContent=d.display_name;section.append(title);
   const status=document.createElement("p");status.textContent=WatcherActivity.freshness(d.last_seen_at,now);section.append(status);
   const coverage=document.createElement("p");coverage.textContent="Coverage: Android app openings only. Webpages, SMS/MMS, chats, and computer activity are not connected.";section.append(coverage);
   const {data:events,error:eventError}=await authClient.from("activity_events").select("package_name,occurred_at").eq("device_id",d.id).gte("occurred_at",new Date(now-WatcherActivity.WINDOW_MS).toISOString()).lte("occurred_at",new Date(now).toISOString()).order("occurred_at",{ascending:false}).limit(501);
   const list=document.createElement("ul");
   function item(text){const li=document.createElement("li");li.textContent=text;list.append(li);}
   if(eventError)item("Activity unavailable. Coverage cannot be determined.");
   else {
    const recent=WatcherActivity.recent(events,now);
    if(!recent.length)item("No app openings received in the last 15 minutes. This does not establish that the device was inactive.");
    for(const e of recent.slice(0,500))item(new Date(e.occurred_at).toLocaleTimeString()+" — "+e.package_name);
    if(events.length>500)item("Only the latest 500 openings are shown; additional activity exists.");
   }
   section.append(list);rendered.append(section);
  }
  if(sequence===generation){devices.replaceChildren(rendered);refreshStatus.textContent="Updated "+new Date(now).toLocaleTimeString()+". Refreshes every 30 seconds while visible.";}
 }catch(e){if(sequence===generation){devices.textContent="Activity unavailable. Check your connection and try again.";refreshStatus.textContent="Refresh failed: "+e.message;}}
 finally {pending=false;refreshButton.disabled=false; if(sequence!==generation)setTimeout(refreshAuth,0);}
}
refreshButton.addEventListener("click",refreshAuth);
if(authClient){
 authClient.auth.onAuthStateChange(()=>{++generation;devices.textContent="Checking account…";document.getElementById("pair-result").textContent="";setTimeout(refreshAuth,0);});
 setInterval(()=>{if(!document.hidden)refreshAuth();},30000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshAuth();});
 setTimeout(refreshAuth,0);
}else authStatus.textContent="Authentication library unavailable. Refresh the page.";

const pairing=document.createElement("section");
pairing.innerHTML='<h3>Pair a child device</h3><p>Generate a one-time code (valid 10 minutes) and enter it on the child device. Do not share this code publicly.</p><input id="child-name" placeholder="Child device name" maxlength="100" aria-label="Child device name"> <button id="make-code">Generate pairing code</button><p id="pair-result" style="overflow-wrap:anywhere"></p>';
document.querySelector("main").insertBefore(pairing,document.querySelector("main").children[1]);
document.getElementById("make-code").addEventListener("click",async()=>{
 const output=document.getElementById("pair-result");
 output.textContent="Generating…";
 const {data:{session}}=await authClient.auth.getSession();
 if(!session){output.textContent="Please sign in first.";return;}
 try{
  const response=await fetch(WATCHER_CONFIG.supabaseUrl+"/functions/v1/watcher-sync",{
   method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":WATCHER_CONFIG.publishableKey},
   body:JSON.stringify({action:"create",name:document.getElementById("child-name").value||"Child device"})
  });
  const result=await response.json();
  output.textContent=response.ok?"Enter this code in Watcher Child within 10 minutes: "+result.code:(result.error||"Unable to create code");
  if(response.ok)refreshAuth();
 }catch(e){output.textContent="Connection error: "+e.message}
});
