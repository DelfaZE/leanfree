const KEY = 'leanfree';
export const DEFAULT_MODEL = 'gemini-flash-latest';

export function emptyState() {
  return { profile: null, weights: [], days: {}, favorites: [], settings: { apiKey: '', model: DEFAULT_MODEL, gistId: '' } };
}

export function load(storage = globalThis.localStorage) {
  try {
    return { ...emptyState(), ...JSON.parse(storage.getItem(KEY)) };
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
  if (!data || typeof data !== 'object' || !data.profile || !Array.isArray(data.weights)) {
    throw new Error('Fichier invalide');
  }
  return {
    ...emptyState(),
    ...data,
    settings: {
      apiKey: current.settings.apiKey,
      model: data.settings?.model || current.settings.model,
      gistId: data.settings?.gistId ?? current.settings.gistId,
    },
  };
}
