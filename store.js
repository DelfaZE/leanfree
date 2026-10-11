const KEY = 'leanfree';
export const DEFAULT_MODEL = 'gemini-flash-latest';

export function emptyState() {
  return { profile: null, weights: [], days: {}, favorites: [], settings: { apiKey: '', model: DEFAULT_MODEL, gistId: '' } };
}

export function load(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    return { ...emptyState(), ...saved, settings: { ...emptyState().settings, ...saved?.settings } };
  } catch {
    return emptyState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(state));
}

export function day(state, date) {
  return (state.days[date] ??= { steps: 0, exercises: [], meals: [] });
}

export function upsertWeight(state, entry) {
  state.weights = state.weights.filter(w => w.date !== entry.date);
  state.weights.push(entry);
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
}

export function exportJson(state) {
  const { apiKey, ...settings } = state.settings;
  return JSON.stringify({ ...state, settings }, null, 2);
}

export function importJson(text, current) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !data.profile || !Array.isArray(data.weights) || !data.weights.length) {
    throw new Error('Fichier invalide');
  }
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (
    (data.days != null && !isObj(data.days)) ||
    (data.favorites != null && !Array.isArray(data.favorites)) ||
    !data.weights.every(w => w && typeof w.date === 'string' && Number.isFinite(w.kg) &&
      ['fatPct', 'musclePct'].every(k => w[k] == null || Number.isFinite(w[k])))
  ) {
    throw new Error('Fichier invalide');
  }
  return {
    ...emptyState(),
    ...data,
    weights: [...new Map(data.weights.map(w => [w.date, w])).values()].sort((a, b) => a.date.localeCompare(b.date)),
    days: data.days ?? {},
    favorites: data.favorites ?? [],
    settings: {
      apiKey: current.settings.apiKey,
      model: data.settings?.model || current.settings.model,
      gistId: data.settings?.gistId ?? current.settings.gistId,
    },
  };
}
