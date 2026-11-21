import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { StockView } from "./stock-view";

export const metadata: Metadata = { title: "Stock" };

export default function StockPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <StockView />
    </Suspense>
  );
}
