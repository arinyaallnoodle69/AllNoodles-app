import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
const root = process.cwd();
createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(1);
  const base = relative.startsWith("fonts/") ? resolve(root, "public") : resolve(root, "output/order-reserve");
  const file = resolve(base, relative);
  if (!file.startsWith(base + "/") && !file.startsWith(base + "\\")) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".css": "text/css", ".ttf": "font/ttf" })[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
}).listen(3013, "127.0.0.1", () => process.stdout.write("Mock reserve fixture: http://127.0.0.1:3013/reserve-picker.html\n"));
