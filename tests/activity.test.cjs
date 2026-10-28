"use strict";
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const activity=require('../docs/activity-view.js');
const now=Date.parse('2026-10-28T12:00:00Z');
test('rolling window includes exact boundary, excludes future and invalid events',()=>{
 const event=n=>({occurred_at:new Date(n).toISOString()});
 assert.deepEqual(activity.recent([event(now-900001),event(now-900000),event(now+1),{occurred_at:'bad'},event(now)],now).map(e=>Date.parse(e.occurred_at)),[now,now-900000]);
});
test('missing, overdue and future heartbeats never appear healthy',()=>{
 assert.match(activity.freshness(null,now),/unknown/);
 assert.match(activity.freshness('invalid',now),/unknown/);
 assert.match(activity.freshness(new Date(now-900001).toISOString(),now),/overdue/);
 assert.match(activity.freshness(new Date(now+120000).toISOString(),now),/unknown/);
 assert.match(activity.freshness(new Date(now).toISOString(),now),/Recently/);
});
class Element {
 constructor(){this.children=[];this.textContent='';this.listeners={};}
 append(e){this.children.push(e);}
 replaceChildren(...items){this.children=items;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 insertBefore(e){this.children.unshift(e);}
}
function setup(){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'parent'}}}),onAuthStateChange:()=>{},getSession:async()=>({data:{session:null}})},from(table){
  const query={select(){return this;},eq(...args){calls.push(['eq',...args]);return this;},gte(...args){calls.push(['gte',...args]);return this;},lte(...args){calls.push(['lte',...args]);return this;},limit(n){calls.push(['limit',n]);return Promise.resolve({data:[],error:null});},order(){return table==='child_devices'?Promise.resolve({data:[{id:'device',display_name:'<script>bad</script>',last_seen_at:null}]}):this;}};
  return query;
 }};
 const context=vm.createContext({window:{supabase:{createClient:()=>client},WATCHER_CONFIG:{}},document:{getElementById:get,createElement:()=>new Element(),createDocumentFragment:()=>new Element(),querySelector:()=>get('main'),addEventListener:()=>{}},WatcherActivity:activity,setTimeout:()=>{},setInterval:()=>{},Date,location:{},URLSearchParams,console});
 vm.runInContext(fs.readFileSync('docs/auth.js','utf8'),context);
 return {context,calls,elements,client,get};
}
test('dashboard queries bounded time window and explains empty results',async()=>{
 const {context,calls,get}=setup();
 await vm.runInContext('refreshAuth()',context);
 assert(calls.some(c=>c[0]==='gte'&&c[1]==='occurred_at'));
 assert(calls.some(c=>c[0]==='lte'&&c[1]==='occurred_at'));
 assert(calls.some(c=>c[0]==='eq'&&c[2]==='device'));
 assert(calls.some(c=>c[0]==='limit'&&c[1]===501));
 const section=get('remote-devices').children[0].children[0];
 assert.equal(section.children[0].textContent,'<script>bad</script>');
 assert.match(section.children[3].children[0].textContent,/does not establish/);
});
test('account change during a device request prevents old data rendering',async()=>{
 const {context,client,get}=setup();
 let resolve;
 client.from=()=>({select(){return this;},order(){return new Promise(r=>resolve=r);}});
 const request=vm.runInContext('refreshAuth()',context);
 await new Promise(r=>setImmediate(r));
 vm.runInContext('++generation',context);
 resolve({data:[],error:null});await request;
 assert.equal(get('remote-devices').children.length,0);
});
test('refresh failure clears prior activity',async()=>{
 const {context,client,get}=setup();
 get('remote-devices').append(new Element());
 client.auth.getUser=async()=>{throw Error('offline');};
 await vm.runInContext('refreshAuth()',context);
 assert.match(get('remote-devices').textContent,/unavailable/);
 assert.match(get('refresh-status').textContent,/offline/);
});
