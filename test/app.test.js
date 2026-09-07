import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../lib/app.js';

async function withServer(fn) {
  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('GET / serves the player page', async () => {
  await withServer(async (base) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /<title>/);
  });
});

test('GET /episodes.json serves the catalog file with a json type', async () => {
  await withServer(async (base) => {
    const res = await fetch(base + '/episodes.json');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const body = await res.json();
    assert.ok(Array.isArray(body.episodes));
  });
});

test('static files cannot escape public/', async () => {
  await withServer(async (base) => {
    const res = await fetch(base + '/..%2F..%2Fpackage.json');
    assert.ok(res.status === 403 || res.status === 404);
    assert.equal((await fetch(base + '/%zz')).status, 400);
    assert.equal((await fetch(base + '/nope.txt')).status, 404);
  });
});

test('other methods give 405', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  });
});
