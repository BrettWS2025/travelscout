import re, json, hashlib
from parsel import Selector

from urllib.parse import urljoin, urlparse


def parse_jsonld(response_text: str):
    sel = Selector(text=response_text)
    out = []
    for node in sel.xpath("//script[@type='application/ld+json']/text()").getall():
        try:
            data = json.loads(node.strip())
            out.extend(data if isinstance(data, list) else [data])
        except Exception:
            continue
    return out

def price_from_jsonld(objs):
    def f(x):
        try: return float(x)
        except: return None
    if not isinstance(objs, list):
        return (None, None, None)
    for obj in objs:
        offers = obj.get("offers")
        if not offers: continue
        if isinstance(offers, dict):
            price = f(offers.get("price") or offers.get("lowPrice"))
            ccy = offers.get("priceCurrency") or "NZD"
            pvu = offers.get("priceValidUntil")
            if price: return price, ccy, pvu
        elif isinstance(offers, list):
            for off in offers:
                price = f(off.get("price") or off.get("lowPrice"))
                ccy = off.get("priceCurrency") or "NZD"
                pvu = off.get("priceValidUntil")
                if price: return price, ccy, pvu
    return (None, None, None)

def title_from_jsonld(objs):
    if not isinstance(objs, list):
        return None
    for obj in objs:
        n = obj.get("name")
        if isinstance(n, str) and n.strip():
            return n.strip()
    return None


CURRENCY_SIGNS = ["$", "NZ$", "NZD", "NZD$"]

def _norm_spaces(s: str) -> str:
    import re as _re
    return _re.sub(r"[\u00A0\u202F\s]+", " ", s or "")

def parse_price_text(text: str):
    t = _norm_spaces((text or "").replace(",", ""))
    if not any(c in t for c in CURRENCY_SIGNS):
        return None
    m = re.search(r"(?:from\s*)?(?:NZD\s*)?\$\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)", t, re.I)
    if m:
        try: return float(m.group(1))
        except: return None
    return None

def parse_nights(text: str):
    m = re.search(r"(\d{1,3})\s*nights?", text or "", re.I)
    if m:
        try: return int(m.group(1))
        except: return None
    return None

def parse_sale_end(text: str):
    m = re.search(r"sale\s*(?:ends|to|until)\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})", text or "", re.I)
    return m.group(1).strip() if m else None

def infer_price_basis(text: str):
    t = text or ""
    if re.search(r"per\s*person|pp", t, re.I): return "per_person"
    if re.search(r"per\s*package|total", t, re.I): return "total"
    return None

def build_item(source, url, title, price, currency, nights, sale_ends_at, page_text):
    price_basis = infer_price_basis(page_text) or "per_person"
    currency = currency or "NZD"
    duration = (nights + 1) if (isinstance(nights, int) and nights>0) else None
    return {
        "source": source, "url": url, "title": title,
        "duration_days": duration, "nights": nights,
        "price": price, "currency": currency, "price_basis": price_basis,
        "sale_ends_at": sale_ends_at,
    }


def extract_price_from_scripts(response_text: str):
    prices = []
    for m in re.finditer(r'"price"\s*:\s*"?([0-9]{2,7}(?:\.[0-9]{1,2})?)"?', response_text or "", re.I):
        try: prices.append(float(m.group(1)))
        except: pass
    return min(prices) if prices else None


def _norm_path(href: str) -> str:
    try:
        u = urlparse(href)
        if u.scheme or u.netloc: return u.path
        return href
    except Exception:
        return href

def filter_links(base_url: str, hrefs, allow_patterns, deny_patterns):
    keep = []
    for h in hrefs:
        path = _norm_path(h) or ""
        if any(re.search(p, path) for p in deny_patterns): continue
        if any(re.search(p, path) for p in allow_patterns):
            keep.append(urljoin(base_url, h))
    seen = set(); out = []
    for k in keep:
        if k not in seen:
            out.append(k); seen.add(k)
    return out

def page_has_price_signal(response_text: str) -> bool:
    sel = Selector(text=response_text or "")
    objs = parse_jsonld(response_text or "")
    price, ccy, _ = price_from_jsonld(objs)
    if isinstance(price, (int, float)) and price >= 99: return True
    price_text = " ".join(sel.css("[class*='price'], .price, .deal-price, [data-test*='price'] ::text").getall())
    p = parse_price_text(price_text)
    if isinstance(p, (int, float)) and p >= 99: return True
    sp = extract_price_from_scripts(response_text or "")
    if isinstance(sp, (int, float)) and sp >= 99: return True
    body_text = " ".join(sel.xpath("//body//text()").getall())
    p2 = parse_price_text(body_text)
    return isinstance(p2, (int, float)) and p2 >= 99
