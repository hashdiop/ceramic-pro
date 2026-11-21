import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { DeliveryNote } from "./delivery-note";

export default function DeliveryNotePage({ params }: PageProps<"/transferts/[id]/bl">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/transferts/[id]/bl">["params"] }) {
  const { id } = await params;
  return <DeliveryNote id={id} />;
}
