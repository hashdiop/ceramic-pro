import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { AdminView } from "./admin-view";

export const metadata: Metadata = { title: "Espace admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AdminView />
    </Suspense>
  );
}
