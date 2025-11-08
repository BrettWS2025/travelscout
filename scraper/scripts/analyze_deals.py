#!/usr/bin/env python3
# scraper/scripts/analyze_deals.py
"""
Analyze travel deals with OpenAI and produce a Top-N report.

- Picks the latest public/data/packages.final*.jsonl (or PACKAGES_FILE override)
- Filters out rows with nights > 21
- (Optional) Shortlist with a quick heuristic to reduce OpenAI calls
- Deep analysis with OpenAI on the (shortlisted) deals
- Ranks and writes:
    * public/reports/deals-openai/<run-id>/combined.jsonl  (all analyzed)
    * public/reports/deals-openai/<run-id>/topN.json, topN.md
    * public/reports/deals-openai/<run-id>/per-deal/       (ONLY Top N per-deal JSON)

ENV:
  OPENAI_API_KEY (required)
  OPENAI_MODEL=gpt-4o-mini            (optional)
  TOP_N=20                            (optional; how many per-deal files to save)
  SHORTLIST_SIZE=0                    (optional; 0 = off, else shortlist this many via heuristic)
  MAX_DEALS=0                         (optional; 0 = all, for testing)
  READ_TIMEOUT=20                     (optional, seconds)
  USER_AGENT="TravelScoutBot/1.0 ..." (optional)
  PACKAGES_FILE=<path/to/file.jsonl>  (optional, override input file)
"""

from __future__ import annotations
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup

# OpenAI SDK (>=1.0 preferred)
try:
    from openai import OpenAI  # new client
except Exception:
    OpenAI = None
try:
    import openai  # legacy shim
except Exception:
    openai = None

# --- repo root detection (robust for scraper/scripts/ placement) ---
def _compute_repo_root() -> Path:
    here = Path(__file__).resolve()
    # Prefer a parent that contains "public" (your site assets)
    for p in here.parents:
        if (p / "public").is_dir():
            return p
    # Fallback to a parent that has .git
    for p in here.parents:
        if (p / ".git").exists():
            return p
    # Last resort: go up two levels (scraper/scripts -> repo root)
    return here.parents[2] if len(here.parents) >= 3 else here.parents[1]

REPO_ROOT = Path(os.environ.get("REPO_ROOT", _compute_repo_root()))
DATA_DIR = REPO_ROOT / "public" / "data"
OUT_BASE = REPO_ROOT / "public" / "reports" / "deals-openai"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
TOP_N = int(os.environ.get("TOP_N", "20"))
SHORTLIST_SIZE = int(os.environ.get("SHORTLIST_SIZE", "0"))  # 0=off
MAX_DEALS = int(os.environ.get("MAX_DEALS", "0"))  # 0=all
READ_TIMEOUT = int(os.environ.get("READ_TIMEOUT", "20"))
USER_AGENT = os.environ.get(
    "USER_AGENT",
    "TravelScoutBot/1.0 (+https://travelscout.co.nz) PythonRequests"
)

# ---- Your analysis prompt ----
USER_PROMPT_CORE = (
    "Attached is a file filled with Travel deals sourced from the internet. I want you to go through the details "
    "and find the best deals. To find the best deals I want you to check to see what is included in the deal, and then "
    "go to the link provided and compare that with what it costs to create that same booking yourself through the likes "
    "of booking.com or expedia or with the suppliers directly, you will need to source this from those sites. Then i want you to collate the top 10 deals that provide "
    "the best deals and give a breakdown of the do it yourself version compared to the travel agency version and provide "
    "sources for where you got the information. What defines a good deal is when the travel agency deal is better than the DIY deal."
    "Be sure to bear in mind that the costs are provided as a per person twin "
    "share whereas when comparing with the likes of a hotel, the cost is not per person, so that is a key consideration "
    "when comparing the deals. I also want you to rate the deals out of 10. Ignore any deals that show more than 21 nights "
    "as they are often an error. Review the options and ensure that if flights are included you need to be making sure that "
    "they are included because you got it wrong on quite a few options. So re run the analysis and ensure you are accurately "
    "capturing when flights are included in the deal. Do the analysis and consider deals that don't include flights (ie hotel "
    "only deals) and rate them as to whether they are a good deal or not ie cruise deals can be good or tours etc. So make sure "
    "you are considering everything when rating for the best deals. But if one of the deals you've already outlined still comes "
    "out as a great deal then still include it on the list of top 10 deals"
)

