/**
 * Défi Entr'aide 2026-2027 — API du site (Apps Script attaché à la Google Sheet des défis).
 *
 *  - doGet  : renvoie en JSON la liste publique des défis (jamais de montants, jamais de
 *             téléphone ni d'email des marraines ; seulement un pourcentage de progression).
 *  - doPost : reçoit un engagement depuis le formulaire du site, l'ajoute dans l'onglet
 *             "Engagements" et envoie les emails (donateur, marraine/parrain, responsable).
 *
 * Le script lit l'onglet des défis par NOM D'EN-TÊTE : vous pouvez déplacer les colonnes,
 * pas les renommer. En-têtes utilisés :
 *   Catégorie | N° (brochure) | Titre du défi | Type | Description | Votre contribution |
 *   Notre besoin | Besoin financement | Marraine / Parrain | Rôle | Email | ID | Collecté |
 *   Bénévoles engagés | Statut | Objectif (quantité)
 *
 * Après toute modification de ce fichier : Déployer > Gérer les déploiements > crayon >
 * Version "Nouvelle version" > Déployer. L'URL /exec ne change pas.
 */

// ------------------------------------------------------------------ RÉGLAGES

const REGLAGES = {
  // Adresse qui reçoit une copie de chaque engagement, et l'email marraine si son email est vide.
  EMAIL_RESPONSABLE: "fbonnasse@gmail.com",
  // Adresse(s) de suivi supplémentaires, en copie de chaque engagement (séparer par des virgules). Vide = aucune.
  EMAILS_COPIE: "",
  // Nom affiché comme expéditeur des emails.
  NOM_EXPEDITEUR: "Défi Entr'aide - Paroisse de Puteaux",
  // Lien de paiement (une seule campagne HelloAsso).
  URL_HELLOASSO: "https://www.helloasso.com/associations/la-source-92",
  // Onglet où sont enregistrés les engagements (créé automatiquement).
  ONGLET_ENGAGEMENTS: "Engagements",
  // Durée du cache de la liste des défis, en secondes (le site voit une modification du
  // Sheet au plus tard après ce délai).
  CACHE_SECONDES: 120,
  // Origines autorisées à appeler l'API. "*" = toutes (nécessaire tant que le domaine
  // définitif n'est pas fixé). Remplacer ensuite par "https://entraide.paroisseputeaux.com".
  ORIGINE_AUTORISEE: "*"
};

// ------------------------------------------------------------------ LECTURE (doGet)

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "defis";
  let corps;
  if (action === "defis") {
    corps = obtenirDefisPublics_();
  } else {
    corps = { ok: false, erreur: "action inconnue" };
  }
  return reponseJson_(corps, e);
}

/** Liste publique des défis, avec cache. */
function obtenirDefisPublics_() {
  const cache = CacheService.getScriptCache();
  const enCache = cache.get("defis");
  if (enCache) return JSON.parse(enCache);

  const lignes = lireDefis_();
  const defis = lignes.map(function (d) {
    return {
      id: d.id,
      numero: d.numero,
      categorie: d.categorie,
      titre: d.titre,
      type: d.type,                 // "don" ou "temps"
      description: d.description,
      contribution: d.contribution,
      besoin: d.besoin,
      referent: d.referent,         // prénom seulement
      role: d.role,                 // "Marraine" ou "Parrain"
      statut: d.statut,             // "ouvert", "finance", "cloture"
      progression: d.progression,   // 0..100, ou null si non calculable
      engages: d.engages            // nb de bénévoles engagés (défis de temps), ou null
    };
  });

  const nbFinances = defis.filter(function (d) { return d.statut === "finance"; }).length;
  const nbDons = defis.filter(function (d) { return d.type === "don"; }).length;
  const nbTemps = defis.filter(function (d) { return d.type === "temps"; }).length;

  const corps = {
    ok: true,
    genereLe: new Date().toISOString(),
    resume: {
      nbDefis: defis.length,
      nbDons: nbDons,
      nbTemps: nbTemps,
      nbFinances: nbFinances,
      progressionGlobale: progressionGlobale_(lignes),
      benevolesEngages: lignes.reduce(function (s, d) { return s + (d.engages || 0); }, 0)
    },
    defis: defis
  };
  cache.put("defis", JSON.stringify(corps), REGLAGES.CACHE_SECONDES);
  return corps;
}

/** Pourcentage global : total collecté / total des besoins de financement (jamais exposé en euros). */
function progressionGlobale_(lignes) {
  let besoin = 0, collecte = 0;
  lignes.forEach(function (d) {
    if (d.type === "don" && d.besoinEuros > 0) {
      besoin += d.besoinEuros;
      collecte += Math.min(d.collecteEuros, d.besoinEuros);
    }
  });
  return besoin > 0 ? Math.round(collecte / besoin * 100) : 0;
}

