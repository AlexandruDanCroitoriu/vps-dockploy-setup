// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  notifyProjectServiceCreation,
  notifyProjectServiceDeleted,
} from "@/lib/project-events";
import {
  OptimisticProjectServices,
  OptimisticServiceVisibilityGuard,
} from "./optimistic-project-services";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("OptimisticProjectServices", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
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
    expect(
      screen.queryByText("PostgreSQL · Creating…"),
    ).not.toBeInTheDocument();

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

    expect(
      screen.queryByText("PostgreSQL · Creating…"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Real service")).toBeInTheDocument();

    await act(async () => Promise.resolve());

    rerender(
      <OptimisticProjectServices projectId="project-1" existingServices={[]}>
        {null}
      </OptimisticProjectServices>,
    );

    expect(
      screen.queryByText("PostgreSQL · Creating…"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No services in this project."),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText("No services in this project."),
    ).toBeInTheDocument();
  });

  it("shows the empty state immediately when the final service is deleted", () => {
    render(
      <OptimisticProjectServices
        projectId="project-1"
        existingServices={[
          { id: "compose-1", name: "Garage with UI", type: "compose" },
        ]}
      >
        <p>Real service</p>
      </OptimisticProjectServices>,
    );

    expect(
      screen.queryByText("No services in this project."),
    ).not.toBeInTheDocument();

    act(() => notifyProjectServiceDeleted("project-1", "compose-1"));

    expect(
      screen.getByText("No services in this project."),
    ).toBeInTheDocument();
  });

  it("hides a newly created optimistic service after it is deleted", () => {
    render(
      <OptimisticProjectServices projectId="project-1" existingServices={[]}>
        {null}
      </OptimisticProjectServices>,
    );

    act(() => {
      notifyProjectServiceCreation({
        phase: "started",
        service: {
          requestId: "request-garage",
          projectId: "project-1",
          matchName: "Garage with UI",
          displayName: "Garage with UI",
          typeLabel: "Compose",
          serviceType: "compose",
        },
      });
      notifyProjectServiceCreation({
        phase: "completed",
        requestId: "request-garage",
        projectId: "project-1",
        serviceId: "compose-garage",
      });
    });
    expect(screen.getByText("Garage with UI")).toBeInTheDocument();

    act(() => notifyProjectServiceDeleted("project-1", "compose-garage"));

    expect(screen.queryByText("Garage with UI")).not.toBeInTheDocument();
    expect(
      screen.getByText("No services in this project."),
    ).toBeInTheDocument();
  });

  it("shows the live status while the project snapshot catches up", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "running",
        appName: "compose-dbgate",
        env: "DATABASE_URL=postgres://db",
        credentials: [],
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
      expect(
        screen.getByRole("button", { name: "Settings for DBGate" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Compose · Running")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /dbgate\.example\.com/ }),
    ).toHaveAttribute("href", "https://dbgate.example.com");
    expect(
      screen.getByRole("button", { name: "Settings for DBGate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Edit variables for DBGate",
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/dokploy/projects/project-1/services/compose/compose-1",
    );
  });

  it("opens an optimistically created Vendure backend at its dashboard", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "running",
        appName: "vendure",
        env: "APP_ENV=production",
        credentials: [],
        domains: [
          {
            domainId: "domain-vendure",
            host: "vendure.example.com",
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
          requestId: "request-vendure",
          projectId: "project-1",
          matchName: "vendure",
          displayName: "Vendure",
          typeLabel: "Application",
          serviceType: "applications",
        },
      });
      notifyProjectServiceCreation({
        phase: "completed",
        requestId: "request-vendure",
        projectId: "project-1",
        serviceId: "application-vendure",
      });
    });

    expect(
      await screen.findByRole("link", { name: /vendure\.example\.com/ }),
    ).toHaveAttribute("href", "https://vendure.example.com/dashboard");
  });

  it("hides a streamed real card until it atomically replaces its optimistic card", () => {
    const service = { id: "compose-1", name: "Portainer", type: "compose" };
    const { rerender } = render(
      <OptimisticProjectServices projectId="project-1" existingServices={[]}>
        <OptimisticServiceVisibilityGuard service={service}>
          <p>Real Portainer</p>
        </OptimisticServiceVisibilityGuard>
      </OptimisticProjectServices>,
    );

    act(() => {
      notifyProjectServiceCreation({
        phase: "started",
        service: {
          requestId: "request-portainer",
          projectId: "project-1",
          matchName: "Portainer",
          displayName: "Portainer",
          typeLabel: "Compose",
          serviceType: "compose",
        },
      });
    });

    expect(screen.getByText("Portainer")).toBeInTheDocument();
    expect(screen.queryByText("Real Portainer")).not.toBeInTheDocument();

    rerender(
      <OptimisticProjectServices
        projectId="project-1"
        existingServices={[service]}
      >
        <OptimisticServiceVisibilityGuard service={service}>
          <p>Real Portainer</p>
        </OptimisticServiceVisibilityGuard>
      </OptimisticProjectServices>,
    );

    expect(screen.queryByText("Compose · Creating…")).not.toBeInTheDocument();
    expect(screen.getByText("Real Portainer")).toBeInTheDocument();
  });
});
