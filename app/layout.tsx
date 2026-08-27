import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import { TopBar } from "@/components/top-bar/top-bar";
import { ZERO_PIPELINE_COUNTS } from "@/core/pipeline/pipeline-counts";
import "./globals.css";

// Self-hosted at build time, so a localhost-only app needs no third-party round
// trip to render text. Static weights rather than the variable
// face on purpose: the design constrains type to exactly 400/600/800, and
// loading only those three makes the constraint physical. No italic is loaded —
// the design system loads none.
const archivo = Archivo({
  weight: ["400", "600", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "tailor",
  description: "Tailors your canonical resume to a job posting.",
};

// Typed explicitly rather than with Next's generated `LayoutProps<"/">`, so
// `pnpm typecheck` passes on a clean checkout — the generated types do not
// exist until `next build`/`next dev` has run once, and `build` type-checks
// first.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        {/* The only seam Epic 2 replaces: the bar reads whatever it is
            handed, and there is nothing to hand it until postings and
            boards.json exist. */}
        <TopBar counts={ZERO_PIPELINE_COUNTS} boardCount={0} />
        {children}
      </body>
    </html>
  );
}
