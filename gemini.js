const NUM = { type: 'NUMBER' };

export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    dish: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, grams: NUM, kcal: NUM, protein: NUM, carbs: NUM, fat: NUM },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
  },
  required: ['dish', 'confidence', 'items'],
};

export function buildPrompt(description) {
  return [
    'Tu es nutritionniste. Analyse la photo de ce repas.',
    'Estime la portion VISIBLE sur la photo, pas une portion standard.',
    'Détaille chaque aliment séparément : nom en français, poids en grammes, kcal, protéines, glucides et lipides en grammes.',
    'Compte les huiles, beurres et sauces probables comme des aliments à part.',
    "Si aucun aliment n'est visible, renvoie une liste items vide.",
    description ? `Description donnée par l'utilisateur : ${description}` : '',
  ].filter(Boolean).join('\n');
}

export function buildBody(base64, description) {
  return {
    contents: [{ parts: [
      { inlineData: { mimeType: 'image/jpeg', data: base64 } },
      { text: buildPrompt(description) },
    ] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
}

export function parseResponse(json) {
  let data;
  try {
    data = JSON.parse(json.candidates[0].content.parts[0].text);
  } catch {
    throw new Error('Réponse illisible, réessaie.');
  }
  if (!Array.isArray(data?.items) || data.items.length === 0) {
    throw new Error('Aucun aliment détecté. Essaie un autre angle.');
  }
  return data;
}

export function httpError(status, message = '') {
  if (status === 429) return 'Quota du jour atteint. Saisis le repas à la main ou réessaie demain.';
  if (status === 404) return 'Modèle introuvable : change-le dans les réglages.';
  if (status === 503) return 'Gemini est surchargé en ce moment. Réessaie dans une minute.';
  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return 'Clé refusée : vérifie la clé et ses restrictions.';
  }
  return `Erreur Gemini (${status}) : ${message}`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function analyze({ apiKey, model, base64, description }, fetchFn = fetch, wait = sleep) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(buildBody(base64, description)),
        },
      );
    } catch {
      throw new Error("Hors ligne : le scan n'est pas disponible.");
    }
    const json = await res.json().catch(() => ({}));
    // 503 = modèle surchargé, souvent passager : 2 relances (après 2 s puis 4 s)
    if (res.status === 503 && attempt < 2) {
      await wait(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(httpError(res.status, json.error?.message));
    return parseResponse(json);
  }
}
