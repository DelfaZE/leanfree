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
