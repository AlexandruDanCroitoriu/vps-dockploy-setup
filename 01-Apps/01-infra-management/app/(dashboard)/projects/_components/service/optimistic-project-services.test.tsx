// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyProjectServiceCreation } from "@/lib/project-events";
import { OptimisticProjectServices } from "./optimistic-project-services";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("OptimisticProjectServices", () => {
  beforeEach(() => refresh.mockReset());
  afterEach(cleanup);

  it("shows a pending card immediately and permanently settles it when the service arrives", async () => {
    const { rerender } = render(
      <OptimisticProjectServices projectId="project-1" existingServices={[]}>
        {null}
      </OptimisticProjectServices>,
    );

    act(() => {
      notifyProjectServiceCreation({
        phase: "started",
        service: {
          requestId: "request-1",
          projectId: "project-1",
          matchName: "postgres",
          displayName: "PostgreSQL",
          typeLabel: "PostgreSQL",
        },
      });
    });

    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL · Creating…")).toBeInTheDocument();

    rerender(
      <OptimisticProjectServices
        projectId="project-1"
        existingServices={[{ id: "database-1", name: "postgres" }]}
      >
        <p>Real service</p>
      </OptimisticProjectServices>,
    );

    expect(screen.queryByText("PostgreSQL · Creating…")).not.toBeInTheDocument();
    expect(screen.getByText("Real service")).toBeInTheDocument();

    await act(async () => Promise.resolve());

    rerender(
      <OptimisticProjectServices projectId="project-1" existingServices={[]}>
        {null}
      </OptimisticProjectServices>,
    );

    expect(screen.queryByText("PostgreSQL · Creating…")).not.toBeInTheDocument();
    expect(screen.getByText("No services in this project.")).toBeInTheDocument();
  });

  it("removes the pending card when creation fails", () => {
    render(
      <OptimisticProjectServices projectId="project-1" existingServices={[]}>
        {null}
      </OptimisticProjectServices>,
    );

    act(() => {
      notifyProjectServiceCreation({
        phase: "started",
        service: {
          requestId: "request-2",
          projectId: "project-1",
          matchName: "redis",
          displayName: "Redis",
          typeLabel: "Redis",
        },
      });
      notifyProjectServiceCreation({
        phase: "failed",
        requestId: "request-2",
        projectId: "project-1",
      });
    });

    expect(screen.queryByText("redis")).not.toBeInTheDocument();
    expect(screen.getByText("No services in this project.")).toBeInTheDocument();
  });
});
