"use client"

import { useState } from "react"
import { IconCalendar, IconCheck } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DateFilterMode = "24h" | "7d" | "30d" | "custom"

export interface DateFilterValue {
  mode: DateFilterMode
  from?: string // YYYY-MM-DD
  to?: string   // YYYY-MM-DD
}

interface DateRangeFilterProps {
  value: DateFilterValue
  onChange: (v: DateFilterValue) => void
  disabled?: boolean
}

const MODES: { value: DateFilterMode; label: string }[] = [
  { value: "24h",    label: "24h"        },
  { value: "7d",     label: "7 dias"     },
  { value: "30d",    label: "30 dias"    },
  { value: "custom", label: "Personalizado" },
]

// Today's date formatted as YYYY-MM-DD (local)
function todayStr() {
  return new Date().toISOString().split("T")[0]
}

// N days ago as YYYY-MM-DD
function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

export function DateRangeFilter({ value, onChange, disabled }: DateRangeFilterProps) {
  // Internal draft state for custom date inputs (only committed on "Aplicar")
  const [draft, setDraft] = useState({
    from: value.from ?? daysAgoStr(7),
    to:   value.to   ?? todayStr(),
  })

  function selectMode(mode: DateFilterMode) {
    if (mode === "custom") {
      // Just switch to custom mode; don't call onChange yet (wait for Aplicar)
      onChange({ mode: "custom", from: draft.from, to: draft.to })
    } else {
      onChange({ mode })
    }
  }

  function applyCustom() {
    if (!draft.from || !draft.to) return
    if (draft.from > draft.to) return
    onChange({ mode: "custom", from: draft.from, to: draft.to })
  }

  const isCustom = value.mode === "custom"
  const customValid = draft.from && draft.to && draft.from <= draft.to

  return (
    <div className="flex flex-col gap-2">
      {/* Segmented button group */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            disabled={disabled}
            onClick={() => selectMode(m.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              value.mode === m.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs (shown only when custom is active) */}
      {isCustom && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <IconCalendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">De:</label>
            <input
              type="date"
              value={draft.from}
              max={draft.to || todayStr()}
              disabled={disabled}
              onChange={(e) => setDraft((p) => ({ ...p, from: e.target.value }))}
              className={cn(
                "h-7 rounded-md border border-input bg-background px-2 text-xs",
                "text-foreground focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-50 cursor-pointer",
              )}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Até:</label>
            <input
              type="date"
              value={draft.to}
              min={draft.from}
              max={todayStr()}
              disabled={disabled}
              onChange={(e) => setDraft((p) => ({ ...p, to: e.target.value }))}
              className={cn(
                "h-7 rounded-md border border-input bg-background px-2 text-xs",
                "text-foreground focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-50 cursor-pointer",
              )}
            />
          </div>

          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={disabled || !customValid}
            onClick={applyCustom}
            className="h-7 gap-1 px-2.5 text-xs"
          >
            <IconCheck className="h-3.5 w-3.5" />
            Aplicar
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Utility: convert DateFilterValue → API query string ────────────────────

export function filterToParams(f: DateFilterValue): URLSearchParams {
  const p = new URLSearchParams()
  if (f.mode === "24h") {
    p.set("hours", "24")
  } else if (f.mode === "custom" && f.from && f.to) {
    p.set("from", f.from)
    p.set("to", f.to)
  } else {
    const days = f.mode === "7d" ? "7" : "30"
    p.set("days", days)
  }
  return p
}
