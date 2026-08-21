import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import DashboardLayout from "@/components/dashboardLayout";


export const metadata: Metadata = {
  title: "Infra Management",
  description: "Infrastructure Management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();

  const theme = cookieStore.get("theme")?.value;

  const isDark = theme === "dark";

  return (
    <html
      lang="en"
      className={[ isDark ? "dark" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <body className="min-h-full flex flex-col">
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}
