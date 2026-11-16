import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "SplitBill",
  description: "Scan a receipt, assign items, split the bill fairly.",
  appleWebApp: { capable: true, title: "SplitBill", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Tailwind is compiled to public/tw.css in the Docker build (see Dockerfile) */}
        <link rel="stylesheet" href="/tw.css" />
      </head>
      <body className="bg-zinc-950 text-zinc-200">{children}</body>
    </html>
  );
}
