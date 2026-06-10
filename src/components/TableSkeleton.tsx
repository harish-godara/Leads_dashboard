import styles from "./TableSkeleton.module.css";

export default function TableSkeleton() {
  const rows = Array.from({ length: 8 });
  const cols = Array.from({ length: 6 });

  return (
    <div className={styles.skeletonContainer}>
      <div className={styles.toolbarSkeleton}>
        <div className={`${styles.bone} ${styles.searchBone}`} />
        <div className={`${styles.bone} ${styles.filterBone}`} />
        <div className={`${styles.bone} ${styles.countBone}`} />
      </div>
      <div className={styles.tableSkeleton}>
        <div className={styles.headerRow}>
          {cols.map((_, i) => (
            <div key={i} className={`${styles.bone} ${styles.headerBone}`} />
          ))}
        </div>
        {rows.map((_, i) => (
          <div key={i} className={styles.dataRow}>
            {cols.map((_, j) => (
              <div key={j} className={`${styles.bone} ${styles.cellBone}`}
                style={{ width: `${50 + Math.random() * 40}%`, animationDelay: `${(i * 6 + j) * 50}ms` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
