import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { TransferDetail } from "./transfer-detail";

export default function TransferPage({ params }: PageProps<"/transferts/[id]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/transferts/[id]">["params"] }) {
  const { id } = await params;
  return <TransferDetail id={id} />;
}
