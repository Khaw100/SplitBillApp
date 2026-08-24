export const metadata = {
  title: "SplitBillApp",
  description: "Split receipts with friends",
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
