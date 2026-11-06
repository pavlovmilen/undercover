import type { ReactNode } from "react";

export function Pill({
  tone,
  children,
}: Readonly<{ tone: string; children: ReactNode }>) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
