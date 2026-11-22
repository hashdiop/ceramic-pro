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
- **Seuil d'alerte** par produit (`minStockBoxes`), appliqué à chaque dépôt : statuts *Rupture* / *Stock bas* / *OK*.
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
- Socket.io diffuse seulement des signaux de rafraîchissement (aucune donnée) : il n'est pas authentifié.
