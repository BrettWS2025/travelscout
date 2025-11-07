# scripts/analyze_deals.py
"""
Analyze travel deals with OpenAI and produce a Top 10 report.

- Picks the latest public/data/packages.final*.jsonl
- Filters out rows with nights > 21
- Fetches deal page HTML (to verify inclusions like flights)
- Calls OpenAI per deal with your prompt; model returns strict JSON for that deal
- Aggregates + ranks by model rating to produce a Top 10
- Writes all artifacts to public/reports/deals-openai/<run-id>/

ENV:
  OPENAI_API_KEY (required)
  OPENAI_MODEL=gpt-4o-mini            (optional)
  MAX_DEALS=0                         (optional, 0 means "all")
  READ_TIMEOUT=20                     (optional, seconds for HTTP)
  USER_AGENT="TravelScoutBot/1.0 ..." (optional)
"""

from __future__ import annotations
import json
import os
import sys
import time
import glob
import math
import textwrap
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

# OpenAI SDK (>=1.0)
try:
    import openai  # legacy import shim; fallback to new client if available
except Exception:
    openai = None

try:
    from openai import OpenAI  # new-style client (openai>=1.0)
except Exception:
    OpenAI = None


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "public" / "data"
OUT_BASE = REPO_ROOT / "public" / "reports" / "deals-openai"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
MAX_DEALS = int(os.environ.get("MAX_DEALS", "0"))  # 0=all
READ_TIMEOUT = int(os.environ.get("READ_TIMEOUT", "20"))
USER_AGENT = os.environ.get(
    "USER_AGENT",
    "TravelScoutBot/1.0 (+https://travelscout.co.nz) PythonRequests"
)

# ---- Your analysis prompt (as provided) ----
USER_PROMPT_CORE = (
    "Attached is a file filled with Travel deals sourced from the internet. I want you to go through the details "
    "and find the best deals. To find the best deals I want you to check to see what is included in the deal, and then "
    "go to the link provided and compare that with what it costs to create that same booking yourself through the likes "
    "of booking.com or expedia or with the suppliers directly. Then i want you to collate the top 10 deals that provide "
    "the best deals and give a breakdown of the do it yourself version compared to the travel agency version and provide "
    "sources for where you got the information. Be sure to bear in mind that the costs are provided as a per person twin "
    "share whereas when comparing with the likes of a hotel, the cost is not per person, so that is a key consideration "
    "when comparing the deals. I also want you to rate the deals out of 10. Ignore any deals that show more than 21 nights "
    "as they are often an error. Review the options and ensure that if flights are included you need to be making sure that "
    "they are included because you got it wrong on quite a few options. So re run the analysis and ensure you are accurately "
    "capturing when flights are included in the deal. d o the analysis and consider deals that don't include flights ( ie hotel "
    "only deals) and rate them as to whether they are a good deal or not ie cruise deals can be good or tours etc. So make sur "
    "eyou are considering everything when rating for the best deals. But if one of the deals you've already outlined still comes "
    "out as a great deal then still include it on the list of top 10 deals"
)

# We’ll ask the model to return **strict JSON** per deal with this schema.
SCHEMA_INSTRUCTIONS = """
Return ONLY valid JSON with this exact top-level schema (no extra keys, no prose):

{
  "deal_id": "<string or number>",
  "title": "<string>",
  "url": "<string>",
  "source": "<string|null>",
  "nights": <number|null>,
  "pp_price": <number|null>,                  // per person price if shown
  "package_total_for_two": <number|null>,     // pp * 2 if pp_price given, else null
  "includes_flights": <boolean>,              // based on page text and deal details provided
  "inclusions_evidence": "<short quotes or bullet points from the page text>",
  "diy_breakdown": {
    "flights": {
      "included": <boolean>,
      "assumed_route": "<string|null>",
      "price_total_for_two": <number|null>,
      "sources": ["<url>", "..."]            // links you relied on for flight pricing (if any)
    },
    "hotel": {
      "name_or_hint": "<string|null>",
      "nights": <number|null>,
      "price_total_for_stay": <number|null>, // room-based, not per person
      "sources": ["<url>", "..."]            // links you relied on for hotel pricing (if any)
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
  "rating_out_of_10": <number>,               // 1..10
  "reasoning": "<short but specific critique>",
  "additional_notes": "<optional string>",
  "citations": ["<url>", "..."]               // include the deal page url; add any others you used
}

Rules:
- If you cannot reliably obtain DIY prices, set numeric fields to null, explain in 'reasoning', and still rate.
- Never invent URLs. Only cite links you were provided or could directly infer (e.g., the deal page).
- Hotel costs are NOT per person. Use room-based math.
- Flights included must be based on the provided page text; quote the section used.
- Keep numbers as raw numbers (no commas or currency symbols).
"""

