"use client";

import { useEffect, useRef } from "react";

/** Debounce a callback; flushes pending call on unmount. */
export function useDebouncedCallback<T extends unknown[]>(
  fn: (...args: T) => void | Promise<void>,
  delayMs: number
): (...args: T) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (...args: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void fnRef.current(...args);
    }, delayMs);
  };
}
