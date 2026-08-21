import { describe, expect, it } from "vitest";
import {
  decorateDeploymentLogs,
  formatDeploymentLogView,
} from "./deployment-logs";

describe("deployment log views", () => {
  const logs = "starting\nwarning: retry\nERROR: failed\ndone";
  it("retains chronological logs by default", () =>
    expect(formatDeploymentLogView(logs, null)).toBe(logs));
  it("groups errors first", () =>
    expect(formatDeploymentLogView(logs, "errors-first")).toMatch(
      /^ERROR: failed/,
    ));
  it("returns only errors", () =>
    expect(formatDeploymentLogView(logs, "errors-only")).toBe(
      "ERROR: failed\n",
    ));
  it("returns non-error information lines", () =>
    expect(formatDeploymentLogView(logs, "info-only")).toBe(
      "starting\ndone\n",
    ));
  it("returns only warnings", () =>
    expect(formatDeploymentLogView(logs, "warnings-only")).toBe(
      "warning: retry\n",
    ));
  it("reports when no errors exist", () =>
    expect(formatDeploymentLogView("all good", "errors-only")).toContain(
      "No error lines",
    ));
  it("decorates severities without ANSI text affecting detection", () => {
    const output = decorateDeploymentLogs(
      "\u001b[31merror\u001b[0m\nsuccess\nplain",
    );
    expect(output).toContain("error  ");
    expect(output).toContain("success");
    expect(output).toContain("info   ");
  });
});
