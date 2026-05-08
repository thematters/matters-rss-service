import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { routeRequest } from "../src/rss.js";
import { MemoryWebSubStorage } from "../src/storage.js";
import { hubUrlFor } from "../src/websub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 8788);
const storage = new MemoryWebSubStorage();
const env = {
  WEBSUB_DAILY_DELIVERY_LIMIT: process.env.WEBSUB_DAILY_DELIVERY_LIMIT || "2500",
};

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
]);

async function staticResponse(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relativePath);

  if (!filePath.startsWith(publicDir)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const body = await readFile(filePath);
    const type = contentTypes.get(path.extname(filePath)) || "application/octet-stream";
    return new Response(body, {
      headers: {
        "content-type": type,
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function writeNodeResponse(webResponse, nodeResponse) {
  nodeResponse.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  if (webResponse.body) {
    const buffer = Buffer.from(await webResponse.arrayBuffer());
    nodeResponse.end(buffer);
  } else {
    nodeResponse.end();
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = `http://localhost:${port}${req.url || "/"}`;
  const request = new Request(requestUrl, {
    method: req.method,
    headers: req.headers,
  });

  const response = await routeRequest(request, {
    env,
    storage,
    webSubHubUrl: (origin) => hubUrlFor(origin, env),
    next: () => staticResponse(requestUrl),
  });
  await writeNodeResponse(response, res);
});

server.listen(port, () => {
  console.log(`Matters RSS service running at http://localhost:${port}`);
});
