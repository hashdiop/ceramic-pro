import type { Metadata } from "next";
import { TransferList } from "./transfer-list";

export const metadata: Metadata = { title: "Transferts" };

export default function TransfertsPage() {
  return <TransferList />;
}
