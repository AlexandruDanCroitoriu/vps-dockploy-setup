// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddComposeDialog } from "./add-compose-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("AddComposeDialog", () => {
  it("disables Zot when its instance-wide limit has been reached", () => {
    render(
      <AddComposeDialog
        projectId="project-1"
        environmentId="environment-1"
        definitions={[
          {
            id: "zot",
            name: "Zot",
            description: "OCI registry",
            supportsDomain: true,
            automaticDomain: true,
            httpsByDefault: true,
            domainRequired: false,
            requiresLoginCredentials: true,
            supportsGarageCapacity: false,
          },
        ]}
        rootDomain="example.com"
        defaultLoginCredentials={{ username: "admin", password: "secret" }}
        unavailableDefinitionIds={["zot"]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add Compose service" }),
    );

    const zotButton = screen.getByRole("button", { name: /Zot/ });
    expect(zotButton).toBeDisabled();
    expect(zotButton).toHaveTextContent(
      "Only one Zot service is allowed per Dokploy instance.",
    );
  });
});
