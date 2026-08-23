// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyProjectServiceCreation } from "@/lib/project-events";
import { OptimisticProjectServices } from "./optimistic-project-services";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("OptimisticProjectServices", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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
          serviceType: "postgres",
        },
      });
    });

    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL · Creating…")).toBeInTheDocument();

    rerender(
      <OptimisticProjectServices
        projectId="project-1"
        existingServices={[
          { id: "database-1", name: "Normalized PostgreSQL", type: "postgres" },
        ]}
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
          serviceType: "redis",
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

  it("shows the live status while the project snapshot catches up", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "running",
        domains: [
          {
            domainId: "domain-1",
            host: "dbgate.example.com",
            https: true,
          },
        ],
      }),
    } as Response);
    render(
      <OptimisticProjectServices projectId="project-1" existingServices={[]}>
        {null}
      </OptimisticProjectServices>,
    );

    act(() => {
      notifyProjectServiceCreation({
        phase: "started",
        service: {
          requestId: "request-dbgate",
          projectId: "project-1",
          matchName: "DBGate",
          displayName: "DBGate",
          typeLabel: "Compose",
          serviceType: "compose",
        },
      });
      notifyProjectServiceCreation({
        phase: "completed",
        requestId: "request-dbgate",
        projectId: "project-1",
        serviceId: "compose-1",
      });
    });

    await waitFor(() =>
      expect(screen.getByText("Compose · Running")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /dbgate\.example\.com/ })).toHaveAttribute(
      "href",
      "https://dbgate.example.com",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/dokploy/projects/project-1/services/compose/compose-1",
    );
  });
});
