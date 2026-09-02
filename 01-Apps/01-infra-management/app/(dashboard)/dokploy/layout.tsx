import { redirect } from "next/navigation";
import { getActiveDokployInstanceSummary } from "@/lib/dokploy";

export default async function DokployLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getActiveDokployInstanceSummary())) redirect("/instance");
  return children;
}
