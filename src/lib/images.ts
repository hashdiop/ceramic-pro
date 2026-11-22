/**
 * URL Cloudinary redimensionnée et compressée à la volée (format et qualité automatiques).
 * Les autres URL (textures locales du jeu d'exemple) sont renvoyées telles quelles.
 */
export function imageUrl(url: string | undefined, size: number): string | undefined {
  if (!url) return url;
  const marker = "/image/upload/";
  const i = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || i === -1) return url;
  const px = Math.round(size * 2); // écrans haute densité
  return `${url.slice(0, i + marker.length)}f_auto,q_auto,c_fill,w_${px},h_${px}/${url.slice(i + marker.length)}`;
}
