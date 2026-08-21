import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500",
  success: "bg-emerald-600 text-white hover:bg-emerald-500",
  secondary:
    "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5",
  ghost: "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5",
} as const;

export function Button({
  variant = "primary",
  size = "sm",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: "xs" | "sm" | "md";
}) {
  const sizing =
    size === "xs"
      ? "px-3 py-1.5 text-xs"
      : size === "md"
        ? "px-4 py-2 text-sm"
        : "px-3.5 py-2 text-xs";
  return (
    <button
      {...props}
      className={`rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${variants[variant]} ${className}`}
    />
  );
}
