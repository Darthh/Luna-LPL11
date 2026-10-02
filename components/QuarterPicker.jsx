"use client";

import { quarterLabel, reportDate } from "@/lib/hedgeFundFormat";

// Which quarter's 13F to read, on the list and on a manager's own page. Shared
// so the two can't offer different quarters or name the same one two ways.
//
// A radiogroup rather than a row of buttons: this is one choice with four
// options, and a screen reader that announces four unrelated buttons loses
// both that they're exclusive and which one is currently on. The exact quarter
// end is on the title, since "Q2 2026" is the readable name but the filing is
// as of a specific day.
export default function QuarterPicker({ periods, value, onChange, label }) {
  if (!periods?.length) return null;
  return (
    <div className="hf-toggle hf-quarters" role="radiogroup" aria-label={label}>
      {periods.map((p) => {
        const on = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? "on" : undefined}
            title={reportDate(p)}
            onClick={() => onChange(p)}
          >
            {quarterLabel(p)}
          </button>
        );
      })}
    </div>
  );
}
