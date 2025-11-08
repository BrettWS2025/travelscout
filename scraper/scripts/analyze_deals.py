#!/usr/bin/env python3
# scraper/scripts/analyze_deals.py
"""
Fast analyze: dedupe, prune, parallel fetch, snippet extraction, Top‑N outputs.

ENV (new + existing):
  OPENAI_API_KEY               (required)
  OPENAI_MODEL=gpt-4o-mini     (optional)
  TOP_N=20                     (save per-deal JSONs only for Top‑N)
  PRUNE_PERCENTILE=60          (keep cheapest X% by heuristic before OpenAI; 0=off)
  SHORTLIST_SIZE=400           (cap count after pruning; 0=off)
  MAX_DEALS=0                  (testing cap; 0=all after filters)
  PARALLEL_FETCH=12            (concurrent page fetches)
  READ_TIMEOUT=10              (seconds per fetch)
  CACHE_PAGES=1                (1=use disk cache at scraper/.cache/pages, 0=off)
  PAUSE_BETWEEN_CALLS=0.15     (seconds between OpenAI calls; 0 to disable)
  PACKAGES_FILE=public/data/packages.final.jsonl  (optional, override input)
"""

from __future__ import annotations
import json
import os
import sys
import time
import math
import hashlib
import concurrent.futures as cf
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
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

# ---------- config & helpers ----------
def _compute_repo_root() -> Path:
    here = Path(__file__).resolve()
    for p in here.parents:
        if (p / "public").is_dir():
            return p
    for p in here.parents:
        if (p / ".git").exists():
            return p
    return here.parents[2] if len(here.parents) >= 3 else here.parents[1]

REPO_ROOT = Path(os.environ.get("REPO_ROOT", _compute_repo_root()))
DATA_DIR = REPO_ROOT / "public" / "data"
OUT_BASE = REPO_ROOT / "public" / "reports" / "deals-openai"
CACHE_DIR = REPO_ROOT / "scraper" / ".cache" / "pages"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
TOP_N = int(os.environ.get("TOP_N", "20"))
PRUNE_PERCENTILE = int(os.environ.get("PRUNE_PERCENTILE", "60"))
SHORTLIST_SIZE = int(os.environ.get("SHORTLIST_SIZE", "400"))
MAX_DEALS = int(os.environ.get("MAX_DEALS", "0"))
READ_TIMEOUT = int(os.environ.get("READ_TIMEOUT", "10"))
PARALLEL_FETCH = int(os.environ.get("PARALLEL_FETCH", "12"))
CACHE_PAGES = os.environ.get("CACHE_PAGES", "1") not in ("0", "false", "False", "")
PAUSE_BETWEEN_CALLS = float(os.environ.get("PAUSE_BETWEEN_CALLS", "0.15"))
USER_AGENT = os.environ.get(
    "USER_AGENT", "TravelScoutBot/1.0 (+https://travelscout.co.nz) PythonRequests"
)

USER_PROMPT_CORE = (
    "Attached is a file filled with Travel deals sourced from the internet. I want you to go through the details "
    "and find the best deals. To find the best deals I want you to check to see what is included in the deal, and then "
    "go to the link provided and compare that with what it costs to create that same booking yourself through the likes "
    "of booking.com or expedia or with the suppliers directly, you will need to source this from those sites. Then i want you to collate the top 10 deals that provide "
    "the best deals and give a breakdown of the do it yourself version compared to the travel agency version and provide "
    "sources for where you got the information. Be sure to bear in mind that the costs are provided as a per person twin "
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
        data_dir.glob("packages.final*.jsonl"),
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

# ---------- dedupe & shortlist ----------
def canonical_url(u: Optional[str]) -> Optional[str]:
    if not u:
        return None
    try:
        p = urlparse(u)
        # keep scheme+netloc+path; drop query/fragment for dedupe
        return f"{p.scheme}://{p.netloc}{p.path}".rstrip("/")
    except Exception:
        return u

def normalize_title_key(t: Optional[str]) -> Optional[str]:
    if not t:
        return None
    s = "".join(ch.lower() for ch in t if ch.isalnum() or ch.isspace())
    return " ".join(s.split()) or None

def dedupe_deals(deals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[Tuple[Optional[str], Optional[str]]] = set()
    out: List[Dict[str, Any]] = []
    for d in deals:
        key = (canonical_url(d.get("url")), normalize_title_key(d.get("title")))
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out

def heuristic_value_score(nd: Dict[str, Any]) -> float:
    nights = nd.get("nights") or 0
    total2 = nd.get("package_total_for_two")
    if not nights or not total2:
        return float("inf")
    score = float(total2) / float(nights)
    title = (nd.get("title") or "").lower()
    if "flight" in title or "airfare" in title or "flights" in title:
        score *= 0.95
    return score

def prune_by_percentile(rows: List[Dict[str, Any]], keep_pct: int) -> List[Dict[str, Any]]:
    if keep_pct <= 0 or keep_pct >= 100 or not rows:
        return rows
    scored = [(heuristic_value_score(r), r) for r in rows]
    scored.sort(key=lambda x: x[0])
    k = max(1, math.ceil(len(scored) * keep_pct / 100))
    return [r for _, r in scored[:k]]

# ---------- requests session & cache ----------
def make_session() -> requests.Session:
    s = requests.Session()
    retries = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=PARALLEL_FETCH, pool_maxsize=PARALLEL_FETCH)
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
    })
    return s

