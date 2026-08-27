// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../_actions/dokploy-instances", () => ({
  createDokployInstanceAction: vi.fn(),
  verifyRootDomainIpAction: vi.fn(),
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
      (screen.getByLabelText(/Cloudflare IP address/) as HTMLInputElement)
        .value,
    ).toBe("203.0.113.10");
    expect(
      (screen.getByLabelText(/Cloudflare IP address/) as HTMLInputElement)
        .readOnly,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Root domain") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Cloudflare IP address/) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText(
        "The domain cannot be changed after the instance is created.",
      ),
    ).toBeTruthy();
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
    ).toBe(true);
    expect(
      (screen.getByLabelText("Default email") as HTMLInputElement).readOnly,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Default password") as HTMLInputElement).readOnly,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Copy default password" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Show default password" }),
    );
    expect(
      screen.getByRole("button", { name: "Hide default password" }),
    ).toBeTruthy();
  });

  it("uses admin service defaults when adding an instance", () => {
    render(<DokployInstanceForm instance={null} />);
    expect(
      screen.getByRole("button", { name: "Add new instance" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Save the instance to enable the first setup step."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("switch", {
          name: "Continue setup automatically",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: "Run" })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
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

  it("selects a Cloudflare domain and uses its apex IP", () => {
    render(
      <DokployInstanceForm
        instance={null}
        cloudflareDomains={[
          { name: "example.com", ipAddress: "203.0.113.10" },
          { name: "missing.example", ipAddress: "" },
        ]}
      />,
    );

    const domain = screen.getByLabelText("Root domain") as HTMLSelectElement;
    expect(domain.tagName).toBe("SELECT");
    expect(
      (
        screen.getByRole("option", {
          name: /missing\.example/,
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(true);

    fireEvent.change(domain, { target: { value: "example.com" } });

    expect(
      (screen.getByLabelText("Cloudflare IP address") as HTMLInputElement)
        .value,
    ).toBe("203.0.113.10");
    const ipLink = screen.getByRole("link", {
      name: "Open Dockploy using IP address",
    });
    expect(ipLink.getAttribute("href")).toBe("http://203.0.113.10:3000");
    expect(ipLink.getAttribute("target")).toBe("_blank");

    const domainLink = screen.getByRole("link", {
      name: "Open Dockploy using domain",
    });
    expect(domainLink.getAttribute("href")).toBe(
      "https://dockploy.example.com",
    );
    expect(domainLink.getAttribute("target")).toBe("_blank");
  });

  it("shows sequential manual setup controls for a saved instance", () => {
    render(
      <DokployInstanceForm
        instance={{
          id: "instance-1",
          name: "Production",
          rootUrl: "https://dockploy.example.com",
          rootDomain: "example.com",
          vpsIp: "203.0.113.10",
          apiKey: "",
          defaultServiceUsername: "admin@example.com",
          defaultServicePassword: "password",
        }}
        provisioningJob={{
          id: "job-1",
          instanceId: "instance-1",
          name: "Production",
          rootUrl: "https://dockploy.example.com",
          rootDomain: "example.com",
          vpsIp: "203.0.113.10",
          apiKey: "",
          defaultServiceUsername: "admin@example.com",
          defaultServicePassword: "password",
          status: "waiting",
          steps: {},
          logs: {},
          error: "",
          updatedAt: new Date().toISOString(),
        }}
      />,
    );
    expect(
      screen.getByRole("switch", { name: "Continue setup automatically" }),
    ).toBeTruthy();
    const runButtons = screen.getAllByRole("button", { name: "Run" });
    expect(runButtons).toHaveLength(7);
    expect((runButtons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((runButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps completed setup tasks and logs beside the editable instance", () => {
    const completedSteps = Object.fromEntries(
      [
        "updating",
        "installing",
        "administrator",
        "domain",
        "api-key",
        "main-project",
        "zot",
      ].map((step) => [step, "done"]),
    );
    render(
      <DokployInstanceForm
        instance={{
          id: "instance-1",
          name: "Production",
          rootUrl: "https://dockploy.example.com",
          rootDomain: "example.com",
          vpsIp: "203.0.113.10",
          apiKey: "api-key",
          defaultServiceUsername: "admin@example.com",
          defaultServicePassword: "password",
        }}
        provisioningJob={{
          id: "job-1",
          instanceId: "instance-1",
          name: "Production",
          rootUrl: "https://dockploy.example.com",
          rootDomain: "example.com",
          vpsIp: "203.0.113.10",
          apiKey: "api-key",
          defaultServiceUsername: "admin@example.com",
          defaultServicePassword: "password",
          status: "complete",
          steps: completedSteps,
          logs: { zot: ["Deployment queued."] },
          error: "",
          updatedAt: new Date().toISOString(),
        }}
      />,
    );
    expect(
      screen.getByText(
        "Setup completed. Review the status and logs for each step.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Completed" })).toHaveLength(
      7,
    );
    const saveButton = screen.getByRole("button", {
      name: "Save changes",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed production" },
    });
    expect(saveButton.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production" },
    });
    expect(saveButton.disabled).toBe(true);
    expect(screen.getByText("Deployment queued.")).toBeTruthy();
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
