import type { InputHTMLAttributes } from "react";
import { inputClassName } from "./form-field";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClassName} ${className}`} />;
}
