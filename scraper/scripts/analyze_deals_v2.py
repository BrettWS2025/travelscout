#!/usr/bin/env python3
# scraper/scripts/analyze_deals_v2.py
"""
Deal auditor v2 (gpt-4o-mini default): deterministic parsing + optional DIY price adapters + strict JSON outputs.

ENV (new + existing):
  OPENAI_API_KEY                     (required)
  OPENAI_MODEL=gpt-4o-mini           (suggested default here)
  BASE_CURRENCY=NZD
  ORIGIN_AIRPORT=AKL
  COUNTRY_HINT=NZ

  # Behavior controls
  TOP_N=20
  PRUNE_PERCENTILE=60
  SHORTLIST_SIZE=400
  MAX_DEALS=0
  PARALLEL_FETCH=12
  READ_TIMEOUT=12
  CACHE_PAGES=1
  PAUSE_BETWEEN_CALLS=0.10
  PACKAGES_FILE=public/data/packages.final.jsonl

  # Optional adapters — configure any subset; missing ones are skipped gracefully.
  KIWI_TEQUILA_API_KEY=
  KIWI_BAGS=1
  KIWI_CABIN=M
  AMADEUS_CLIENT_ID=
  AMADEUS_CLIENT_SECRET=
  AMADEUS_ENV=test
  OXR_APP_ID=
  FX_RATE_NZD=1.0
"""

from __future__ import annotations
import json, os, sys, time, math, re, hashlib
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

try:
    import dateparser  # optional
except Exception:
    dateparser = None

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
OUT_BASE = REPO_ROOT / "public" / "reports" / "deals-openai-v2"
CACHE_DIR = REPO_ROOT / "scraper" / ".cache" / "pages"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
TOP_N = int(os.environ.get("TOP_N", "20"))
PRUNE_PERCENTILE = int(os.environ.get("PRUNE_PERCENTILE", "60"))
SHORTLIST_SIZE = int(os.environ.get("SHORTLIST_SIZE", "400"))
MAX_DEALS = int(os.environ.get("MAX_DEALS", "0"))
READ_TIMEOUT = int(os.environ.get("READ_TIMEOUT", "12"))
PARALLEL_FETCH = int(os.environ.get("PARALLEL_FETCH", "12"))
CACHE_PAGES = os.environ.get("CACHE_PAGES", "1") not in ("0", "false", "False", "")
PAUSE_BETWEEN_CALLS = float(os.environ.get("PAUSE_BETWEEN_CALLS", "0.10"))

BASE_CCY = os.environ.get("BASE_CURRENCY", "NZD")
ORIGIN_AIRPORT = os.environ.get("ORIGIN_AIRPORT", "AKL")
COUNTRY_HINT = os.environ.get("COUNTRY_HINT", "NZ")

KIWI_KEY = os.environ.get("KIWI_TEQUILA_API_KEY", "").strip()
KIWI_BAGS = int(os.environ.get("KIWI_BAGS", "1"))
KIWI_CABIN = os.environ.get("KIWI_CABIN", "M")

AMADEUS_ID = os.environ.get("AMADEUS_CLIENT_ID", "").strip()
AMADEUS_SECRET = os.environ.get("AMADEUS_CLIENT_SECRET", "").strip()
AMADEUS_ENV = os.environ.get("AMADEUS_ENV", "test")

OXR_APP_ID = os.environ.get("OXR_APP_ID", "").strip()
FX_RATE_NZD = float(os.environ.get("FX_RATE_NZD", "1.0"))

USER_AGENT = os.environ.get(
    "USER_AGENT", "TravelScoutBot/2.0 (+https://travelscout.co.nz) PythonRequests"
)

def stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M")

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def to_number(v: Any) -> Optional[float]:
    try:
        if v is None: return None
        if isinstance(v, (int, float)): return float(v)
        import re as _re
        s = str(v).replace(",", "").replace("$","").strip()
        return float(_re.sub(r"[^0-9.\-]", "", s))
    except Exception:
        return None

# ---------- IO ----------
def find_latest_packages(data_dir: Path, override: Optional[str] = None) -> Path:
    if override:
        cand = Path(override)
        if not cand.is_absolute():
            p1 = REPO_ROOT / cand
            p2 = data_dir / cand
            if p1.exists(): return p1
            if p2.exists(): return p2
        if cand.exists(): return cand
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
            if not s: continue
            try:
                out.append(json.loads(s))
            except Exception:
                continue
    return out

