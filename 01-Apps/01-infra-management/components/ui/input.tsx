import type { ComponentProps } from "react";
import { inputClassName } from "./form-field";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${inputClassName} ${className}`} />;
}