# ----------------- helpers -----------------

def stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M")

def find_latest_packages(data_dir: Path) -> Path:
    candidates = sorted(data_dir.glob("packages.final*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        raise FileNotFoundError(f"No packages.final*.jsonl found in {data_dir}")
    return candidates[0]

def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    out = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                # tolerate occasional broken lines
                continue
    return out

def to_number(v: Any) -> Optional[float]:
    try:
        if v is None: return None
        if isinstance(v, (int, float)): return float(v)
        # strip non-numeric (commas, currency symbols)
        s = str(v).replace(",", "").strip()
        # keep leading digits and dot
        return float(s)
    except Exception:
        return None

def normalize_deal(d: Dict[str, Any]) -> Dict[str, Any]:
    # try to find common fields
    title = d.get("title") or d.get("name") or d.get("headline")
    url   = d.get("url") or d.get("link") or d.get("deal_url")
    src   = d.get("source") or d.get("agency") or d.get("site")
    nights = d.get("nights") or d.get("duration") or d.get("duration_nights")
    nights = to_number(nights)

    price_pp = d.get("price") or d.get("price_per_person") or d.get("pp_price") or d.get("price_pp")
    price_pp = to_number(price_pp)
    package_total_for_two = price_pp * 2 if isinstance(price_pp, (int, float)) else None

    return {
        "id": d.get("id") or d.get("_id") or d.get("uid") or d.get("hash") or d.get("title") or url,
        "title": title,
        "url": url,
        "source": src,
        "nights": nights,
        "pp_price": price_pp,
        "package_total_for_two": package_total_for_two,
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
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        html = resp.text or ""
        soup = BeautifulSoup(html, "lxml")
        # remove scripts/styles/nav/footer to reduce noise
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        # light attempt to remove repeated nav/footer chunks
        for cls in ["header", "navbar", "footer", "site-footer", "cookie", "consent"]:
            for el in soup.select(f".{cls}"):
                el.decompose()
        text = " ".join(soup.get_text(separator=" ").split())
        # cap to a sane size (model context safety)
        return text[:12000]
    except Exception:
        return ""

def build_messages_for_deal(deal_norm: Dict[str, Any], page_text: str) -> List[Dict[str, str]]:
    # System prompt keeps the model concise & JSON-only
    system = (
        "You are a meticulous travel analyst. You must return only valid JSON per instructions. "
        "Work step-by-step but do not expose chain-of-thought; only include final fields in JSON."
    )
    # Compose the per-deal payload
    deal_block = {
        "id": deal_norm["id"],
        "title": deal_norm["title"],
        "url": deal_norm["url"],
        "source": deal_norm["source"],
        "nights": deal_norm["nights"],
        "pp_price": deal_norm["pp_price"],
        "package_total_for_two": deal_norm["package_total_for_two"],
    }

    # The page text helps confirm inclusions (e.g., flights)
    page_hint = page_text or "(no page text fetched)"

    user = f"""
{USER_PROMPT_CORE}

This payload is ONE deal. Evaluate it in isolation and return the strict JSON schema described below.

### Deal JSON
```json
{json.dumps(deal_block, ensure_ascii=False)}
