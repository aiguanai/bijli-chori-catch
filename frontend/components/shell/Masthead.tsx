"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { BreakerIcon, ClipboardCheckIcon, FuseIcon, MeterIcon, WaveIcon } from "@/components/icons";
import { Tour } from "@/components/shell/Tour";
import { useStatus } from "@/lib/api";
import { formatDay } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Meters", Icon: MeterIcon },
  { href: "/plan", label: "Inspection list", Icon: ClipboardCheckIcon },
  { href: "/ledger", label: "Results", Icon: FuseIcon },
  { href: "/system", label: "How it works", Icon: WaveIcon },
];

function isActive(href: string, path: string) {
  if (href === "/") return path === "/" || path.startsWith("/meters");
  return path.startsWith(href);
}

/** The navigation hangs off a power line: each page is a pole, the wire sags between them. */
function PowerLine({ points, width }: { points: number[]; width: number }) {
  const all = [0, ...points, width];
  const SAG = 13;
  const span = (from: number, to: number) => `M${from} 3Q${(from + to) / 2} ${3 + SAG * 2} ${to} 3`;
  const whole = all.slice(1).reduce((path, x, index) => `${path}Q${(all[index] + x) / 2} ${3 + SAG * 2} ${x} 3`, `M0 3`);
  return (
    <svg width={width} height={22} className="pointer-events-none absolute left-0 top-0" aria-hidden>
      {all.slice(1).map((x, index) => (
        <path key={index} d={span(all[index], x)} fill="none" stroke="var(--foreground)" strokeWidth="1" />
      ))}
      <path d={whole} fill="none" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" className="wire-pulse" />
      {points.map((x) => (
        <rect key={x} x={x - 3} y={0} width={6} height={6} fill="var(--foreground)" />
      ))}
    </svg>
  );
}

function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function ThemeSwitch() {
  const night = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  function toggle() {
    const next = !night;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("shift", next ? "night" : "day");
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={night ? "Switch to day shift" : "Switch to night shift"}
      className="plate flex cursor-pointer items-center gap-1.5 hover:text-foreground"
    >
      {night ? <Sun size={14} weight="bold" aria-hidden /> : <Moon size={14} weight="bold" aria-hidden />}
      {night ? "Day shift" : "Night shift"}
    </button>
  );
}

export function Masthead() {
  const path = usePathname();
  const { data: status } = useStatus();
  const navRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ width: 0, points: [] as number[] });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const box = nav.getBoundingClientRect();
      const anchors = [...nav.querySelectorAll<HTMLElement>("[data-pole]")];
      setGeometry({
        width: box.width,
        points: anchors.map((anchor) => {
          const rect = anchor.getBoundingClientRect();
          return Math.round(rect.left + rect.width / 2 - box.left);
        }),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  const demo = status?.model_version?.startsWith("fake");

  return (
    <header className="border-b-2 border-foreground">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-x-8 gap-y-2 px-4 pt-4 md:px-8">
        <Link href="/" className="flex items-baseline gap-3" aria-label="BijliChori home">
          <span lang="hi" className="font-deva text-[28px] font-bold leading-none tracking-tight">
            बिजली चोरी
          </span>
          <span className="plate hidden sm:inline">Electricity theft detection</span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {demo && (
            <span className="plate flex items-center gap-1.5 !text-amber" title="Scores come from the fake seed until the Flink job is live">
              <BreakerIcon size={14} />
              Demo scores
            </span>
          )}
          <span className="plate">
            Data to <span className="text-foreground">{status?.latest_scored_at ? formatDay(status.latest_scored_at) : "..."}</span>
          </span>
          <span className="plate">
            Model <span className="text-foreground">{status?.model_version ?? "..."}</span>
          </span>
          <ThemeSwitch />
          <Tour />
        </div>
      </div>
      <nav ref={navRef} aria-label="Main" className="relative mx-auto mt-3 max-w-[1500px] overflow-hidden px-4 md:px-8">
        {geometry.width > 0 && <PowerLine {...geometry} />}
        <ul className="flex gap-1 sm:gap-2">
          {LINKS.map(({ href, label, Icon }) => {
            const active = isActive(href, path);
            return (
              <li key={href} data-pole className="flex-1 sm:flex-none">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`mt-5 flex flex-col items-center gap-1 border-[1.5px] border-b-0 border-foreground px-3 py-1.5 text-center transition-colors sm:min-w-[132px] ${active ? "bg-foreground text-card" : "bg-card hover:bg-secondary"}`}
                >
                  <Icon size={22} strokeWidth={active ? 2 : 1.5} />
                  <span className="text-[13px] font-medium leading-tight">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
