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
- **`CLOUDINARY_*`** : intégré mais **pas encore utilisé**. Le jeu d'exemple utilise les textures locales de `public/tiles`. Le module se trouve dans `src/server/cloudinary.ts` (upload signé via `POST /api/uploads/sign`, upload serveur, suppression).

## Règles métier

- **Vente par caisse entière** : les m² demandés sont arrondis à la caisse supérieure. Les calculs sont faits en cm² entiers, ce qui évite les erreurs d'arrondi (`4,32 m² / 1,44` donne bien 3 caisses).
- **Le serveur fait foi** : le navigateur n'envoie que `{produit, m² demandés, bain}`. Prix, totaux et casse sont recalculés côté serveur.
- **Stock = caisses par produit × dépôt × bain** :
  - `physique` : caisses présentes au dépôt ;
  - `réservé` : caisses engagées dans un transfert non encore reçu ;
  - `disponible = physique − réservé` : seul le disponible est vendable.
- **Seuil d'alerte** par produit (`minStockBoxes`), appliqué à chaque dépôt : statuts *Rupture* / *Stock bas* / *OK*.
- **Journal des mouvements** : chaque entrée, vente, casse, ajustement ou transfert est tracé avec le solde après mouvement.

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
  context.ts              Utilisateur courant : point d'entrée du futur RBAC
  services/               stock, transferts, factures, catalogue, tableau de bord
```

## RBAC (à venir)

Pas encore d'authentification : **ne pas déployer publiquement**. Toutes les écritures passent par `src/server/services` et l'utilisateur est fourni par `getActor()` (`src/server/context.ts`). C'est le seul point à brancher pour l'authentification et les rôles. Les champs `createdBy` / `receivedBy` sont déjà enregistrés.
