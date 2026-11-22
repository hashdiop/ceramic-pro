import { route } from "@/server/api";
import { getNetwork } from "@/server/services/users";

/** Dépôts du réseau et leurs responsables (nom, téléphone) : pour se contacter entre dépôts. */
export const GET = route(async () => getNetwork());
