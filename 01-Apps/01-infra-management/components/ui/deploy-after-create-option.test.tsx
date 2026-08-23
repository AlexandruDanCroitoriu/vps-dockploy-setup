// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeployAfterCreateOption } from "./deploy-after-create-option";

afterEach(cleanup);

describe("DeployAfterCreateOption", () => {
  it("submits the shared field and supports a checked default", () => {
    render(
      <DeployAfterCreateOption
        defaultChecked
        description="Start immediately."
      />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: /Deploy automatically after creation/i,
    });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(checkbox.getAttribute("name")).toBe("deployAfterCreate");
    expect(screen.getByText("Start immediately.")).toBeTruthy();
  });
});
