import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleWatcher} from '../../../lib/watcher.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!env.DB)return Response.json({error:'Database unavailable'},{status:503});
 return handleWatcher(request,env.DB,user?.userId);
}
