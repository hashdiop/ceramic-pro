import type { Metadata } from "next";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: "Mon compte" };

export default function ComptePage() {
  return <AccountView />;
}
