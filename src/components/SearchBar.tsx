"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useRef, useEffect } from "react";
import styles from "./SearchBar.module.css";

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

interface SearchBarProps {
  columns: ColumnDef[];
}

export default function SearchBar({ columns }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSearchBy = searchParams.get("searchBy") || "";
  const defaultColumn = columns[0]?.name || "";
  const selectedColumn =
    urlSearchBy && columns.some((c) => c.name === urlSearchBy)
      ? urlSearchBy
      : defaultColumn;

  const [value, setValue] = useState(searchParams.get("search") || "");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pushParams = useCallback(
    (term: string, column: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (column) {
        params.set("searchBy", column);
      } else {
        params.delete("searchBy");
      }

      if (term.trim()) {
        params.set("search", term.trim());
      } else {
        params.delete("search");
      }

      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => pushParams(newValue, selectedColumn), 300);
  };

  const handleColumnChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newColumn = e.target.value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Re-run with the current input value against the newly selected column
    pushParams(value, newColumn);
  };

  const handleClear = () => {
    setValue("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pushParams("", selectedColumn);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClear();
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const formatColumnName = (name: string) =>
    name
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .trim();

  const selectedLabel = formatColumnName(selectedColumn || "column");

  return (
    <div className={styles.searchWrapper}>
      <div className={styles.searchByGroup}>
        <label htmlFor="search-by" className={styles.searchByLabel}>
          Search by
        </label>
        <select
          id="search-by"
          className={styles.searchBySelect}
          value={selectedColumn}
          onChange={handleColumnChange}
          aria-label="Select column to search"
        >
          {columns.map((col) => (
            <option key={col.name} value={col.name}>
              {formatColumnName(col.name)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.searchInputGroup}>
        <div className={styles.searchIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <input
          ref={inputRef}
          id="global-search"
          type="text"
          className={styles.searchInput}
          placeholder={`Search ${selectedLabel}...`}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <button
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear search"
            type="button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
