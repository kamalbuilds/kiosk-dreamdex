import type { Metadata } from "next";
import Link from "next/link";
import { Newsreader } from "next/font/google";
import { KioskScriptEmbed } from "@/components/KioskScriptEmbed";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Degen Lounge, issue 214: a market in the middle of the newsletter",
  description:
    "A demonstration host page. Degen Lounge is a fictional market-structure newsletter running a live Kiosk embed inside one of its issues.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <div
      className={`${newsreader.variable} skin-press flex-1 bg-press text-press-ink`}
      style={{ colorScheme: "light" }}
    >
      <header className="border-b border-press-rule">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-6 px-5 py-3 text-[13px] text-press-dim sm:px-8">
          <span className="tracking-[0.16em] uppercase">Issue 214</span>
          <span className="hidden sm:block">Friday</span>
          <button
            type="button"
            className="rounded-full bg-press-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-transform active:translate-y-px"
          >
            Subscribe
          </button>
        </div>
      </header>

      <div className="border-b-4 border-double border-press-ink/80">
        <div className="mx-auto max-w-[1100px] px-5 py-9 text-center sm:px-8">
          <h1 className="text-[40px] leading-none font-bold tracking-[-0.03em] sm:text-[62px]">
            Degen Lounge
          </h1>
          <p className="mt-2 text-[15px] italic text-press-dim">
            Market structure notes for people who trade far too much.
          </p>
        </div>
      </div>

      <nav className="border-b border-press-rule">
        <div className="mx-auto flex max-w-[1100px] gap-6 overflow-x-auto px-5 py-2.5 text-[13px] tracking-[0.1em] uppercase text-press-dim sm:px-8">
          <span className="whitespace-nowrap text-press-ink">The Desk</span>
          <span className="whitespace-nowrap">Perps</span>
          <span className="whitespace-nowrap">Event Contracts</span>
          <span className="whitespace-nowrap">Archive</span>
        </div>
      </nav>

      <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 sm:py-14">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,680px)_260px] lg:gap-16">
          <article>
            <p className="text-[13px] font-semibold tracking-[0.18em] uppercase text-press-accent">
              Market structure
            </p>
            <h2 className="mt-3 text-[34px] leading-[1.08] font-semibold tracking-[-0.02em] sm:text-[46px]">
              Your readers already have an opinion. They have nowhere to put it.
            </h2>
            <p className="mt-4 text-[19px] leading-relaxed italic text-press-dim">
              Every letter in this business ends with a take and a link to an exchange. The link is
              where the conviction goes to die.
            </p>

            <div className="mt-6 flex items-center gap-3 border-y border-press-rule py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-press-ink text-[13px] font-semibold text-press">
                MO
              </span>
              <div className="text-[14px]">
                <span className="font-semibold">Marta Oyelaran</span>
                <span className="text-press-dim"> · six minute read</span>
              </div>
            </div>

            <div className="mt-7 space-y-5 text-[19px] leading-[1.68]">
              <p className="first-letter:float-left first-letter:mt-1 first-letter:mr-2 first-letter:text-[62px] first-letter:leading-[0.78] first-letter:font-semibold">
                There is a gap of roughly ninety seconds between reading a take and acting on it, and
                very little survives it. You finish the paragraph, you agree, you open a tab, the tab
                asks you to sign in, and somewhere around the second confirmation dialog the
                conviction has cooled into a bookmark.
              </p>
              <p>
                Everyone files this under conversion. It is really a distribution problem, and it
                belongs to the venue rather than to the reader. Order books rarely lack liquidity so
                much as they lack a doorway within arm&apos;s reach of the people who already hold a
                view. The audience is assembled, warmed up and briefed. It is just assembled
                somewhere the exchange cannot see.
              </p>

              <blockquote className="border-l-2 border-press-accent py-1 pl-5 text-[22px] leading-[1.45] font-medium italic">
                The exchange has had the doorway written into the function signature the entire time.
                Nobody has walked through it.
              </blockquote>

              <p>
                That last part is literal. DreamDEX event contracts on Somnia expose{" "}
                <code className="rounded bg-press-ink/6 px-1.5 py-0.5 press-code text-[15px]">
                  placeBinaryOrder(..., address builder, uint96 builderFeeBpsTimes1k)
                </code>
                , and every pool publishes a{" "}
                <code className="rounded bg-press-ink/6 px-1.5 py-0.5 press-code text-[15px]">
                  maxBuilderFeeBpsTimes1k
                </code>{" "}
                ceiling for it. Whoever sends the flow is supposed to get paid for sending it. Read
                the cap on Shannon today and it is zero. The rail is wired and the switch is off.
              </p>
              <p>
                Kiosk is one script tag that plants the order ticket in the page instead of linking
                away from it. We are running one below, in this issue, on the five minute BTC window.
                It is live rather than a screenshot. If the book happens to be empty, it will say so
                instead of drawing a number.
              </p>
            </div>

            <figure className="my-9">
              <div className="border-y border-press-rule bg-[#eae5da] px-4 py-7 sm:px-8">
                <KioskScriptEmbed code="degen-lounge" asset="BTC" className="mx-auto max-w-[420px]" />
              </div>
              <figcaption className="mt-3 text-[14px] leading-relaxed italic text-press-dim">
                Live Kiosk embed, code <span className="not-italic">degen-lounge</span>. Orders are
                signed by you against the venue pool. Degen Lounge is paid 13 basis points of routed
                notional by KioskRouter and never holds the position.
              </figcaption>
            </figure>

            <div className="space-y-5 text-[19px] leading-[1.68]">
              <p>
                Two things are worth noticing. The first is that the ticket does not need us. The
                reader signs their own order against the venue&apos;s own pool, so this letter cannot
                hold, move or misdirect anybody&apos;s position even if it wanted to. The second is
                that the fee is printed on the ticket rather than buried in a disclosure. We take a
                cut, you can see the cut, and you can decide whether the convenience is worth it.
              </p>
              <p>
                Whether this becomes a business or stays a novelty depends entirely on how much flow
                a room like this one actually carries. We have no idea yet. The router counts
                notional, fees and orders per code on chain, so when we do know, the number will be
                the same number you can read yourself.
              </p>
            </div>

            <div className="mt-10 border-t border-press-rule pt-5 text-[14px] leading-relaxed text-press-dim">
              Degen Lounge is a fictional publication built to show what a Kiosk host page looks
              like. The market, the order book and the router fee inside the embed above are real and
              live on Somnia Shannon.{" "}
              <Link href="/" className="text-press-accent underline underline-offset-2">
                See how the embed works
              </Link>
              .
            </div>
          </article>

          <aside className="space-y-8 lg:pt-10">
            <section>
              <h3 className="border-b border-press-ink pb-2 text-[13px] tracking-[0.18em] uppercase">
                In this issue
              </h3>
              <ol className="mt-3 space-y-3 text-[16px] leading-snug">
                {[
                  "The doorway nobody walked through",
                  "Event contract books are thinner than the screenshots suggest",
                  "A short note on settling in nanoseconds",
                ].map((t, i) => (
                  <li key={t} className="flex gap-3">
                    <span className="text-[14px] text-press-dim">{i + 1}</span>
                    <span className={i === 0 ? "font-semibold" : "text-press-dim"}>{t}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="border border-press-rule bg-press-2 p-5">
              <h3 className="text-[16px] font-semibold">House rules</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-press-dim">
                We disclose every referral arrangement in the issue that carries it. The embed above
                pays this letter. Nothing else on the page does.
              </p>
            </section>
          </aside>
        </div>
      </main>

      <footer className="border-t border-press-rule">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-[13px] text-press-dim sm:px-8">
          <span>Degen Lounge · a demonstration host page for Kiosk</span>
          <Link href="/" className="text-press-accent underline underline-offset-2">
            Kiosk
          </Link>
        </div>
      </footer>
    </div>
  );
}
