import { parseSteps } from './calc.js';

export function gistIdFrom(text) {
  return String(text ?? '').trim().replace(/\/+$/, '').split('/').pop();
}

export function parseGist(json) {
  const raw = json?.files?.['steps.json']?.content;
  if (raw == null) throw new Error('steps.json absent du gist');
  const days = {};
  for (const [date, value] of Object.entries(JSON.parse(raw))) {
    const n = parseSteps(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && n != null) days[date] = n;
  }
  return { days, updatedAt: json.updated_at };
}

export async function fetchSteps(gistId, fetchFn = fetch) {
  const res = await fetchFn(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gist introuvable (${res.status})`);
  return parseGist(await res.json());
}
