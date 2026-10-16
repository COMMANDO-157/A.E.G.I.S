// Fresh native local PostgreSQL only; never loads .env or an existing data directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
const execute=promisify(execFile);
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const bin=arg('pg-bin');if(!bin||!path.isAbsolute(bin))throw Error('Supply --pg-bin=<absolute native PostgreSQL bin directory>.');
const exe=name=>path.join(bin,name+(process.platform==='win32'?'.exe':''));
for(const name of ['postgres','initdb','pg_ctl'])if(!fs.existsSync(exe(name)))throw Error('Missing native PostgreSQL executable: '+name);
const base=fs.mkdtempSync(path.join(os.tmpdir(),'isolated_aegis_phase12_'));
const work=path.join(base,'.verification','phase12');fs.mkdirSync(work,{recursive:true});
const dataDirectory=path.join(work,'cluster');const password=randomBytes(32).toString('hex');
const passwordFile=path.join(work,'init-password');fs.writeFileSync(passwordFile,password,{mode:0o600});
// Child environment intentionally excludes inherited database/provider credentials.
const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
let server,started=false;let status=1;
try{
 const init=await execute(exe('initdb'),['-D',dataDirectory,'-U','phase12_operator','--auth=scram-sha-256','--pwfile='+passwordFile,'--encoding=UTF8','--locale=C'],{windowsHide:true,env});fs.writeFileSync(path.join(work,'init.log'),init.stdout+init.stderr);fs.unlinkSync(passwordFile);
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const out=fs.openSync(path.join(work,'postgres.log'),'a');server=spawn(exe('postgres'),['-D',dataDirectory,'-h','127.0.0.1','-p',String(port),'-c','ssl=off'],{windowsHide:true,env,stdio:['ignore',out,out]});fs.closeSync(out);started=true;
 let ready=false;for(let i=0;i<100;i++){const client=new pg.Client({host:'127.0.0.1',port,user:'phase12_operator',password,database:'postgres',ssl:false,connectionTimeoutMillis:200});try{await client.connect();await client.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}finally{await client.end().catch(()=>{});}}if(!ready)throw Error('Disposable cluster startup failed.');
 const config=path.join(work,'local-only.json');fs.writeFileSync(config,JSON.stringify({host:'127.0.0.1',port,user:'phase12_operator',password,dataDirectory}),{mode:0o600});
 const child=spawn(process.execPath,['--test','test_phase12_postgres.js'],{cwd:process.cwd(),windowsHide:true,env:{...env,NODE_ENV:'test',AEGIS_PHASE12_LOCAL_CONFIG:config},stdio:['ignore','pipe','pipe']});
 const log=fs.createWriteStream(path.join(work,'integration.txt'));for(const [stream,destination] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{destination.write(chunk);log.write(chunk);});
 const deadline=setTimeout(()=>child.kill(),60000);
 try {status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1));});}
 finally {clearTimeout(deadline);await new Promise(resolve=>log.end(resolve));}
}finally{
 if(started){await execute(exe('pg_ctl'),['-D',dataDirectory,'-m','fast','-w','stop'],{windowsHide:true,env});console.log('Disposable PostgreSQL cluster stopped.');}
 if(fs.existsSync(passwordFile))fs.unlinkSync(passwordFile);
 const config=path.join(work,'local-only.json');if(fs.existsSync(config))fs.unlinkSync(config);
 console.log('Local evidence retained at '+work+' (no credentials in report).');
}
process.exitCode=status;
