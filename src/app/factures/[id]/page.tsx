import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { InvoiceView } from "./invoice-view";

export default function FacturePage({ params }: PageProps<"/factures/[id]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/factures/[id]">["params"] }) {
  const { id } = await params;
  return <InvoiceView id={id} />;
}
