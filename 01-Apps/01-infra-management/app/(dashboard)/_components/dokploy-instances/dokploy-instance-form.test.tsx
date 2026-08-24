// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../_actions/dokploy-instances", () => ({
  createDokployInstanceAction: vi.fn(),
  resolveDokployVpsIpAction: vi.fn(),
  updateDokployInstanceAction: vi.fn(),
}));

import { DokployInstanceForm } from "./dokploy-instance-form";

afterEach(cleanup);

describe("DokployInstanceForm", () => {
  it("shows instance values and default service credentials in edit mode", () => {
    render(
      <DokployInstanceForm
        instance={{
          id: "instance-1",
          name: "Production",
          rootUrl: "https://dockploy.example.com",
          rootDomain: "example.com",
          vpsIp: "203.0.113.10",
          apiKey: "api-key",
          defaultServiceUsername: "service-user",
          defaultServicePassword: "service-password",
        }}
      />,
    );

    expect(screen.getByText("Default service credentials")).toBeTruthy();
    expect(
      (screen.getByLabelText(/VPS IP address/) as HTMLInputElement).value,
    ).toBe("203.0.113.10");
    expect(
      (screen.getByLabelText(/VPS IP address/) as HTMLInputElement).readOnly,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Default email") as HTMLInputElement).value,
    ).toBe("service-user");
    expect(
      (screen.getByLabelText("Default password") as HTMLInputElement).value,
    ).toBe("service-password");
    expect(
      (screen.getByLabelText("API/CLI key") as HTMLInputElement).value,
    ).toBe("api-key");
    expect(
      (screen.getByLabelText("API/CLI key") as HTMLInputElement).readOnly,
    ).toBe(false);
  });

  it("uses admin service defaults when adding an instance", () => {
    render(<DokployInstanceForm instance={null} />);
    expect(screen.getByRole("button", { name: "Copy all logs" })).toBeTruthy();
    expect(screen.getAllByLabelText(/^Copy .* logs$/)).toHaveLength(9);
    expect(
      (screen.getByLabelText("Default email") as HTMLInputElement).value,
    ).toBe("admin");
    expect(
      (screen.getByLabelText("Default password") as HTMLInputElement).value,
    ).toBe("admin");
    expect(
      (screen.getByLabelText("API/CLI key") as HTMLInputElement).readOnly,
    ).toBe(true);
  });

  it("uses environment-backed defaults when adding an instance", () => {
    render(
      <DokployInstanceForm
        instance={null}
        newInstanceDefaults={{
          username: "infra@example.com",
          password: "environment-password",
        }}
      />,
    );
    expect(
      (screen.getByLabelText("Default email") as HTMLInputElement).value,
    ).toBe("infra@example.com");
    expect(
      (screen.getByLabelText("Default password") as HTMLInputElement).value,
    ).toBe("environment-password");
  });
});
