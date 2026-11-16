import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "SplitBill",
  description: "Split restaurant receipts with friends, without the drama.",
  appleWebApp: { capable: true, title: "SplitBill", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Tailwind is compiled to public/tw.css in the Docker build (see Dockerfile) */}
        <link rel="stylesheet" href="/tw.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
