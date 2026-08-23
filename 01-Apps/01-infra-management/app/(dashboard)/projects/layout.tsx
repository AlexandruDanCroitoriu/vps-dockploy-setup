import { redirect } from "next/navigation";
import { getActiveDokployInstanceSummary } from "@/lib/dokploy";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getActiveDokployInstanceSummary())) redirect("/");
  return children;
}
