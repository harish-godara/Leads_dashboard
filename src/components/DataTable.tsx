"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";
import styles from "./DataTable.module.css";
import ColumnFilter, { CachedDistinct, DistinctCache } from "./ColumnFilter";

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

interface DataTableProps {
  data: Record<string, unknown>[];
  columns: ColumnDef[];
}

export default function DataTable({ data, columns }: DataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sort") || "";
  const currentOrder = searchParams.get("order") || "asc";

  // Persist distinct-value fetches across popover open/close cycles so the
  // distinct API is only hit once per column per session.
  const distinctCacheRef = useRef<Map<string, CachedDistinct>>(new Map());
  const distinctCache = useMemo<DistinctCache>(
    () => ({
      get: (col) => distinctCacheRef.current.get(col),
      set: (col, val) => {
        distinctCacheRef.current.set(col, val);
      },
    }),
    []
  );

  const handleSort = useCallback(
    (columnName: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (currentSort === columnName) {
        // Toggle direction
        params.set("order", currentOrder === "asc" ? "desc" : "asc");
      } else {
        params.set("sort", columnName);
        params.set("order", "asc");
      }
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, currentSort, currentOrder]
  );

  const formatColumnName = (name: string) => {
    return name
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  };

  const formatCellValue = (value: unknown, type: string): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";

    // Handle Date objects and date/time/timestamp strings
    if (
      value instanceof Date ||
      type.includes("timestamp") ||
      type === "date" ||
      type.includes("time")
    ) {
      try {
        const date = value instanceof Date ? value : new Date(String(value));
        if (!isNaN(date.getTime())) {
          return type === "date"
            ? date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : date.toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
        }
      } catch {
        // Fall through to default
      }
    }

    // Handle JSON/objects
    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  };

  const getSortIcon = (columnName: string) => {
    if (currentSort !== columnName) {
      return (
        <svg
          className={styles.sortIconInactive}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m7 15 5 5 5-5" />
          <path d="m7 9 5-5 5 5" />
        </svg>
      );
    }

    return currentOrder === "asc" ? (
      <svg
        className={styles.sortIconActive}
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m7 15 5 5 5-5" />
      </svg>
    ) : (
      <svg
        className={styles.sortIconActive}
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m7 9 5-5 5 5" />
      </svg>
    );
  };

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📭</div>
        <p>No leads found matching your criteria.</p>
        <p style={{ fontSize: "0.8rem" }}>
          Try adjusting your search.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <div className={styles.tableScroll}>
        <table className={styles.table} id="leads-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  className={`${styles.th} ${currentSort === col.name ? styles.thSorted : ""}`}
                  onClick={() => handleSort(col.name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleSort(col.name);
                  }}
                  id={`sort-${col.name}`}
                >
                  <span className={styles.thContent}>
                    <span className={styles.thLabel}>
                      {formatColumnName(col.name)}
                    </span>
                    {getSortIcon(col.name)}
                    <ColumnFilter column={col.name} cache={distinctCache} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={styles.tr}>
                {columns.map((col) => (
                  <td key={col.name} className={styles.td}>
                    <span className={styles.cellContent} suppressHydrationWarning>
                      {formatCellValue(row[col.name], col.type)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
