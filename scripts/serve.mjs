// ローカルでサイトを開くための小さなサーバー。実行: npm start
// （YouTube の埋め込みは file:// で開くと再生できないため、http で配信する）
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = 5173;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.includes(".env")) return res.writeHead(403).end();
  try {
    const body = await readFile(root + (path === "/" ? "/index.html" : path));
    res.writeHead(200, { "Content-Type": (types[extname(path)] || "text/html") + "; charset=utf-8" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`▶ http://localhost:${PORT} を開いてください`));
