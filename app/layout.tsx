import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { getThemePreference } from "@/lib/theme-server";
import { themeClass } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Interview Prep",
  description:
    "A real-time voice interview trainer: talk to an AI interviewer built from your own CV and the job you're targeting, then get a scorecard.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Rendered by the server from the theme cookie, so the first paint is
  // already in the chosen theme (components/ui/ThemeToggle.tsx).
  const theme = themeClass(await getThemePreference());

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${theme}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
