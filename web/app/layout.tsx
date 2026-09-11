import type { Metadata, Viewport } from "next";
import { Archivo, Azeret_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const azeret = Azeret_Mono({
  variable: "--font-azeret",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Kiosk: a prediction market you plant on someone else's site",
    template: "%s",
  },
  description:
    "One script tag gives any newsletter, community or site a live Up/Down market on DreamDEX, and pays the host a share of every order their audience routes.",
  applicationName: "Kiosk",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "Kiosk: a prediction market you plant on someone else's site",
    description:
      "One script tag. A live Up/Down market inside your page. The host earns bps on every order routed to DreamDEX.",
    siteName: "Kiosk",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#070c0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${azeret.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-paper">
        {children}
      </body>
    </html>
  );
}
