import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ผลการเลือกตั้งประจำหมู่บ้าน",
  description: "ระบบรายงานผลเลือกตั้งหมู่บ้านแบบสด",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="font-sansThai text-ink">{children}</body>
    </html>
  );
}
