/**
 * URL Cloudinary redimensionnée et compressée à la volée (format et qualité automatiques).
 *  - "cover"   : vignette carrée recadrée ;
 *  - "contain" : grande photo entière, sans recadrage (fiche produit).
 * Les autres URL (textures locales du jeu d'exemple) sont renvoyées telles quelles.
 */
export function imageUrl(url: string | undefined, size: number, fit: "cover" | "contain" = "cover"): string | undefined {
  if (!url) return url;
  const marker = "/image/upload/";
  const i = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || i === -1) return url;
  const px = Math.round(size * 2); // écrans haute densité
  const t = fit === "cover" ? `c_fill,w_${px},h_${px}` : `c_limit,w_${px},h_${px}`;
  return `${url.slice(0, i + marker.length)}f_auto,q_auto,${t}/${url.slice(i + marker.length)}`;
}
