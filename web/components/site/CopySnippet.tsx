"use client";

import { useEffect, useState } from "react";

function buildSnippet(origin: string, code: string, asset: string) {
  return `<script src="${origin}/embed.js"\n        data-kiosk="${code}"\n        data-asset="${asset}" async></script>`;
}

export function CopySnippet({ code, asset }: { code: string; asset: string }) {
  const [origin, setOrigin] = useState("https://your-kiosk-host");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => setOrigin(window.location.origin), []);

  const snippet = buildSnippet(origin, code, asset);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
      } else {
        const ta = document.createElement("textarea");
        ta.value = snippet;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2200);
  };

  return (
    <div className="chassis rounded-kiosk overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rivet" aria-hidden />
          <span className="text-[11px] tracking-[0.22em] uppercase text-paper-3">
            paste anywhere in the page
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="key key-sodium px-3 py-1.5 text-[12px] font-bold tracking-wide"
        >
          {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
        </button>
      </div>
      <pre className="numerals overflow-x-auto px-4 py-4 text-[12px] leading-relaxed text-paper-2 sm:px-6 sm:text-[13.5px]">
        <code>
          <span className="text-paper-3">{"<script "}</span>
          <span className="text-paper-2">src=</span>
          <span className="text-up">{`"${origin}/embed.js"`}</span>
          {"\n        "}
          <span className="text-sodium">data-kiosk=</span>
          <span className="text-up">{`"${code}"`}</span>
          {"\n        "}
          <span className="text-sodium">data-asset=</span>
          <span className="text-up">{`"${asset}"`}</span>
          <span className="text-paper-3">{" async></script>"}</span>
        </code>
      </pre>
      <div className="plate flex items-center justify-between gap-3 px-4 py-2">
        <span>no npm install · no react · no css to write</span>
        <span className="rivet" aria-hidden />
      </div>
    </div>
  );
}