def cache_path_for(url: str) -> Path:
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{h}.txt"

def fetch_page_text(session: requests.Session, url: str) -> str:
    if not url or not url.startswith(("http://", "https://")):
        return ""
    if CACHE_PAGES:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cp = cache_path_for(url)
        if cp.exists():
            try:
                return cp.read_text(encoding="utf-8")
            except Exception:
                pass
    try:
        r = session.get(url, timeout=READ_TIMEOUT)
        r.raise_for_status()
        soup = BeautifulSoup(r.text or "", "lxml")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        for cls in ["header", "navbar", "footer", "cookie", "consent"]:
            for el in soup.select(f".{cls}"):
                el.decompose()
        text = " ".join(soup.get_text(separator=" ").split())
        if CACHE_PAGES:
            try:
                cache_path_for(url).write_text(text, encoding="utf-8")
            except Exception:
                pass
        return text
    except Exception:
        return ""

KEYWORDS = [
    "include", "includes", "included", "inclusions",
    "what's included", "whats included",
    "flight", "flights", "airfare", "airfares",
    "itinerary", "terms", "conditions", "exclusions",
    "price includes", "package includes",
]

def extract_relevant_snippets(text: str, max_chars: int = 2500, window: int = 240) -> str:
    if not text:
        return ""
    t = text
    idxs = []
    low = t.lower()
    for kw in KEYWORDS:
        start = 0
        kwl = kw.lower()
        while True:
            i = low.find(kwl, start)
            if i == -1:
                break
            idxs.append(i)
            start = i + len(kwl)
    if not idxs:
        return t[:max_chars]
    idxs = sorted(set(idxs))
    chunks = []
    for i in idxs:
        a = max(0, i - window)
        b = min(len(t), i + window)
        chunks.append(t[a:b])
    joined = "\\n...\\n".join(chunks)
    if len(joined) <= max_chars:
        return joined
    return joined[:max_chars]

# ---------- OpenAI ----------
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

def build_messages_for_deal(deal_norm: Dict[str, Any], page_text_snippet: str) -> List[Dict[str, str]]:
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
    page_hint = page_text_snippet or "(no page text fetched)"
    user = f"""
{USER_PROMPT_CORE}

This payload is ONE deal. Evaluate it in isolation and return the strict JSON schema described below.

### Deal JSON
```json
{json.dumps(deal_block, ensure_ascii=False)}
```

### Deal Page Text (relevant excerpts)
```
{page_hint}
```

{SCHEMA_INSTRUCTIONS}
""".strip()
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

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
                    max_tokens=3000,
                )
                content = (resp.choices[0].message.content or "").strip()
            else:
                resp = openai.ChatCompletion.create(
                    model=MODEL,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=3000,
                )
                content = (resp["choices"][0]["message"]["content"] or "").strip()
            parsed = safe_json_parse(content)
            if isinstance(parsed, dict) and "_raw_snippet" not in parsed:
                parsed["_raw_snippet"] = content[:3000]
            return parsed
        except Exception as e:
            last_err = str(e)
            time.sleep(0.8 * attempts)
    return {"_error": f"openai_failed: {last_err or 'unknown'}"}

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

