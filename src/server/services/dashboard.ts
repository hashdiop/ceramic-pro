import { connectDB } from "@/server/db";
import { Invoice, Product, Transfer } from "@/server/models";
import { getProductOverview } from "./stock";

/** Indicateurs du tableau de bord : ventes, motifs, alertes de stock, transferts. */
export async function getDashboard() {
  await connectDB();
  const [totals, byMotif, breakageByMotif, recent, stock, inTransit] = await Promise.all([
    Invoice.aggregate([
      {
        $group: {
          _id: null,
          revenue: { $sum: "$netTotal" },
          volume: { $sum: "$totalM2" },
          breakage: { $sum: "$breakageAmount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Invoice.aggregate([
      { $unwind: "$lines" },
      { $group: { _id: "$lines.motif", m2: { $sum: "$lines.billedM2" }, gross: { $sum: "$lines.lineTotal" } } },
    ]),
    // La casse est imputée au motif de l'article cassé, pour un bilan net cohérent avec le CA.
    Invoice.aggregate([
      { $match: { breakageAmount: { $gt: 0 } } },
      { $lookup: { from: Product.collection.name, localField: "breakage.product", foreignField: "_id", as: "bp" } },
      { $group: { _id: { $arrayElemAt: ["$bp.motif", 0] }, amount: { $sum: "$breakageAmount" } } },
    ]),
    Invoice.find().sort({ createdAt: -1 }).limit(5).populate("depot", "code name").lean(),
    getProductOverview(),
    Transfer.countDocuments({ status: "EN_TRANSIT" }),
  ]);

  const t = totals[0] ?? { revenue: 0, volume: 0, breakage: 0, count: 0 };
  const breakMap = new Map(breakageByMotif.map((b) => [b._id, b.amount]));
  const motifs = byMotif
    .map((m) => {
      const breakage = breakMap.get(m._id) ?? 0;
      return { motif: m._id as string, m2: m.m2 as number, gross: m.gross as number, breakage, net: m.gross - breakage };
    })
    .sort((a, b) => b.m2 - a.m2);

  // Alertes au niveau du réseau (déjà triées : rupture, stock bas, à rééquilibrer).
  const alerts = stock.filter((s) => s.status !== "OK");

  return {
    revenue: t.revenue,
    volume: t.volume,
    breakage: t.breakage,
    invoiceCount: t.count,
    motifs,
    recent,
    alerts,
    inTransitCount: inTransit,
  };
}