/** Lit l'onglet des défis et renvoie un tableau d'objets normalisés (usage interne). */
function lireDefis_() {
  const feuille = trouverOngletDefis_();
  const valeurs = feuille.getDataRange().getValues();
  const entetes = valeurs[0].map(function (h) { return String(h).trim(); });
  const col = function (nom) {
    const i = entetes.indexOf(nom);
    if (i < 0) throw new Error("Colonne introuvable dans l'onglet des défis : « " + nom + " »");
    return i;
  };
  const colOpt = function (nom) { return entetes.indexOf(nom); };

  const iCat = col("Catégorie"), iNum = col("N° (brochure)"), iTitre = col("Titre du défi"),
        iType = col("Type"), iDesc = col("Description"), iContrib = col("Votre contribution"),
        iBesoin = col("Notre besoin"), iBesoinEur = col("Besoin financement"),
        iRef = col("Marraine / Parrain"), iRole = col("Rôle"), iEmail = col("Email"),
        iId = colOpt("ID"), iCollecte = colOpt("Collecté"), iEngages = colOpt("Bénévoles engagés"),
        iStatut = colOpt("Statut"), iObjQte = colOpt("Objectif (quantité)");

  const resultat = [];
  for (let r = 1; r < valeurs.length; r++) {
    const v = valeurs[r];
    const numero = v[iNum];
    const titre = String(v[iTitre] || "").trim();
    const typeBrut = String(v[iType] || "").toLowerCase();
    // Ligne publiée = un numéro ET un type reconnu ("Appel aux dons" / "Engagement de temps").
    if (numero === "" || numero === null || titre === "" || typeBrut === "") continue;
    const type = typeBrut.indexOf("temps") >= 0 ? "temps" : "don";

    const besoinEuros = nombre_(v[iBesoinEur]);
    const collecteEuros = iCollecte >= 0 ? nombre_(v[iCollecte]) : 0;
    const engages = iEngages >= 0 ? Math.round(nombre_(v[iEngages])) : 0;
    const objectifQte = iObjQte >= 0 ? nombre_(v[iObjQte]) : 0;

    let statut = iStatut >= 0 ? normaliserStatut_(v[iStatut]) : "";
    let progression = null;
    if (type === "don") {
      if (besoinEuros > 0) progression = Math.min(100, Math.round(collecteEuros / besoinEuros * 100));
      if (!statut) statut = (progression !== null && progression >= 100) ? "finance" : "ouvert";
    } else {
      if (objectifQte > 0) progression = Math.min(100, Math.round(engages / objectifQte * 100));
      if (!statut) statut = (progression !== null && progression >= 100) ? "finance" : "ouvert";
    }

    resultat.push({
      id: (iId >= 0 && String(v[iId]).trim()) ? String(v[iId]).trim() : "D" + String(numero).padStart(2, "0"),
      numero: Number(numero),
      categorie: String(v[iCat] || "").replace(/\s+/g, " ").trim(),
      titre: titre,
      type: type,
      description: String(v[iDesc] || "").trim(),
      contribution: String(v[iContrib] || "").trim(),
      besoin: String(v[iBesoin] || "").trim(),
      referent: String(v[iRef] || "").trim(),
      role: String(v[iRole] || "").trim(),
      emailReferent: String(v[iEmail] || "").trim(),
      statut: statut,
      progression: progression,
      engages: type === "temps" ? engages : null,
      besoinEuros: besoinEuros,
      collecteEuros: collecteEuros
    });
  }
  return resultat;
}

/** L'onglet des défis est celui qui contient l'en-tête "Titre du défi". */
function trouverOngletDefis_() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const onglets = classeur.getSheets();
  for (let i = 0; i < onglets.length; i++) {
    const premiere = onglets[i].getRange(1, 1, 1, Math.max(1, onglets[i].getLastColumn())).getValues()[0];
    if (premiere.map(String).indexOf("Titre du défi") >= 0) return onglets[i];
  }
  throw new Error("Aucun onglet avec la colonne « Titre du défi »");
}

function normaliserStatut_(s) {
  const t = String(s || "").toLowerCase().trim();
  if (!t) return "";
  if (t.indexOf("financ") >= 0 || t.indexOf("pourvu") >= 0 || t.indexOf("complet") >= 0) return "finance";
  if (t.indexOf("cl") === 0 || t.indexOf("ferm") >= 0 || t.indexOf("termin") >= 0 || t.indexOf("réaffect") >= 0 || t.indexOf("reaffect") >= 0) return "cloture";
  return "ouvert";
}

