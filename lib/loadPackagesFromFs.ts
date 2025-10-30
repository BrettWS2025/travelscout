import fs from "node:fs/promises";
import path from "node:path";
import type { Package } from "./types";

export async function loadPackagesFromFs(): Promise<Package[]> {
  const filePath = path.join(process.cwd(), "public", "data", "packages.final.jsonl");
  try {
    const text = await fs.readFile(filePath, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    return lines.map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
