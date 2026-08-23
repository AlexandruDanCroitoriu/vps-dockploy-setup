// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useClickOutside } from "./use-click-outside";

function DropdownHarness() {
  const [open, setOpen] = useState(true);
  const ref = useClickOutside<HTMLDivElement>(open, setOpen);
  return (
    <>
      <div ref={ref}>
        <button type="button">Inside</button>
        {open && <span>Menu</span>}
      </div>
      <button type="button">Outside</button>
    </>
  );
}

afterEach(cleanup);

describe("useClickOutside", () => {
  it("keeps a dropdown open for inside clicks", () => {
    render(<DropdownHarness />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Inside" }));
    expect(screen.getByText("Menu")).toBeTruthy();
  });

  it("closes a dropdown for outside clicks", () => {
    render(<DropdownHarness />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByText("Menu")).toBeNull();
  });
});