/** Convertit "2,500 €", "€264", 1120, "45,40" en nombre. */
function nombre_(x) {
  if (typeof x === "number") return x;
  let s = String(x || "").replace(/[€\s ]/g, "");
  if (!s) return 0;
  // "2,500" (séparateur de milliers) vs "45,40" (décimale)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ------------------------------------------------------------------ ÉCRITURE (doPost)

function doPost(e) {
  try {
    const brut = (e.postData && e.postData.contents) || (e.parameter && e.parameter.payload) || "{}";
    const data = JSON.parse(brut);

    // Anti-spam : champ caché rempli = robot. On répond "ok" sans rien enregistrer.
    if (data.site_web) return reponseJson_({ ok: true }, e);

    const eng = {
      horodatage: new Date(),
      defiId: String(data.defiId || "").trim(),
      defiNumero: String(data.defiNumero || "").trim(),
      defiTitre: String(data.defiTitre || "").trim(),
      prenom: String(data.prenom || "").trim(),
      nom: String(data.nom || "").trim(),
      email: String(data.email || "").trim(),
      telephone: String(data.telephone || "").trim(),
      typeEngagement: String(data.typeEngagement || "").trim(),   // "don", "don_mensuel", "temps"
      montantOuDispo: String(data.montantOuDispo || "").trim(),
      message: String(data.message || "").trim(),
      consentement: data.consentement ? "oui" : "non"
    };

    if (!eng.prenom || !eng.nom || !eng.email || !eng.defiTitre) {
      return reponseJson_({ ok: false, erreur: "Champs obligatoires manquants" }, e);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eng.email)) {
      return reponseJson_({ ok: false, erreur: "Adresse email invalide" }, e);
    }

    // Don libre : pas de défi, notification au responsable seulement.
    const libre = eng.defiId === "LIBRE" || !eng.defiNumero;
    if (libre) { eng.defiId = "LIBRE"; eng.defiNumero = "Libre"; if (!eng.defiTitre) eng.defiTitre = "Don libre, sans défi particulier"; }

    // Retrouve la marraine ou le parrain du défi.
    let referent = null;
    if (!libre) try {
      const defis = lireDefis_();
      referent = defis.filter(function (d) { return d.id === eng.defiId || String(d.numero) === eng.defiNumero; })[0] || null;
    } catch (err) { /* on continue sans référent */ }

    ecrireEngagement_(eng, referent);
    envoyerEmails_(eng, referent);

    return reponseJson_({ ok: true, urlPaiement: REGLAGES.URL_HELLOASSO }, e);
  } catch (err) {
    return reponseJson_({ ok: false, erreur: String(err) }, e);
  }
}

const ENTETES_ENGAGEMENTS = [
  "Horodatage", "N° défi", "Défi", "Prénom", "Nom", "Email", "Téléphone",
  "Type d'engagement", "Montant / disponibilité", "Message", "Consentement RGPD",
  "Marraine / Parrain", "Email marraine / parrain", "Paiement reçu", "Suivi"
];

function ecrireEngagement_(eng, referent) {
  const feuille = obtenirOngletEngagements_();
  feuille.appendRow([
    eng.horodatage, eng.defiNumero, eng.defiTitre, eng.prenom, eng.nom, eng.email, eng.telephone,
    libelleType_(eng.typeEngagement), eng.montantOuDispo, eng.message, eng.consentement,
    referent ? referent.referent : "", referent ? referent.emailReferent : "", "", ""
  ]);
}

function obtenirOngletEngagements_() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(REGLAGES.ONGLET_ENGAGEMENTS);
  if (!feuille) feuille = classeur.insertSheet(REGLAGES.ONGLET_ENGAGEMENTS);
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(ENTETES_ENGAGEMENTS);
    feuille.getRange(1, 1, 1, ENTETES_ENGAGEMENTS.length)
      .setFontWeight("bold").setBackground("#1d4453").setFontColor("#ffffff");
    feuille.setFrozenRows(1);
    feuille.getRange("A:A").setNumberFormat("dd/mm/yyyy hh:mm");
  }
  return feuille;
}

function libelleType_(t) {
  return { don: "Don ponctuel", don_mensuel: "Don mensuel", temps: "Engagement de temps" }[t] || t;
}

// ------------------------------------------------------------------ EMAILS

