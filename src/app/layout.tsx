import type { Metadata } from "next";
import { Crimson_Pro, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { IdentityProvider } from "@/components/identity-provider";

// Elegant display font - classic serif without quirky letters
const crimsonPro = Crimson_Pro({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Clean, modern body font
const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Monospace for codes
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gift Circle",
  description:
    "An app for facilitating or participating in Gift Circles—cultivating generosity and abundance in community!",
  openGraph: {
    title: "Gift Circle",
    description:
      "An app for facilitating or participating in Gift Circles—cultivating generosity and abundance in community!",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gift Circle",
    description:
      "An app for facilitating or participating in Gift Circles—cultivating generosity and abundance in community!",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${crimsonPro.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-body antialiased`}
      >
        <IdentityProvider>{children}</IdentityProvider>
      </body>
    </html>
  );
}
