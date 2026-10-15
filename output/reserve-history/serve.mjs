import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,"http://localhost").pathname).slice(1)||"index.html";
  const base=resolve(name.startsWith("fonts/")?"public":"output/reserve-history");
  const file=resolve(base,name);
  if(!file.startsWith(base+sep)){res.writeHead(403).end();return;}
  try{res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".ttf":"font/ttf"})[extname(file)]??"application/octet-stream");res.end(readFileSync(file));}catch{res.writeHead(404).end();}
}).listen(3013,"127.0.0.1",()=>process.stdout.write("History fixture at http://127.0.0.1:3013/\n"));
