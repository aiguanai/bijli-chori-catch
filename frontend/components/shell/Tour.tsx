"use client";

import { ArrowLeft, ArrowRight, Question, X } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Step = { target?: string; title: string; body: string };

const SEEN_KEY = "guide-seen";
const CARD_WIDTH = 340;
const CARD_HEIGHT = 210;
const GAP = 12;

const METERS: Step[] = [
  {
    title: "Welcome to BijliChori",
    body: "This tool helps you decide which homes to inspect for electricity theft each week. A model gives every meter a risk score from 0 to 1. A higher score means the usage looks more like theft. It is a reason to check, never proof.",
  },
  {
    target: "steps",
    title: "Your weekly job, in three steps",
    body: "This strip is on every page. It shows where you are and marks the step to do next. Click any step to go there.",
  },
  {
    target: "count",
    title: "The headline",
    body: "How many meters are at or above your alert level on the day shown.",
  },
  {
    target: "histogram",
    title: "Set your alert level",
    body: "Each bar is a group of meters with similar scores. Drag the black flag, or use the plus and minus buttons, to choose what counts as suspicious. This only changes your view here, not the inspection list.",
  },
  {
    target: "replay",
    title: "Go back in time",
    body: "Press Replay to watch 60 days of scores play out, or drag across the timeline to jump to one day. Meters whose score climbs steadily matter more than a one-day spike.",
  },
  {
    target: "wall",
    title: "Every meter is a dial",
    body: "Each dial is one home. The further right the needle, the higher the risk. A red dot means it is above your alert level. Click a dial to read it.",
  },
  {
    target: "inspector",
    title: "A closer look",
    body: "This shows the dial you clicked. Press See full history for everything we know about that meter.",
  },
];

const PLAN: Step[] = [
  {
    target: "slips",
    title: "Decide on each meter",
    body: "Each box is one suggested meter with its reason. Check the numbers in bold, then answer in the bar along the bottom. You get 5 seconds to undo.",
  },
  {
    target: "budget",
    title: "Weekly budget",
    body: "How many inspections you can afford each week. Drag round the knob to change it. The boxes below show how much is used.",
  },
  {
    target: "planner",
    title: "Make a new list",
    body: "AI agent studies each meter and writes a reason, which can take minutes. Top scores simply lists the highest scores. Either way, you still make the final decision.",
  },
];

const METER: Step[] = [
  {
    target: "summary",
    title: "One meter at a glance",
    body: "The score, how it compares with the city, and why it is on this week's list, if it is.",
  },
  {
    target: "tracks",
    title: "Its full history",
    body: "Every chart shares one time axis. Move your pointer across any chart to read all values for that day in the left column.",
  },
  {
    target: "peers",
    title: "Compared with neighbours",
    body: "Each dot is another meter in the same city, and the red dot is this one. Click a dot to open that meter.",
  },
  {
    target: "record",
    title: "After the inspection",
    body: "Press Record result to save what the inspector found. Results train the next version of the model.",
  },
];

const RESULTS: Step[] = [
  {
    title: "Inspection results",
    body: "Everything inspectors have reported. Hit rate is the share of inspections that found theft. To add one, approve a meter on the inspection list, then press Record result on its slip.",
  },
];

const SYSTEM: Step[] = [
  {
    target: "diagram",
    title: "How the system fits together",
    body: "Press any block to read what it does and why it is there. This page is for explaining the project. Nothing here changes any data.",
  },
];

function stepsFor(path: string) {
  if (path.startsWith("/plan")) return PLAN;
  if (path.startsWith("/meters")) return METER;
  if (path.startsWith("/ledger")) return RESULTS;
  if (path.startsWith("/system")) return SYSTEM;
  return METERS;
}

const find = (target?: string) => (target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null);

function placeCard(box: DOMRect | null) {
  const width = Math.min(CARD_WIDTH, window.innerWidth - 2 * GAP);
  if (!box) return { left: (window.innerWidth - width) / 2, top: Math.max(GAP, (window.innerHeight - CARD_HEIGHT) / 2), width };
  const left = Math.max(GAP, Math.min(box.left, window.innerWidth - width - GAP));
  if (box.bottom + GAP + CARD_HEIGHT < window.innerHeight) return { left, top: box.bottom + GAP, width };
  if (box.top - GAP - CARD_HEIGHT > 0) return { left, top: box.top - GAP - CARD_HEIGHT, width };
  return { left, top: window.innerHeight - CARD_HEIGHT - GAP, width };
}

