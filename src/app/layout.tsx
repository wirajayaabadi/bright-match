import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bright Match", template: "%s · Bright Match" },
  description:
    "NFR Commercial Intelligence & Partnership Platform: mencocokkan ruang usaha di SPBU Pertamina dengan tenant yang tepat.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
