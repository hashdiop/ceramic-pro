import type { Metadata } from "next";
import { StockOperationForm } from "./operation-form";

export const metadata: Metadata = { title: "Opération de stock" };

export default function StockOperationPage() {
  return <StockOperationForm />;
}
