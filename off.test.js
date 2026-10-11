import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from './off.js';

test('productToFood : valeurs pour 100 g en kcal', () => {
  const json = {
    status: 1,
    product: {
      product_name: 'Skyr',
      nutriments: { 'energy-kcal_100g': 60, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 0.2 },
    },
  };
  assert.deepEqual(O.productToFood(json, '123'), { name: 'Skyr', grams: 100, kcal: 60, protein: 10, carbs: 4, fat: 0.2 });
});

test('productToFood : énergie en kJ seulement, nom et macros absents', () => {
  const f = O.productToFood({ status: 1, product: { nutriments: { energy_100g: 418.4 } } }, '123');
  assert.equal(f.name, 'Produit 123');
  assert.ok(Math.abs(f.kcal - 100) < 1e-9);
  assert.equal(f.protein, 0);
});

test('productToFood : produit inconnu ou sans énergie → null', () => {
  assert.equal(O.productToFood({ status: 0 }, '1'), null);
  assert.equal(O.productToFood({ status: 1, product: { nutriments: {} } }, '1'), null);
});

test('lookup : URL et résultat', async () => {
  let url;
  const fake = async u => {
    url = u;
    return { json: async () => ({ status: 1, product: { product_name: 'X', nutriments: { 'energy-kcal_100g': 100 } } }) };
  };
  const f = await O.lookup('3017620422003', fake);
  assert.equal(url, 'https://world.openfoodfacts.org/api/v2/product/3017620422003.json');
  assert.equal(f.kcal, 100);
});

test('lookup : hors ligne', async () => {
  await assert.rejects(O.lookup('1', async () => { throw new TypeError('x'); }), /Hors ligne/);
});
