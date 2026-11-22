/** Liens d'appel et WhatsApp pour joindre un responsable de dépôt (numéros sénégalais par défaut). */

/** "77 123 45 67" → "221771234567" ; "+33 6…" → "336…" ; vide si rien d'exploitable. */
export function phoneDigits(phone: string | undefined): string {
  let d = (phone ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 9) d = `221${d}`; // numéro local sénégalais (7x xxx xx xx / 33 xxx xx xx)
  return d.replace(/\D/g, "").length >= 9 ? d.replace(/\D/g, "") : "";
}

export const telHref = (phone: string) => {
  const d = phoneDigits(phone);
  return d ? `tel:+${d}` : "";
};

export const whatsappHref = (phone: string, message: string) => {
  const d = phoneDigits(phone);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(message)}` : "";
};

/** Demande de transfert informelle (le transfert réel sera saisi par le dépôt qui expédie). */
export function transferRequestMessage(opts: { to?: string; from: string; product?: { name: string; ref: string }; lot?: string }) {
  const hello = opts.to ? `Bonjour ${opts.to},` : "Bonjour,";
  const what = opts.product ? `du ${opts.product.name} (${opts.product.ref}${opts.lot ? `, bain ${opts.lot}` : ""})` : "de la marchandise";
  return `${hello} ici le dépôt ${opts.from} (CéramiquePro). Pourriez-vous nous transférer ${what} ? Quantité souhaitée : … caisses. Merci !`;
}
