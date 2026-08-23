// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyProjectServiceDeleted } from "@/lib/project-events";
import { DeletedServiceGuard } from "./deleted-service-guard";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("DeletedServiceGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("immediately hides a deleted service without overlapping refreshes", () => {
    render(
      <DeletedServiceGuard projectId="project-1" serviceId="postgres-1">
        <p>PostgreSQL card</p>
      </DeletedServiceGuard>,
    );

    act(() => notifyProjectServiceDeleted("project-1", "postgres-1"));
    expect(screen.queryByText("PostgreSQL card")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4_000));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
