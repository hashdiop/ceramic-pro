import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Paramètres" };

export default function ParametresPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SettingsView />
    </Suspense>
  );
}
