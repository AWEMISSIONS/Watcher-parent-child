"use strict";
const supabase = window.supabase.createClient(WATCHER_CONFIG.supabaseUrl,WATCHER_CONFIG.publishableKey);
const login = document.getElementById("github-login");
const logout = document.getElementById("github-logout");
const authStatus = document.getElementById("auth-status");
const devices = document.getElementById("remote-devices");
login.addEventListener("click",async()=> {
  const {error}=await supabase.auth.signInWithOAuth({provider:"github",options:{redirectTo:location.origin+location.pathname}});
  if(error)authStatus.textContent=error.message;
});
logout.addEventListener("click",async()=>{await supabase.auth.signOut();location.reload()});
async function refreshAuth(){
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user){authStatus.textContent="Not signed in";login.hidden=false;logout.hidden=true;devices.textContent="Sign in to see enrolled devices.";return;}
  authStatus.textContent="Signed in as "+(user.email||user.id);
  login.hidden=true;logout.hidden=false;
  const {data,error:queryError}=await supabase.from("child_devices").select("id,display_name,last_seen_at").order("created_at",{ascending:false});
  if(queryError){devices.textContent="Unable to load devices: "+queryError.message;return;}
  devices.replaceChildren();
  if(!data.length){devices.textContent="No devices paired yet. Secure device pairing is not enabled.";return;}
  for(const d of data){
    const section=document.createElement("section");
    const h=document.createElement("h3");h.textContent=d.display_name;section.append(h);
    const p=document.createElement("p");p.textContent="Last seen: "+(d.last_seen_at?new Date(d.last_seen_at).toLocaleString():"Never");section.append(p);
    const {data:events,error:eventError}=await supabase.from("activity_events").select("package_name,occurred_at").eq("device_id",d.id).order("occurred_at",{ascending:false}).limit(50);
    const list=document.createElement("ul");
    if(eventError){const li=document.createElement("li");li.textContent="Could not load activity.";list.append(li);}
    else for(const e of events){const li=document.createElement("li");li.textContent=new Date(e.occurred_at).toLocaleString()+" — "+e.package_name;list.append(li);}
    section.append(list);devices.append(section);
  }
}
supabase.auth.onAuthStateChange(()=>{setTimeout(refreshAuth,0)});
refreshAuth();
