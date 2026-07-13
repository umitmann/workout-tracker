import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Log workouts, track sets and rest, and follow guided tempo training.",
};

// themeColor moved out of `metadata` into `viewport` per Next 16 (see
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0d100e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <span aria-hidden="true" className="fixed bottom-1 right-2 text-[10px] text-zinc-600 dark:text-zinc-400 font-mono select-none pointer-events-none z-50">
          {process.env.COMMIT_SHA}
        </span>
      </body>
    </html>
  );
}
