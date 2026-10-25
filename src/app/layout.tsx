import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fleo — international flight deals from India",
  description: "Unusually cheap international fares from Indian cities, spotted automatically.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">{children}</body>
    </html>
  );
}
