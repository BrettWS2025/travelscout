import Link from "next/link";
export function Footer() {
  return (
    <footer className="mt-16 py-10 border-t border-white/10">
      <div className="container grid md:grid-cols-3 gap-6 text-sm text-[var(--muted)]">
        <div>
          <h3 className="text-white font-semibold mb-2">About</h3>
          <p>Independent travel comparisons, guides and tools to help Kiwis travel smarter.</p>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-2">Legal</h3>
          <ul className="space-y-1">
            <li><Link className="link" href="#">How this site works</Link></li>
            <li><Link className="link" href="#">Advertising policy</Link></li>
            <li><Link className="link" href="#">Privacy</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-2">Connect</h3>
          <ul className="space-y-1">
            <li><a className="link" href="#">Instagram</a></li>
            <li><a className="link" href="#">YouTube</a></li>
            <li><a className="link" href="#">Newsletter</a></li>
          </ul>
        </div>
      </div>
      <div className="container mt-6 text-xs text-[var(--muted)]">© {new Date().getFullYear()} TravelScout</div>
    </footer>
  );
}
