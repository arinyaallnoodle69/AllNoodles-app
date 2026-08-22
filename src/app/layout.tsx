import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { PwaProvider } from "@/components/pwa-provider";
import { getSiteUrl } from "@/lib/site-url";
import { RootAppLayoutShell } from "@/components/root-layout-shell";
import { PerformanceReporter } from "@/components/performance/performance-reporter";

const sukhumvitSet = localFont({
  src: [
    {
      path: "../../public/fonts/SukhumvitSet-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/SukhumvitSet-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/SukhumvitSet-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-sukhumvit",
});

const siteDescription =
  "ระบบจัดการธุรกิจจำหน่ายเส้นก๋วยเตี๋ยวและวัตถุดิบแบบดิจิทัล รองรับออเดอร์ ส่งของ เก็บเงิน และรายงาน";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "All Noodles",
    template: "%s | All Noodles",
  },
  description: siteDescription,
  applicationName: "All Noodles",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "All Noodles",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/api/brand/logo", sizes: "192x192", type: "image/png" },
      { url: "/api/brand/logo", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/api/brand/logo", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/api/brand/logo", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "All Noodles",
    title: "All Noodles",
    description: siteDescription,
    images: [
      {
        url: "/api/brand/logo",
        width: 512,
        height: 512,
        alt: "All Noodles",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "All Noodles",
    description: siteDescription,
    images: ["/api/brand/logo"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4A148C",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="font-sans">
      <head>
        <link rel="preconnect" href="https://profile.line-scdn.net" crossOrigin="anonymous" />
      </head>
      <body
        className={`${sukhumvitSet.variable} ${sukhumvitSet.className} bg-background text-foreground`}
      >
        <PwaProvider />
        <Suspense fallback={null}>
          <PerformanceReporter />
        </Suspense>
        <main>
          <Suspense fallback={null}>
            <RootAppLayoutShell>{children}</RootAppLayoutShell>
          </Suspense>
        </main>
      </body>
    </html>
  );
}
