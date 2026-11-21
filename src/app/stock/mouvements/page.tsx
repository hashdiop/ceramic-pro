import type { Metadata } from "next";
import { MovementsView } from "./movements-view";

export const metadata: Metadata = { title: "Journal des mouvements" };

export default function MovementsPage() {
  return <MovementsView />;
}
