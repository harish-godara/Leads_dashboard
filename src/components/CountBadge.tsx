"use client";

import { useEffect, useRef } from "react";
import styles from "./CountBadge.module.css";

interface CountBadgeProps {
  filtered: number;
  total: number;
}

export default function CountBadge({ filtered, total }: CountBadgeProps) {
  const countRef = useRef<HTMLSpanElement>(null);
  const prevFiltered = useRef(filtered);

  useEffect(() => {
    if (prevFiltered.current !== filtered && countRef.current) {
      countRef.current.classList.remove(styles.countAnimate);
      // Trigger reflow
      void countRef.current.offsetWidth;
      countRef.current.classList.add(styles.countAnimate);
    }
    prevFiltered.current = filtered;
  }, [filtered]);

  const isFiltered = filtered !== total;

  return (
    <div className={styles.countBadge} id="count-badge">
      <div className={styles.countIcon}>
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <div className={styles.countInfo}>
        <span ref={countRef} className={styles.countNumber}>
          {filtered.toLocaleString()}
        </span>
        {isFiltered && (
          <span className={styles.countTotal}>
            of {total.toLocaleString()}
          </span>
        )}
        <span className={styles.countLabel}>
          {filtered === 1 ? "lead" : "leads"}
        </span>
      </div>
    </div>
  );
}
