"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

const MIN_PANEL_PERCENT = 25;
const MAX_PANEL_PERCENT = 75;

export function ResizableEditorPanels({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(50);

  function resize(clientX: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    const percentage = ((clientX - bounds.left) / bounds.width) * 100;
    setLeftPercent(
      Math.min(MAX_PANEL_PERCENT, Math.max(MIN_PANEL_PERCENT, percentage)),
    );
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    resize(event.clientX);
  }

  return (
    <div
      ref={containerRef}
      className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[var(--left-panel)_0.75rem_minmax(0,1fr)] lg:gap-0 [&>section]:mt-0 [&>section]:max-w-none"
      style={{ "--left-panel": `${leftPercent}%` } as CSSProperties}
    >
      {left}
      <div
        role="separator"
        aria-label="Resize Compose and environment editors"
        aria-orientation="vertical"
        aria-valuemin={MIN_PANEL_PERCENT}
        aria-valuemax={MAX_PANEL_PERCENT}
        aria-valuenow={Math.round(leftPercent)}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            resize(event.clientX);
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -5 : 5;
          setLeftPercent((current) =>
            Math.min(
              MAX_PANEL_PERCENT,
              Math.max(MIN_PANEL_PERCENT, current + direction),
            ),
          );
        }}
        className="group relative hidden cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
      >
        <span className="h-16 w-1 rounded-full bg-gray-300 transition-colors group-hover:bg-indigo-400 dark:bg-white/15" />
      </div>
      {right}
    </div>
  );
}
