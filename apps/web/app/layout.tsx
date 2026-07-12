import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel, Crimson_Text } from "next/font/google";

import "leaflet/dist/leaflet.css";
import "./globals.css";

const displayFont = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "700"],
});

const bodyFont = Crimson_Text({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "The Mind's Eye",
  description: "Community-first historical review workspace for The Mind's Eye.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
