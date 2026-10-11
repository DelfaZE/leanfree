export function productToFood(json, code) {
  const p = json?.product;
  if (json?.status !== 1 || !p) return null;
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  if (kcal == null) return null;
  return {
    name: p.product_name || `Produit ${code}`,
    grams: 100,
    kcal,
    protein: n.proteins_100g ?? 0,
    carbs: n.carbohydrates_100g ?? 0,
    fat: n.fat_100g ?? 0,
  };
}

export async function lookup(code, fetchFn = fetch) {
  let json;
  try {
    const res = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    json = await res.json();
  } catch {
    throw new Error('Hors ligne : Open Food Facts injoignable.');
  }
  return productToFood(json, code);
}
