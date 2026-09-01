import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./provider-buttons.css";
import "./settings.css";
import "./product-admin.css";
import "./deliveries.css";
import "./delivery-edit.css";
import "./inventory.css";
import "./requests.css";
import "./table-colors.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "DCC Inventory", template: "%s · DCC Inventory" },
  description: "Simple stock tracking for Dunany Country Club",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
