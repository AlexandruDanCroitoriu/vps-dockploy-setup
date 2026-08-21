import type { SelectHTMLAttributes } from "react";
import { inputClassName } from "./form-field";

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClassName} ${className}`} />;
}
