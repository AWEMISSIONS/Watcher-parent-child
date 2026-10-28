/** Shared Watcher protocol client. Never pass a service-role key to clients. */
export class WatcherClient {
  constructor(endpoint, {fetch: transport = globalThis.fetch} = {}) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw Error('HTTPS required');
    this.endpoint = endpoint; this.transport = transport;
  }
  async call(action, payload = {}) {
    const headers = {'Content-Type':'application/json'};
    const response = await this.transport(this.endpoint, {method:'POST', headers, credentials:'same-origin',
      body:JSON.stringify({...payload,action}), signal:AbortSignal.timeout(20000)});
    let result;
    try { result = await response.json(); } catch { throw Error(`Server unavailable (${response.status})`); }
    if (!response.ok) { const error = Error(result.error || `HTTP ${response.status}`); error.status = response.status; throw error; }
    return result;
  }
  create(name) { return this.call('create',{name}); }
  request(credentials,packageName,message='Please approve this application.') { return this.call('request',{...credentials,packageName,message}); }
  claim(code) { if (!/^[a-f0-9]{64}$/.test(code)) throw Error('Invalid pairing code'); return this.call('claim',{code}); }
  async sync(credentials, events, metadata = {}) {
    let result;
    for(let i=0; i<Math.max(events.length,1); i+=500) {
      result = await this.call('sync',{...credentials,...metadata,events:events.slice(i,i+500)});
    }
    return result;
  }
}
