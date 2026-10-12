import {fail} from './policy.js';

// Fixed provider URL; credentials and sender never come from a request.
export async function sendOwnerOtp({email, code, challengeId}, fetcher=fetch) {
 const {RESEND_API_KEY:key, OWNER_EMAIL_FROM:from, OWNER_EMAIL_DOMAIN_ID:domainId}=process.env;
 if(!key || !from || !domainId || !/^[^\s@<>]+@[^\s@<>]+$/.test(from)) fail(503,'Owner verification unavailable.');
 const call=async (path,options={})=>{
  let response;
  try { response=await fetcher('https://api.resend.com'+path,{
   ...options, headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},
   signal:AbortSignal.timeout(10000)
  }); } catch { fail(503,'Owner verification unavailable.'); }
  if(!response.ok) fail(503,'Owner verification unavailable.');
  try { return await response.json(); } catch { fail(503,'Owner verification unavailable.'); }
 };
 const domain=await call('/domains/'+encodeURIComponent(domainId));
 if(domain.status!=='verified' || domain.name?.toLowerCase()!==from.split('@')[1].toLowerCase() || domain.capabilities?.sending==='disabled') fail(503,'Owner verification unavailable.');
 const sent=await call('/emails',{method:'POST',headers:{'Idempotency-Key':'owner-entry/'+challengeId},body:JSON.stringify({
  from,to:[email],subject:'A.E.G.I.S owner verification',
  text:`Your owner portal verification code is ${code}. It expires in 5 minutes and can be used once. If you did not request this, do not share the code.`
 })});
 if(!sent.id) fail(503,'Owner verification unavailable.');
 return sent.id;
}
