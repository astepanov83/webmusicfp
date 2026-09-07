// HTTP request handler: static player files plus the JSON API.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    res.writeHead(400); res.end('bad path'); return;
  }
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

export function createApp({ catalog, state, log = () => {} }) {
  if (!catalog || !state) throw new Error('catalog and state are required');

  async function api(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (pathname === '/api/health') return json(res, 200, { ok: true, catalog: catalog.status() });

    if (pathname === '/api/episodes' && method === 'GET') {
      const data = catalog.get();
      return json(res, 200, { fetchedAt: data.fetchedAt, status: catalog.status(), episodes: data.episodes });
    }

    const one = /^\/api\/episodes\/([a-z]+)$/.exec(pathname);
    if (one && method === 'GET') {
      const ep = catalog.find(one[1]);
      return ep ? json(res, 200, ep) : json(res, 404, { error: 'no such episode' });
    }

    if (pathname === '/api/refresh' && method === 'POST') {
      const full = url.searchParams.get('full') === '1';
      try {
        const r = await catalog.refresh({ full });
        return json(res, 200, { ok: true, ...r, status: catalog.status() });
      } catch (err) {
        return json(res, 502, { ok: false, error: err.message, status: catalog.status() });
      }
    }

    if (pathname === '/api/state' && method === 'GET') return json(res, 200, state.get());

    if (pathname === '/api/state' && method === 'PUT') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (err) {
        return json(res, 400, { error: `bad json: ${err.message}` });
      }
      return json(res, 200, await state.put(body));
    }

    return json(res, 404, { error: 'not found' });
  }

  return (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400); res.end('bad url'); return;
    }
    if (url.pathname.startsWith('/api/')) {
      api(req, res, url).catch((err) => {
        log(`api error: ${err.stack || err}`);
        if (!res.headersSent) json(res, 500, { error: err.message });
        else res.end();
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(req, res, url.pathname);
  };
}
