"use client";

import { useEffect, useRef } from "react";
import { KioskUnit } from "./KioskUnit";

/**
 * The iframe body. Measures itself and tells embed.js how tall to make the
 * frame, so the kiosk fits a narrow sidebar and a wide article column without
 * the host writing any CSS.
 */
export function EmbedFrame({ code, asset, kid }: { code: string; asset: string; kid: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    const node = ref.current;
    if (!node || window.parent === window) return;

    let last = 0;
    const post = () => {
      const h = Math.ceil(node.getBoundingClientRect().height);
      if (h > 0 && Math.abs(h - last) > 1) {
        last = h;
        window.parent.postMessage({ source: "kiosk", type: "height", kid, height: h }, "*");
      }
    };

    post();
    const ro = new ResizeObserver(post);
    ro.observe(node);
    const id = window.setInterval(post, 1000);
    return () => {
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [kid]);

  return (
    <div ref={ref} className="w-full">
      <KioskUnit code={code} asset={asset} />
    </div>
  );
}