/** Walks through the page with a spotlight on one thing at a time. */
export function Tour() {
  const path = usePathname();
  const [started, setStarted] = useState<{ index: number; path: string } | null>(null);
  // Leaving the page ends the guide: its targets are gone.
  const index = started?.path === path ? started.index : null;
  const setIndex = useCallback((next: number | null) => setStarted(next == null ? null : { index: next, path }), [path]);
  const [box, setBox] = useState<DOMRect | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const [available, setAvailable] = useState<Step[]>([]);
  const steps = useMemo(() => stepsFor(path), [path]);
  const step = index == null ? null : available[index];

  const start = useCallback(() => {
    // A target can be missing, such as the panel while data loads. Skip it, do not point at nothing.
    setAvailable(steps.filter((entry) => !entry.target || find(entry.target)));
    setIndex(0);
  }, [steps, setIndex]);

  const stop = useCallback(() => {
    setIndex(null);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }, [setIndex]);

  // Open once by itself, on the first visit, as soon as the first page has data.
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen || path !== "/") return;
    const timer = setInterval(() => {
      if (find("wall") && find("steps")) {
        clearInterval(timer);
        start();
      }
    }, 300);
    return () => clearInterval(timer);
  }, [path, start]);

  useLayoutEffect(() => {
    if (!step) return;
    const node = find(step.target);
    if (node) {
      const fits = node.getBoundingClientRect().height < window.innerHeight - CARD_HEIGHT - 2 * GAP;
      node.scrollIntoView({ block: fits ? "center" : "start" });
    }
    const measure = () => setBox(node?.getBoundingClientRect() ?? null);
    measure();
    nextButton.current?.focus();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  const move = useCallback(
    (by: number) => {
      if (index == null) return;
      if (index + by >= available.length) stop();
      else setIndex(Math.max(0, index + by));
    },
    [index, available.length, stop, setIndex],
  );

  // Captured first, so a key pressed in the guide can never approve a meter underneath it.
  useEffect(() => {
    if (index == null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Tab" || event.key === "Enter" || event.key === " ") return;
      event.stopPropagation();
      if (event.key === "Escape") stop();
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, move, stop]);

  const card = step ? placeCard(box) : null;

  return (
    <>
      <button type="button" className="press !min-h-8 !px-2.5" data-tone="ink" onClick={start}>
        <Question size={15} weight="bold" aria-hidden />
        Guide
      </button>
      {step &&
        card &&
        createPortal(
          <div className="fixed inset-0 z-[60]">
            {box ? (
              <div
                className="pointer-events-none fixed"
                style={{
                  left: box.left - 4,
                  top: Math.max(box.top - 4, 0),
                  width: box.width + 8,
                  height: Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0) + 8,
                  outline: "2px solid var(--signal)",
                  boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.55)",
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-black/55" />
            )}
            <div role="dialog" aria-label={step.title} className="sheet fixed flex flex-col gap-2 p-4" style={card}>
              <div className="flex items-center justify-between">
                <p className="plate">
                  Step {index! + 1} of {available.length}
                </p>
                <button type="button" aria-label="Close the guide" className="cursor-pointer text-ink-2 hover:text-foreground" onClick={stop}>
                  <X size={16} weight="bold" aria-hidden />
                </button>
              </div>
              <h2 className="text-lg font-semibold leading-tight">{step.title}</h2>
              <p className="text-sm leading-snug text-ink-2">{step.body}</p>
              <div className="mt-1 flex justify-between gap-2">
                <button type="button" className="press !min-h-9" disabled={index === 0} onClick={() => move(-1)}>
                  <ArrowLeft size={14} weight="bold" aria-hidden />
                  Back
                </button>
                <button ref={nextButton} type="button" className="press !min-h-9" data-tone="ink" onClick={() => move(1)}>
                  {index === available.length - 1 ? "Done" : "Next"}
                  <ArrowRight size={14} weight="bold" aria-hidden />
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
