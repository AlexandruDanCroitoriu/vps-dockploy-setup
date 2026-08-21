export const inputClassName =
  "mt-1.5 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-gray-800 dark:text-white";

export function FormField({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {optional && <span className="text-gray-400"> (optional)</span>}
      </label>
      {children}
    </div>
  );
}

export function ActionMessage({
  status,
  message,
}: {
  status: "idle" | "success" | "error";
  message: string;
}) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={`text-sm ${status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
    >
      {message}
    </p>
  );
}
