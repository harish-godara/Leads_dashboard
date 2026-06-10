import { NextResponse } from "next/server";
import { getColumns } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const columns = await getColumns();
    return NextResponse.json({ columns });
  } catch (error) {
    console.error("GET /api/leads/columns failed:", error);
    return NextResponse.json({ error: "Failed to fetch column metadata" }, { status: 500 });
  }
}
