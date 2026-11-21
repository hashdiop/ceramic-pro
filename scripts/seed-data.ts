/** Jeu de données d'exemple (tests et démonstration). */

export const DEPOTS = [
  { code: "YOF", name: "Showroom Yoff", address: "Route de l'Aéroport, Yoff - Dakar", phone: "+221 33 820 00 00" },
  { code: "PIK", name: "Dépôt Pikine", address: "Zone industrielle, Pikine", phone: "+221 33 834 10 10" },
  { code: "THS", name: "Dépôt Thiès", address: "Route de Dakar, Thiès", phone: "+221 33 951 20 20" },
];

export interface SeedProduct {
  ref: string;
  name: string;
  motif: string;
  format: string;
  m2PerBox: number;
  pricePerM2: number;
  minStockBoxes: number;
  /** Fond + motif SVG de la texture d'exemple. */
  bg: string;
  pattern: string;
}

export const PRODUCTS: SeedProduct[] = [
  {
    ref: "REF-01", name: "Calacatta Gold Poli", motif: "Effet Marbre", format: "60x60 cm", m2PerBox: 1.44, pricePerM2: 9500, minStockBoxes: 15,
    bg: "#f8fafc",
    pattern: '<path d="M0,20 Q40,35 70,10 T120,40 M10,90 Q60,70 110,105" stroke="#d4af37" stroke-width="2.5" fill="none" opacity="0.6"/><path d="M20,0 Q50,60 90,120" stroke="#cbd5e1" stroke-width="4" fill="none" opacity="0.5"/>',
  },
  {
    ref: "REF-02", name: "Chêne Nordique Mat", motif: "Effet Bois", format: "20x120 cm", m2PerBox: 1.2, pricePerM2: 8500, minStockBoxes: 12,
    bg: "#b47b49",
    pattern: '<line x1="0" y1="30" x2="120" y2="30" stroke="#784b26" stroke-width="2"/><line x1="0" y1="60" x2="120" y2="60" stroke="#784b26" stroke-width="2"/><line x1="0" y1="90" x2="120" y2="90" stroke="#784b26" stroke-width="2"/><path d="M10,15 Q60,10 110,18 M15,75 Q70,82 105,72" stroke="#925e32" stroke-width="1.5" fill="none"/>',
  },
  {
    ref: "REF-03", name: "Azulejo Casa Blanca", motif: "Géométrique", format: "30x30 cm", m2PerBox: 1.0, pricePerM2: 11000, minStockBoxes: 10,
    bg: "#1e3a8a",
    pattern: '<circle cx="60" cy="60" r="38" fill="none" stroke="#f8fafc" stroke-width="4"/><polygon points="60,15 105,60 60,105 15,60" fill="none" stroke="#f59e0b" stroke-width="3"/><circle cx="60" cy="60" r="10" fill="#f8fafc"/>',
  },
  {
    ref: "REF-04", name: "Béton Ciré Anthracite", motif: "Effet Béton", format: "60x60 cm", m2PerBox: 1.44, pricePerM2: 7500, minStockBoxes: 15,
    bg: "#475569",
    pattern: '<circle cx="30" cy="40" r="18" fill="#334155" opacity="0.4"/><circle cx="85" cy="80" r="25" fill="#64748b" opacity="0.3"/><rect x="0" y="0" width="120" height="120" fill="none" stroke="#334155" stroke-width="3"/>',
  },
  {
    ref: "REF-05", name: "Nero Marquina", motif: "Effet Marbre", format: "60x120 cm", m2PerBox: 1.44, pricePerM2: 12500, minStockBoxes: 8,
    bg: "#18181b",
    pattern: '<path d="M0,100 L120,15 M30,120 L120,55" stroke="#ffffff" stroke-width="2" opacity="0.75"/><path d="M0,40 L70,0" stroke="#e4e4e7" stroke-width="1" opacity="0.4"/>',
  },
  {
    ref: "REF-06", name: "Terracotta Andalou", motif: "Géométrique", format: "20x20 cm", m2PerBox: 1.0, pricePerM2: 9000, minStockBoxes: 10,
    bg: "#c2410c",
    pattern: '<rect x="10" y="10" width="100" height="100" fill="none" stroke="#ffedd5" stroke-width="3"/><path d="M10,10 L110,110 M110,10 L10,110" stroke="#ffedd5" stroke-width="2" opacity="0.7"/>',
  },
  {
    ref: "REF-07", name: "Pierre de Bourgogne", motif: "Effet Pierre", format: "45x90 cm", m2PerBox: 1.215, pricePerM2: 10500, minStockBoxes: 10,
    bg: "#d6c7a1",
    pattern: '<circle cx="25" cy="30" r="6" fill="#a8956b" opacity="0.5"/><circle cx="80" cy="25" r="4" fill="#8c7a52" opacity="0.5"/><circle cx="60" cy="85" r="8" fill="#a8956b" opacity="0.4"/><circle cx="100" cy="95" r="3" fill="#8c7a52" opacity="0.6"/>',
  },
  {
    ref: "REF-08", name: "Blanc Satiné Uni", motif: "Uni", format: "30x60 cm", m2PerBox: 1.08, pricePerM2: 6000, minStockBoxes: 20,
    bg: "#f1f5f9",
    pattern: '<rect x="2" y="2" width="116" height="116" fill="none" stroke="#e2e8f0" stroke-width="3"/>',
  },
];

/** Stock initial : [ref, dépôt, bain, caisses]. Quelques niveaux bas pour les alertes. */
export const STOCK: [string, string, string, number][] = [
  ["REF-01", "YOF", "B2610A", 40], ["REF-01", "YOF", "B2611C", 18], ["REF-01", "PIK", "B2610A", 120], ["REF-01", "THS", "B2611C", 12],
  ["REF-02", "YOF", "W2609B", 25], ["REF-02", "PIK", "W2609B", 90], ["REF-02", "PIK", "W2611A", 60],
  ["REF-03", "YOF", "G2608A", 8], ["REF-03", "PIK", "G2608A", 45],
  ["REF-04", "YOF", "C2610B", 35], ["REF-04", "PIK", "C2610B", 150], ["REF-04", "THS", "C2611A", 40],
  ["REF-05", "YOF", "N2611A", 6], ["REF-05", "PIK", "N2611A", 30],
  ["REF-06", "PIK", "T2607C", 70], ["REF-06", "THS", "T2607C", 9],
  ["REF-07", "YOF", "P2610A", 22], ["REF-07", "PIK", "P2610A", 55],
  ["REF-08", "YOF", "U2611B", 60], ["REF-08", "PIK", "U2611B", 200], ["REF-08", "THS", "U2611B", 80],
];

export const tileSvg = (p: SeedProduct) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="${p.bg}"/>${p.pattern}</svg>\n`;
