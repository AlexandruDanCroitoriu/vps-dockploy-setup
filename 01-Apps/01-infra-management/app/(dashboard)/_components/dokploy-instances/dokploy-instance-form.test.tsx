// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../_actions/dokploy-instances", () => ({
  createDokployInstanceAction: vi.fn(),
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
          apiKey: "api-key",
          defaultServiceUsername: "service-user",
          defaultServicePassword: "service-password",
        }}
      />,
    );

    expect(screen.getByText("Default service credentials")).toBeTruthy();
    expect(
      (screen.getByLabelText("Default username") as HTMLInputElement).value,
    ).toBe("service-user");
    expect(
      (screen.getByLabelText("Default password") as HTMLInputElement).value,
    ).toBe("service-password");
    expect(
      (screen.getByLabelText("API/CLI key") as HTMLInputElement).value,
    ).toBe("api-key");
  });

  it("uses admin service defaults when adding an instance", () => {
    render(<DokployInstanceForm instance={null} />);
    expect(
      (screen.getByLabelText("Default username") as HTMLInputElement).value,
    ).toBe("admin");
    expect(
      (screen.getByLabelText("Default password") as HTMLInputElement).value,
    ).toBe("admin");
  });
});
