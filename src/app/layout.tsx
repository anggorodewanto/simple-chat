import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/app/service-worker";

export const metadata: Metadata = {
  title: "Simple Chat",
  description: "A small, invite-only group chat.",
  manifest: "/manifest.webmanifest",
  applicationName: "Simple Chat",
  appleWebApp: { capable: true, title: "Simple Chat", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
