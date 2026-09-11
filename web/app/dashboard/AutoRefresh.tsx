"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-runs the server component on an interval so every figure on the page stays
 * a fresh chain read rather than a snapshot from page load. The countdown is
 * shown so a stale number is never mistaken for a live one.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          router.refresh();
          return seconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <button
      type="button"
      onClick={() => {
        router.refresh();
        setLeft(seconds);
      }}
      className="border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
    >
      refresh now · auto in {left}s
    </button>
  );
}
