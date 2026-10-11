import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from './sync.js';

const gist = content => ({ updated_at: '2026-10-11T18:00:12Z', files: { 'steps.json': { content } } });

test('parseGist garde les dates et nombres valides', () => {
  const g = gist('{"2026-10-11": 8432, "2026-10-10": "10 234", "hier": 5, "2026-10-09": "abc"}');
  assert.deepEqual(Y.parseGist(g), {
    days: { '2026-10-11': 8432, '2026-10-10': 10234 },
    updatedAt: '2026-10-11T18:00:12Z',
  });
});

test('parseGist : fichier absent ou JSON invalide', () => {
  assert.throws(() => Y.parseGist({ files: {} }));
  assert.throws(() => Y.parseGist(gist('{')));
});

test('parseGist : format simple (juste le total du jour) → daté avec updated_at', () => {
  const g = n => ({ updated_at: '2026-10-11T12:00:00Z', files: { 'steps.json': { content: n } } });
  assert.deepEqual(Y.parseGist(g('8432')).days, { '2026-10-11': 8432 });
  assert.deepEqual(Y.parseGist(g('8 432')).days, { '2026-10-11': 8432 });
  assert.deepEqual(Y.parseGist(g('{}')).days, {});
});

test("gistIdFrom accepte l'identifiant ou l'URL", () => {
  assert.equal(Y.gistIdFrom(' https://gist.github.com/dede/0f1e2d3c4b5a/ '), '0f1e2d3c4b5a');
  assert.equal(Y.gistIdFrom('0f1e2d3c4b5a'), '0f1e2d3c4b5a');
  assert.equal(Y.gistIdFrom(''), '');
});

test('fetchSteps : URL, sans cache, résultat', async () => {
  let call;
  const fake = async (url, opts) => {
    call = { url, opts };
    return { ok: true, status: 200, json: async () => gist('{"2026-10-11": 8432}') };
  };
  const r = await Y.fetchSteps('abc', fake);
  assert.equal(call.url, 'https://api.github.com/gists/abc');
  assert.equal(call.opts.cache, 'no-store');
  assert.deepEqual(r.days, { '2026-10-11': 8432 });
});

test('fetchSteps : gist introuvable', async () => {
  const fake = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(Y.fetchSteps('abc', fake), /introuvable/);
});

test('fetchSteps : hors ligne', async () => {
  await assert.rejects(Y.fetchSteps('abc', async () => { throw new TypeError('Failed to fetch'); }));
});