SCHEMA_INSTRUCTIONS = """
Return ONLY valid JSON with this exact top-level schema (no extra keys, no prose):

{
  "deal_id": "<string or number>",
  "title": "<string>",
  "url": "<string>",
  "source": "<string|null>",
  "nights": <number|null>,
  "pp_price": <number|null>,
  "package_total_for_two": <number|null>,
  "includes_flights": <boolean>,
  "inclusions_evidence": "<short quotes or bullet points from the page text>",
  "diy_breakdown": {
    "flights": {
      "included": <boolean>,
      "assumed_route": "<string|null>",
      "price_total_for_two": <number|null>,
      "sources": ["<url>", "..."]
    },
    "hotel": {
      "name_or_hint": "<string|null>",
      "nights": <number|null>,
      "price_total_for_stay": <number|null>,
      "sources": ["<url>", "..."]
    },
    "other": {
      "items": [
        {"label": "<string>", "price": <number|null>, "source": "<url|null>"}
      ],
      "notes": "<string>"
    },
    "diy_total_for_two": <number|null>
  },
  "estimated_savings_vs_diy": {
    "abs": <number|null>,
    "pct": <number|null>
  },
  "rating_out_of_10": <number>,
  "reasoning": "<short but specific critique>",
  "additional_notes": "<optional string>",
  "citations": ["<url>", "..."]
}

Rules:
- If you cannot reliably obtain DIY prices, set numeric fields to null, explain in 'reasoning', and still rate.
- Never invent URLs. Only cite links you were provided or could directly infer (e.g., the deal page).
- Hotel costs are NOT per person. Use room-based math.
- Flights included must be based on the provided page text; quote the section used.
- Keep numbers as raw numbers (no commas or currency symbols).
"""

def stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M")

def find_latest_packages(data_dir: Path, override: Optional[str] = None) -> Path:
    if override:
        cand = Path(override)
        if not cand.is_absolute():
            p1 = REPO_ROOT / cand
            p2 = data_dir / cand
            if p1.exists():
                return p1
            if p2.exists():
                return p2
        if cand.exists():
            return cand
        raise FileNotFoundError(f"PACKAGES_FILE override not found: {override}")

    candidates = sorted(
        data_dir.glob("packages.final*.jsonl"),  # wildcard to match variations
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        listing = [p.name for p in sorted(data_dir.glob('*'))][:50] if data_dir.exists() else []
        raise FileNotFoundError(f"No packages.final*.jsonl found in {data_dir}. Found: {listing}")
    return candidates[0]

def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            try:
                out.append(json.loads(s))
            except Exception:
                continue
    return out

def to_number(v: Any) -> Optional[float]:
    try:
        if v is None: return None
        if isinstance(v, (int, float)): return float(v)
        s = str(v).replace(",", "").strip()
        return float(s)
    except Exception:
        return None

def normalize_deal(d: Dict[str, Any]) -> Dict[str, Any]:
    title = d.get("title") or d.get("name") or d.get("headline")
    url   = d.get("url") or d.get("link") or d.get("deal_url")
    src   = d.get("source") or d.get("agency") or d.get("site")
    nights = to_number(d.get("nights") or d.get("duration") or d.get("duration_nights"))
    price_pp = to_number(d.get("price") or d.get("price_per_person") or d.get("pp_price") or d.get("price_pp"))
    pkg2 = price_pp * 2 if isinstance(price_pp, (int, float)) else None
    return {
        "id": d.get("id") or d.get("_id") or d.get("uid") or d.get("hash") or d.get("title") or url,
        "title": title,
        "url": url,
        "source": src,
        "nights": nights,
        "pp_price": price_pp,
        "package_total_for_two": pkg2,
        "raw": d,
    }

def fetch_page_text(url: str, timeout: int = READ_TIMEOUT) -> str:
    if not url or not url.startswith(("http://", "https://")):
        return ""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
    }
    try:
        r = requests.get(url, headers=headers, timeout=timeout)
        r.raise_for_status()
        soup = BeautifulSoup(r.text or "", "lxml")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        for cls in ["header", "navbar", "footer", "cookie", "consent"]:
            for el in soup.select(f".{cls}"):
                el.decompose()
        text = " ".join(soup.get_text(separator=" ").split())
        return text[:12000]
    except Exception:
        return ""

