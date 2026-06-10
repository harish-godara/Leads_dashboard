"use client";

import { useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./ClearFiltersButton.module.css";

export default function ClearFiltersButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filteredColumns = useMemo(() => {
    const set = new Set<string>();
    for (const raw of searchParams.getAll("colFilter")) {
      const sep = raw.indexOf("|");
      if (sep < 0) continue;
      set.add(raw.slice(0, sep));
    }
    for (const raw of searchParams.getAll("colRange")) {
      const sep = raw.indexOf("|");
      if (sep < 0) continue;
      set.add(raw.slice(0, sep));
    }
    return set;
  }, [searchParams]);

  if (filteredColumns.size === 0) return null;

  const handleClear = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("colFilter");
    params.delete("colRange");
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const label =
    filteredColumns.size === 1
      ? "1 column filtered"
      : `${filteredColumns.size} columns filtered`;

  return (
    <button
      type="button"
      className={styles.chip}
      onClick={handleClear}
      title="Clear all column filters"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      <span>{label}</span>
      <span className={styles.clear} aria-label="Clear filters">×</span>
    </button>
  );
}
