"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export function useClickOutside<T extends HTMLElement>(
  active: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    function handlePointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [active, setOpen]);

  return ref;
}
