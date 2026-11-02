import type { ReactNode } from "react";

type BoxProps = {
  title: string;
  hint?: string;
  action?: ReactNode;
  tour?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/** One tool on the page: a bordered box whose title bar says what it is and how to use it. */
export function Box({ title, hint, action, tour, className = "", bodyClassName = "p-4", children }: BoxProps) {
  return (
    <section data-tour={tour} aria-label={title} className={`box ${className}`}>
      <header className="box-head">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          {hint && <p className="text-[13px] leading-snug text-ink-2">{hint}</p>}
        </div>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Top of every page: what this page is for, and the main thing to do from here. */
export function PageHeader({ title, summary, action }: { title: string; summary: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-foreground pb-3">
      <div className="min-w-0">
        <h1 className="display text-5xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-ink-2">{summary}</p>
      </div>
      {action}
    </div>
  );
}

/** A named control group, so a row of buttons always says what it changes. */
export function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </div>
  );
}
