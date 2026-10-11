// Fonctions pures : aucun accès au DOM ni au stockage.

export const EXERCISES = [
  { key: 'muscu', label: 'Musculation (classique)', met: 3.5 },
  { key: 'muscu-intense', label: 'Musculation intense', met: 5.0 },
  { key: 'velo', label: 'Vélo / elliptique modéré', met: 7.0 },
  { key: 'course', label: 'Course ~10 km/h', met: 9.8 },
  { key: 'natation', label: 'Natation', met: 5.8 },
  { key: 'hiit', label: 'Cours collectif / HIIT', met: 8.0 },
];

export const RATES = [-1, -0.75, -0.5, -0.25, 0, 0.25];

export function ymd(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

export function latest(weights) {
  if (!weights.length) return null;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const withFat = sorted.filter(w => w.fatPct != null).at(-1);
  return { kg: sorted.at(-1).kg, fatPct: withFat ? withFat.fatPct : null };
}

export function bmr(profile, kg, fatPct) {
  if (fatPct != null) return 370 + 21.6 * kg * (1 - fatPct / 100);
  const base = 10 * kg + 6.25 * profile.heightCm - 5 * profile.age;
  return profile.sex === 'F' ? base - 161 : base + 5;
}

export function stepsKcal(steps, heightCm, kg) {
  const km = (steps * 0.415 * heightCm) / 100 / 1000;
  return km * kg * 0.5;
}

export function exerciseKcal(met, minutes, kg) {
  return (Math.max(0, met - 1) * kg * minutes) / 60;
}

export function dailyTarget({ bmr, steps, exercise, rate, sex }) {
  // X = dépense − déficit, avec dépense = bmr + pas + exo + 0,1·X (digestion) → X = (…) / 0,9
  const raw = (bmr + steps + exercise + (rate * 7700) / 7) / 0.9;
  const floor = sex === 'F' ? 1200 : 1500;
  return raw < floor ? { kcal: floor, floored: true } : { kcal: raw, floored: false };
}

export function macroTargets(kcal, kg, fatPct) {
  const protein = fatPct != null ? 2.2 * kg * (1 - fatPct / 100) : 1.8 * kg;
  const fat = (kcal * 0.25) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { protein, fat, carbs };
}

export function weeksToGoal(kg, goalKg, rate) {
  const diff = goalKg - kg; // négatif = perte
  if (diff === 0) return 0;
  if (rate === 0 || Math.sign(diff) !== Math.sign(rate)) return null;
  return diff / rate;
}

export function scaleItem(base, grams) {
  if (!(base.grams > 0)) return { ...base, grams };
  const f = grams / base.grams;
  return { grams, kcal: base.kcal * f, protein: base.protein * f, carbs: base.carbs * f, fat: base.fat * f };
}

export function totals(list) {
  return list.reduce(
    (t, x) => ({
      kcal: t.kcal + (x.kcal || 0),
      protein: t.protein + (x.protein || 0),
      carbs: t.carbs + (x.carbs || 0),
      fat: t.fat + (x.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function avg7(weights) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map(w => {
    const from = addDays(w.date, -6);
    const win = sorted.filter(x => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: win.reduce((s, x) => s + x.kg, 0) / win.length };
  });
}

export function parseSteps(text) {
  const s = String(text ?? '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return n <= 100000 ? n : null;
}

export function dayPlan(profile, weights, day) {
  const w = latest(weights);
  const b = bmr(profile, w.kg, w.fatPct);
  const steps = stepsKcal(day.steps || 0, profile.heightCm, w.kg);
  const exercise = totals(day.exercises).kcal;
  const target = dailyTarget({ bmr: b, steps, exercise, rate: profile.rateKgPerWeek, sex: profile.sex });
  const eaten = totals(day.meals);
  return {
    bmr: b,
    steps,
    exercise,
    digestion: eaten.kcal * 0.1,
    target,
    eaten,
    macros: macroTargets(target.kcal, w.kg, w.fatPct),
  };
}
