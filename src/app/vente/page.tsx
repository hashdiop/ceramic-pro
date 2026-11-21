import type { Metadata } from "next";
import { SaleForm } from "./sale-form";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default function VentePage() {
  return <SaleForm />;
}