# ---------- normalization & pruning ----------
def normalize_deal(d: Dict[str, Any]) -> Dict[str, Any]:
    title = d.get("title") or d.get("name") or d.get("headline")
    url   = d.get("url") or d.get("link") or d.get("deal_url")
    src   = d.get("source") or d.get("agency") or d.get("site")
    nights = to_number(d.get("nights") or d.get("duration") or d.get("duration_nights"))
    price_pp = to_number(d.get("price") or d.get("price_per_person") or d.get("pp_price") or d.get("price_pp"))
    pkg2 = price_pp * 2 if isinstance(price_pp, (int, float)) else None
    return {
        "id": d.get("id") or d.get("_id") or d.get("uid") or d.get("hash") or d.get("title") or url,
        "title": title, "url": url, "source": src,
        "nights": nights, "pp_price": price_pp,
        "package_total_for_two": pkg2, "raw": d,
    }

def canonical_url(u: Optional[str]) -> Optional[str]:
    if not u: return None
    try:
        from urllib.parse import urlparse
        p = urlparse(u)
        return f"{p.scheme}://{p.netloc}{p.path}".rstrip("/")
    except Exception:
        return u

def normalize_title_key(t: Optional[str]) -> Optional[str]:
    if not t: return None
    s = "".join(ch.lower() for ch in t if ch.isalnum() or ch.isspace())
    return " ".join(s.split()) or None

