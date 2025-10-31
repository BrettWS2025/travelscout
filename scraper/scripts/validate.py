
#!/usr/bin/env python3
import os, sys, json
from pathlib import Path
import orjson

sys.path.append(str(Path(__file__).resolve().parents[2] / "scraper"))
from models import PackageModel

def read_jsonl(path):
    with open(path, "rb") as f:
        for line in f:
            if not line.strip():
                continue
            yield orjson.loads(line)

def is_valid_record(rec: dict) -> bool:
    # Require essential fields for inclusion
    if not rec.get("title"): return False
    if not rec.get("url"): return False
    price_nzd = rec.get("price_nzd")
    if not isinstance(price_nzd, (int,float)) or price_nzd <= 0:
        return False
    dd = rec.get("duration_days") or 0
    ngt = rec.get("nights") or 0
    if not ((isinstance(dd, int) and dd > 0) or (isinstance(ngt, int) and ngt > 0)):
        return False
    return True

def coverage(records):
    total = len(records) or 1
    def pct(v): return round(100.0 * v / total, 1)
    from collections import defaultdict
    buckets = defaultdict(list)
    for r in records:
        buckets[r.get("source","unknown")].append(r)

    def has_price(r): return isinstance(r.get("price_nzd"), (int,float)) and r.get("price_nzd")>0
    def has_dur_or_nights(r): return ((r.get("duration_days") or 0) > 0) or ((r.get("nights") or 0) > 0)
    def has_dest(r): return isinstance(r.get("destinations"), list) and len(r["destinations"])>0

    by_src = {}
    for s, rows in sorted(buckets.items()):
        st = len(rows) or 1
        by_src[s] = {
            "count": len(rows),
            "price_nzd_present_pct": round(100.0 * sum(1 for r in rows if has_price(r))/st, 1),
            "duration_or_nights_present_pct": round(100.0 * sum(1 for r in rows if has_dur_or_nights(r))/st, 1),
            "destinations_present_pct": round(100.0 * sum(1 for r in rows if has_dest(r))/st, 1),
        }

    cov = {
        "count_total": len(records),
        "price_nzd_present_pct": pct(sum(1 for r in records if has_price(r))),
        "duration_or_nights_present_pct": pct(sum(1 for r in records if has_dur_or_nights(r))),
        "destinations_present_pct": pct(sum(1 for r in records if has_dest(r))),
        "by_source": by_src,
    }
    return cov

def main(in_path, out_path):
    raw = list(read_jsonl(in_path))

    struct_ok = []
    for r in raw:
        try:
            PackageModel(**r)
            struct_ok.append(r)
        except Exception:
            pass

    valid = [r for r in struct_ok if is_valid_record(r)]
    cov = coverage(struct_ok)

    req_price = float(os.getenv("REQ_PRICE_COVERAGE", "0.90"))
    req_duration = float(os.getenv("REQ_DURATION_COVERAGE", "0.80"))
    req_dest = float(os.getenv("REQ_DESTINATIONS_COVERAGE", "0.60"))

    status_ok = (
        (cov["price_nzd_present_pct"]/100.0) >= req_price and
        (cov["duration_or_nights_present_pct"]/100.0) >= req_duration and
        (cov["destinations_present_pct"]/100.0) >= req_dest
    )

    out_dir = Path("scraper/out")
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(out_path, "wb") as out:
        for r in valid:
            out.write(orjson.dumps(r) + b"\n")

    summary = {
        "thresholds": {
            "REQ_PRICE_COVERAGE": req_price,
            "REQ_DURATION_COVERAGE": req_duration,
            "REQ_DESTINATIONS_COVERAGE": req_dest,
        },
        "status_ok": status_ok,
        "overall": cov,
    }
    (out_dir / "qa_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    md_lines = []
    md_lines.append("# TravelScout QA Summary")
    md_lines.append("")
    md_lines.append(f"- Total records (structural OK): **{cov['count_total']}**")
    md_lines.append(f"- PriceNZD present: **{cov['price_nzd_present_pct']}%** (required {int(req_price*100)}%+)")
    md_lines.append(f"- Duration/Nights present: **{cov['duration_or_nights_present_pct']}%** (required {int(req_duration*100)}%+)")
    md_lines.append(f"- Destinations present: **{cov['destinations_present_pct']}%** (required {int(req_dest*100)}%+)")
    md_lines.append("")
    md_lines.append("## By Source")
    md_lines.append("")
    md_lines.append("| Source | Count | PriceNZD % | Duration/Nights % | Destinations % |")
    md_lines.append("|---|---:|---:|---:|---:|")
    for s, m in summary["overall"]["by_source"].items():
        md_lines.append(f"| {s} | {m['count']} | {m['price_nzd_present_pct']} | {m['duration_or_nights_present_pct']} | {m['destinations_present_pct']} |")
    md_lines.append("")
    md_lines.append(f"**Status:** {'✅ PASS' if status_ok else '❌ FAIL'}")
    (out_dir / "qa_summary.md").write_text("\n".join(md_lines), encoding="utf-8")

    sys.exit(0 if status_ok else 1)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
