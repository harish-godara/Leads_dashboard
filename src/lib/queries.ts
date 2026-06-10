/**
 * Data layer for the leads dashboard.
 *
 * Design notes:
 * - Schema-agnostic: column metadata is read at runtime from information_schema, so the same
 *   code works against any table set via DB_SCHEMA / DB_TABLE.
 * - Every value goes through a parameterized placeholder. Identifiers are quoted via quoteIdent.
 * - `getColumns` is wrapped in React.cache so multiple callers in one server render share one fetch.
 * - No memoization beyond that. The previous attempts to cache COUNT(*) introduced staleness bugs
 *   (filtered > total displays); the table is small enough that a fresh COUNT is microseconds.
 * - Per-column IN-list filters use typed parameter arrays (`= ANY($1::text[])`) — this collapses
 *   N placeholders into one, and avoids `::text` casts on indexed text/numeric/boolean columns so
 *   any existing B-tree index can still be used.
 * - Distinct-values lookup is a single query — NULL is surfaced inline via ORDER BY NULLS FIRST
 *   rather than a separate EXISTS roundtrip.
 */

import { cache } from "react";
import pool from "./db";

const SCHEMA = process.env.DB_SCHEMA || "public";
const TABLE = process.env.DB_TABLE || "leads";

const MAX_LIMIT = 100;
const MAX_DISTINCT_LIMIT = 2000;
const DEFAULT_DISTINCT_LIMIT = 500;

// Type categories used for picking the right SQL operator and parameter binding.
type TypeKind = "text" | "numeric" | "boolean" | "date" | "other";

const TEXT_TYPES = new Set([
  "character varying",
  "text",
  "varchar",
  "char",
  "character",
  "name",
  "citext",
]);

const NUMERIC_HINTS = ["int", "numeric", "decimal", "double", "real", "float", "money"];

export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

export interface LeadsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  searchBy?: string;
  sort?: string;
  order?: "asc" | "desc";
  colFilters?: string[];
  colRanges?: string[];
}

export interface LeadsResult {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  columns: ColumnDef[];
}

export interface DistinctValuesResult {
  values: (string | null)[];
  truncated: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  // Standard Postgres identifier escaping: wrap in double quotes, double up any internal quotes.
  return `"${name.replace(/"/g, '""')}"`;
}

