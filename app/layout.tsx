import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./provider-buttons.css";
import "./settings.css";
import "./product-admin.css";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata: Metadata = { title: { default: "DCC Inventory", template: "%s · DCC Inventory" }, description: "Dunany Country Club inventory operations" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className={inter.variable}>{children}</body></html>; }
