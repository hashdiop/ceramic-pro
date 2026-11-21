/**
 * Identité de l'utilisateur courant.
 *
 * RBAC non encore activé : toutes les opérations sont attribuées à un
 * utilisateur par défaut. Quand l'authentification sera en place, c'est
 * le seul endroit à modifier (lecture de la session + contrôle des rôles).
 */
export interface Actor {
  id: string;
  name: string;
}

export async function getActor(): Promise<Actor> {
  return { id: "system", name: "Utilisateur (sans RBAC)" };
}
