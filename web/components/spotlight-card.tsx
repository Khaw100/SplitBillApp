"use client";

import { useRef, type ReactNode } from "react";

/**
 * Spotlight card — pointer-tracked radial glow with a gradient hairline border.
 * Pattern from 21st.dev "Spotlight Card" (easemize), reimplemented dependency
 * free so it stays cheap on mobile.
 */
export function SpotlightCard({
  children,
  className = "",
  glow = "rgba(59,130,246,0.16)",
  radius = 320,
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "-999px");
    el.style.setProperty("--my", "-999px");
  };

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      className={`spotlight ${className}`}
      style={
        {
          "--spot-glow": glow,
          "--spot-size": `${radius}px`,
          "--mx": "-999px",
          "--my": "-999px",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
