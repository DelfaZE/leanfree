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

test("dailyTarget : jour d'entraînement (8 000 pas + 1 h muscu, −0,5 kg/sem)", () => {
  const t = C.dailyTarget({ bmr: 1779.4, steps: 258.5, exercise: 217.5, rate: -0.5, sex: 'M' });
  near(t.kcal, 1895);
  assert.equal(t.floored, false);
});

test('dailyTarget : jour de repos (5 000 pas)', () => {
  const steps = C.stepsKcal(5000, 179, 87);
  near(C.dailyTarget({ bmr: 1779.4, steps, exercise: 0, rate: -0.5, sex: 'M' }).kcal, 1546);
});

test('dailyTarget : plancher de sécurité', () => {
  assert.deepEqual(
    C.dailyTarget({ bmr: 1779.4, steps: 0, exercise: 0, rate: -1, sex: 'M' }),
    { kcal: 1500, floored: true },
  );
  assert.equal(C.dailyTarget({ bmr: 1000, steps: 0, exercise: 0, rate: -1, sex: 'F' }).kcal, 1200);
});

test('macroTargets', () => {
  const m = C.macroTargets(1895, 87, 25);
  near(m.protein, 143.6);
  near(m.fat, 52.6);
  near(m.carbs, 211.8);
  near(C.macroTargets(2000, 87, null).protein, 156.6);
});

test('weeksToGoal', () => {
  assert.equal(C.weeksToGoal(87, 78, -0.5), 18);
  assert.equal(C.weeksToGoal(70, 75, 0.25), 20);
  assert.equal(C.weeksToGoal(87, 78, 0.25), null);
  assert.equal(C.weeksToGoal(87, 78, 0), null);
  assert.equal(C.weeksToGoal(78, 78, -0.5), 0);
});

test('scaleItem : proportionnel, et sans recalcul si grammes de base ≤ 0', () => {
  const base = { grams: 200, kcal: 300, protein: 10, carbs: 40, fat: 8 };
  assert.deepEqual(C.scaleItem(base, 100), { grams: 100, kcal: 150, protein: 5, carbs: 20, fat: 4 });
  assert.deepEqual(C.scaleItem({ ...base, grams: 0 }, 50), { ...base, grams: 50 });
});

test('totals', () => {
  assert.deepEqual(
    C.totals([{ kcal: 100, protein: 1, carbs: 2, fat: 3 }, { kcal: 50 }]),
    { kcal: 150, protein: 1, carbs: 2, fat: 3 },
  );
});

test('avg7 : moyenne des pesées des 7 derniers jours', () => {
  const r = C.avg7([
    { date: '2026-10-01', kg: 88 },
    { date: '2026-10-09', kg: 86 },
    { date: '2026-10-05', kg: 87 },
  ]);
  assert.deepEqual(r, [
    { date: '2026-10-01', kg: 88 },
    { date: '2026-10-05', kg: 87.5 },
    { date: '2026-10-09', kg: 86.5 },
  ]);
});

test('parseSteps : texte du presse-papiers → entier', () => {
  assert.equal(C.parseSteps('8432'), 8432);
  assert.equal(C.parseSteps(' 8 432 '), 8432);
  assert.equal(C.parseSteps('8432,6'), 8433);
  assert.equal(C.parseSteps('abc'), null);
  assert.equal(C.parseSteps(''), null);
  assert.equal(C.parseSteps('250000'), null);
});

test("dayPlan : journée d'entraînement complète", () => {
  const day = {
    steps: 8000,
    exercises: [{ kcal: 217.5 }],
    meals: [{ kcal: 600, protein: 40, carbs: 60, fat: 20 }],
  };
  const p = C.dayPlan(me, [{ date: '2026-10-11', kg: 87, fatPct: 25 }], day);
  near(p.bmr, 1779);
  near(p.steps, 258);
  near(p.target.kcal, 1895);
  near(p.digestion, 60);
  assert.equal(p.eaten.kcal, 600);
  near(p.macros.protein, 143.6);
});
