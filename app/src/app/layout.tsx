import type { Metadata } from "next";
import "./globals.css";
import { CustomerProvider } from "@/contexts/CustomerContext";
import { AppNav } from "@/components/AppNav";

export const metadata: Metadata = {
  title: "Shop ML Pipeline",
  description: "ML pipeline deployment - order late delivery prediction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">
        <CustomerProvider>
          <AppNav />
          <main>{children}</main>
        </CustomerProvider>
      </body>
    </html>
  );
}
