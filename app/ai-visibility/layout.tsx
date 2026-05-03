import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Wilderness — LLM visibility check",
  description:
    "Run motorhome and campervan prompts against OpenAI and see whether Wilderness Motorhomes appears in model answers.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AiVisibilityLayout({ children }: { children: ReactNode }) {
  return children;
}
