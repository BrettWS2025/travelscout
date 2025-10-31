import re, json, hashlib
from parsel import Selector


def parse_jsonld(response_text: str):
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

def price_from_jsonld(objs):
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

def title_from_jsonld(objs):
    for obj in objs:
        n = obj.get("name")
        if isinstance(n, str) and n.strip():
            return n.strip()
    return None

CURRENCY_SIGNS = ["$", "NZ$", "NZD", "NZD$"]

def parse_price_text(text: str):
    if not any(c in text for c in CURRENCY_SIGNS):
        return None
    t = text.replace(",", "")
    m = re.search(r"(?:NZD\s*)?\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", t)
    if m:
        try: return float(m.group(1))
        except: return None
    return None

def parse_nights(text: str):
    m = re.search(r"(\d{1,3})\s*nights?", text, re.I)
    if m:
        try: return int(m.group(1))
        except: return None
    return None

def parse_sale_end(text: str):
    m = re.search(r"sale\s*(?:ends|to|until)\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})", text, re.I)
    return m.group(1).strip() if m else None

def infer_price_basis(text: str):
    if re.search(r"per\s*person|pp", text, re.I): return "per_person"
    if re.search(r"per\s*package|total", text, re.I): return "total"
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


from urllib.parse import urljoin, urlparse
def _norm_path(href: str) -> str:
    try:
        u = urlparse(href)
        if u.scheme or u.netloc:
            return u.path
        return href
    except Exception:
        return href

def filter_links(base_url: str, hrefs, allow_patterns, deny_patterns):
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
    sel = Selector(text=response_text)
    objs = parse_jsonld(response_text)
    price, ccy, _ = price_from_jsonld(objs)
    if isinstance(price, (int, float)) and price >= 99:
        return True
    price_text = " ".join(sel.css("[class*='price'], .price, .deal-price, [data-test*='price'] ::text").getall())
    p = parse_price_text(price_text)
    if isinstance(p, (int, float)) and p >= 99:
        return True
    body_text = " ".join(sel.xpath("//body//text()").getall())
    p2 = parse_price_text(body_text)
    return isinstance(p2, (int, float)) and p2 >= 99
