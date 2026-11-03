// Optional local server for systems with Node.js but no Python.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.argv[2]??8000),base=(process.argv[3]||'').replace(/\/$/,'');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  let file;try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(base){if(!name.startsWith(base+'/'))throw Error();name=name.slice(base.length);}file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)&&file!==root)throw Error();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');}catch{res.writeHead(404);res.end('Not found');return;}
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(body);});
}).listen(port,'127.0.0.1',()=>console.log(`FIELDWORK ready: http://127.0.0.1:${server.address().port}${base}/`));
