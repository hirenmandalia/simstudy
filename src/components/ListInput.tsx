"use client";

import { inputClass } from "./ui";

/** Edit a string[] as one item per line. */
export function ListInput({ value, onChange, rows = 3, placeholder }: { value: string[]; onChange: (v: string[]) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      className={inputClass}
      rows={rows}
      placeholder={placeholder ?? "One item per line"}
      defaultValue={value.join("\n")}
      onChange={(e) =>
        onChange(
          e.target.value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

export function idsInput(value: string[], onChange: (v: string[]) => void) {
  return (
    <input
      className={inputClass}
      defaultValue={value.join(", ")}
      placeholder="RQ1, RQ2"
      onChange={(e) =>
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  );
}
