"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import styles from "./Pagination.module.css";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

export default function Pagination({
  page,
  totalPages,
  total,
  limit,
}: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(newPage));
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const changeLimit = useCallback(
    (newLimit: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("limit", String(newLimit));
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  // Generate page numbers to show
  const getPageNumbers = (): (number | "...")[] => {
    const pages: (number | "...")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);

      if (page > 3) pages.push("...");

      const rangeStart = Math.max(2, page - 1);
      const rangeEnd = Math.min(totalPages - 1, page + 1);

      for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);

      if (page < totalPages - 2) pages.push("...");

      pages.push(totalPages);
    }

    return pages;
  };

  if (total === 0) return null;

  return (
    <div className={styles.paginationContainer} id="pagination">
      <div className={styles.info}>
        <span className={styles.showing}>
          Showing{" "}
          <span className={styles.range}>
            {start}–{end}
          </span>{" "}
          of{" "}
          <span className={styles.total}>{total.toLocaleString()}</span>
        </span>
      </div>

      <div className={styles.controls}>
        <div className={styles.limitSelector}>
          <label htmlFor="page-size" className={styles.limitLabel}>
            Rows:
          </label>
          <select
            id="page-size"
            className={styles.limitSelect}
            value={limit}
            onChange={(e) => changeLimit(Number(e.target.value))}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className={styles.pageButtons}>
          <button
            className={styles.pageBtn}
            onClick={() => goToPage(1)}
            disabled={page <= 1}
            aria-label="First page"
            title="First page"
            id="page-first"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m11 17-5-5 5-5" />
              <path d="m18 17-5-5 5-5" />
            </svg>
          </button>
          <button
            className={styles.pageBtn}
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            title="Previous page"
            id="page-prev"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          {getPageNumbers().map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className={styles.ellipsis}>
                ⋯
              </span>
            ) : (
              <button
                key={p}
                className={`${styles.pageBtn} ${styles.pageNum} ${page === p ? styles.pageBtnActive : ""}`}
                onClick={() => goToPage(p as number)}
                id={`page-${p}`}
              >
                {p}
              </button>
            )
          )}

          <button
            className={styles.pageBtn}
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            title="Next page"
            id="page-next"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <button
            className={styles.pageBtn}
            onClick={() => goToPage(totalPages)}
            disabled={page >= totalPages}
            aria-label="Last page"
            title="Last page"
            id="page-last"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m13 17 5-5-5-5" />
              <path d="m6 17 5-5-5-5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
