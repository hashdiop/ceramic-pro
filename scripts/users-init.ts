/**
 * Crée les comptes par défaut s'ils n'existent pas :
 *   admin@cpro.com (administrateur) + depot{N}@cpro.com pour chaque dépôt actif « DEP-N ».
 *
 *   USERS_DEFAULT_PASSWORD="…" npm run users:init
 *
 * Idempotent : un compte existant n'est jamais modifié. Chaque compte devra changer
 * son mot de passe à la première connexion.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* variables déjà présentes dans l'environnement */
}

async function main() {
  const password = process.env.USERS_DEFAULT_PASSWORD;
  if (!password) throw new Error("Définissez USERS_DEFAULT_PASSWORD (mot de passe provisoire des comptes).");
  const { default: mongoose } = await import("mongoose");
  const { connectDB } = await import("@/server/db");
  const { ensureDefaultUsers } = await import("@/server/services/users");
  const { User, Depot } = await import("@/server/models");

  await connectDB();
  console.log(`Base « ${mongoose.connection.name} »`);
  const created = await ensureDefaultUsers(password);
  console.log(created.length ? `Comptes créés : ${created.join(", ")}` : "Aucun compte créé (déjà présents).");

  const users = await User.find().populate<{ depots: { code: string; name: string }[] }>("depots", "code name", Depot).lean();
  for (const u of users) console.log(`  ${u.email.padEnd(20)} ${u.role.padEnd(5)} ${u.depots.map((d) => `${d.code} ${d.name}`).join(", ") || "tous les dépôts"}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  const { default: mongoose } = await import("mongoose");
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
