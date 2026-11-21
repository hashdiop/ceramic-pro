import type { Metadata } from "next";
import { NewTransferForm } from "./new-transfer-form";

export const metadata: Metadata = { title: "Nouveau transfert" };

export default function NewTransferPage() {
  return <NewTransferForm />;
}
