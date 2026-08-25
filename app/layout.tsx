import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
