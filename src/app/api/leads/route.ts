import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    const result = await getLeads({
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
      search: sp.get("search") || undefined,
      searchBy: sp.get("searchBy") || undefined,
      sort: sp.get("sort") || undefined,
      order: (sp.get("order") as "asc" | "desc") || undefined,
      colFilters: sp.getAll("colFilter").length ? sp.getAll("colFilter") : undefined,
      colRanges: sp.getAll("colRange").length ? sp.getAll("colRange") : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/leads failed:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}
