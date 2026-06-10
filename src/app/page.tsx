import { Suspense } from "react";
import { getLeads, getTotalCount } from "@/lib/queries";
import DataTable from "@/components/DataTable";
import SearchBar from "@/components/SearchBar";
import Pagination from "@/components/Pagination";
import CountBadge from "@/components/CountBadge";
import ClearFiltersButton from "@/components/ClearFiltersButton";
import DateRangeBar from "@/components/DateRangeBar";
import TableSkeleton from "@/components/TableSkeleton";

// Force dynamic rendering — this page always fetches fresh data
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function LeadsContent({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // Parse search params
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || 25;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const searchBy = typeof searchParams.searchBy === "string" ? searchParams.searchBy : undefined;
  const sort = typeof searchParams.sort === "string" ? searchParams.sort : undefined;
  const order = typeof searchParams.order === "string" ? (searchParams.order as "asc" | "desc") : undefined;

  const rawColFilter = searchParams.colFilter;
  const colFilters = Array.isArray(rawColFilter)
    ? rawColFilter
    : typeof rawColFilter === "string"
      ? [rawColFilter]
      : undefined;

  const rawColRange = searchParams.colRange;
  const colRanges = Array.isArray(rawColRange)
    ? rawColRange
    : typeof rawColRange === "string"
      ? [rawColRange]
      : undefined;

  const hasFilter =
    Boolean(search && search.trim()) ||
    (colFilters && colFilters.length > 0) ||
    (colRanges && colRanges.length > 0);

  // The "of N" denominator in the badge only matters when a filter is narrowing things —
  // when no filter is active, filtered total === table total, so skip the second query.
  try {
    const [result, fullTotal] = await Promise.all([
      getLeads({ page, limit, search, searchBy, sort, order, colFilters, colRanges }),
      hasFilter ? getTotalCount() : Promise.resolve(0),
    ]);
    const totalRows = hasFilter ? fullTotal : result.total;

    return (
      <>
        <div className="toolbar">
          <SearchBar columns={result.columns} />
          <DateRangeBar columns={result.columns} />
          <ClearFiltersButton />
          <CountBadge filtered={result.total} total={totalRows} />
        </div>

        <DataTable data={result.data} columns={result.columns} />

        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          limit={result.limit}
        />
      </>
    );
  } catch (error) {
    console.error("Database connection error:", error);
    return (
      <div className="error-container">
        <h2>Database Connection Error</h2>
        <p>
          We couldn't connect to the PostgreSQL database. Please make sure that you have set the <strong>DATABASE_URL</strong> correctly in your <code>.env.local</code> file and that the database server is running.
        </p>
      </div>
    );
  }
}

export default async function HomePage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;

  return (
    <Suspense fallback={<TableSkeleton />}>
      <LeadsContent searchParams={resolvedParams} />
    </Suspense>
  );
}
