import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { NetworkView } from "./network-view";

export const metadata: Metadata = { title: "Réseau" };

export default function ReseauPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NetworkView />
    </Suspense>
  );
}
