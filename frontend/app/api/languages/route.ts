import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:5001";
  const search = request.nextUrl.search || "";
  const res = await fetch(`${backendUrl}/api/languages${search}`);
  const data = await res.json();
  return NextResponse.json(data);
} 