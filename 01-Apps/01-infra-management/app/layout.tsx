import type { Metadata } from "next";
import { cookies } from "next/headers";

import "./globals.css";

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
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
