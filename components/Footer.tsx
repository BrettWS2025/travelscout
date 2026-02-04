import Link from "next/link";
export function Footer() {
  return (
    <footer className="mt-16 py-10 border-t border-slate-200 bg-white/50">
      <div className="container grid md:grid-cols-3 gap-6 text-sm" style={{color:"var(--muted)"}}>
        <div>
          <h3 className="text-slate-800 font-bold mb-2 font-[family-name:var(--font-plus-jakarta)]">About</h3>
          <p className="text-slate-600">Plan your travel journey and travel smarter.</p>
        </div>
        <div>
          <h3 className="text-slate-800 font-bold mb-2 font-[family-name:var(--font-plus-jakarta)]">Legal</h3>
          <ul className="space-y-1">
            <li><Link className="link" href="/terms">Terms of Service</Link></li>
            <li><Link className="link" href="/privacy">Privacy</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-slate-800 font-bold mb-2 font-[family-name:var(--font-plus-jakarta)]">Connect</h3>
          <ul className="space-y-1">
            <li><a className="link" href="#">Instagram</a></li>
            <li><a className="link" href="#">YouTube</a></li>
          </ul>
        </div>
      </div>
      <div className="container mt-6 text-xs text-slate-500">
        © {new Date().getFullYear()} TravelScout
      </div>
    </footer>
  );
}
