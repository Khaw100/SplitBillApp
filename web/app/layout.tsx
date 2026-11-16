import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "SplitBill",
  description: "Bagi struk makan bareng tanpa drama.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        {/* Tailwind is compiled to public/tw.css in the Docker build (see Dockerfile) */}
        <link rel="stylesheet" href="/tw.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
