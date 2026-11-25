# CéramiquePro

Application fullstack **Next.js 16** pour la distribution de carrelage : facturation, stock multi-dépôt suivi par bain (lot), transferts inter-dépôts avec bon de livraison, et mises à jour en temps réel (Socket.io).

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner MONGODB_URI
npm run seed                 # jeu de données d'exemple (npm run seed -- --reset pour recharger)
npm run dev                  # http://localhost:3000
```

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur personnalisé (Next.js + Socket.io) en développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run seed` | Charge les dépôts, produits, stocks, factures et transferts d'exemple |
| `npm run lint` / `npm run typecheck` | Contrôles ESLint et TypeScript |

## Variables d'environnement

Voir [`.env.example`](.env.example).

- **`MONGODB_URI`** (obligatoire) : **MongoDB Atlas** recommandé. Les ventes et transferts utilisent des **transactions**, qui exigent un *replica set* (fourni par Atlas, y compris l'offre gratuite). Un `mongod` local autonome ne suffit pas. `GET /api/health` indique si les transactions sont disponibles.
- **`CLOUDINARY_*`** : photos des produits. Le jeu d'exemple utilise les textures locales de `public/tiles`. Fonctionnement (`src/server/cloudinary.ts`) :
  - **envoi** : la photo est réduite dans le navigateur (1600 px max), puis envoyée directement à Cloudinary avec une signature fournie par `POST /api/uploads/sign` (le secret reste côté serveur) ;
  - **remplacement / retrait** : l'ancienne image est supprimée de Cloudinary après l'enregistrement du produit ;
  - **formulaire fermé sans enregistrer** : la photo envoyée est supprimée (`DELETE /api/uploads`, refusé si l'image est utilisée) ;
  - **archivage** : l'image passe de `<CLOUDINARY_FOLDER>/products` à `<CLOUDINARY_FOLDER>/archives`, et revient à la réactivation ;
  - les vignettes sont servies redimensionnées et compressées (`f_auto,q_auto`).

## Règles métier

- **Vente par caisse entière** : les m² demandés sont arrondis à la caisse supérieure. Les calculs sont faits en cm² entiers, ce qui évite les erreurs d'arrondi (`4,32 m² / 1,44` donne bien 3 caisses).
- **Le serveur fait foi** : le navigateur n'envoie que `{produit, m² demandés, bain}`. Prix, totaux et casse sont recalculés côté serveur.
- **Stock = caisses par produit × dépôt × bain** :
  - `physique` : caisses présentes au dépôt ;
  - `réservé` : caisses engagées dans un transfert non encore reçu ;
  - `disponible = physique − réservé` : seul le disponible est vendable.
- **Alertes de stock à deux niveaux** par produit :
  - *seuil global* (`globalMinBoxes`, réseau entier ; vide = minimum par dépôt × nombre de dépôts) ;
  - *minimum par dépôt* (`minStockBoxes`).
  Statut réseau : *Rupture* (plus rien nulle part), *Stock bas* (total sous le seuil global → commander), *À rééquilibrer* (total suffisant mais un dépôt sous son minimum → un transfert suffit), *OK*. `GET /api/stock/products` donne ce statut et la répartition par dépôt et par bain.
- **Fiche produit** (fenêtre modale) : grande photo zoomable et référence bien visible pour distinguer des carreaux ressemblants, caractéristiques, stock réseau détaillé. Ouverte depuis Vente, Stock, Réseau et les alertes du tableau de bord.
- **Réseau** (`/reseau`) : chaque responsable consulte le stock des autres dépôts et joint leur responsable (téléphone saisi sur son compte par l'admin) par appel ou WhatsApp, avec une demande de transfert pré-rédigée. La demande reste informelle : le transfert est saisi par le dépôt qui expédie, et tracé. Un responsable n'a qu'un dépôt de travail (pas de sélecteur) ; l'admin et les responsables multi-dépôts choisissent le leur dans un panneau de cartes.
- **Journal des mouvements** : chaque entrée, vente, casse, ajustement ou transfert est tracé avec le solde après mouvement.
- **Paramètres** (`/parametres`, icône engrenage) : création et modification des produits et des dépôts. La **référence produit est attribuée automatiquement** (`REF-000001`, `REF-000002`…, au-dessus de la plus grande référence `REF-<nombre>` existante) et ne se modifie pas. Le **nombre de carreaux par caisse** est déduit des m²/caisse et du format, à titre indicatif seulement (jamais stocké ni utilisé dans les calculs) ; il n'est affiché que si la division tombe juste (formats nominaux comme 33×33 exclus). On **archive** au lieu de supprimer, pour garder l'historique intact. L'archivage est refusé tant qu'il reste du stock ou un transfert en transit, et il est impossible d'archiver le dernier dépôt actif. Les factures conservent le prix et la désignation en vigueur au moment de la vente.

### Transferts inter-dépôts

1. **Expédition** : le dépôt source saisit les articles, bains et caisses. Statut **En transit**. Les compteurs physiques des deux dépôts **ne changent pas**, les caisses sont seulement **réservées** au départ, donc non vendables.
2. **Réception** : le dépôt destinataire saisit les quantités reçues. Une **transaction unique** :
   - sort les caisses du dépôt source et libère la réservation ;
   - entre les caisses au dépôt destinataire ;
   - inscrit un mouvement *Écart transfert* pour les éventuelles caisses manquantes ou cassées.
3. **Annulation** (tant que c'est en transit) : libère la réservation.

On peut consulter les quantités en transit (page Transferts, ou colonne « En route » du stock), et chaque transfert a un **bon de livraison imprimable** (`/transferts/[id]/bl`).

## Temps réel (Socket.io)

`server.ts` fait tourner Next.js et Socket.io sur le **même port**. Les routes API diffusent `stock:updated`, `transfers:updated`, `invoices:updated` et `catalog:updated`, et les pages concernées se rechargent automatiquement.

> ⚠️ Socket.io exige un serveur Node persistant. Il faut héberger l'application sur un VPS, Railway, Render ou Fly.io, **pas sur Vercel** (serverless).

## Architecture

```
server.ts                 Serveur Node : Next.js + Socket.io
scripts/seed.ts           Jeu de données d'exemple
src/app/                  Pages (mobile en priorité) et routes API (src/app/api)
src/components/           Coque de l'app (navigation basse mobile), UI, contexte dépôt
src/lib/                  Code partagé client/serveur : calculs, schémas Zod, types
src/server/               Serveur uniquement : DB, modèles Mongoose, services métier
  context.ts              Utilisateur connecté et règles d'accès (RBAC)
  services/               stock, transferts, factures, catalogue, tableau de bord
```

## Comptes et droits (RBAC)

| Action | Administrateur | Utilisateur dépôt |
| --- | --- | --- |
| Consulter tous les dépôts (stock, factures, transferts, journal) | ✅ | ✅ |
| Vendre, entrée / ajustement / casse de stock | ✅ partout | sur ses dépôts uniquement |
| Expédier un transfert | ✅ | depuis ses dépôts |
| Valider la réception | ✅ | vers ses dépôts |
| Annuler un transfert | ✅ | dépôt expéditeur |
| Produits, dépôts, photos (Paramètres) | ✅ | consultation |
| Espace admin : comptes, supervision | ✅ | — |

- **Toutes les règles sont vérifiées côté serveur** (`src/server/context.ts` : `getActor`, `assertCanWriteDepot`, `requireAdmin`) ; l'interface ne fait que les refléter (boutons masqués, bandeau « Consultation seule »).
- **Session** : cookie httpOnly signé (HMAC, `AUTH_SECRET`), 7 jours. L'utilisateur est rechargé à chaque requête : désactiver un compte ou réinitialiser son mot de passe coupe immédiatement ses sessions. `src/proxy.ts` redirige vers `/login` les pages consultées sans session.
- **Mots de passe** : hachés avec scrypt (module `crypto` de Node). Tout mot de passe provisoire (création, réinitialisation) doit être changé à la connexion suivante.
- **Comptes par défaut** : `USERS_DEFAULT_PASSWORD="…" npm run users:init` crée `admin@cpro.com` et `depot{N}@cpro.com` pour chaque dépôt actif `DEP-N` (idempotent, ne modifie jamais un compte existant). Le mot de passe n'est pas écrit dans le code.
- Les opérations enregistrent leur auteur (`createdBy`, `createdByName`), visible dans le journal et la supervision.
- **Mode démo** (maquette) : avec `DEMO_LOGIN=true`, la page de connexion propose des boutons de connexion rapide, sans mot de passe, vers `admin@cpro.com`, `depot1@cpro.com` et `depot2@cpro.com` (comptes actifs uniquement), avec un bandeau « Mode démo » dans l'application. Les droits restent appliqués. ⚠️ Quiconque a le lien devient administrateur : retirer la variable avant d'utiliser de vraies données.
- Socket.io diffuse seulement des signaux de rafraîchissement (aucune donnée) : il n'est pas authentifié.

## Sauvegarde et restauration

Base MongoDB Atlas gratuite (M0) = **aucune sauvegarde automatique côté Atlas** : l'application gère les siennes.

- **Contenu** : toutes les collections (produits, dépôts, lots, mouvements, transferts, factures, compteurs, comptes), lues en un seul instant (lecture *snapshot*).
- **Fichier `.cpb`** : en-tête lisible (date, type, auteur, nombres d'éléments, empreintes) + données compressées et **chiffrées** (AES-256-GCM, clé `BACKUP_KEY`). Un fichier modifié ou ouvert avec une autre clé est refusé.
- **Stockage** : Cloudinary, fichiers privés dans `<CLOUDINARY_FOLDER>/backups`.
- **Pas de doublon** : une sauvegarde identique à la précédente (empreinte du contenu, hors dates de connexion) est refusée ; un verrou empêche deux opérations simultanées.
- **Restauration** : fichier vérifié avant toute écriture → sauvegarde de sécurité automatique de l'état actuel → mode maintenance (écritures refusées, 503) → index recréés → remplacement de toutes les collections en **une transaction** → contrôle des nombres → photos remises en place.
- **Corbeille des photos** : une photo remplacée ou retirée part dans `<CLOUDINARY_FOLDER>/trash` (vidée après 60 jours, à chaque sauvegarde) pour qu'une restauration la retrouve.

**Espace admin → Sauvegardes** : sauvegarder (avec note), liste avec l'écart par rapport à la précédente, télécharger, restaurer (aperçu des écarts + saisie de `RESTAURER`), importer un fichier, historique.

**Ligne de commande** (fonctionne même si la base a été supprimée — plus aucun compte pour se connecter) :

```bash
npm run backup:list                          # sauvegardes disponibles
npm run backup -- --note="avant inventaire"  # nouvelle sauvegarde
npm run restore                              # choix interactif dans la liste
npm run restore -- --latest                  # la plus récente
npm run restore -- --file=copie.cpb          # un fichier téléchargé
npm run restore -- --latest --db=ceramique-pro-repetition   # répétition dans une autre base
npm run backup:download -- --latest --out=copie.cpb
```

> ⚠️ `BACKUP_KEY` doit être **la même** en local et sur Vercel, et conservée en lieu sûr : sans elle, les sauvegardes sont illisibles. Les scripts utilisent `MONGODB_URI` / `MONGODB_DB` de `.env.local` : vérifiez la base cible affichée avant de confirmer.
