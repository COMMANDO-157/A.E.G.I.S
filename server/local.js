import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import handler from './handler.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/')) return handler(req,res);
 try {
  const decoded=decodeURIComponent(path);
  if(decoded!=='/'&&decoded!=='/index.html'&&!/^\/(css|js)\/[A-Za-z0-9_./-]+$/.test(decoded)) {res.writeHead(404).end();return;}
  const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
  if(!(file===resolve(root,'index.html')||file.startsWith(resolve(root,'js')+sep)||file.startsWith(resolve(root,'css')+sep))||!types[extname(file)]) {res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[extname(file)],'X-Content-Type-Options':'nosniff'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
server.listen(Number(process.env.PORT||5501),'127.0.0.1',()=>console.log('A.E.G.I.S local backend ready; Google login requires configured environment and migrations.'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
