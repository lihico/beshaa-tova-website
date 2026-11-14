import type { ReactNode } from "react";
import { trackSectionView, useSeenOnce } from "@/lib/behavior";

/** Wraps a page block and reports once when it is on screen (M2). No layout of its own. */
export function TrackSection({ name, page = "home", children }: { name: string; page?: string; children: ReactNode }) {
  const ref = useSeenOnce<HTMLDivElement>(() => trackSectionView(name, page), 0.25);
  return <div ref={ref} data-section={name}>{children}</div>;
}
