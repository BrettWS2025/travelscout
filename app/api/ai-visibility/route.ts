import OpenAI from "openai";
import { NextResponse } from "next/server";
import { runAiVisibilityPipeline } from "@/lib/ai-visibility/pipeline";

/** Seed batch + expansion + optional advisory; capped by budget and prompt limit. */
export const maxDuration = 300;

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set in the server environment." },
      { status: 503 }
    );
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  const openai = new OpenAI({ apiKey });

  try {
    const report = await runAiVisibilityPipeline(openai, model);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