def build_messages_for_deal(deal_norm: Dict[str, Any], page_text: str) -> List[Dict[str, str]]:
    system = (
        "You are a meticulous travel analyst. Return only valid JSON per instructions. "
        "Do not include explanations outside JSON."
    )
    deal_block = {
        "id": deal_norm["id"],
        "title": deal_norm["title"],
        "url": deal_norm["url"],
        "source": deal_norm["source"],
        "nights": deal_norm["nights"],
        "pp_price": deal_norm["pp_price"],
        "package_total_for_two": deal_norm["package_total_for_two"],
    }
    page_hint = page_text or "(no page text fetched)"
    user = f"""
{USER_PROMPT_CORE}

This payload is ONE deal. Evaluate it in isolation and return the strict JSON schema described below.

### Deal JSON
```json
{json.dumps(deal_block, ensure_ascii=False)}
```

### Deal Page Text (excerpts)
```
{page_hint}
```

{SCHEMA_INSTRUCTIONS}
""".strip()
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

def openai_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)
    if OpenAI is not None:
        return OpenAI(api_key=api_key), "new"
    if openai is None:
        print("ERROR: openai SDK not installed.", file=sys.stderr)
        sys.exit(1)
    openai.api_key = api_key
    return openai, "legacy"

def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return s

def safe_json_parse(content: str) -> Dict[str, Any]:
    s = _strip_code_fences(content)
    if "{" in s and "}" in s:
        start = s.find("{")
        end = s.rfind("}")
        candidate = s[start:end+1]
        try:
            return json.loads(candidate)
        except Exception:
            pass
    try:
        return json.loads(s)
    except Exception:
        return {"_error": "bad_json", "_raw": content}

