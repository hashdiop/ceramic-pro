import { route } from "@/server/api";
import { getDashboard } from "@/server/services/dashboard";

export const GET = route(async () => getDashboard());
