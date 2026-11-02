"use client";

import { Prohibit, ShieldCheck, Warning } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { recordOutcome } from "@/lib/api";
import { THEFT_STYLES } from "@/lib/format";

const UNKNOWN = "unknown";

/** Writes an inspection result. Today in IST is used if the date is left empty. */
export function OutcomeDialog({ meterId, children }: { meterId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<boolean | null>(null);
  const [style, setStyle] = useState(UNKNOWN);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    if (found == null) return;
    setSaving(true);
    setProblem(null);
    try {
      await recordOutcome({
        meter_id: meterId,
        theft_found: found,
        inspected_on: date || undefined,
        theft_style: found && style !== UNKNOWN ? style : null,
        notes: notes.trim() || null,
      });
      setOpen(false);
      setFound(null);
      setNotes("");
      setDate("");
      setStyle(UNKNOWN);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sheet gap-4 rounded-none ring-0 sm:max-w-md">
        <div>
          <p className="plate">Inspection result</p>
          <DialogTitle className="display text-4xl">{meterId}</DialogTitle>
          <DialogDescription className="text-ink-2">What did the inspector find at this meter?</DialogDescription>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="press !min-h-14" data-tone={found === true ? "ink" : undefined} onClick={() => setFound(true)}>
            <Warning size={18} weight="bold" aria-hidden />
            Theft found
          </button>
          <button type="button" className="press !min-h-14" data-tone={found === false ? "ink" : undefined} onClick={() => setFound(false)}>
            <ShieldCheck size={18} weight="bold" aria-hidden />
            All clear
          </button>
        </div>
        {found && (
          <label className="block">
            <span className="plate mb-1 block">Theft style</span>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger className="w-full rounded-none border-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value={UNKNOWN}>Not known</SelectItem>
                {THEFT_STYLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <label className="block">
          <span className="plate mb-1 block">Inspected on (empty means today)</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="num w-full border border-foreground bg-transparent px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="plate mb-1 block">Notes</span>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded-none border-foreground bg-transparent" />
        </label>
        {problem && (
          <p role="alert" className="flex items-center gap-2 text-sm text-signal">
            <Prohibit size={15} weight="bold" aria-hidden />
            {problem}
          </p>
        )}
        <button type="button" className="press w-full" data-tone="ink" disabled={found == null || saving} onClick={save}>
          {saving ? "Saving" : "Save result"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
