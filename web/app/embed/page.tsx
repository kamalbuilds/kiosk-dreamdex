import type { Metadata } from "next";
import { EmbedFrame } from "@/components/kiosk/EmbedFrame";

export const metadata: Metadata = {
  title: "Kiosk: embedded market",
  robots: { index: false, follow: false },
};

function first(v: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

export default async function EmbedPage({ searchParams }: PageProps<"/embed">) {
  const params = await searchParams;
  const code = first(params.code, "kiosk-demo");
  const asset = first(params.asset, "BTC");
  const kid = first(params.kid, "standalone");

  return (
    <main className="w-full p-0">
      <EmbedFrame code={code} asset={asset} kid={kid} />
    </main>
  );
}
