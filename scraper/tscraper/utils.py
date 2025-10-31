
import re, json, hashlib
from typing import Any, Dict, List, Optional
from parsel import Selector

CURRENCY_SIGNS = ["$", "NZ$", "NZD", "NZD$"]

def md5_id(*parts: str) -> str:
    s = "|".join([p or "" for p in parts])
    return hashlib.md5(s.encode()).hexdigest()

def parse_jsonld(response_text: str) -> List[Dict[str, Any]]:
    sel = Selector(text=response_text)
    out = []
    for node in sel.xpath("//script[@type='application/ld+json']/text()").getall():
        try:
            data = json.loads(node.strip())
            if isinstance(data, list):
                out.extend(data)
            else:
                out.append(data)
        except Exception:
            continue
    return out

def price_from_jsonld(objs: List[Dict[str, Any]]):
    def coerce_float(x):
        try: return float(x)
        except: return None
    for obj in objs:
        offers = obj.get("offers")
        if not offers: continue
        if isinstance(offers, dict):
            price = coerce_float(offers.get("price") or offers.get("lowPrice"))
            ccy = offers.get("priceCurrency") or "NZD"
            pvu = offers.get("priceValidUntil")
            if price: return price, ccy, pvu
        elif isinstance(offers, list):
            for off in offers:
                price = coerce_float(off.get("price") or off.get("lowPrice"))
                ccy = off.get("priceCurrency") or "NZD"
                pvu = off.get("priceValidUntil")
                if price: return price, ccy, pvu
    return None, None, None

def title_from_jsonld(objs: List[Dict[str, Any]]):
    for obj in objs:
        n = obj.get("name")
        if isinstance(n, str) and len(n.strip())>0:
            return n.strip()
    return None

def parse_price_text(text: str) -> Optional[float]:
    if not any(c in text for c in CURRENCY_SIGNS):
        return None
    m = re.search(r"(?:NZD\s*)?\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", text.replace(",", ""))
    if m:
        try: return float(m.group(1))
        except: return None
    return None

def parse_nights(text: str) -> Optional[int]:
    m = re.search(r"(\d{1,3})\s*nights?", text, re.I)
    if m:
        try: return int(m.group(1))
        except: return None
    return None

def parse_sale_end(text: str) -> Optional[str]:
    m = re.search(r"sale\s*(?:ends|to|until)\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})", text, re.I)
    if m:
        return m.group(1).strip()
    return None

def infer_price_basis(text: str) -> Optional[str]:
    if re.search(r"per\s*person|pp", text, re.I): return "per_person"
    if re.search(r"per\s*package|total", text, re.I): return "total"
    return None

def extract_destinations_from_text(text: str) -> List[str]:
    candidates = re.findall(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b", text)
    stop = set(["Sale", "Ends", "From", "Deal", "Deals", "Package", "Holiday", "Holidays"])
    out = [c for c in candidates if c not in stop]
    seen = set(); uniq = []
    for c in out:
        if c not in seen:
            uniq.append(c); seen.add(c)
    return uniq[:5]

def build_item(source: str, url: str, title: str, price: Optional[float],
               currency: Optional[str], nights: Optional[int],
               sale_ends_at: Optional[str], page_text: str) -> Dict[str, Any]:
    price_basis = infer_price_basis(page_text) or "per_person"
    currency = currency or "NZD"
    duration = (nights + 1) if (isinstance(nights, int) and nights>0) else None
    destinations = extract_destinations_from_text(title)
    pkg_id = md5_id(url, title, str(price or ""))
    includes = {}
    if re.search(r"with\s+flights|return\s+flights|airfares", page_text, re.I):
        includes["flights"] = True
    elif re.search(r"land\s*only|hotel\s*only", page_text, re.I):
        includes["flights"] = False
    if re.search(r"accommodation|hotel", page_text, re.I):
        includes["hotel"] = True

    hotel = {}
    m = re.search(r"(\d(?:\.\d)?)[\s-]*star", page_text, re.I)
    if m:
        try: hotel["stars"] = float(m.group(1))
        except: pass

    return {
        "package_id": pkg_id,
        "source": source,
        "url": url,
        "title": title,
        "destinations": destinations or None,
        "duration_days": duration,
        "nights": nights,
        "price": price,
        "currency": currency,
        "price_basis": price_basis,
        "includes": includes or None,
        "hotel": hotel or None,
        "sale_ends_at": sale_ends_at,
    }

# --- link filters + content gate ---
from urllib.parse import urljoin, urlparse

def _norm_path(href: str) -> str:
    try:
        u = urlparse(href)
        if u.scheme or u.netloc:
            return u.path
        return href
    except Exception:
        return href

def filter_links(base_url: str, hrefs: List[str], allow_patterns: List[str], deny_patterns: List[str]) -> List[str]:
    keep = []
    for h in hrefs:
        path = _norm_path(h) or ""
        if any(re.search(p, path) for p in deny_patterns):
            continue
        if any(re.search(p, path) for p in allow_patterns):
            keep.append(urljoin(base_url, h))
    seen = set(); out = []
    for k in keep:
        if k not in seen:
            out.append(k); seen.add(k)
    return out

def page_has_price_signal(response_text: str) -> bool:
    objs = parse_jsonld(response_text)
    price, ccy, _ = price_from_jsonld(objs)
    if price and (ccy or price > 0):
        return True
    txt = " ".join(Selector(text=response_text).xpath("//body//text()").getall())
    if parse_price_text(txt):
        return True
    return False
