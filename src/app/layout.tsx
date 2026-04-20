import type { Metadata } from "next";
import "./globals.css";
import ClientRoot from "./Components/ClientRoot";

export const metadata: Metadata = {
  title: "Faragon Database",
  description: "Faragon Database management system",
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
