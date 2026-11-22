"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import { AuthProvider } from "./auth-context";
import { DepotProvider } from "./depot-context";

/** La page de connexion s'affiche seule : aucune donnée n'est chargée avant d'être connecté. */
export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return (
    <AuthProvider>
      <DepotProvider>
        <AppShell>{children}</AppShell>
      </DepotProvider>
    </AuthProvider>
  );
}
