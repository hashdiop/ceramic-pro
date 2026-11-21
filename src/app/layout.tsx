import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DepotProvider } from "@/components/depot-context";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CéramiquePro", template: "%s · CéramiquePro" },
  description: "Facturation, stock multi-dépôt et transferts pour la distribution de carrelage.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      {/* suppressHydrationWarning : des extensions (ColorZilla, Grammarly…) ajoutent des attributs au <body>. Ne masque que les attributs de cette balise, pas ses enfants. */}
      <body className="min-h-full font-sans" suppressHydrationWarning>
        {/* Fournisseur et coque dans la même frontière : hydratés ensemble (pas d'écart serveur/client). */}
        <Suspense>
          <DepotProvider>
            <AppShell>{children}</AppShell>
          </DepotProvider>
        </Suspense>
      </body>
    </html>
  );
}
