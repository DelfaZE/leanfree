import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './calc.js';

const near = (actual, expected, tol = 1) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} n'est pas ≈ ${expected}`);

// Profil de référence (spec §1)
const me = { sex: 'M', age: 28, heightCm: 179, goalKg: 78, rateKgPerWeek: -0.5 };

test('ymd et addDays en heure locale', () => {
  assert.equal(C.ymd(new Date(2026, 9, 11)), '2026-10-11');
  assert.equal(C.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(C.addDays('2026-03-01', -1), '2026-02-28');
});

test('latest : dernier poids + dernière masse grasse connue', () => {
  const w = [
    { date: '2026-10-01', kg: 88, fatPct: 26 },
    { date: '2026-10-11', kg: 87 },
    { date: '2026-10-05', kg: 87.5 },
  ];
  assert.deepEqual(C.latest(w), { kg: 87, fatPct: 26 });
  assert.equal(C.latest([]), null);
});

test('bmr : Katch-McArdle si masse grasse connue', () => {
  near(C.bmr(me, 87, 25), 1779);
});

test('bmr : Mifflin-St Jeor sinon', () => {
  near(C.bmr(me, 87, null), 1854);
  near(C.bmr({ ...me, sex: 'F' }, 87, null), 1688);
});

test('stepsKcal : 8 000 pas', () => {
  near(C.stepsKcal(8000, 179, 87), 258);
});

test('exerciseKcal : 1 h de musculation classique (MET 3,5)', () => {
  near(C.exerciseKcal(3.5, 60, 87), 218);
  assert.equal(C.exerciseKcal(0.5, 60, 87), 0);
});
