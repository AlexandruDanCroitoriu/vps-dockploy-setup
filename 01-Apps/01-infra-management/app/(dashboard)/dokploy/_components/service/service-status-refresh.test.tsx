// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceStatusRefresh } from "./service-status-refresh";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("ServiceStatusRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps only one refresh in flight and stops afterward", () => {
    const { rerender } = render(<ServiceStatusRefresh active />);

    act(() => vi.advanceTimersByTime(4_000));
    expect(refresh).toHaveBeenCalledOnce();

    rerender(<ServiceStatusRefresh active={false} />);
    act(() => vi.advanceTimersByTime(4_000));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
