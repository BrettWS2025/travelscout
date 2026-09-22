import InsuranceSlides from "@/components/InsuranceSlides";
import { INSURANCE_SLIDES } from "@/lib/insurance-slides";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Travel Insurance — Compare",
  description:
    "Compare travel insurance options across Basic, Comprehensive and Multi Trip plans. Find the best travel insurance for your New Zealand journey.",
};

export default function Page() {
  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          Travel Insurance
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Click through the comparisons for different trips and regions.
        </p>
      </header>

      {/* Slideshow of comparison tables (from your spreadsheet) */}
      <InsuranceSlides slides={INSURANCE_SLIDES} />

      {/* Content area under the tables — add your article/writeup here */}
      <article className="space-y-6" style={{ color: "var(--text)" }}>
        <h2 className="text-2xl font-semibold">What to know before you pick a policy</h2>
        <p style={{ color: "var(--muted)" }}>
          Use this space to add guidance — e.g., coverage limits, pre-existing conditions, excesses,
          adventure add-ons, cruising, and cancellation rules.
        </p>
        {/* Add more sections/Pros-Cons lists etc. */}
      </article>
    </section>
  );
}
