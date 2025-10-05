import { Compass, BadgePercent, Sparkles } from "lucide-react";
const features = [
  { icon: Sparkles, title: "Opinionated but fair", blurb: "We highlight gotchas and call out fees."},
  { icon: BadgePercent, title: "Deal vetting", blurb: "No clickbait—every deal is verified."},
  { icon: Compass, title: "Guides that help", blurb: "Actionable advice, NZ‑specific."},
]
export function FeatureCards(){
  return (
    <section className="grid md:grid-cols-3 gap-4">
      {features.map(({icon:Icon,title,blurb})=> (
        <article key={title} className="card p-6">
          <Icon className="w-6 h-6" />
          <h3 className="mt-3 text-xl font-semibold">{title}</h3>
          <p className="text-[var(--muted)]">{blurb}</p>
        </article>
      ))}
    </section>
  )
}
