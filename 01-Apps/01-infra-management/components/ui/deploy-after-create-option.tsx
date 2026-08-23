import type { InputHTMLAttributes } from "react";

export function DeployAfterCreateOption({
  description,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name"> & {
  description: string;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-md border border-gray-200 p-3 text-sm text-gray-700 dark:border-white/10 dark:text-gray-300 ${className}`}
    >
      <input
        {...props}
        type="checkbox"
        name="deployAfterCreate"
        className="mt-0.5 size-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-white/20 dark:bg-gray-800"
      />
      <span>
        <span className="block font-medium">
          Deploy automatically after creation
        </span>
        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
          {description}
        </span>
      </span>
    </label>
  );
}
