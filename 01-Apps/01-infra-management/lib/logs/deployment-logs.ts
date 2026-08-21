const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const ERROR_PATTERN = /\b(error|exception|fatal|fail(?:ed|ure)?|panic)\b/i;

export type DeploymentLogView =
  "chronological" | "errors-first" | "errors-only";

export function formatDeploymentLogView(logs: string, view: string | null) {
  if (!logs || (view !== "errors-first" && view !== "errors-only")) return logs;
  const lines = logs.split(/\r?\n/);
  const errors = lines.filter((line) => ERROR_PATTERN.test(line));
  if (view === "errors-only") {
    return errors.length
      ? `${errors.join("\n")}\n`
      : "No error lines were found in this deployment log.\n";
  }
  const remaining = lines.filter((line) => !ERROR_PATTERN.test(line));
  return `${[...errors, ...remaining].join("\n")}\n`;
}

export function decorateDeploymentLogs(logs: string) {
  if (!logs) return logs;
  return logs
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;
      const plain = line.replace(ANSI_PATTERN, "");
      const severity = ERROR_PATTERN.test(plain)
        ? { label: "error  ", color: 31 }
        : /\b(warn(?:ing)?|deprecated|retry)\b/i.test(plain)
          ? { label: "warning", color: 33 }
          : /\b(success|succeeded|complete(?:d)?|finished|done)\b/i.test(plain)
            ? { label: "success", color: 32 }
            : { label: "info   ", color: 34 };
      return `\u001b[${severity.color}m│ ${severity.label}\u001b[0m  ${line}`;
    })
    .join("\n");
}
