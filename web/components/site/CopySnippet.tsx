"use client";

import { useState, useSyncExternalStore } from "react";

function buildSnippet(origin: string, code: string, asset: string) {
  return `<script src="${origin}/embed.js"\n        data-kiosk="${code}"\n        data-asset="${asset}" async></script>`;
}

function selectionCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/** The snippet carries the origin the visitor is actually on, so it can be
 *  pasted straight into a scratch file and still resolve. */
const noopSubscribe = () => () => {};
const readOrigin = () => window.location.origin;
const serverOrigin = () => "https://your-kiosk-host";

export function CopySnippet({ code, asset }: { code: string; asset: string }) {
  const origin = useSyncExternalStore(noopSubscribe, readOrigin, serverOrigin);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const snippet = buildSnippet(origin, code, asset);

  const copy = async () => {
    let ok = false;
    try {
      // The async clipboard can sit unresolved behind a permission prompt, which
      // would leave the button with no feedback at all. Give it 600ms, then fall
      // back to the selection copy, which either works or reports false.
      await Promise.race([
        navigator.clipboard.writeText(snippet),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("slow")), 600)),
      ]);
      ok = true;
    } catch {
      ok = selectionCopy(snippet);
    }
    setState(ok ? "copied" : "failed");
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
