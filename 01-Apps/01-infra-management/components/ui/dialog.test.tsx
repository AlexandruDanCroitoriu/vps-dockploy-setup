// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppDialog } from "./dialog";

describe("AppDialog", () => {
  it("renders its accessible title, description, body, actions, and footer", () => {
    render(
      <AppDialog
        open
        onClose={vi.fn()}
        title="Example dialog"
        description="Helpful context"
        headerActions={<button>Header action</button>}
        footer={<button>Save</button>}
      >
        <p>Dialog body</p>
      </AppDialog>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Example dialog" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Helpful context")).toBeInTheDocument();
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Header action" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("calls onClose from the shared close button", () => {
    const onClose = vi.fn();
    render(
      <AppDialog open onClose={onClose} title="Closable">
        <p>Body</p>
      </AppDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