function envoyerEmails_(eng, referent) {
  const libre = eng.defiId === "LIBRE";
  const defi = libre ? "Don libre (attribution par l'équipe)" : (eng.defiNumero ? "Défi " + eng.defiNumero + " · " : "") + eng.defiTitre;
  const typeLib = libelleType_(eng.typeEngagement);
  const estDon = eng.typeEngagement !== "temps";
  const prenomRef = referent ? referent.referent : "";
  const roleRef = referent ? (referent.role || "marraine/parrain").toLowerCase() : "marraine/parrain";

  // 1. Donateur / bénévole
  let corpsDonateur =
    "Bonjour " + eng.prenom + ",\n\n" +
    "Merci pour votre engagement au Défi Entr'aide 2026-2027 de la Paroisse et du Secours Catholique de Puteaux.\n\n" +
    "Défi choisi : " + defi + "\n" +
    "Engagement : " + typeLib + (eng.montantOuDispo ? " · " + eng.montantOuDispo : "") + "\n\n";
  if (estDon) {
    corpsDonateur +=
      "Pour concrétiser votre don :\n" +
      "  · par carte bancaire : " + REGLAGES.URL_HELLOASSO + "\n" +
      "    (indiquez « " + defi + " » dans le champ prévu lors du paiement)\n" +
      "  · par chèque à l'ordre de La Source 92, à déposer au 33 rue Saulnier, 92800 Puteaux, ou dans les paniers de quête.\n\n" +
      "Les dons ne donnent pas droit à un reçu fiscal.\n\n";
  }
  corpsDonateur +=
    (libre ? "Votre don sera affecté aux défis les moins financés, en concertation avec l'équipe d'accompagnement ; nous vous informerons de son affectation.\n\n"
           : (prenomRef ? prenomRef + ", " + roleRef + " de ce défi, " : "La marraine ou le parrain de ce défi ") + "vous contactera pour vous accompagner.\n\n") +
    "Vos informations ne sont utilisées que pour le suivi de votre engagement et ne sont pas conservées au-delà.\n\n" +
    "Paroisse de Puteaux · Secours Catholique\n33 rue Saulnier, 92800 Puteaux";

  envoyer_(eng.email, "Défi Entr'aide : merci pour votre engagement (" + defi + ")", corpsDonateur);

  // 2. Marraine / parrain (ou responsable si email vide)
  const emailRef = (referent && referent.emailReferent) ? referent.emailReferent : REGLAGES.EMAIL_RESPONSABLE;
  const corpsRef =
    "Bonjour" + (prenomRef ? " " + prenomRef : "") + ",\n\n" +
    "Un nouvel engagement vient d'arriver sur le défi que vous suivez.\n\n" +
    "Défi : " + defi + "\n" +
    "Nom : " + eng.prenom + " " + eng.nom + "\n" +
    "Email : " + eng.email + "\n" +
    "Téléphone : " + (eng.telephone || "non renseigné") + "\n" +
    "Engagement : " + typeLib + (eng.montantOuDispo ? " · " + eng.montantOuDispo : "") + "\n" +
    (eng.message ? "Message : " + eng.message + "\n" : "") +
    (libre ? "\nDon à attribution libre : à affecter par l'équipe." : "\nÀ vous de prendre contact pour l'accompagner.") + " L'engagement est enregistré dans l'onglet « " +
    REGLAGES.ONGLET_ENGAGEMENTS + " » de la Google Sheet.\n";
  envoyer_(emailRef, "Défi Entr'aide : nouvel engagement sur « " + defi + " »", corpsRef);

  // 3. Copies : responsable (si différent de la marraine) et adresse(s) de suivi
  const copies = [REGLAGES.EMAIL_RESPONSABLE].concat(String(REGLAGES.EMAILS_COPIE || "").split(","))
    .map(function (a) { return a.trim(); })
    .filter(function (a, i, arr) { return a && a !== emailRef && arr.indexOf(a) === i; });
  copies.forEach(function (a) {
    envoyer_(a, "[copie] Défi Entr'aide : nouvel engagement sur « " + defi + " »", corpsRef);
  });
}

function envoyer_(a, sujet, corps) {
  if (!a) return;
  try {
    MailApp.sendEmail({ to: a, subject: sujet, body: corps, name: REGLAGES.NOM_EXPEDITEUR, replyTo: REGLAGES.EMAIL_RESPONSABLE });
  } catch (err) {
    console.error("Email non envoyé à " + a + " : " + err);
  }
}

// ------------------------------------------------------------------ UTILITAIRES

function reponseJson_(corps, e) {
  // JSONP si le site le demande (callback=...), sinon JSON simple.
  const cb = e && e.parameter && e.parameter.callback;
  if (cb && /^[\w.]+$/.test(cb)) {
    return ContentService.createTextOutput(cb + "(" + JSON.stringify(corps) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(corps))
    .setMimeType(ContentService.MimeType.JSON);
}

/** À exécuter une fois à la main : crée l'onglet Engagements et vérifie la lecture des défis. */
function initialiser() {
  obtenirOngletEngagements_();
  const d = lireDefis_();
  console.log(d.length + " défis lus. Premier : " + JSON.stringify(d[0]));
}

/** Vide le cache (utile après une modification du Sheet que vous voulez voir tout de suite). */
function viderCache() {
  CacheService.getScriptCache().remove("defis");
}

/** Test d'envoi d'email vers le responsable. */
function testEmail() {
  envoyer_(REGLAGES.EMAIL_RESPONSABLE, "Test Défi Entr'aide", "L'envoi d'email depuis le script fonctionne.");
}
