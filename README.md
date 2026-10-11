# LeanFree

Compteur de calories personnel (PWA iPhone) : objectif du jour calculé à partir du
métabolisme de base, des pas, de l'exercice et de la digestion, scan IA des repas (Gemini),
code-barres (Open Food Facts), pas synchronisés depuis Santé, suivi du poids. Les données
restent sur le téléphone.

## Tests

```bash
npm test
```

## Lancer en local

```bash
npx --yes serve -l 8080 .
```

## Déployer (GitHub Pages)

1. Créer un dépôt public `leanfree` sur GitHub, puis :
   `git remote add origin https://github.com/<toi>/leanfree.git && git push -u origin main`
2. GitHub → Settings → Pages → Source : « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. L'app est publiée à `https://<toi>.github.io/leanfree/`.
4. À chaque mise à jour : incrémenter `VERSION` dans `sw.js`, puis commit et push.
5. Toutes les pages publiées sur `https://<toi>.github.io` partagent le même stockage : n'y publie pas d'autre projet que tu ne maîtrises pas (sinon il pourrait lire ta clé Gemini).

## Installer sur l'iPhone

Ouvrir l'URL dans **Safari** → Partager → **Sur l'écran d'accueil**. Ensuite, toujours
ouvrir LeanFree depuis l'icône : l'app installée et Safari ont des données séparées.

## Clé Gemini

1. https://aistudio.google.com → **Get API key** → Create API key.
2. Sécuriser la clé : Google Cloud Console → APIs & Services → Credentials → la clé :
   - Application restrictions : **Websites** → `https://<toi>.github.io/*`
   - API restrictions : **Generative Language API**
3. LeanFree → Réglages → coller la clé → Enregistrer.

Offre gratuite : quota quotidien limité, et Google peut utiliser les données envoyées pour
améliorer ses modèles. Si la clé est refusée en France, activer la facturation (moins de
0,1 centime par scan avec Flash).

## Synchro des pas (Santé → LeanFree)

Une web app n'a pas accès à Santé : un raccourci iOS dépose tes pas dans un gist GitHub
secret, et LeanFree les relit à chaque ouverture.

1. **Gist** : https://gist.github.com → nom de fichier `steps.json`, contenu `{}` →
   **Create secret gist**. Copier son URL : l'identifiant est la dernière partie.
2. **Token** : GitHub → Settings → Developer settings → Personal access tokens →
   **Tokens (classic)** → Generate new token (classic) → cocher **uniquement `gist`** →
   copier le token (`ghp_…`). Il ne sert qu'au raccourci.
3. **Raccourci « Synchro pas LeanFree »** (app Raccourcis → **+**), 3 actions :
   1. **Rechercher des échantillons de santé** : Type = Pas, filtre « Date de début est
      aujourd'hui ».
   2. **Calculer les statistiques** : Somme (sur les échantillons de l'action 1).
   3. **Obtenir le contenu de l'URL** : `https://api.github.com/gists/<ID_DU_GIST>`,
      méthode **PATCH**, en-têtes `Authorization` = `Bearer <TOKEN>` et
      `Accept` = `application/vnd.github+json`, corps **JSON** : `files` (dictionnaire) →
      `steps.json` (dictionnaire) → `content` (texte) = le résultat de l'action 2.
   LeanFree date le total avec l'heure d'envoi : l'envoi de 23:30 fixe le total de la journée.
   (L'ancien format `{"2026-10-11": 8432, …}` reste accepté.)
4. **Automatisations** : Raccourcis → Automatisation → **+** → Heure de la journée → 12:00,
   Quotidien → **Exécuter immédiatement** → « Synchro pas LeanFree ». Recommencer pour
   18:00, 21:00 et 23:30.
5. **LeanFree** → Réglages → Synchro des pas → coller l'URL du gist →
   **Enregistrer et synchroniser**.

Les libellés exacts peuvent varier légèrement selon la version d'iOS. En secours : le
champ Pas reste modifiable, et le bouton **Coller** lit un nombre copié.

Sécurité : le gist secret est lisible par quiconque connaît son adresse (il ne contient
que des nombres de pas). Le token peut modifier tes gists : en cas de fuite, le révoquer
dans GitHub et en mettre un nouveau dans le raccourci.

## Sauvegarde

Réglages → Exporter (JSON) → enregistrer dans Fichiers. La clé API n'est pas exportée.
