import Link from "next/link";
export function Footer() {
  return (
    <footer className="mt-16 py-10 border-t border-white/10">
      <div className="container grid md:grid-cols-3 gap-6 text-sm" style={{color:"var(--muted)"}}>
        <div>
          <h3 className="text-white font-semibold mb-2">About</h3>
          <p>Plan your travel journey and travel smarter.</p>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-2">Legal</h3>
          <ul className="space-y-1">
            <li><Link className="link" href="/terms">Terms of Service</Link></li>
            <li><Link className="link" href="/privacy">Privacy</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-2">Connect</h3>
          <ul className="space-y-1">
            <li><a className="link" href="#">Instagram</a></li>
            <li><a className="link" href="#">YouTube</a></li>
          </ul>
        </div>
      </div>
      <div className="container mt-6 text-xs" style={{color:"var(--muted)"}}>
        © {new Date().getFullYear()} TravelScout
      </div>
    </footer>
  );
}