def call_openai(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    client, flavor = openai_client()
    attempts = 0
    last_err: Optional[str] = None
    while attempts < 3:
        attempts += 1
        try:
            if flavor == "new":
                resp = client.chat.completions.create(
                    model=MODEL,
                    messages=messages,
                    temperature=0.2,
                    response_format={"type": "json_object"},
                    max_tokens=3500,
                )
                content = (resp.choices[0].message.content or "").strip()
            else:
                resp = openai.ChatCompletion.create(
                    model=MODEL,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=3500,
                )
                content = (resp["choices"][0]["message"]["content"] or "").strip()
            parsed = safe_json_parse(content)
            if isinstance(parsed, dict) and "_raw_snippet" not in parsed:
                parsed["_raw_snippet"] = content[:5000]
            return parsed
        except Exception as e:
            last_err = str(e)
            time.sleep(0.8 * attempts)
    return {"_error": f"openai_failed: {last_err or 'unknown'}"}

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

# ---- simple shortlist heuristic (optional) ----
def heuristic_value_score(nd: Dict[str, Any]) -> float:
    """
    Lower is 'better' (cheaper per room-night).
    Gently favor titles that look like they include flights.
    """
    nights = nd.get("nights") or 0
    cost2 = nd.get("package_total_for_two")
    if not nights or not cost2:
        return float("inf")
    score = float(cost2) / float(nights)
    title = (nd.get("title") or "").lower()
    if "flight" in title or "airfare" in title or "flights" in title:
        score *= 0.95  # small boost
    return score

def main():
    latest = find_latest_packages(DATA_DIR, override=os.environ.get("PACKAGES_FILE"))
    deals = read_jsonl(latest)
    if not deals:
        print(f"No rows in {latest}", file=sys.stderr)
        sys.exit(0)

    # Normalize + drop >21 nights
    normalized: List[Dict[str, Any]] = []
    for d in deals:
        nd = normalize_deal(d)
        if nd["nights"] is not None and nd["nights"] > 21:
            continue
        normalized.append(nd)

    # Optional MAX_DEALS for testing
    if MAX_DEALS > 0:
        normalized = normalized[:MAX_DEALS]

    # Optional shortlist to cap OpenAI calls
    analyzed_input = normalized
    if SHORTLIST_SIZE > 0 and len(normalized) > SHORTLIST_SIZE:
        analyzed_input = sorted(normalized, key=heuristic_value_score)[:SHORTLIST_SIZE]

    run_id = stamp()
    out_dir = OUT_BASE / run_id
    ensure_dir(out_dir)

    meta = {
        "input_file": str(latest.relative_to(REPO_ROOT)) if str(latest).startswith(str(REPO_ROOT)) else str(latest),
        "rows_in_file": len(deals),
        "rows_after_filter": len(normalized),
        "rows_analyzed": len(analyzed_input),
        "model": MODEL,
        "run_id": run_id,
        "generated_at_utc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "top_n": TOP_N,
        "shortlist_size": SHORTLIST_SIZE,
    }
    (out_dir / "run_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Deep analysis (OpenAI) – do NOT write per-deal here
    per_results: List[Dict[str, Any]] = []
    for idx, nd in enumerate(analyzed_input, 1):
        url = nd["url"] or ""
        page_text = fetch_page_text(url)
        messages = build_messages_for_deal(nd, page_text)
        result = call_openai(messages)

        if isinstance(result, dict):
            result.setdefault("package_total_for_two", nd["package_total_for_two"])
            result.setdefault("pp_price", nd["pp_price"])
            result.setdefault("nights", nd["nights"])
            result.setdefault("url", nd["url"])
            result.setdefault("title", nd["title"])
            result.setdefault("source", nd["source"])
            result.setdefault("deal_id", nd["id"])

        per_results.append(result)
        time.sleep(0.35)  # pacing

    # Combine into JSONL (all analyzed)
    combined_path = out_dir / "combined.jsonl"
    with combined_path.open("w", encoding="utf-8") as f:
        for r in per_results:
            f.write(json.dumps(r, ensure_ascii=False) + "\\n")

    # Rank and select Top-N
    def rating_of(r: Dict[str, Any]) -> float:
        try:
            return float(r.get("rating_out_of_10") or 0.0)
        except Exception:
            return 0.0

    def savings_abs(r: Dict[str, Any]) -> float:
        try:
            v = r.get("estimated_savings_vs_diy", {}).get("abs")
            return float(v or 0.0)
        except Exception:
            return 0.0

    ranked = sorted(per_results, key=lambda x: (rating_of(x), savings_abs(x)), reverse=True)
    topN = ranked[:TOP_N]

    # Write only Top-N per-deal JSON
    per_deal_dir = out_dir / "per-deal"
    ensure_dir(per_deal_dir)
    for i, r in enumerate(topN, 1):
        rid = str(r.get("deal_id") or r.get("title") or i)
        rid = "".join(ch for ch in rid if ch.isalnum() or ch in ("-", "_"))[:60] or f"rank{i:02d}"
        (per_deal_dir / f"rank-{i:02d}-{rid}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")

    # Top-N JSON + Markdown
    (out_dir / f"top{TOP_N}.json").write_text(json.dumps(topN, indent=2), encoding="utf-8")

    lines = [f"# Top {TOP_N} deals (model: {MODEL})", "", f"_Run: {run_id}_", ""]
    for i, r in enumerate(topN, 1):
        title = r.get("title") or "Untitled"
        url = r.get("url") or ""
        nights = r.get("nights")
        pkg2 = r.get("package_total_for_two")
        inc_flights = r.get("includes_flights")
        diy_total = (r.get("diy_breakdown") or {}).get("diy_total_for_two")
        sav = r.get("estimated_savings_vs_diy") or {}
        sav_abs = sav.get("abs")
        sav_pct = sav.get("pct")
        rating = rating_of(r)
        reason = (r.get("reasoning") or "").strip()
        cites = r.get("citations") or []

        def fmt(x):
            return "—" if x in (None, "", []) else f"{x}"
        def fnum(x):
            try:
                return f"NZD {float(x):,.0f}"
            except Exception:
                return "—"

        lines += [
            f"## {i}. {title}",
            f"- Link: {url}",
            f"- Nights: {fmt(nights)}  |  Includes flights: **{bool(inc_flights)}**",
            f"- Package (2 pax): {fnum(pkg2)}  |  DIY total (2 pax): {fnum(diy_total)}",
            f"- Estimated savings: {fnum(sav_abs)} ({fmt(f'{sav_pct:.1f}%') if isinstance(sav_pct,(int,float)) else '—'})",
            f"- Rating: **{rating:.1f}/10**",
            f"- Reasoning: {reason or '—'}",
            f"- Sources: {', '.join(cites) if cites else '—'}",
            ""
        ]
    (out_dir / f"top{TOP_N}.md").write_text("\\n".join(lines), encoding="utf-8")

    # Latest pointer
    (OUT_BASE / "LATEST.txt").write_text(run_id + "\\n", encoding="utf-8")

    print("✅ Analysis complete")
    print("Artifacts:")
    print("  ", (out_dir / f'top{TOP_N}.md').relative_to(REPO_ROOT))
    print("  ", (out_dir / f'top{TOP_N}.json').relative_to(REPO_ROOT))
    print("  ", combined_path.relative_to(REPO_ROOT))
    print("  ", (out_dir / 'per-deal').relative_to(REPO_ROOT))
    print("  ", (OUT_BASE / 'LATEST.txt').relative_to(REPO_ROOT))


if __name__ == "__main__":
    main()
