/**
 * Charge le jeu de données d'exemple.
 *
 *   npm run seed            → refuse si la base contient déjà des produits
 *   npm run seed -- --reset → vide la base puis recharge tout
 *
 * Les ventes et transferts d'exemple passent par les services métier
 * (mêmes règles et transactions que l'application).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* variables déjà présentes dans l'environnement */
}

async function main() {
  const { default: mongoose } = await import("mongoose");
  const { connectDB, withTransaction } = await import("@/server/db");
  const models = await import("@/server/models");
  const { applyMovement } = await import("@/server/services/stock");
  const { createInvoice } = await import("@/server/services/invoices");
  const { createTransfer, receiveTransfer } = await import("@/server/services/transfers");
  const { DEPOTS, PRODUCTS, STOCK, tileSvg } = await import("./seed-data");

  const actor = { id: "seed", name: "Jeu d'exemple" };
  const reset = process.argv.includes("--reset");

  await connectDB();
  console.log(`Connecté à MongoDB (base « ${mongoose.connection.name} »)`);

  if ((await models.Product.countDocuments()) > 0) {
    if (!reset) {
      console.error("La base contient déjà des données. Relancez avec --reset pour tout effacer et recharger.");
      process.exit(1);
    }
  }
  if (reset) {
    for (const m of [models.Counter, models.Product, models.Depot, models.StockLot, models.StockMovement, models.Transfer, models.Invoice]) {
      await m.collection.deleteMany({});
    }
    console.log("Base vidée.");
  }
  // Crée collections et index avant les transactions (requis par MongoDB).
  for (const m of [models.Counter, models.Product, models.Depot, models.StockLot, models.StockMovement, models.Transfer, models.Invoice]) {
    await m.createCollection().catch(() => undefined);
    await m.syncIndexes();
  }

  // Textures locales des carreaux (en attendant les photos Cloudinary).
  const dir = join(process.cwd(), "public", "tiles");
  mkdirSync(dir, { recursive: true });
  for (const p of PRODUCTS) writeFileSync(join(dir, `${p.ref.toLowerCase()}.svg`), tileSvg(p));

  const depots = await models.Depot.insertMany(DEPOTS);
  const products = await models.Product.insertMany(
    PRODUCTS.map((p) => ({
      ref: p.ref,
      name: p.name,
      motif: p.motif,
      format: p.format,
      m2PerBox: p.m2PerBox,
      pricePerM2: p.pricePerM2,
      minStockBoxes: p.minStockBoxes,
      imageUrl: `/tiles/${p.ref.toLowerCase()}.svg`,
    })),
  );
  const depotId = (code: string) => String(depots.find((d) => d.code === code)!._id);
  const productId = (ref: string) => String(products.find((p) => p.ref === ref)!._id);
  console.log(`${depots.length} dépôts, ${products.length} produits.`);

  await withTransaction(async (session) => {
    for (const [ref, depot, lot, boxes] of STOCK) {
      await applyMovement(session, {
        type: "ENTREE",
        productId: productId(ref),
        depotId: depotId(depot),
        lot,
        delta: boxes,
        note: "Stock initial (jeu d'exemple)",
        actor,
      });
    }
  });
  console.log(`${STOCK.length} lots de stock initial.`);

  await createInvoice(
    {
      depotId: depotId("YOF"),
      client: { name: "Entreprise Sénégalaise BTP", phone: "33 860 45 45", type: "Entreprise BTP" },
      paymentMethod: "Virement Bancaire",
      lines: [{ productId: productId("REF-01"), requestedM2: 43.2 }],
      breakage: { productId: productId("REF-01"), unit: "caisses", quantity: 1 },
    },
    actor,
  );
  await createInvoice(
    {
      depotId: depotId("YOF"),
      client: { name: "Fatou Sow (Architecte)", phone: "77 123 45 67", type: "Particulier" },
      paymentMethod: "Wave",
      lines: [
        { productId: productId("REF-02"), requestedM2: 18 },
        { productId: productId("REF-08"), requestedM2: 12.5 },
      ],
    },
    actor,
  );
  await createInvoice(
    {
      depotId: depotId("PIK"),
      client: { name: "Moussa Ndiaye (Chantier Almadies)", phone: "77 450 12 34", type: "Carreleur / Artisan" },
      paymentMethod: "Orange Money",
      lines: [{ productId: productId("REF-04"), requestedM2: 60 }],
    },
    actor,
  );
  console.log("3 factures d'exemple.");

  // Transfert reçu (avec un écart de 1 caisse) et transfert en transit.
  const received = await createTransfer(
    {
      fromDepotId: depotId("PIK"),
      toDepotId: depotId("YOF"),
      driver: "Ibrahima Fall",
      vehicle: "DK-4521-BC",
      note: "Réassort showroom",
      lines: [
        { productId: productId("REF-03"), lot: "G2608A", boxes: 15 },
        { productId: productId("REF-05"), lot: "N2611A", boxes: 10 },
      ],
    },
    actor,
  );
  await receiveTransfer(
    String(received._id),
    {
      receivedBy: "Awa Diallo",
      receptionNote: "",
      lines: received.lines.map((l) => ({
        lineId: String(l._id),
        receivedBoxes: l.ref === "REF-05" ? l.sentBoxes - 1 : l.sentBoxes,
        note: l.ref === "REF-05" ? "1 caisse cassée pendant le transport" : "",
      })),
    },
    actor,
  );
  await createTransfer(
    {
      fromDepotId: depotId("PIK"),
      toDepotId: depotId("THS"),
      driver: "Cheikh Ba",
      vehicle: "TH-0987-AA",
      note: "",
      lines: [
        { productId: productId("REF-06"), lot: "T2607C", boxes: 20 },
        { productId: productId("REF-01"), lot: "B2610A", boxes: 25 },
      ],
    },
    actor,
  );
  console.log("2 transferts d'exemple (1 reçu, 1 en transit).");

  await mongoose.disconnect();
  console.log("Jeu de données chargé ✔");
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  const { default: mongoose } = await import("mongoose");
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
