"use client";

import { useEffect, useRef } from "react";

/**
 * Loads the real /embed.js exactly the way a host would paste it, so the demo
 * page exercises the shipped loader rather than a hand-wired iframe.
 */
export function KioskScriptEmbed({
  code,
  asset,
  className,
}: {
  code: string;
  asset: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    node.textContent = "";

    const script = document.createElement("script");
    script.src = "/embed.js";
    script.async = true;
    script.setAttribute("data-kiosk", code);
    script.setAttribute("data-asset", asset);
    node.appendChild(script);

    return () => {
      node.textContent = "";
    };
  }, [code, asset]);

  return <div ref={host} className={className} />;
}
