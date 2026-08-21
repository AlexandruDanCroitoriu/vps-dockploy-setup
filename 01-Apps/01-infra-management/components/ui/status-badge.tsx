export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    danger: "bg-red-500/10 text-red-600 dark:text-red-300",
    neutral: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
