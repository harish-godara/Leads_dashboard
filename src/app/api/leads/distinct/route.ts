import { NextRequest, NextResponse } from "next/server";
import { getDistinctValues } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const column = sp.get("column");
  if (!column) {
    return NextResponse.json({ error: "column is required" }, { status: 400 });
  }
  try {
    const result = await getDistinctValues(column, {
      search: sp.get("search") || undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/leads/distinct failed:", error);
    return NextResponse.json({ error: "Failed to fetch distinct values" }, { status: 500 });
  }
}
