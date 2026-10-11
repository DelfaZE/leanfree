import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from './gemini.js';

const reply = obj => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const meal = {
  dish: 'Riz au poulet',
  confidence: 'medium',
  items: [{ name: 'Riz', grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 1 }],
};

test('buildBody : image, prompt « portion visible », schéma JSON', () => {
  const b = G.buildBody('AAA', 'riz basmati');
  assert.deepEqual(b.contents[0].parts[0], { inlineData: { mimeType: 'image/jpeg', data: 'AAA' } });
  assert.match(b.contents[0].parts[1].text, /portion VISIBLE/);
  assert.match(b.contents[0].parts[1].text, /riz basmati/);
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  assert.equal(b.generationConfig.responseSchema, G.SCHEMA);
});

test('buildPrompt sans description', () => {
  assert.doesNotMatch(G.buildPrompt(''), /Description/);
});

test('parseResponse : OK', () => {
  assert.deepEqual(G.parseResponse(reply(meal)), meal);
});

test('parseResponse : aucun aliment', () => {
  assert.throws(() => G.parseResponse(reply({ ...meal, items: [] })), /Aucun aliment détecté/);
});

test('parseResponse : réponse JSON null', () => {
  assert.throws(() => G.parseResponse(reply(null)), /Aucun aliment/);
});

test('parseResponse : réponse illisible ou bloquée', () => {
  assert.throws(() => G.parseResponse({ candidates: [{ content: { parts: [{ text: '{' }] } }] }), /illisible/);
  assert.throws(() => G.parseResponse({}), /illisible/);
});

test('httpError : messages selon le code', () => {
  assert.match(G.httpError(429), /Quota du jour/);
  assert.match(G.httpError(404), /Modèle introuvable/);
  assert.match(G.httpError(403), /Clé refusée/);
  assert.match(G.httpError(400, 'API key not valid. Please pass a valid API key.'), /Clé refusée/);
  assert.match(G.httpError(500, 'boom'), /Erreur Gemini \(500\) : boom/);
});

test('analyze : succès, URL et clé correctes', async () => {
  let call;
  const fake = async (url, opts) => {
    call = { url, opts };
    return { ok: true, status: 200, json: async () => reply(meal) };
  };
  const r = await G.analyze({ apiKey: 'KEY', model: 'gemini-flash-latest', base64: 'A', description: '' }, fake);
  assert.match(call.url, /\/v1beta\/models\/gemini-flash-latest:generateContent$/);
  assert.equal(call.opts.headers['x-goog-api-key'], 'KEY');
  assert.equal(r.dish, 'Riz au poulet');
});

test('analyze : hors ligne', async () => {
  const fake = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(G.analyze({ apiKey: 'k', model: 'm', base64: 'A' }, fake), /Hors ligne/);
});

test('analyze : quota épuisé (429)', async () => {
  const fake = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) });
  await assert.rejects(G.analyze({ apiKey: 'k', model: 'm', base64: 'A' }, fake), /Quota du jour/);
});

const busy = { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
const noWait = async () => {};

test('analyze : modèle surchargé (503) puis succès → relance', async () => {
  const replies = [busy, { ok: true, status: 200, json: async () => reply(meal) }];
  let calls = 0;
  const r = await G.analyze({ apiKey: 'k', model: 'm', base64: 'A' }, async () => replies[calls++], noWait);
  assert.equal(calls, 2);
  assert.equal(r.dish, 'Riz au poulet');
});

test('analyze : toujours surchargé (503) → 3 essais puis message', async () => {
  let calls = 0;
  await assert.rejects(
    G.analyze({ apiKey: 'k', model: 'm', base64: 'A' }, async () => { calls++; return busy; }, noWait),
    /surchargé/,
  );
  assert.equal(calls, 3);
});
