import { NextResponse } from "next/server";
import { loadPackagesFromFs } from "@/lib/loadPackagesFromFs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const items = await loadPackagesFromFs();
  const { searchParams } = new URL(req.url);
  let out = items;

  const dest = searchParams.get("dest");
  if (dest) out = out.filter(p => (p.destinations ?? []).join(" ").toLowerCase().includes(dest.toLowerCase()));

  const flights = searchParams.get("flights");
  if (flights) out = out.filter(p => (p.includes?.flights ?? false) === (flights === "true"));

  const max = Number(searchParams.get("max") ?? 500);
  return NextResponse.json({ count: out.length, results: out.slice(0, Math.max(1, Math.min(max, 1000))) });
}
