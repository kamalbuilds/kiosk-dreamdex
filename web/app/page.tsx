import Link from "next/link";
import { KioskUnit } from "@/components/kiosk/KioskUnit";
import { CopySnippet } from "@/components/site/CopySnippet";
import { RouterStats } from "@/components/site/RouterStats";

const EXPLORER = "https://shannon-explorer.somnia.network";

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-rule bg-ink/92 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="lamp" aria-hidden />
            <span className="text-[15px] font-bold tracking-[0.26em] text-paper">KIOSK</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px] text-paper-2">
            <Link href="/demo" className="hidden transition-colors hover:text-paper sm:block">
              Live issue
            </Link>
            <Link
              href="/embed?code=kiosk-demo&asset=BTC"
              className="hidden transition-colors hover:text-paper sm:block"
            >
              The widget
            </Link>
            <a href="#snippet" className="key key-sodium px-3 py-1.5 text-[12px] font-bold">
              Copy the snippet
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* hero -------------------------------------------------------- */}
        <section className="relative overflow-hidden border-b border-rule">
          <div className="hairline-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 pt-12 pb-16 lg:grid-cols-[1.05fr_minmax(0,420px)] lg:gap-16 lg:px-8 lg:pt-16">
            <div>
              <h1 className="max-w-[20ch] text-[38px] leading-[1.0] font-bold tracking-[-0.035em] text-paper sm:text-[52px] lg:text-[58px]">
                Plant a market on someone else&apos;s corner.
              </h1>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-paper-2 sm:text-[19px]">
                One script tag gives any page a live Up/Down market, and pays the host on every order
                routed.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href="#snippet" className="key key-sodium px-5 py-2.5 text-[14px] font-bold">
                  Copy the snippet
                </a>
                <Link href="/demo" className="key px-5 py-2.5 text-[14px] font-semibold text-paper">
                  Read the live issue
                </Link>
              </div>
            </div>

            <div className="relative justify-self-center lg:justify-self-end">
              <div
                className="asphalt pointer-events-none absolute inset-x-[-14%] -bottom-8 h-28 rounded-[50%]"
                aria-hidden
              />
              <div className="relative">
                <KioskUnit code="kiosk-demo" asset="BTC" />
              </div>
            </div>
          </div>
        </section>

        {/* the till ---------------------------------------------------- */}
        <section className="border-b border-rule">
          <div className="mx-auto max-w-[1200px] px-5 py-16 lg:px-8 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,42ch)_1fr] lg:gap-16">
              <div>
                <h2 className="text-[30px] leading-[1.05] font-bold tracking-[-0.025em] text-paper sm:text-[38px]">
                  The venue already built the till and never opened it.
                </h2>
                <p className="mt-5 text-[16px] leading-relaxed text-paper-2">
                  Every DreamDEX event contract order carries the address of whoever sent it and the
                  fee that address should be paid. Each pool publishes the ceiling for that fee. The
                  plumbing for paying distribution is in the signature.
                </p>
              </div>

              <div>
                <div className="chassis rounded-kiosk overflow-hidden">
                  <pre className="numerals overflow-x-auto px-4 py-5 text-[12.5px] leading-[1.85] sm:px-6 sm:text-[13.5px]">
                    <code>
                      <span className="text-paper-2">placeBinaryOrder(</span>
                      {"\n  "}
                      <span className="text-paper-3">uint8 kind, uint256 price, uint256 quantity,</span>
                      {"\n  "}
                      <span className="text-sodium">address builder,</span>
                      <span className="text-paper-3">{"              // whoever sent the flow"}</span>
                      {"\n  "}
                      <span className="text-sodium">uint96 builderFeeBpsTimes1k</span>
                      <span className="text-paper-3">{"   // what the venue pays them"}</span>
                      {"\n"}
                      <span className="text-paper-2">);</span>
                    </code>
                  </pre>
                  <div className="plate px-4 py-2.5 leading-relaxed">
                    maxBuilderFeeBpsTimes1k on event contract pools reads 0. Shannon block 485483251,
                    Somnia mainnet block 409688211.
                  </div>
                </div>
                <p className="mt-5 max-w-[62ch] text-[16px] leading-relaxed text-paper-2">
                  So Kiosk does not sit and wait for it. The router charges its own 25 bps in
                  collateral and splits that with the host, while the builder tag rides along on the
                  order for the day the venue raises the cap.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* distribution ------------------------------------------------ */}
        <section className="border-b border-rule">
          <div className="mx-auto max-w-[1200px] px-5 py-16 lg:px-8 lg:py-24">
            <h2 className="max-w-[20ch] text-[30px] leading-[1.05] font-bold tracking-[-0.025em] text-paper sm:text-[38px]">
              Nobody is short exchange front ends.
            </h2>
            <p className="mt-5 max-w-[62ch] text-[16px] leading-relaxed text-paper-2">
              A prediction market does not get liquidity by opening one more terminal and asking
              people to come to it. It gets liquidity from a doorway standing next to whoever already
              holds the attention. Those corners are already occupied, and none of them are exchanges.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Storefront
                title="The market letter"
                seat={0}
                body="Drops mid-article, under the take, while the reader still agrees with it."
              />
              <Storefront
                title="The members-only server"
                seat={1}
                body="Pinned in the channel where the call was made, settling in the same room."
              />
              <Storefront
                title="The portfolio dashboard"
                seat={2}
                body="Beside the position it hedges, on a page the user already leaves open."
              />
              <Storefront
                title="The match day liveblog"
                seat={3}
                body="Sports, elections, any liveblog where the audience is loud and already in-play."
              />
            </div>
          </div>
        </section>

        {/* snippet ----------------------------------------------------- */}
        <section id="snippet" className="scroll-mt-20 border-b border-rule">
          <div className="mx-auto max-w-[1200px] px-5 py-16 lg:px-8 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,38ch)_1fr] lg:gap-16">
              <div>
                <h2 className="text-[30px] leading-[1.05] font-bold tracking-[-0.025em] text-paper sm:text-[38px]">
                  One tag. It sizes itself.
                </h2>
                <p className="mt-5 text-[16px] leading-relaxed text-paper-2">
                  The loader finds its own script tag, reads the attributes off it, plants a sandboxed
                  iframe in that exact spot, and listens for the height the kiosk reports back. It fits
                  a 320px sidebar and a 700px article column without the host writing a line of CSS.
                </p>
                <p className="mt-4 text-[16px] leading-relaxed text-paper-2">
                  Swap <span className="numerals text-sodium">data-kiosk</span> for your own code and
                  the fee starts landing in your payout address instead of ours.
                </p>
              </div>
              <div className="self-start">
                <CopySnippet code="degen-lounge" asset="BTC" />
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-paper-3">
                  <span>
                    <span className="numerals text-paper-2">data-kiosk</span> your integrator code
                  </span>
                  <span>
                    <span className="numerals text-paper-2">data-asset</span> BTC, ETH, any listed
                    market
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* economics --------------------------------------------------- */}
        <section className="border-b border-rule">
          <div className="mx-auto max-w-[1200px] px-5 py-16 lg:px-8 lg:py-24">
            <h2 className="max-w-[22ch] text-[30px] leading-[1.05] font-bold tracking-[-0.025em] text-paper sm:text-[38px]">
              What the host earns, without the rounding up.
            </h2>

            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-3">
              <Figure
                value="25"
                unit="bps"
                label="KioskRouter fee"
                body="Charged in collateral on routed notional, capped at 100 bps in the contract."
              />
              <Figure
                value="13"
                unit="bps"
                label="to the host"
                body="The integrator share on the launch codes. The remaining 12 bps is the platform split."
                accent
              />
              <Figure
                value="0"
                unit="bps"
                label="from the venue, today"
                body="The pool's own builder fee cap. Kiosk passes the builder tag anyway, so nothing changes when it moves."
              />
            </div>

            <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,52ch)_1fr] lg:gap-16">
              <p className="text-[16px] leading-relaxed text-paper-2">
                The honest version: on Shannon the venue pays integrators nothing right now, so the
                entire host payout comes out of Kiosk&apos;s own router fee, which the trader pays on
                top of their collateral and can read on the ticket before they sign. That is the whole
                arrangement. When the venue raises its cap, the same builder address already on the
                order starts collecting from the venue as well.
              </p>
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-paper-3">
                  KioskRouter, live
                </p>
                <RouterStats code="kiosk-demo" />
              </div>
            </div>
          </div>
        </section>

        {/* what it cannot do ------------------------------------------- */}
        <section>
          <div className="mx-auto max-w-[1200px] px-5 py-16 lg:px-8 lg:py-24">
            <h2 className="text-[30px] leading-[1.05] font-bold tracking-[-0.025em] text-paper sm:text-[38px]">
              What Kiosk cannot do.
            </h2>
            <ul className="mt-8 max-w-[70ch] divide-y divide-rule border-y border-rule">
              {[
                {
                  k: "Hold your position",
                  v: "The trader signs placeBinaryOrder against the venue's own pool from their own wallet. The router never becomes a counterparty.",
                },
                {
                  k: "Move your collateral",
                  v: "KioskRouter pulls the fee and nothing else, and reverts with FeeTransferFailed if the token answers false instead of throwing.",
                },
                {
                  k: "Invent a price",
                  v: "Every number on the ticket is a read of the live book. When the book is empty the widget says the book is empty.",
                },
              ].map((row) => (
                <li key={row.k} className="flex flex-col gap-1.5 py-5 sm:flex-row sm:gap-8">
                  <span className="shrink-0 text-[15px] font-semibold text-paper sm:w-[19ch]">
                    {row.k}
                  </span>
                  <span className="text-[15px] leading-relaxed text-paper-2">{row.v}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule bg-ink-2">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-5 py-8 text-[13px] text-paper-3 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="lamp" aria-hidden />
            <span className="text-[13px] font-bold tracking-[0.26em] text-paper-2">KIOSK</span>
            <span className="numerals ml-2">somnia shannon · 50312</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/demo" className="transition-colors hover:text-paper">
              Host page
            </Link>
            <Link href="/embed?code=kiosk-demo&asset=BTC" className="transition-colors hover:text-paper">
              Standalone widget
            </Link>
            <a
              href={EXPLORER}
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-paper"
            >
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

/** Each corner gets its own canvas: a different stripe pitch and rake, same two
 *  colours, so the row reads as four stalls rather than four copies of a card. */
const AWNINGS = [
  { "--awning-angle": "108deg", "--awning-band": "13px" },
  { "--awning-angle": "72deg", "--awning-band": "9px" },
  { "--awning-angle": "96deg", "--awning-band": "17px" },
  { "--awning-angle": "118deg", "--awning-band": "11px" },
] as unknown as React.CSSProperties[];

function Storefront({ title, body, seat }: { title: string; body: string; seat: number }) {
  return (
    <div className="overflow-hidden rounded-kiosk border border-rule bg-ink-2 transition-[transform,border-color] duration-200 hover:-translate-y-[2px] hover:border-rule-2">
      <div className="awning" style={AWNINGS[seat % AWNINGS.length]} aria-hidden />
      <div className="valance" aria-hidden />
      <div className="px-4 pt-3 pb-4">
        <h3 className="text-[14px] font-semibold text-paper">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-paper-3">{body}</p>
      </div>
    </div>
  );
}

function Figure({
  value,
  unit,
  label,
  body,
  accent,
}: {
  value: string;
  unit: string;
  label: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div className="border-t border-rule pt-4">
      <div className="flex items-baseline gap-1.5">
        <span
          className={`numerals text-[46px] leading-none font-bold tracking-tight ${
            accent ? "text-sodium" : "text-paper"
          }`}
        >
          {value}
        </span>
        <span className="numerals text-[15px] text-paper-3">{unit}</span>
      </div>
      <p className="mt-2 text-[13px] font-semibold tracking-wide text-paper">{label}</p>
      <p className="mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-paper-3">{body}</p>
    </div>
  );
}
