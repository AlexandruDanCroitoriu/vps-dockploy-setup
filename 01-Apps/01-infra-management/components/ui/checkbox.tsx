import type { InputHTMLAttributes } from "react";

export function Checkbox({
  label,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        {...props}
        className="size-4 rounded border-gray-300 accent-indigo-600 disabled:opacity-50 dark:border-white/20"
      />
      {label}
    </label>
  );
}