def dedupe_deals(deals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[Tuple[Optional[str], Optional[str]]] = set()
    out: List[Dict[str, Any]] = []
    for d in deals:
        key = (canonical_url(d.get("url")), normalize_title_key(d.get("title")))
        if key in seen: continue
        seen.add(key); out.append(d)
    return out

def heuristic_value_score(nd: Dict[str, Any]) -> float:
    nights = nd.get("nights") or 0
    total2 = nd.get("package_total_for_two")
    if not nights or not total2: return float("inf")
    score = float(total2) / float(nights)
    title = (nd.get("title") or "").lower()
    if "flight" in title or "airfare" in title or "flights" in title:
        score *= 0.95
    return score

def prune_by_percentile(rows: List[Dict[str, Any]], keep_pct: int) -> List[Dict[str, Any]]:
    if keep_pct <= 0 or keep_pct >= 100 or not rows: return rows
    scored = [(heuristic_value_score(r), r) for r in rows]
    scored.sort(key=lambda x: x[0])
    k = max(1, math.ceil(len(scored) * keep_pct / 100))
    return [r for _, r in scored[:k]]

# ---------- HTTP fetch + snippet extraction ----------
def make_session() -> requests.Session:
    s = requests.Session()
    retries = Retry(
        total=2, connect=2, read=2, backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"], raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=PARALLEL_FETCH, pool_maxsize=PARALLEL_FETCH)
    s.mount("http://", adapter); s.mount("https://", adapter)
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
    if not url or not url.startswith(("http://", "https://")): return ""
    if CACHE_PAGES:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cp = cache_path_for(url)
        if cp.exists():
            try: return cp.read_text(encoding="utf-8")
            except Exception: pass
    try:
        r = session.get(url, timeout=READ_TIMEOUT); r.raise_for_status()
        soup = BeautifulSoup(r.text or "", "lxml")
        for tag in soup(["script", "style", "noscript"]): tag.decompose()
        text = " ".join(soup.get_text(separator=" ").split())
        if CACHE_PAGES:
            try: cache_path_for(url).write_text(text, encoding="utf-8")
            except Exception: pass
        return text
    except Exception:
        return ""

KEYWORDS = [
    "include", "includes", "included", "inclusions",
    "flight", "flights", "airfare", "airfares",
    "itinerary", "terms", "conditions", "exclusions",
    "price includes", "package includes", "what's included", "whats included"
]

def extract_relevant_snippets(text: str, max_chars: int = 2400, window: int = 260) -> str:
    if not text: return ""
    t = text; idxs = []; low = t.lower()
    for kw in KEYWORDS:
        start = 0; kwl = kw.lower()
        while True:
            i = low.find(kwl, start)
            if i == -1: break
            idxs.append(i); start = i + len(kwl)
    if not idxs: return t[:max_chars]
    idxs = sorted(set(idxs))
    chunks = []
    for i in idxs:
        a = max(0, i - window); b = min(len(t), i + window)
        chunks.append(t[a:b])
    joined = "\\n...\\n".join(chunks)
    return joined[:max_chars]

# ---------- light parsing ----------
DATE_PAT = re.compile(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})|([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})", re.IGNORECASE)
NIGHTS_PAT = re.compile(r"(\d{1,2})\s*(?:night|nights)\b", re.IGNORECASE)
INCLUDES_FLIGHTS_PAT = re.compile(r"(includes?\s+flights?|return\s+flights?|airfares?\s+included)", re.IGNORECASE)

def try_parse_dates(text: str) -> Tuple[Optional[str], Optional[str]]:
    if not text or dateparser is None: return (None, None)
    found = [m.group(0) for m in DATE_PAT.finditer(text)]
    if len(found) >= 2:
        d1 = dateparser.parse(found[0]); d2 = dateparser.parse(found[1])
        if d1 and d2 and d2 > d1: return (d1.date().isoformat(), d2.date().isoformat())
    return (None, None)

def try_parse_nights(text: str) -> Optional[int]:
    m = NIGHTS_PAT.search(text or "")
    if not m: return None
    try: return int(m.group(1))
    except Exception: return None

def try_detect_flights_included(text: str) -> Optional[bool]:
    if not text: return None
    return bool(INCLUDES_FLIGHTS_PAT.search(text))

# ---------- adapters (optional) ----------
class KiwiFlightsAdapter:
    def __init__(self, api_key: str):
        self.api_key = api_key.strip()

    def enabled(self) -> bool:
        return bool(self.api_key)

    def search(self, origin_iata: str, dest_iata: str, depart_dt: str, return_dt: str, adults: int = 2) -> Optional[Dict[str, Any]]:
        if not self.enabled(): return None
        try:
            params = {
                "fly_from": origin_iata, "fly_to": dest_iata,
                "date_from": datetime.fromisoformat(depart_dt).strftime("%d/%m/%Y"),
                "date_to": datetime.fromisoformat(depart_dt).strftime("%d/%m/%Y"),
                "return_from": datetime.fromisoformat(return_dt).strftime("%d/%m/%Y"),
                "return_to": datetime.fromisoformat(return_dt).strftime("%d/%m/%Y"),
                "adults": adults, "selected_cabins": "M", "curr": "NZD",
                "max_stopovers": 2, "vehicle_type": "aircraft", "limit": 5, "sort": "price",
            }
            headers = {"apikey": self.api_key}
            r = requests.get("https://tequila-api.kiwi.com/v2/search", params=params, headers=headers, timeout=12)
            r.raise_for_status()
            js = r.json(); data = js.get("data", [])
            if not data: return None
            best = data[0]
            price_nzd = float(best.get("price", 0.0)) * adults  # per passenger -> two travelers
            src_url = f"https://www.kiwi.com/en/search/results/{origin_iata}-{dest_iata}/{params['date_from']}/{params['return_from']}?adults={adults}"
            return {"included": True, "assumed_route": f"{origin_iata}-{dest_iata} RT",
                    "price_total_for_two": round(price_nzd, 2), "sources": [src_url]}
        except Exception:
            return None

class AmadeusHotelAdapter:
    def __init__(self, client_id: str, client_secret: str, env: str = "test"):
        self.client_id = client_id.strip(); self.client_secret = client_secret.strip()
        self.env = (env or "test").lower(); self._token = None; self._token_expiry = 0

    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def _host(self) -> str:
        return "https://test.api.amadeus.com" if self.env != "production" else "https://api.amadeus.com"

    def _auth(self) -> Optional[str]:
        if not self.enabled(): return None
        now = time.time()
        if self._token and now < self._token_expiry - 30: return self._token
        try:
            r = requests.post(self._host()+"/v1/security/oauth2/token",
                              data={"grant_type":"client_credentials","client_id": self.client_id,"client_secret": self.client_secret},
                              timeout=10)
            r.raise_for_status(); js = r.json()
            self._token = js.get("access_token"); self._token_expiry = now + int(js.get("expires_in", 1799))
            return self._token
        except Exception:
            return None

    def search(self, city_code: str, checkin: str, checkout: str, rooms: int = 1) -> Optional[Dict[str, Any]]:
        tok = self._auth()
        if not tok: return None
        try:
            params = {"cityCode": city_code.upper(),"checkInDate": checkin,"checkOutDate": checkout,
                      "adults": 2, "roomQuantity": rooms, "currencyCode": "NZD", "bestRateOnly": True}
            r = requests.get(self._host()+"/v3/shopping/hotel-offers", params=params,
                             headers={"Authorization": f"Bearer {tok}"}, timeout=12)
            r.raise_for_status(); data = r.json().get("data", [])
            if not data: return None
            best_total = None
            for h in data:
                for off in h.get("offers", []):
                    tot = off.get("price", {}).get("total")
                    if tot:
                        try:
                            val = float(tot)
                            if best_total is None or val < best_total: best_total = val
                        except Exception:
                            pass
            if best_total is None: return None
            return {"name_or_hint": None, "nights": None, "price_total_for_stay": round(float(best_total), 2),
                    "sources": ["https://developers.amadeus.com"]}
        except Exception:
            return None

# ---------- OpenAI plumbing ----------
def openai_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY is not set.", file=sys.stderr); sys.exit(1)
    if OpenAI is not None:
        return OpenAI(api_key=api_key), "new"
    if openai is None:
        print("ERROR: openai SDK not installed.", file=sys.stderr); sys.exit(1)
    openai.api_key = api_key; return openai, "legacy"

def output_json_schema() -> Dict[str, Any]:
    num_or_null = {"anyOf": [{"type":"number"}, {"type":"null"}]}
    str_or_null = {"anyOf": [{"type":"string"}, {"type":"null"}]}
    def arr_str(): return {"type":"array", "items": {"type":"string"}}
    return {
        "type": "object", "additionalProperties": False,
        "properties": {
            "deal_id": {"type":"string"}, "title": {"type":"string"}, "url": {"type":"string"},
            "source": {"anyOf":[{"type":"string"},{"type":"null"}]},
            "nights": num_or_null, "pp_price": num_or_null, "package_total_for_two": num_or_null,
            "includes_flights": {"type":"boolean"}, "inclusions_evidence": {"type":"string"},
            "diy_breakdown": {
                "type":"object", "additionalProperties": False,
                "properties": {
                    "flights": {"type":"object","additionalProperties": False,
                        "properties": {
                            "included": {"type":"boolean"},
                            "assumed_route": {"anyOf":[{"type":"string"},{"type":"null"}]},
                            "price_total_for_two": num_or_null,
                            "sources": arr_str()
                        },"required":["included","assumed_route","price_total_for_two","sources"]},
                    "hotel": {"type":"object","additionalProperties": False,
                        "properties": {
                            "name_or_hint": {"anyOf":[{"type":"string"},{"type":"null"}]},
                            "nights": num_or_null, "price_total_for_stay": num_or_null,
                            "sources": arr_str()
                        },"required":["name_or_hint","nights","price_total_for_stay","sources"]},
                    "other": {"type":"object","additionalProperties": False,
                        "properties": {"items": {"type":"array","items": {"type":"object","additionalProperties": False,
                            "properties": {"label":{"type":"string"},"price": num_or_null,"source":{"anyOf":[{"type":"string"},{"type":"null"}]}},
                            "required":["label","price","source"]}}, "notes": {"type":"string"}},
                        "required":["items","notes"]},
                    "diy_total_for_two": num_or_null
                },
                "required": ["flights","hotel","other","diy_total_for_two"]
            },
            "estimated_savings_vs_diy": {"type":"object","additionalProperties": False,
                "properties": {"abs": num_or_null, "pct": num_or_null},
                "required": ["abs","pct"]
            },
            "rating_out_of_10": {"type":"number"}, "reasoning": {"type":"string"},
            "additional_notes": {"anyOf":[{"type":"string"},{"type":"null"}]},
            "citations": arr_str()
        },
        "required": ["deal_id","title","url","source","nights","pp_price","package_total_for_two",
                     "includes_flights","inclusions_evidence","diy_breakdown","estimated_savings_vs_diy",
                     "rating_out_of_10","reasoning","additional_notes","citations"]
    }

SYSTEM_PROMPT = (
    "You are a meticulous travel deal auditor. Return only JSON that matches the provided JSON Schema. "
    "Do not invent URLs or prices. If a number is unknown, use null and explain briefly in 'reasoning'. "
    "Hotel costs are room-based (not per person). All totals are for TWO travelers (twin share). "
    "Ignore deals with more than 21 nights or obviously broken prices. "
    "If flights are marked included, quote the exact excerpt used under 'inclusions_evidence'."
)

USER_INSTRUCTIONS = """
Task:
- Evaluate ONE deal below. You are NOT allowed to browse the web; rely only on the provided page excerpts and any DIY quotes we pass in.
- If DIY quotes are missing, leave numeric fields as null and still provide a rating based on value signals (inclusions, flights, nights, brand).

Definitions:
- package_total_for_two: total package price for 2 people (twin share).
- diy_breakdown.flights.price_total_for_two: lowest roundtrip economy price for 2 on similar dates + baggage if required.
- diy_breakdown.hotel.price_total_for_stay: total room cost (taxes/fees included if provided) for the stay.

Scoring rubric (guideline; 0–10):
- Start with 5.0.
- Add up to +3 based on estimated_savings_vs_diy.pct (e.g., +3 at >=20% savings).
- Add up to +1 if flights are included and seem long-haul (quote evidence).
- Add up to +1 for extra inclusions (breakfast, transfers, tours, onboard credit) with evidence.
- Subtract up to −2 for uncertainty (missing dates/brand/room type) and for mismatched comparisons.
- Deals that are more expensive than DIY should not exceed 4.9 unless inclusions confer clear extra value; explain why.

Return ONLY the JSON.
"""

def build_messages_for_deal(deal_norm: Dict[str, Any], page_text_snippet: str, observed: Dict[str, Any]) -> List[Dict[str, str]]:
    deal_block = {
        "id": deal_norm["id"],
        "title": deal_norm["title"],
        "url": deal_norm["url"],
        "source": deal_norm["source"],
        "nights": deal_norm["nights"],
        "pp_price": deal_norm["pp_price"],
        "package_total_for_two": deal_norm["package_total_for_two"],
    }
    user = f"""
{USER_INSTRUCTIONS}

### Deal JSON
```json
{json.dumps(deal_block, ensure_ascii=False)}
```

### Deal Page Text (relevant excerpts)
```
{page_text_snippet or "(no page text fetched)"}
```

### Observed DIY Quotes (pre-fetched by the system; may be partial)
```json
{json.dumps(observed, ensure_ascii=False)}
```
""".strip()
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]