function classify(type: string): TypeKind {
  const t = type.toLowerCase();
  if (TEXT_TYPES.has(t)) return "text";
  if (t === "boolean") return "boolean";
  if (t.includes("timestamp") || t === "date" || t.includes("time")) return "date";
  if (NUMERIC_HINTS.some((h) => t.includes(h))) return "numeric";
  return "other";
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return 25;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function clampPage(page: number | undefined): number {
  if (!page || !Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

const QUALIFIED_TABLE = `${quoteIdent(SCHEMA)}.${quoteIdent(TABLE)}`;

// ─── column metadata ──────────────────────────────────────────────────────────

export const getColumns = cache(async (): Promise<ColumnDef[]> => {
  const result = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [SCHEMA, TABLE]
  );

  return result.rows.map((row) => ({
    name: row.column_name as string,
    type: row.data_type as string,
    nullable: row.is_nullable === "YES",
  }));
});

// ─── total count ──────────────────────────────────────────────────────────────

export async function getTotalCount(): Promise<number> {
  const result = await pool.query(`SELECT COUNT(*)::bigint AS total FROM ${QUALIFIED_TABLE}`);
  return parseInt(result.rows[0].total, 10);
}

// ─── WHERE builder ────────────────────────────────────────────────────────────

interface Where {
  parts: string[];
  values: unknown[];
}

function makeWhere(): Where {
  return { parts: [], values: [] };
}

function pushParam(w: Where, value: unknown): string {
  w.values.push(value);
  return `$${w.values.length}`;
}

/**
 * Append the global `search` clause.
 *  - `searchBy=<col>`: single-column ILIKE. Text columns use the column directly (index-friendly);
 *    everything else gets `::text` cast.
 *  - No `searchBy`: OR'd ILIKE across every text-like column. This is the legacy "search anywhere"
 *    fallback used by external API callers; the dashboard's SearchBar always supplies `searchBy`.
 */
function applySearch(w: Where, columns: ColumnDef[], search: string, searchBy: string | undefined) {
  const term = `%${search.trim()}%`;
  const target = searchBy ? columns.find((c) => c.name === searchBy) : undefined;

  if (target) {
    const ident = quoteIdent(target.name);
    const expr = classify(target.type) === "text" ? ident : `${ident}::text`;
    w.parts.push(`${expr} ILIKE ${pushParam(w, term)}`);
    return;
  }

  if (searchBy) return; // unknown column — silently ignore

  const textCols = columns.filter((c) => classify(c.type) === "text");
  if (textCols.length === 0) return;

  const placeholder = pushParam(w, term);
  const ors = textCols.map((c) => `${quoteIdent(c.name)} ILIKE ${placeholder}`).join(" OR ");
  w.parts.push(`(${ors})`);
}

/**
 * Per-column IN-list filters from the header popovers.
 * Format on each URL entry: `<column>|<value>`. Repeated entries on the same column become an
 * IN list. The literal value `__null__` maps to `IS NULL`.
 *
 * Performance: instead of emitting N placeholders, we send the values as a single typed array
 * parameter and compare with `= ANY(...)`. This keeps the prepared-statement shape stable across
 * different filter sizes and, where the column is text/numeric/boolean, avoids casting the column
 * to text — preserving any index that exists on it.
 */
function applyColFilters(w: Where, columns: ColumnDef[], colFilters: string[]) {
  const grouped = new Map<string, string[]>();
  for (const raw of colFilters) {
    if (!raw) continue;
    const sep = raw.indexOf("|");
    if (sep < 0) continue;
    const col = raw.slice(0, sep);
    const value = raw.slice(sep + 1);
    if (!columns.find((c) => c.name === col)) continue;
    const list = grouped.get(col) ?? [];
    list.push(value);
    grouped.set(col, list);
  }

  for (const [colName, rawValues] of grouped) {
    const col = columns.find((c) => c.name === colName)!;
    const ident = quoteIdent(colName);
    const kind = classify(col.type);

    const wantsNull = rawValues.includes(NULL_SENTINEL);
    const nonNullRaw = rawValues.filter((v) => v !== NULL_SENTINEL);

    const orParts: string[] = [];

    if (nonNullRaw.length > 0) {
      switch (kind) {
        case "text": {
          orParts.push(`${ident} = ANY(${pushParam(w, nonNullRaw)}::text[])`);
          break;
        }
        case "numeric": {
          const parsed = nonNullRaw.map((v) => Number(v));
          if (parsed.every((n) => Number.isFinite(n))) {
            orParts.push(`${ident} = ANY(${pushParam(w, parsed)}::numeric[])`);
          } else {
            orParts.push(`${ident}::text = ANY(${pushParam(w, nonNullRaw)}::text[])`);
          }
          break;
        }
        case "boolean": {
          const parsed = nonNullRaw.map((v) => v.trim().toLowerCase() === "true");
          orParts.push(`${ident} = ANY(${pushParam(w, parsed)}::boolean[])`);
          break;
        }
        case "date":
        case "other": {
          orParts.push(`${ident}::text = ANY(${pushParam(w, nonNullRaw)}::text[])`);
          break;
        }
      }
    }

    if (wantsNull) {
      orParts.push(`${ident} IS NULL`);
    }

    if (orParts.length > 0) {
      w.parts.push(`(${orParts.join(" OR ")})`);
    }
  }
}

/**
 * Date range filter for the toolbar's DateRangeBar.
 * Format: `<column>|<startISO>|<endISO>`, either bound may be empty (open-ended).
 * Only valid on date-like columns; silently ignored otherwise.
 */
function applyColRanges(w: Where, columns: ColumnDef[], colRanges: string[]) {
  for (const raw of colRanges) {
    if (!raw) continue;
    const segs = raw.split("|");
    if (segs.length < 3) continue;
    const [colName, startRaw, endRaw] = segs;
    const col = columns.find((c) => c.name === colName);
    if (!col || classify(col.type) !== "date") continue;

    const start = (startRaw ?? "").trim();
    const end = (endRaw ?? "").trim();
    if (!start && !end) continue;

    const ident = quoteIdent(colName);
    const conds: string[] = [];
    if (start) conds.push(`${ident} >= ${pushParam(w, start)}`);
    if (end) conds.push(`${ident} <= ${pushParam(w, end)}`);
    w.parts.push(`(${conds.join(" AND ")})`);
  }
}

function buildWhere(columns: ColumnDef[], params: LeadsQueryParams): Where {
  const w = makeWhere();

  if (params.search && params.search.trim()) {
    applySearch(w, columns, params.search, params.searchBy);
  }
  if (params.colFilters && params.colFilters.length > 0) {
    applyColFilters(w, columns, params.colFilters);
  }
  if (params.colRanges && params.colRanges.length > 0) {
    applyColRanges(w, columns, params.colRanges);
  }

  return w;
}

// ─── main fetch ───────────────────────────────────────────────────────────────

/**
 * Sentinel used by the column-filter popover to represent NULL values in the URL.
 * Exported so the client can stay in lockstep if it ever needs to be referenced from one place.
 */
export const NULL_SENTINEL = "__null__";

export async function getLeads(params: LeadsQueryParams): Promise<LeadsResult> {
  const page = clampPage(params.page);
  const limit = clampLimit(params.limit);
  const offset = (page - 1) * limit;

  const columns = await getColumns();
  const { parts, values } = buildWhere(columns, params);
  const whereClause = parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";

  let orderClause = "";
  if (params.sort) {
    const col = columns.find((c) => c.name === params.sort);
    if (col) {
      const dir = params.order?.toLowerCase() === "desc" ? "DESC" : "ASC";
      orderClause = `ORDER BY ${quoteIdent(col.name)} ${dir} NULLS LAST`;
    }
  }

  // Count and data run in parallel — they're independent queries against the same pool.
  const countSql = `SELECT COUNT(*)::bigint AS total FROM ${QUALIFIED_TABLE} ${whereClause}`;
  const dataSql = `
    SELECT * FROM ${QUALIFIED_TABLE}
    ${whereClause}
    ${orderClause}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [countResult, dataResult] = await Promise.all([
    pool.query(countSql, values),
    pool.query(dataSql, values),
  ]);

  const total = parseInt(countResult.rows[0].total, 10);

  return {
    data: dataResult.rows,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    columns,
  };
}

// ─── distinct values (for column filter popover) ──────────────────────────────

/**
 * Distinct values for one column, used by the in-header checkbox dropdown.
 *
 * One query handles everything:
 *  - DISTINCT on the column itself (so NULL is naturally one of the values).
 *  - `ORDER BY 1 NULLS FIRST` so NULL surfaces at the top.
 *  - `LIMIT n+1` so we can detect truncation without a separate COUNT.
 *  - Optional substring search runs server-side via `ILIKE` against `col::text`.
 *
 * The previous implementation made a second roundtrip just to see whether NULL existed;
 * inlining it into the DISTINCT query removes that overhead entirely.
 */
export async function getDistinctValues(
  column: string,
  opts: { search?: string; limit?: number } = {}
): Promise<DistinctValuesResult> {
  const columns = await getColumns();
  const col = columns.find((c) => c.name === column);
  if (!col) return { values: [], truncated: false };

  const limit = Math.min(
    MAX_DISTINCT_LIMIT,
    Math.max(1, Math.floor(opts.limit ?? DEFAULT_DISTINCT_LIMIT))
  );

  const ident = quoteIdent(col.name);
  const values: unknown[] = [];
  let where = "";

  if (opts.search && opts.search.trim()) {
    values.push(`%${opts.search.trim()}%`);
    where = `WHERE ${ident}::text ILIKE $1`;
  }

  const sql = `
    SELECT DISTINCT ${ident}::text AS v
    FROM ${QUALIFIED_TABLE}
    ${where}
    ORDER BY v NULLS FIRST
    LIMIT ${limit + 1}
  `;

  const result = await pool.query(sql, values);
  const rows = result.rows.map((r) => (r.v === null ? null : (r.v as string)));
  const truncated = rows.length > limit;
  if (truncated) rows.length = limit;
  return { values: rows, truncated };
}
