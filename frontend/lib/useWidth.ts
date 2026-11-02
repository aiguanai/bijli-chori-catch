import { useCallback, useState } from "react";

/** Callback ref that tracks an element's width, for charts drawn in real pixels. */
export function useWidth<T extends HTMLElement>(initial = 0) {
  const [width, setWidth] = useState(initial);
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