def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        if lines and lines[0].startswith("```"): lines = lines[1:]
        if lines and lines[-1].startswith("```"): lines = lines[:-1]
        return "\n".join(lines).strip()
    return s

def safe_json_parse(content: str) -> Dict[str, Any]:
    s = _strip_code_fences(content)
    if "{" in s and "}" in s:
        start = s.find("{"); end = s.rfind("}")
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
    schema = output_json_schema()
    attempts = 0; last_err: Optional[str] = None
    while attempts < 3:
        attempts += 1
        try:
            if flavor == "new":
                resp = client.chat.completions.create(
                    model=MODEL,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=2800,
                    seed=7,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name":"deal_eval","strict": True, "schema": schema},
                    },
                )
                content = (resp.choices[0].message.content or "").strip()
            else:
                resp = openai.ChatCompletion.create(
                    model=MODEL,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=2800,
                )
                content = (resp["choices"][0]["message"]["content"] or "").strip()
            return safe_json_parse(content)
        except Exception as e:
            last_err = str(e); time.sleep(0.8 * attempts)
    return {"_error": f"openai_failed: {last_err or 'unknown'}"}

# ---------- DIY collection ----------
def diy_collect(est: Dict[str, Any], page_snip: str) -> Dict[str, Any]:
    out = {
        "flights": {"included": False, "assumed_route": None, "price_total_for_two": None, "sources": []},
        "hotel": {"name_or_hint": None, "nights": None, "price_total_for_stay": None, "sources": []},
        "other": {"items": [], "notes": ""},
        "diy_total_for_two": None
    }

    includes_flights = try_detect_flights_included(page_snip)
    nights_hint = try_parse_nights(page_snip) or est.get("nights")
    d1, d2 = try_parse_dates(page_snip)
    if nights_hint and not (d1 and d2):
        from datetime import date
        d1 = (datetime.utcnow() + timedelta(days=45)).date().isoformat()
        d2 = (datetime.utcnow() + timedelta(days=45 + int(nights_hint))).date().isoformat()

    # optional adapters (only if configured)
    origin_iata = est.get("origin_iata") or ORIGIN_AIRPORT
    dest_iata = est.get("dest_iata") or est.get("destination")
    kiwi = KiwiFlightsAdapter(KIWI_KEY)
    if dest_iata and d1 and d2 and kiwi.enabled():
        q = kiwi.search(origin_iata, dest_iata, d1, d2, adults=2)
        if q: out["flights"] = q

    city_code = est.get("city_code")
    ama = AmadeusHotelAdapter(AMADEUS_ID, AMADEUS_SECRET, AMADEUS_ENV)
    if city_code and d1 and d2 and ama.enabled():
        hq = ama.search(city_code, d1, d2, rooms=1)
        if hq:
            out["hotel"].update(hq); out["hotel"]["nights"] = nights_hint

    f_tot = out["flights"]["price_total_for_two"]
    h_tot = out["hotel"]["price_total_for_stay"]
    if isinstance(f_tot, (int, float)) or isinstance(h_tot, (int, float)):
        s = 0.0
        if isinstance(f_tot, (int, float)): s += float(f_tot)
        if isinstance(h_tot, (int, float)): s += float(h_tot)
        for it in out["other"]["items"]:
            p = it.get("price")
            if isinstance(p, (int, float)): s += float(p)
        out["diy_total_for_two"] = round(s, 2)

    return out

