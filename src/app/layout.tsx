import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = "Cosmic Nebula";
const DESCRIPTION =
  "An interactive particle universe. Seven living visual modes, gravity that follows your touch, and supernovae you ignite — tuned to run smooth on phones, tablets and desktops.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://cosmic-nebula.pages.dev"),
  title: {
    default: "Cosmic Nebula — Interactive Particle Universe",
    template: "%s · Cosmic Nebula",
  },
  description: DESCRIPTION,
  applicationName: SITE,
  keywords: [
    "particle universe",
    "interactive canvas",
    "generative art",
    "nebula",
    "galaxy simulation",
    "WebGL alternative",
    "creative coding",
  ],
  authors: [{ name: "John Mike" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-icon.png" }],
  },
  openGraph: {
    title: "Cosmic Nebula — Interactive Particle Universe",
    description: DESCRIPTION,
    siteName: SITE,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Cosmic Nebula" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cosmic Nebula — Interactive Particle Universe",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#05020f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} cosmic-body antialiased`}
      >
        {children}
        <Toaster theme="dark" position="bottom-center" />
      </body>
    </html>
  );
}
