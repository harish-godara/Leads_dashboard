"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./ColumnFilter.module.css";

const NULL_SENTINEL = "__null__";

export interface DistinctCache {
  get: (column: string) => CachedDistinct | undefined;
  set: (column: string, value: CachedDistinct) => void;
}

export interface CachedDistinct {
  values: (string | null)[];
  truncated: boolean;
}

interface ColumnFilterProps {
  column: string;
  cache: DistinctCache;
}

interface FetchState {
  loading: boolean;
  error: string | null;
  data: CachedDistinct | null;
}

export default function ColumnFilter({ column, cache }: ColumnFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [state, setState] = useState<FetchState>({ loading: false, error: null, data: null });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fetchSeqRef = useRef(0);

  // Read currently-applied filter values for this column from the URL
  const appliedValues = useMemo(() => {
    const set = new Set<string>();
    for (const raw of searchParams.getAll("colFilter")) {
      const sep = raw.indexOf("|");
      if (sep < 0) continue;
      if (raw.slice(0, sep) === column) {
        set.add(raw.slice(sep + 1));
      }
    }
    return set;
  }, [searchParams, column]);

  const isActive = appliedValues.size > 0;

  const positionPopover = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popWidth = 260;
    const viewportW = window.innerWidth;
    let left = rect.left;
    if (left + popWidth > viewportW - 8) {
      left = Math.max(8, viewportW - popWidth - 8);
    }
    setCoords({ top: rect.bottom + 4, left });
  }, []);

  // Fetch distinct values once per (column, search) — cache the un-searched result.
  const fetchValues = useCallback(
    async (q: string) => {
      const seq = ++fetchSeqRef.current;

      // Hit cache only for the empty-search case
      if (!q.trim()) {
        const cached = cache.get(column);
        if (cached) {
          setState({ loading: false, error: null, data: cached });
          return;
        }
      }

      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const params = new URLSearchParams({ column });
        if (q.trim()) params.set("search", q.trim());
        const res = await fetch(`/api/leads/distinct?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CachedDistinct;
        if (seq !== fetchSeqRef.current) return; // a newer request superseded this one
        if (!q.trim()) cache.set(column, json);
        setState({ loading: false, error: null, data: json });
      } catch (err) {
        if (seq !== fetchSeqRef.current) return;
        setState({ loading: false, error: (err as Error).message, data: null });
      }
    },
    [column, cache]
  );

  // Open handler: position, seed pending checks from applied URL filters, fetch if needed
  const handleOpen = useCallback(() => {
    positionPopover();
    setPending(new Set(appliedValues));
    setSearch("");
    setOpen(true);
    // Kick off (or reuse) the distinct fetch
    fetchValues("");
  }, [positionPopover, appliedValues, fetchValues]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  // Click-outside + reposition on scroll/resize
  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      handleClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    const onScroll = () => positionPopover();
    const onResize = () => positionPopover();

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, handleClose, positionPopover]);

  // Server-side search refetch (debounced) — only when the cached set was truncated.
  const truncated = state.data?.truncated ?? false;
  useEffect(() => {
    if (!open) return;
    if (!truncated) return; // client-side filtering is sufficient
    const t = setTimeout(() => fetchValues(search), 250);
    return () => clearTimeout(t);
  }, [search, open, truncated, fetchValues]);

  const displayedValues = useMemo(() => {
    if (!state.data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return state.data.values;
    return state.data.values.filter((v) => {
      if (v === null) return "(blanks)".includes(q);
      return v.toLowerCase().includes(q);
    });
  }, [state.data, search]);

  const allSelected =
    displayedValues.length > 0 &&
    displayedValues.every((v) => pending.has(v === null ? NULL_SENTINEL : v));

  const toggleValue = (v: string | null) => {
    const key = v === null ? NULL_SENTINEL : v;
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setPending((prev) => {
      const next = new Set(prev);
      const keys = displayedValues.map((v) => (v === null ? NULL_SENTINEL : v));
      if (allSelected) {
        for (const k of keys) next.delete(k);
      } else {
        for (const k of keys) next.add(k);
      }
      return next;
    });
  };

  const applyFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    // Remove any existing entries for this column
    const all = params.getAll("colFilter");
    params.delete("colFilter");
    for (const raw of all) {
      const sep = raw.indexOf("|");
      if (sep < 0) continue;
      if (raw.slice(0, sep) !== column) params.append("colFilter", raw);
    }
    for (const v of pending) {
      params.append("colFilter", `${column}|${v}`);
    }
    params.set("page", "1");
    handleClose();
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    const all = params.getAll("colFilter");
    params.delete("colFilter");
    for (const raw of all) {
      const sep = raw.indexOf("|");
      if (sep < 0) continue;
      if (raw.slice(0, sep) !== column) params.append("colFilter", raw);
    }
    params.set("page", "1");
    handleClose();
    router.push(`${pathname}?${params.toString()}`);
  };

  const stopHeaderClick = (e: React.MouseEvent) => {
    // Prevent the th's sort handler from firing
    e.stopPropagation();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.filterButton} ${isActive ? styles.filterButtonActive : ""}`}
        onClick={(e) => {
          stopHeaderClick(e);
          if (open) handleClose();
          else handleOpen();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`Filter ${column}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill={isActive ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>

      {open && coords && (
        <div
          ref={popoverRef}
          className={styles.popover}
          style={{ top: coords.top, left: coords.left }}
          role="dialog"
          onMouseDown={stopHeaderClick}
          onClick={stopHeaderClick}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search values..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          <div className={styles.selectAllRow}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAllVisible}
                disabled={state.loading || displayedValues.length === 0}
              />
              <span>(Select all{search ? " visible" : ""})</span>
            </label>
            {pending.size > 0 && (
              <span className={styles.selectedCount}>{pending.size} selected</span>
            )}
          </div>

          <div className={styles.list}>
            {state.loading && <div className={styles.statusRow}>Loading…</div>}
            {state.error && (
              <div className={styles.statusRow}>Failed to load: {state.error}</div>
            )}
            {!state.loading && !state.error && displayedValues.length === 0 && (
              <div className={styles.statusRow}>No values</div>
            )}
            {!state.loading &&
              !state.error &&
              displayedValues.map((v) => {
                const key = v === null ? NULL_SENTINEL : v;
                const label = v === null ? "(Blanks)" : v;
                return (
                  <label key={key} className={styles.checkboxRow} title={label}>
                    <input
                      type="checkbox"
                      checked={pending.has(key)}
                      onChange={() => toggleValue(v)}
                    />
                    <span className={styles.valueLabel}>{label}</span>
                  </label>
                );
              })}
            {truncated && (
              <div className={styles.truncatedHint}>
                Showing top results — type to search.
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={clearFilter}>
              Clear
            </button>
            <div className={styles.actionsRight}>
              <button type="button" className={styles.secondaryBtn} onClick={handleClose}>
                Cancel
              </button>
              <button type="button" className={styles.primaryBtn} onClick={applyFilter}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