# ---------- main ----------
def main():
    latest = find_latest_packages(DATA_DIR, override=os.environ.get("PACKAGES_FILE"))
    raw = read_jsonl(latest)
    if not raw:
        print(f"No rows in {latest}", file=sys.stderr); sys.exit(0)

    normalized: List[Dict[str, Any]] = []
    for d in raw:
        nd = normalize_deal(d)
        if nd["nights"] is not None and nd["nights"] > 21:  # safety filter
            continue
        normalized.append(nd)

    deduped = dedupe_deals(normalized)
    if MAX_DEALS > 0: deduped = deduped[:MAX_DEALS]

    pruned = prune_by_percentile(deduped, PRUNE_PERCENTILE) if PRUNE_PERCENTILE else deduped
    analyzed_input = pruned[:SHORTLIST_SIZE] if SHORTLIST_SIZE and len(pruned) > SHORTLIST_SIZE else pruned

    run_id = stamp(); out_dir = OUT_BASE / run_id; ensure_dir(out_dir)

    meta = {
        "input_file": str(latest.relative_to(REPO_ROOT)) if str(latest).startswith(str(REPO_ROOT)) else str(latest),
        "rows_in_file": len(raw), "rows_after_filter": len(normalized),
        "rows_after_dedupe": len(deduped), "rows_after_prune": len(pruned),
        "rows_analyzed": len(analyzed_input), "model": MODEL, "run_id": run_id,
        "generated_at_utc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "top_n": TOP_N, "prune_percentile": PRUNE_PERCENTILE, "shortlist_size": SHORTLIST_SIZE,
        "parallel_fetch": PARALLEL_FETCH, "read_timeout": READ_TIMEOUT, "cache_pages": bool(CACHE_PAGES),
        "adapters": {"kiwi": bool(KIWI_KEY), "amadeus": bool(AMADEUS_ID and AMADEUS_SECRET)},
    }
    (out_dir / "run_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    sess = make_session()
    urls = [d.get("url") or "" for d in analyzed_input]
    from concurrent.futures import ThreadPoolExecutor
    def fetch_and_snip(u: str) -> str:
        return extract_relevant_snippets(fetch_page_text(sess, u))

    page_snippets: List[str] = []
    with ThreadPoolExecutor(max_workers=PARALLEL_FETCH) as ex:
        for txt in ex.map(fetch_and_snip, urls):
            page_snippets.append(txt)

    per_results: List[Dict[str, Any]] = []
    for nd, snippet in zip(analyzed_input, page_snippets):
        est_hints = {
            "nights": nd.get("nights"),
            "origin_iata": (nd.get("raw") or {}).get("origin_iata"),
            "dest_iata": (nd.get("raw") or {}).get("dest_iata"),
            "city_code": (nd.get("raw") or {}).get("city_code"),
            "destination": (nd.get("raw") or {}).get("destination"),
        }
        observed = diy_collect(est_hints, snippet)
        messages = build_messages_for_deal(nd, snippet, observed)
        result = call_openai(messages)

        if isinstance(result, dict):
            result.setdefault("package_total_for_two", nd["package_total_for_two"])
            result.setdefault("pp_price", nd["pp_price"])
            result.setdefault("nights", nd["nights"])
            result.setdefault("url", nd["url"])
            result.setdefault("title", nd["title"])
            result.setdefault("source", nd["source"])
            result.setdefault("deal_id", nd["id"])

            try:
                pkg2 = float(result.get("package_total_for_two") or 0.0)
                diy2 = float((result.get("diy_breakdown") or {}).get("diy_total_for_two") or 0.0)
                if pkg2 > 0 and diy2 > 0:
                    abs_sav = round(diy2 - pkg2, 2)
                    pct_sav = round(100.0 * abs_sav / diy2, 2)
                    result.setdefault("estimated_savings_vs_diy", {"abs": abs_sav, "pct": pct_sav})
            except Exception:
                pass

        per_results.append(result)
        if PAUSE_BETWEEN_CALLS > 0: time.sleep(PAUSE_BETWEEN_CALLS)

    combined_path = out_dir / "combined.jsonl"
    with combined_path.open("w", encoding="utf-8") as f:
        for r in per_results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    def rating_of(r: Dict[str, Any]) -> float:
        try: return float(r.get("rating_out_of_10") or 0.0)
        except Exception: return 0.0
    def savings_abs(r: Dict[str, Any]) -> float:
        try: return float((r.get("estimated_savings_vs_diy") or {}).get("abs") or 0.0)
        except Exception: return 0.0

    ranked = sorted(per_results, key=lambda x: (savings_abs(x), rating_of(x)), reverse=True)
    topN = ranked[:TOP_N]

    per_deal_dir = out_dir / "per-deal"; ensure_dir(per_deal_dir)
    for i, r in enumerate(topN, 1):
        rid = str(r.get("deal_id") or r.get("title") or i)
        rid = "".join(ch for ch in rid if ch.isalnum() or ch in ("-", "_"))[:60] or f"rank{i:02d}"
        (per_deal_dir / f"rank-{i:02d}-{rid}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")

    (out_dir / f"top{TOP_N}.json").write_text(json.dumps(topN, indent=2), encoding="utf-8")

    lines = [f"# Top {TOP_N} deals (model: {MODEL})", "", f"_Run: {run_id}_", ""]
    def fmt(x): return "—" if x in (None, "", []) else f"{x}"
    def fnum(x):
        try: return f"{BASE_CCY} {float(x):,.0f}"
        except Exception: return "—"
    for i, r in enumerate(topN, 1):
        title = r.get("title") or "Untitled"; url = r.get("url") or ""
        nights = r.get("nights"); pkg2 = r.get("package_total_for_two")
        inc_flights = r.get("includes_flights")
        diy_total = (r.get("diy_breakdown") or {}).get("diy_total_for_two")
        sav = r.get("estimated_savings_vs_diy") or {}; sav_abs = sav.get("abs"); sav_pct = sav.get("pct")
        rating = rating_of(r); reason = (r.get("reasoning") or "").strip()
        cites = r.get("citations") or []
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

    (OUT_BASE / "LATEST.txt").write_text(run_id + "\n", encoding="utf-8")

    print("✅ v2 analysis complete (model:", MODEL, ")")
    print("Artifacts:")
    print("  ", (out_dir / f'top{TOP_N}.md').relative_to(REPO_ROOT))
    print("  ", (out_dir / f'top{TOP_N}.json').relative_to(REPO_ROOT))
    print("  ", combined_path.relative_to(REPO_ROOT))
    print("  ", (out_dir / 'per-deal').relative_to(REPO_ROOT))
    print("  ", (OUT_BASE / 'LATEST.txt').relative_to(REPO_ROOT))

if __name__ == "__main__":
    main()
