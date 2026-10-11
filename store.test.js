import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './store.js';

// Faux localStorage en mémoire
const mem = () => {
  const m = {};
  return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } };
};

test('load : stockage vide → état vide', () => {
  assert.deepEqual(S.load(mem()), S.emptyState());
});

test('load : JSON corrompu → état vide', () => {
  const st = mem();
  st.setItem('leanfree', '{oops');
  assert.deepEqual(S.load(st), S.emptyState());
});

test('save puis load', () => {
  const st = mem();
  const s = S.emptyState();
  s.profile = { sex: 'M', age: 28 };
  S.save(s, st);
  assert.deepEqual(S.load(st), s);
});

test('day crée la journée si absente', () => {
  const s = S.emptyState();
  S.day(s, '2026-10-11').steps = 5;
  assert.deepEqual(s.days['2026-10-11'], { steps: 5, exercises: [], meals: [] });
});

test('upsertWeight remplace la même date et trie', () => {
  const s = S.emptyState();
  S.upsertWeight(s, { date: '2026-10-11', kg: 87 });
  S.upsertWeight(s, { date: '2026-10-01', kg: 88 });
  S.upsertWeight(s, { date: '2026-10-11', kg: 86.8, fatPct: 25 });
  assert.deepEqual(s.weights, [
    { date: '2026-10-01', kg: 88 },
    { date: '2026-10-11', kg: 86.8, fatPct: 25 },
  ]);
});

test("exportJson n'inclut pas la clé API", () => {
  const s = S.emptyState();
  s.settings.apiKey = 'SECRET';
  s.settings.gistId = 'abc';
  const out = S.exportJson(s);
  assert.ok(!out.includes('SECRET'));
  assert.deepEqual(JSON.parse(out).settings, { model: S.DEFAULT_MODEL, gistId: 'abc' });
});

test('importJson garde la clé actuelle', () => {
  const current = S.emptyState();
  current.settings.apiKey = 'MA-CLE';
  const file = JSON.stringify({ profile: { age: 28 }, weights: [{ date: '2026-10-11', kg: 87 }], settings: { model: 'x' } });
  const s = S.importJson(file, current);
  assert.equal(s.settings.apiKey, 'MA-CLE');
  assert.equal(s.settings.model, 'x');
  assert.deepEqual(s.days, {});
});

test('importJson refuse un fichier invalide', () => {
  assert.throws(() => S.importJson('{"a":1}', S.emptyState()));
  assert.throws(() => S.importJson('pas du json', S.emptyState()));
});

test('importJson refuse days/favorites/weights mal formés', () => {
  assert.throws(() => S.importJson('{"profile":{},"weights":[{}]}', S.emptyState()));
  assert.throws(() => S.importJson('{"profile":{},"weights":[],"days":[]}', S.emptyState()));
  assert.throws(() => S.importJson('{"profile":{},"weights":[],"favorites":{}}', S.emptyState()));
});

test('load : réglages partiels fusionnés avec les défauts', () => {
  const st = mem();
  st.setItem('leanfree', '{"profile":{"age":28},"settings":{"apiKey":"K"}}');
  const s = S.load(st);
  assert.equal(s.settings.model, S.DEFAULT_MODEL);
  assert.equal(s.settings.gistId, '');
  assert.equal(s.settings.apiKey, 'K');
});
