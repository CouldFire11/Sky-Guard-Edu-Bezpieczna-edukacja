import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkyGuard EDU",
  description: "Inteligentny system monitorowania szkoły",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
