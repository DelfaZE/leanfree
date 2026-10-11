# LeanFree — Spec de conception

Date : 2026-10-11 · Statut : validé en brainstorming, audité, en relecture

## 1. But

Clone personnel et gratuit de l'app « Lean » (compteur de calories) : suivre ce qu'on mange,
ce qu'on dépense, et atteindre un poids cible. Un seul utilisateur, sur iPhone, données en local.

Profil de référence (pour les tests) : homme, 28 ans, 1,79 m, 87 kg, 25 % de masse grasse
(Basic-Fit), objectif 78 kg.

## 2. Périmètre

### Inclus (v1)
1. **Premier lancement** : saisie du profil + **première pesée** (le poids vient toujours des pesées).
2. **Profil et objectif** : sexe, âge, taille, poids cible, rythme (kg/semaine).
3. **Journée** : anneau des calories restantes, 3 barres de macros, liste des repas, pas et
   séances. Navigation ← → entre les jours (aujourd'hui par défaut). Bouton **+** →
   scan IA / code-barres / saisie manuelle / favoris.
4. **Poids** : une pesée par jour (une nouvelle pesée le même jour remplace la précédente) :
   kg obligatoire, % de masse grasse et % de masse musculaire facultatifs. Courbes et
   moyenne glissante sur 7 jours.
5. **Exercice** : ajouter une séance (type + durée → kcal, ou kcal saisies directement).
6. **Pas** : synchronisés automatiquement depuis Santé via un gist GitHub (voir §6). En secours :
   bouton Coller ou saisie à la main.
7. **Modifier / supprimer** : un repas, une séance ou une pesée.
8. **Réglages** : clé Gemini, nom du modèle, identifiant du gist des pas, export/import JSON.

### Exclus (v1)
Scan du corps, ajustement automatique de la dépense d'après l'évolution du poids (v2),
jeûne intermittent, séries, plans de repas IA, synchro multi-appareils, comptes.

## 3. Architecture

- PWA en JavaScript simple, sans framework ni build : `index.html`, `app.js`, `calc.js`,
  `sync.js`, `style.css`, `manifest.json`, `sw.js`, une icône, et la bibliothèque de code-barres
  **copiée dans le dépôt** (`vendor/`), sans CDN.
- Hébergée sur GitHub Pages (HTTPS, nécessaire pour la PWA et la caméra).
- Installée via Safari → Partager → « Sur l'écran d'accueil ».
- `calc.js` ne contient que des fonctions pures (sans DOM ni stockage) → testable avec Node.
- Service worker : met en cache les fichiers de l'app, sous un nom de cache versionné
  (`leanfree-vN`). On incrémente N à chaque déploiement et les anciens caches sont supprimés
  à l'activation. L'app s'ouvre hors ligne, mais le scan IA et le code-barres ont besoin du réseau.

## 4. Données (localStorage, une clé `leanfree`, JSON)

```js
{
  profile:   { sex: "M"|"F", age, heightCm, goalKg, rateKgPerWeek }, // rate: -1, -0.75, -0.5, -0.25, 0, +0.25
  weights:   [{ date: "2026-10-11", kg, fatPct?, musclePct? }],
  days: {
    "2026-10-11": {
      steps: 8432,
      exercises: [{ id, type, name, minutes?, met?, kcal }],   // type: clé de la liste du §5, ou "autre"
      meals:     [{ id, time, name, kcal, protein, carbs, fat, items?: [...] }]
    }
  },
  favorites: [{ id, name, kcal, protein, carbs, fat, items? }],
  settings:  { apiKey, model, gistId },  // model par défaut : "gemini-flash-latest" ; gistId : "" si pas de synchro
  stepsSyncedAt: "2026-10-11T18:00:12Z"   // updated_at du gist lors de la dernière lecture réussie (ou absent)
}
```

- Les photos ne sont jamais stockées. Les dates sont en heure locale (`YYYY-MM-DD`).
- `id` = `crypto.randomUUID()`, pour pouvoir modifier ou supprimer un élément.
- **Export** : tout sauf `settings.apiKey`. **Import** : JSON validé (présence de `profile`
  et `weights`), sinon refusé ; la clé API actuelle est conservée.

## 5. Calculs (`calc.js`)

Poids `W` = dernière pesée. `fatPct` = la valeur de la dernière pesée qui en contient une.

| Fonction | Formule |
|---|---|
| Métabolisme de base | si `fatPct` connu : Katch-McArdle `370 + 21,6 × W × (1 − fatPct/100)`. Sinon : Mifflin-St Jeor `10W + 6,25 × taille − 5 × âge + 5` (homme) / `− 161` (femme) |
| Pas | `steps × 0,415 × taille(m) / 1000` = km ; `km × W × 0,5` kcal |
| Exercice | `(MET − 1) × W × heures`, ou kcal saisies directement |
| Digestion | 10 % des kcal mangées |
| Déficit/jour | `rate × 7700 / 7` (−0,5 → −550) |
| **Objectif du jour** | `X = (BMR + pas + exercice + déficit) / 0,9`. Le 0,9 vient de la digestion, qui dépend de ce qu'on mange : X = dépense − déficit, avec dépense = BMR + pas + exo + 0,1·X. Plancher : 1 500 kcal (H) / 1 200 (F), avec un avertissement s'il s'applique |
| Protéines | `2,2 g × masse maigre` si `fatPct` connu, sinon `1,8 g × W` |
| Lipides | 25 % de l'objectif du jour ÷ 9 |
| Glucides | reste ÷ 4 (min 0) |
| Date d'arrivée | `(W − goalKg) / |rate|` semaines à partir d'aujourd'hui ; aucune si rate = 0 ou si l'objectif va dans le mauvais sens |

Liste des exercices (MET du Compendium 2024 ; ces valeurs couvrent les séances avec leurs
temps de repos habituels) :
musculation, séance classique (plusieurs exercices, 8–15 répétitions) **3,5 par défaut** ·
musculation intense (squats, soulevés de terre, peu de repos) 5,0 · vélo/elliptique modéré 7,0 ·
course ~10 km/h 9,8 · natation 5,8 · cours collectif/HIIT 8,0 · autre (kcal saisies).
Limite connue : les pas faits pendant une course sont comptés deux fois (pas + exercice).
C'est accepté en v1.

Valeurs attendues pour le profil de référence (vérifiées par les tests) :

| Cas | Attendu |
|---|---|
| Katch-McArdle (87 kg, 25 %) | ≈ 1 779 |
| Mifflin-St Jeor (sans `fatPct`, 28 ans) | ≈ 1 854 |
| 8 000 pas | ≈ 258 kcal |
| 1 h de musculation classique (MET 3,5) | ≈ 218 kcal |
| Objectif d'un jour d'entraînement (8 000 pas + 1 h de muscu, −0,5 kg/sem) | ≈ 1 895 kcal |
| Objectif d'un jour de repos (5 000 pas, −0,5 kg/sem) | ≈ 1 546 kcal |
| 9 kg à −0,5 kg/sem | 18 semaines |
| Rythme −1 kg/sem, 0 pas, 0 exercice | plancher de 1 500 appliqué + avertissement |

## 6. Pas depuis l'iPhone

Une web app n'a pas accès à Santé (HealthKit). Sur iOS, l'app installée sur l'écran
d'accueil a en plus un stockage séparé de Safari, et « Ouvrir l'URL » dans un raccourci ouvre
Safari. Les pas passent donc par un relais : un **gist GitHub secret**.

### Synchro automatique (principal)

- **Gist** : un gist secret contenant un fichier `steps.json`, au format
  `{"2026-10-11": 8432, "2026-10-10": 10234}` (aujourd'hui et hier).
- **Raccourci iOS « Synchro pas LeanFree »** :
  1. Rechercher des échantillons de santé (Pas, aujourd'hui) → Calculer les statistiques (somme).
  2. Pareil pour hier.
  3. Construire le texte JSON avec les deux dates (format `yyyy-MM-dd`).
  4. Obtenir le contenu de l'URL : `PATCH https://api.github.com/gists/{gistId}`, en-têtes
     `Authorization: Bearer <token>` et `Accept: application/vnd.github+json`, corps JSON
     `{"files": {"steps.json": {"content": "<texte JSON>"}}}`.
- **Automatisations personnelles** (« Exécuter immédiatement », sans notification) :
  12 h, 18 h, 21 h et 23 h 30.
- **Token** : un token GitHub *classic* avec **uniquement** le scope `gist` (les tokens
  « fine-grained » ne gèrent pas les gists). Il n'est stocké que dans le raccourci, jamais
  dans l'app.
- **Dans l'app** (`sync.js`) : au démarrage et à chaque retour au premier plan, si `gistId`
  est renseigné → `GET https://api.github.com/gists/{gistId}` (`cache: "no-store"`, sans
  authentification) → lecture de `files["steps.json"].content`. Chaque date valide
  (`YYYY-MM-DD`) avec un nombre valide (`parseSteps`) **remplace** les pas de ce jour (Santé
  est la source de vérité). `stepsSyncedAt` reçoit le `updated_at` du gist, c'est-à-dire
  l'heure du dernier passage du raccourci.
- Le champ « Gist des pas » des réglages accepte l'identifiant ou l'URL complète du gist.
- **Affichage** : sous le champ Pas, « Pas de Santé mis à jour à 18:00 », ou « Synchro des
  pas impossible » en cas d'échec. L'échec ne bloque rien.
- Limite connue : si l'app n'est pas ouverte pendant plus d'un jour, les pas d'avant-hier ne
  sont plus dans le gist. C'est accepté.

### Secours

- Champ « Pas » modifiable à la main, plus un bouton **Coller**
  (`navigator.clipboard.readText()` au tap). La valeur doit être un entier entre 0 et 100 000.
- La prochaine synchro réussie écrase la saisie manuelle des jours présents dans le gist.
- Le guide pas à pas (gist, token, raccourci, automatisations) sera dans le README.

## 7. Scan IA (Gemini)

1. `<input type="file" accept="image/*" capture="environment">` → redimensionnement via un
   canvas (côté le plus long : 1024 px, JPEG qualité 0,8) → base64.
2. Description facultative (texte libre).
3. `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
   en-tête `x-goog-api-key`, `generationConfig.responseMimeType = "application/json"` +
   `responseSchema` :
   `{ dish, confidence: "low"|"medium"|"high", items: [{ name, grams, kcal, protein, carbs, fat }] }`.
4. Prompt (en français, une seule passe) : estimer la **portion visible** sur la photo, pas
   une portion standard ; détailler chaque aliment ; compter les huiles et sauces probables ;
   tenir compte de la description si elle est fournie.
5. Écran de correction : grammes modifiables → kcal et macros recalculées
   proportionnellement (`valeur × nouveauxGrammes / grammesIA`). Si `grammesIA ≤ 0`, les
   valeurs restent modifiables à la main, sans recalcul. On peut supprimer ou ajouter un
   aliment ; un bandeau s'affiche si `confidence = low`. Bouton Enregistrer et case ⭐ Favori.

`gemini-flash-latest` pointe automatiquement vers le dernier Gemini Flash : les estimations
peuvent donc évoluer quand Google change de version. Le nom du modèle reste modifiable dans
les réglages pour figer une version.

### Code-barres
Photo du code → décodage par la bibliothèque copiée dans `vendor/` (Safari iOS ne supporte
pas `BarcodeDetector`). Si le décodage échoue, on peut taper les chiffres du code.
→ `GET https://world.openfoodfacts.org/api/v2/product/{code}.json`
→ `product_name` (sinon « Produit {code} ») ; kcal = `energy-kcal_100g`, ou à défaut
`energy_100g` (en kJ) ÷ 4,184 ; macros = `proteins_100g`, `carbohydrates_100g`, `fat_100g`
(0 si absentes) → saisie des grammes → aliment calculé.

## 8. Erreurs

| Cas | Comportement |
|---|---|
| Pas de clé API | ouvrir les réglages |
| HTTP 429 | « Quota du jour atteint. Saisis le repas à la main ou réessaie demain. » |
| HTTP 404 (modèle inconnu) | « Modèle introuvable : change-le dans les réglages. » |
| HTTP 401/403, ou 400 dont le message mentionne « API key » (clé refusée ou région) | « Clé refusée : vérifie la clé et ses restrictions. » |
| Autre erreur HTTP | « Erreur Gemini (code) : message de Google » |
| `items` vide | « Aucun aliment détecté. Essaie un autre angle. » |
| JSON invalide | « Réponse illisible, réessaie. » (sans relance automatique) |
| Hors ligne | « Hors ligne : le scan n'est pas disponible. » La saisie manuelle et les favoris restent actifs |
| Code-barres illisible | saisie des chiffres à la main |
| Produit inconnu / sans données nutritionnelles | bascule vers la saisie manuelle |
| Presse-papiers vide ou non numérique | « Aucun nombre de pas dans le presse-papiers. » |
| Synchro des pas : réseau, gist introuvable, fichier absent ou JSON invalide | ligne d'état « Synchro des pas impossible », pas actuels conservés |
| Import JSON invalide | refus, données actuelles conservées |

## 9. Sécurité

- La clé API ne sort du téléphone que vers Google : elle n'est ni exportée, ni journalisée.
- Aucun script tiers chargé à l'exécution : la bibliothèque de code-barres est dans `vendor/`.
- À faire dans Google Cloud : restreindre la clé à « Generative Language API » et aux
  référents HTTP `https://<user>.github.io/*`.
- Toutes les pages publiées sur `<user>.github.io` partagent le même stockage : ne pas y
  publier d'autre projet non maîtrisé, ou utiliser un domaine dédié.
- Gist des pas : un gist « secret » n'est pas listé, mais il est lisible par toute personne
  qui en connaît l'adresse. Il ne contient que deux nombres de pas.
- Token GitHub : scope `gist` uniquement ; il permet de modifier tous les gists du compte.
  S'il fuit, il suffit de le révoquer dans GitHub et d'en recréer un dans le raccourci.

## 10. Tests

- `calc.test.js` : des `assert` (module natif de Node) sur toutes les valeurs attendues du §5.
  Lancement : `node calc.test.js`.
- `sync.test.js` : lecture du gist (dates et nombres valides gardés, le reste ignoré,
  fichier absent, hors ligne, gist introuvable).
- Interface : tests à la main sur l'iPhone (installation, scan, code-barres, synchro et collage des pas,
  navigation entre les jours, modification/suppression, export/import, mise à jour du cache).
- Calibrage du scan : peser 3 ou 4 repas et comparer avec l'estimation de Gemini.

## 11. Points ouverts

- Offre gratuite de Gemini en France : les sources se contredisent. À vérifier lors de la
  création de la clé dans Google AI Studio. Si elle est refusée → offre payante (Flash,
  < 0,1 centime par scan).
- Choix de la bibliothèque de code-barres : à faire dans le plan (légère, décodage d'une
  photo, compatible Safari iOS).
