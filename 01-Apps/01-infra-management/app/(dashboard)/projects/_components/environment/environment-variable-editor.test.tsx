// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockEditor({ value }: { value: string }) {
      return (
        <textarea aria-label="Environment document" value={value} readOnly />
      );
    },
}));
vi.mock("../../_actions/projects", () => ({ updateProjectEnvAction: vi.fn() }));
vi.mock("../../_actions/services", () => ({ updateServiceEnvAction: vi.fn() }));

import { EnvironmentVariableEditor } from "./environment-variable-editor";

afterEach(cleanup);

describe("EnvironmentVariableEditor", () => {
  it("renders the inline editor with its initial environment document", () => {
    render(
      <EnvironmentVariableEditor
        target="project"
        targetId="project-1"
        targetName="Infra"
        initialValue="PORT=3000"
        inline
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Environment variables" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Environment document")).toHaveValue(
      "PORT=3000",
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });

  it("adopts a refreshed project environment document", async () => {
    const { rerender } = render(
      <EnvironmentVariableEditor
        target="project"
        targetId="project-1"
        targetName="Infra"
        initialValue="APP_ENV=production"
        inline
      />,
    );

    rerender(
      <EnvironmentVariableEditor
        target="project"
        targetId="project-1"
        targetName="Infra"
        initialValue={'APP_ENV=production\nPOSTGRES_HOST="postgres-internal"'}
        inline
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Environment document")).toHaveValue(
        'APP_ENV=production\nPOSTGRES_HOST="postgres-internal"',
      ),
    );
  });
});
