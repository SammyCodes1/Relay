import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { WalletConnect } from "./wallet-connect";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Relay",
  description: "A planner hires a specialist, and that specialist hires a finisher, inside one budget.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-[100dvh]">
        <header className="border-b border-[var(--line)]">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/" className="inline-flex min-h-11 items-center gap-3">
              <svg viewBox="0 0 36 36" className="h-9 w-9" aria-hidden>
                <rect width="36" height="36" rx="11" fill="#1c1917" />
                <circle cx="12" cy="18" r="2.4" fill="#f7f3ec" />
                <path d="M14.6 18h6.8" stroke="#f7f3ec" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="24" cy="18" r="2.4" fill="none" stroke="#f7f3ec" strokeWidth="1.6" />
              </svg>
              <span className="text-[1.35rem] leading-none font-medium tracking-[-0.04em]">Relay</span>
            </Link>
            <div className="flex items-center gap-4">
              <nav className="mono flex gap-6 text-[13px] uppercase tracking-[0.16em] text-[var(--muted)]">
                <Link className="inline-flex min-h-11 items-center" href="/start">Start</Link>
                <Link className="inline-flex min-h-11 items-center" href="/receipts">Receipts</Link>
              </nav>
              <WalletConnect />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1120px] px-5 py-8 sm:px-8 sm:py-12">{children}</main>
      </body>
    </html>
  );
}
