"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./DateRangeBar.module.css";

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

interface DateRangeBarProps {
  columns: ColumnDef[];
}

function isDateLike(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes("timestamp") || t === "date" || t.includes("time");
}

function pickTargetColumn(columns: ColumnDef[]): string | null {
  const preferred = columns.find((c) => c.name === "created_time" && isDateLike(c.type));
  if (preferred) return preferred.name;
  const anyDate = columns.find((c) => isDateLike(c.type));
  return anyDate?.name ?? null;
}

function formatColumnName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// Reverse "YYYY-MM-DD HH:mm:ss" back to the datetime-local input format.
function toInputValue(raw: string): string {
  if (!raw) return "";
  const s = raw.replace(" ", "T");
  return s.length >= 16 ? s.slice(0, 16) : s;
}

// Normalize "YYYY-MM-DDTHH:mm" to "YYYY-MM-DD HH:mm:00" for Postgres.
function normalize(v: string): string {
  if (!v) return "";
  return v.replace("T", " ") + (v.length === 16 ? ":00" : "");
}

export default function DateRangeBar({ columns }: DateRangeBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const targetColumn = useMemo(() => pickTargetColumn(columns), [columns]);

  // Read currently-applied range for the target column from the URL.
  const applied = useMemo(() => {
    if (!targetColumn) return { start: "", end: "" };
    for (const raw of searchParams.getAll("colRange")) {
      const segs = raw.split("|");
      if (segs.length < 3) continue;
      if (segs[0] === targetColumn) {
        return { start: segs[1] || "", end: segs[2] || "" };
      }
    }
    return { start: "", end: "" };
  }, [searchParams, targetColumn]);

  const [start, setStart] = useState(() => toInputValue(applied.start));
  const [end, setEnd] = useState(() => toInputValue(applied.end));

  // Re-sync local state when the URL changes (e.g. via Clear all chip)
  useEffect(() => {
    setStart(toInputValue(applied.start));
    setEnd(toInputValue(applied.end));
  }, [applied.start, applied.end]);

  if (!targetColumn) return null;

  const isDirty =
    normalize(start) !== applied.start || normalize(end) !== applied.end;
  const isActive = Boolean(applied.start || applied.end);

  const pushRange = (s: string, e: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const existing = params.getAll("colRange");
    params.delete("colRange");
    for (const raw of existing) {
      const segs = raw.split("|");
      if (segs.length < 3) continue;
      if (segs[0] !== targetColumn) params.append("colRange", raw);
    }
    if (s || e) {
      params.append("colRange", `${targetColumn}|${s ? normalize(s) : ""}|${e ? normalize(e) : ""}`);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleApply = () => pushRange(start, end);
  const handleClear = () => {
    setStart("");
    setEnd("");
    pushRange("", "");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    }
  };

  return (
    <div className={`${styles.bar} ${isActive ? styles.barActive : ""}`}>
      <span className={styles.label}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {formatColumnName(targetColumn)}
      </span>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>From</span>
        <input
          type="datetime-local"
          step={60}
          className={styles.input}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>To</span>
        <input
          type="datetime-local"
          step={60}
          className={styles.input}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <button
        type="button"
        className={styles.applyBtn}
        onClick={handleApply}
        disabled={!isDirty || (!start && !end && !isActive)}
      >
        Apply
      </button>
      {isActive && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={handleClear}
          aria-label="Clear date range"
          title="Clear date range"
        >
          ×
        </button>
      )}
    </div>
  );
}
