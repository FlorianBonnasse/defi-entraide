# Site Défi Entr'aide 2026-2027 : installation

Trois briques : la Google Sheet des défis (source unique), un Apps Script attaché à cette Sheet (l'API), et le site (un fichier `index.html` et deux logos), hébergé sur Netlify en attendant le sous-domaine.

Fichiers de ce dossier :

- `Code.gs` : l'API. Lit l'onglet des défis, enregistre les engagements, envoie les emails.
- `index.html` : le site complet (accueil, défis, formulaire, à propos, bilan, mentions légales).
- `logo paroisse.png`, `Logo-Secours-Catholique-Caritas-France.png` : à garder à côté de `index.html`.
- `GUIDE-site.md` : ce guide.

---

## Étape 1 : coller le script dans la Sheet des défis

1. Ouvrez la Google Sheet « Défi Entr'aide 2026-2027 - Défis ».
2. Menu `Extensions` puis `Apps Script`.
3. Effacez le contenu de `Code.gs`, ouvrez le fichier `Code.gs` de ce dossier, copiez tout, collez.
4. En haut du script, bloc `REGLAGES` : vérifiez `EMAIL_RESPONSABLE` (adresse qui reçoit la copie de chaque engagement).
5. Enregistrez (icône disquette).
6. Dans la barre du haut, choisissez la fonction `initialiser` puis `Exécuter`. Autorisez l'accès quand Google le demande (écran « Google n'a pas validé cette application » : `Paramètres avancés` puis `Accéder à … (non sécurisé)` ; c'est votre propre script). Cette exécution crée l'onglet « Engagements » et vérifie que les 22 défis sont lus. Le journal en bas doit afficher « 22 défis lus ».
7. Choisissez la fonction `testEmail` puis `Exécuter` : vous devez recevoir un email dans la minute.

## Étape 2 : déployer l'API

1. Bouton `Déployer` puis `Nouveau déploiement`.
2. Roue dentée à côté de « Sélectionner le type », choisissez `Application Web`.
3. Réglages : Exécuter en tant que `Moi` ; Qui a accès `Tout le monde`.
4. `Déployer`, puis copiez l'`URL de l'application web` (elle finit par `/exec`).
5. Test : ouvrez cette URL dans un navigateur. Vous devez voir un texte JSON commençant par `{"ok":true,...` avec la liste des défis, sans aucun montant.

## Étape 3 : brancher le site

1. Ouvrez `index.html` dans un éditeur de texte (sur Mac, TextEdit avec « Afficher les fichiers HTML comme du code HTML » activé dans Réglages > Ouverture, ou n'importe quel éditeur de code).
2. Tout en haut du bloc `<script>` de configuration, ligne `URL_API: ""`, collez l'URL `/exec` entre les guillemets.
3. Enregistrez.

## Étape 4 : mettre en ligne (adresse provisoire)

1. Créez un dossier contenant uniquement `index.html` et les deux logos.
2. Allez sur https://app.netlify.com/drop (compte gratuit, connexion par email).
3. Glissez le dossier dans la zone. Une adresse `https://xxxx.netlify.app` est créée en quelques secondes. Vous pouvez la renommer dans `Site settings` > `Change site name` (par exemple `defi-entraide-puteaux.netlify.app`).
4. Pour mettre à jour le site plus tard : `Deploys` puis glisser à nouveau le dossier.

Quand le sous-domaine `entraide.paroisseputeaux.com` sera prêt : `Domain management` > `Add a domain`, puis un enregistrement CNAME chez l'hébergeur de paroisseputeaux.com pointant vers l'adresse Netlify. Le certificat HTTPS est automatique.

## Étape 5 : test de bout en bout

1. Sur le site, ouvrez un défi, cliquez `Je m'engage`, remplissez avec votre propre email, envoyez.
2. Vérifiez : l'écran de confirmation avec le bouton HelloAsso ; la nouvelle ligne dans l'onglet « Engagements » ; les emails reçus (donateur, marraine ou vous si son email est vide, copie responsable).
3. Dans l'onglet des défis, saisissez un montant dans « Collecté » pour un défi de don : le site affiche le pourcentage au plus tard deux minutes après (cache de l'API). Pour voir tout de suite : Apps Script, fonction `viderCache`, `Exécuter`.

---

## Au quotidien

Vous ne touchez qu'à la Sheet :

- `Collecté` : montant reçu (HelloAsso et chèques). Le site n'affiche jamais ce montant, seulement collecté / besoin en pourcentage.
- `Bénévoles engagés` : pour les défis de temps ; s'affiche tel quel (« 2 bénévoles engagés »). Si `Objectif (quantité)` contient un nombre pour un défi de temps, une progression en % est aussi calculée.
- `Statut` : vide = calcul automatique (ouvert, ou financé quand collecté atteint le besoin). Écrire `financé` pour forcer l'affichage « Défi financé » (le bouton devient « Soutenir un besoin similaire »), `clôturé` pour retirer le bouton.
- `Email` : email de la marraine ou du parrain. Vide = l'email de nouvel engagement vous arrive à vous.
- Onglet `Engagements` : colonnes « Paiement reçu » et « Suivi » à votre disposition pour la relance.
- Modifier un titre, une description, une contribution : visible sur le site après deux minutes.

Le site ne publie que : catégorie, numéro, titre, description, contribution, besoin, prénom et rôle de la marraine, statut, pourcentage. Ni téléphones, ni emails, ni montants.

## Modifier le script plus tard

Après toute modification de `Code.gs` : `Déployer` > `Gérer les déploiements` > crayon > `Version` = `Nouvelle version` > `Déployer`. L'URL `/exec` reste la même, rien à changer dans le site.
