import type { Metadata } from "next";
import { InvoiceList } from "./invoice-list";

export const metadata: Metadata = { title: "Factures" };

export default function FacturesPage() {
  return <InvoiceList />;
}
