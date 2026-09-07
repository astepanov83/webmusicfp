import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStateStore, sanitizeState } from '../lib/state.js';

test('sanitizeState keeps known fields and drops junk', () => {
  const s = sanitizeState({
    lastSlug: 'seven',
    positions: { seven: 12.7, 'bad slug!': 3, one: -1, two: 'x' },
    finished: { one: true, two: false, 'x y': true },
    marks: { seven: { 0: 0, 3: 601.26, x: 5 }, bad: {} },
    extra: 'nope',
  });
  assert.deepEqual(s, {
    lastSlug: 'seven',
    positions: { seven: 13 },
    finished: { one: true },
    marks: { seven: { 0: 0, 3: 601.3 } },
    updatedAt: 0,
  });
  assert.equal(sanitizeState(null).lastSlug, null);
  assert.equal(sanitizeState('str').lastSlug, null);
});

test('put saves and load reads back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webmusicfp-state-'));
  const store = createStateStore({ dataDir: dir });
  await store.load();
  assert.equal(store.get().lastSlug, null);
  await store.put({ lastSlug: 'two', positions: { two: 40 } });
  const again = createStateStore({ dataDir: dir });
  const loaded = await again.load();
  assert.equal(loaded.lastSlug, 'two');
  assert.equal(loaded.positions.two, 40);
  assert.ok(loaded.updatedAt > 0);
});
