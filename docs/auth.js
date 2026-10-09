"use strict";
const authClient = window.supabase?.createClient?.(window.WATCHER_CONFIG?.supabaseUrl,window.WATCHER_CONFIG?.publishableKey);
const login = document.getElementById("github-login");
const logout = document.getElementById("github-logout");
const authStatus = document.getElementById("auth-status");
const devices = document.getElementById("remote-devices");
login.addEventListener("click",async()=> {
  if(!authClient){authStatus.textContent="Login library did not load. Open this page in Chrome and refresh.";return;}
  authStatus.textContent="Redirecting to GitHub…";
  try {
  const {error}=await authClient.auth.signInWithOAuth({provider:"github",options:{redirectTo:location.origin+location.pathname}});
  if(error)authStatus.textContent="GitHub sign-in error: "+error.message;
  } catch(e){authStatus.textContent="Sign-in failed: "+e.message;}
});
logout.addEventListener("click",async()=>{await authClient.auth.signOut();location.reload()});
async function refreshAuth(){
  let user, error;
  try {({data:{user},error}=await authClient.auth.getUser());}
  catch(e){authStatus.textContent="Session check failed: "+e.message;return;}
  if(error||!user){authStatus.textContent="Not signed in";login.hidden=false;logout.hidden=true;devices.textContent="Sign in to see enrolled devices.";return;}
  authStatus.textContent="Signed in as "+(user.email||user.id);
  login.hidden=true;logout.hidden=false;
  const {data,error:queryError}=await authClient.from("child_devices").select("id,display_name,last_seen_at").order("created_at",{ascending:false});
  if(queryError){devices.textContent="Unable to load devices: "+queryError.message;return;}
  devices.replaceChildren();
  if(!data.length){devices.textContent="No devices paired yet. Generate a code below and enter it on the child device.";return;}
  for(const d of data){
    const section=document.createElement("section");
    const h=document.createElement("h3");h.textContent=d.display_name;section.append(h);
    const p=document.createElement("p");p.textContent="Last seen: "+(d.last_seen_at?new Date(d.last_seen_at).toLocaleString():"Never");section.append(p);
    const {data:events,error:eventError}=await authClient.from("activity_events").select("package_name,occurred_at").eq("device_id",d.id).order("occurred_at",{ascending:false}).limit(50);
    const list=document.createElement("ul");
    if(eventError){const li=document.createElement("li");li.textContent="Could not load activity.";list.append(li);}
    else for(const e of events){const li=document.createElement("li");li.textContent=new Date(e.occurred_at).toLocaleString()+" — "+e.package_name;list.append(li);}
    section.append(list);devices.append(section);
  }
}
if(authClient){
  const params = new URLSearchParams(location.search);
  const oauthError=params.get("error_description")||params.get("error");
  if(oauthError)authStatus.textContent="GitHub authorization error: "+oauthError;
  authClient.auth.onAuthStateChange(()=>{setTimeout(refreshAuth,0)});
  refreshAuth();
}else{
  authStatus.textContent="Authentication library unavailable. Try Chrome, then refresh.";
}

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
 }catch(e){output.textContent="Connection error: "+e.message}
});
