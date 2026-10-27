import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './server/handler.js';

test('Services and support namespaces remain closed without reading identity, payload or database',async()=>{
 let touched=0;
 const forbidden=()=>{touched++;throw Error('Protected boundary touched');};
 const handler=createHandler({sessionUser:forbidden,logout:forbidden},{database:forbidden,transaction:forbidden},{consumeRateLimit:forbidden});
 for(const root of ['student-services','wellbeing'])for(const suffix of ['', '/requests','/records/DEMO','/export','/disclose'])for(const method of ['GET','POST','PUT','PATCH','DELETE'])for(const url of [`/api/${root}${suffix}`,`/api?route=${root}${suffix}`]){
  let payload;const headers={};
  const response={setHeader(k,v){headers[k]=v;},end(v){payload=JSON.parse(v);},statusCode:0};
  await handler({url,method,headers:{},get body(){return forbidden();}},response);
  assert.equal(response.statusCode,503,url);assert.equal(payload.code,'G11_STRICT_HOLD');assert.equal(headers['Cache-Control'],'no-store');
 }
 assert.equal(touched,0);
});
