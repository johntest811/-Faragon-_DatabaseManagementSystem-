import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientRoot from "./Components/ClientRoot";

export const metadata: Metadata = {
  title: "Faragon Database",
  description: "Faragon Database management system",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