# ---------- main ----------
def main():
    latest = find_latest_packages(DATA_DIR, override=os.environ.get("PACKAGES_FILE"))
    raw = read_jsonl(latest)
    if not raw:
        print(f"No rows in {latest}", file=sys.stderr)
        sys.exit(0)

    # Normalize + basic filters
    normalized: List[Dict[str, Any]] = []
    for d in raw:
        nd = normalize_deal(d)
        if nd["nights"] is not None and nd["nights"] > 21:
            continue
        normalized.append(nd)

    # Dedupe
    deduped = dedupe_deals(normalized)

    # Optional MAX_DEALS cap (for testing)
    if MAX_DEALS > 0:
        deduped = deduped[:MAX_DEALS]

    # Heuristic pruning (percentile) then shortlist cap
    pruned = prune_by_percentile(deduped, PRUNE_PERCENTILE) if PRUNE_PERCENTILE else deduped
    analyzed_input = pruned[:SHORTLIST_SIZE] if SHORTLIST_SIZE and len(pruned) > SHORTLIST_SIZE else pruned

    run_id = datetime.utcnow().strftime("%Y%m%d-%H%M")
    out_dir = OUT_BASE / run_id
    ensure_dir(out_dir)

    meta = {
        "input_file": str(latest.relative_to(REPO_ROOT)) if str(latest).startswith(str(REPO_ROOT)) else str(latest),
        "rows_in_file": len(raw),
        "rows_after_filter": len(normalized),
        "rows_after_dedupe": len(deduped),
        "rows_after_prune": len(pruned),
        "rows_analyzed": len(analyzed_input),
        "model": MODEL,
        "run_id": run_id,
        "generated_at_utc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "top_n": TOP_N,
        "prune_percentile": PRUNE_PERCENTILE,
        "shortlist_size": SHORTLIST_SIZE,
        "parallel_fetch": PARALLEL_FETCH,
        "read_timeout": READ_TIMEOUT,
        "cache_pages": bool(CACHE_PAGES),
    }
    (out_dir / "run_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Parallel fetch pages, extract only relevant snippets
    sess = make_session()
    urls = [d.get("url") or "" for d in analyzed_input]
    def fetch_and_snip(u: str) -> str:
        return extract_relevant_snippets(fetch_page_text(sess, u))

    page_snippets: List[str] = []
    with cf.ThreadPoolExecutor(max_workers=PARALLEL_FETCH) as ex:
        for txt in ex.map(fetch_and_snip, urls):
            page_snippets.append(txt)

    # Deep analysis (OpenAI)
    per_results: List[Dict[str, Any]] = []
    for nd, snippet in zip(analyzed_input, page_snippets):
        messages = build_messages_for_deal(nd, snippet)
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
        if PAUSE_BETWEEN_CALLS > 0:
            time.sleep(PAUSE_BETWEEN_CALLS)

    # Combined JSONL for all analyzed
    combined_path = out_dir / "combined.jsonl"
    with combined_path.open("w", encoding="utf-8") as f:
        for r in per_results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Rank & select Top‑N
    def rating_of(r: Dict[str, Any]) -> float:
        try:
            return float(r.get("rating_out_of_10") or 0.0)
        except Exception:
            return 0.0

    def savings_abs(r: Dict[str, Any]) -> float:
        try:
            v = r.get("estimated_savings_vs_diy", {}).get("abs")
        except Exception:
            v = None
        try:
            return float(v or 0.0)
        except Exception:
            return 0.0

    ranked = sorted(per_results, key=lambda x: (rating_of(x), savings_abs(x)), reverse=True)
    topN = ranked[:TOP_N]

    # Per‑deal only for Top‑N
    per_deal_dir = out_dir / "per-deal"
    ensure_dir(per_deal_dir)
    for i, r in enumerate(topN, 1):
        rid = str(r.get("deal_id") or r.get("title") or i)
        rid = "".join(ch for ch in rid if ch.isalnum() or ch in ("-", "_"))[:60] or f"rank{i:02d}"
        (per_deal_dir / f"rank-{i:02d}-{rid}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")

    # Top‑N JSON + Markdown
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
    (out_dir / f"top{TOP_N}.md").write_text("\n".join(lines), encoding="utf-8")

    # Latest pointer
    (OUT_BASE / "LATEST.txt").write_text(run_id + "\n", encoding="utf-8")

    print("✅ Analysis complete")
    print("Artifacts:")
    print("  ", (out_dir / f'top{TOP_N}.md').relative_to(REPO_ROOT))
    print("  ", (out_dir / f'top{TOP_N}.json').relative_to(REPO_ROOT))
    print("  ", combined_path.relative_to(REPO_ROOT))
    print("  ", (out_dir / 'per-deal').relative_to(REPO_ROOT))
    print("  ", (OUT_BASE / 'LATEST.txt').relative_to(REPO_ROOT))


if __name__ == "__main__":
    main()
