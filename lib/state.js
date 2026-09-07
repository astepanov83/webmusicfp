// Player state saved on disk: last episode, positions, finished flags, track marks.

import fs from 'node:fs/promises';
import path from 'node:path';

const EMPTY = () => ({ lastSlug: null, positions: {}, finished: {}, marks: {}, updatedAt: 0 });

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// Keep only the fields we know, with sane types. Anything else from the client is dropped.
export function sanitizeState(input) {
  const s = EMPTY();
  if (!isObj(input)) return s;
  if (Number.isFinite(input.updatedAt) && input.updatedAt > 0) s.updatedAt = Math.round(input.updatedAt);
  if (typeof input.lastSlug === 'string' && /^[a-z]+$/.test(input.lastSlug)) s.lastSlug = input.lastSlug;
  if (isObj(input.positions)) {
    for (const [k, v] of Object.entries(input.positions)) {
      if (/^[a-z]+$/.test(k) && Number.isFinite(v) && v >= 0) s.positions[k] = Math.round(v);
    }
  }
  if (isObj(input.finished)) {
    for (const [k, v] of Object.entries(input.finished)) if (/^[a-z]+$/.test(k) && v === true) s.finished[k] = true;
  }
  if (isObj(input.marks)) {
    for (const [k, v] of Object.entries(input.marks)) {
      if (!/^[a-z]+$/.test(k) || !isObj(v)) continue;
      const m = {};
      for (const [idx, sec] of Object.entries(v)) {
        if (/^\d+$/.test(idx) && Number.isFinite(sec) && sec >= 0) m[idx] = Math.round(sec * 10) / 10;
      }
      if (Object.keys(m).length) s.marks[k] = m;
    }
  }
  return s;
}

export function createStateStore({ dataDir }) {
  if (!dataDir) throw new Error('dataDir is required');
  const file = path.join(dataDir, 'state.json');
  let state = EMPTY();
  let writing = Promise.resolve();

  async function load() {
    try {
      state = sanitizeState(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch {
      state = EMPTY();
    }
    return state;
  }

  function save() {
    const snapshot = JSON.stringify(state, null, 1);
    writing = writing.then(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(`${file}.tmp`, snapshot);
      await fs.rename(`${file}.tmp`, file);
    }).catch(() => {});
    return writing;
  }

  // Replace the whole state. The client owns it; the server only stores it.
  async function put(next) {
    state = sanitizeState(next);
    state.updatedAt = Date.now();
    await save();
    return state;
  }

  return { load, put, get: () => state, flush: () => writing };
}
