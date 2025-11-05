#!/usr/bin/env python3
import re, json, sys, time, concurrent.futures, requests

UA = "TravelScoutBackfill/1.1 (+contact: data@travelscout.example)"
TIMEOUT = 12
MAX_WORKERS = 6

CCY_MAP = {"NZD":"NZD","AUD":"AUD","USD":"USD","NZ$":"NZD","AU$":"AUD","US$":"USD","$":"NZD"}

def norm(s): return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "")).strip()

def walk_json(node, keys=("price","fromPrice","leadPrice","amount","valueInCents")):
    found=[]; cur=None
    def w(x):
        nonlocal cur
        if isinstance(x,dict):
            t = x.get("@type") or x.get("type")
            if t in ("Offer","AggregateOffer"):
                p = x.get("price") or x.get("lowPrice") or x.get("highPrice")
                c = x.get("priceCurrency") or (x.get("priceSpecification") or {}).get("priceCurrency")
                if p:
                    try: found.append((float(re.sub(r"[^\d.]", "", str(p))), (c or "").upper() or None))
                    except: pass
            for k,v in x.items():
                if any(k.lower()==kk.lower() for kk in keys):
                    try: found.append((float(re.sub(r"[^\d.]", "", str(v))), None))
                    except: pass
                w(v)
        elif isinstance(x,list):
            for v in x: w(v)
    w(node)
    if found:
        found.sort(key=lambda t:t[0])
        return found[0]  # lowest advertised price
    return None, None

def extract_price(html):
    # 1) JSON-LD
    for m in re.finditer(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.I|re.S):
        try:
            data=json.loads(m.group(1))
        except Exception:
            continue
        p,c = walk_json(data)
        if p: return p, (c or "NZD")
    # 2) <meta itemprop>
    mp = re.search(r'itemprop=["\']price["\'][^>]*content=["\']([^"\']+)', html, re.I)
    if mp:
        try:
            pv=float(re.sub(r"[^\d.]", "", mp.group(1))); 
            mc = re.search(r'itemprop=["\']priceCurrency["\'][^>]*content=["\']([^"\']+)', html, re.I)
            return pv, (mc.group(1).upper() if mc else "NZD")
        except: pass
    # 3) any embedded JSON
    for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.I|re.S):
        raw=m.group(1).strip()
        if not raw or len(raw)<10 or raw.startswith("function") or raw.startswith("if "): continue
        try:
            data=json.loads(raw)
        except Exception:
            continue
        p,c=walk_json(data)
        if p: return p, (c or "NZD")
    # 4) text patterns
    t=norm(html).replace(",", " ")
    t=re.sub(r"(?<=\$)\s+","",t)
    m=re.search(r"(?:from|price\s*from)\s*(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9\s,\.]{2,})", t, re.I)
    if m:
        try:
            num=float(re.sub(r"[^\d.]","",m.group(1)))
            win=t[max(m.start()-12,0):m.end()]
            cm=re.search(r"(NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", win, re.I)
            ccy=CCY_MAP[(cm.group(1).upper() if cm else "$")]
            return num, ccy
        except: pass
    m2=re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9\s,\.]{2,})\s*(?:per\s+person|pp|twin\s+share)", t, re.I)
    if m2:
        try: return float(re.sub(r"[^\d.]","",m2.group(1))), "NZD"
        except: pass
    return None, None

def fetch(url):
    try:
        r=requests.get(url, headers={"User-Agent":UA}, timeout=TIMEOUT)
        if r.status_code!=200: return url, None, None
        p,c=extract_price(r.text)
        return url,p,c
    except Exception:
        return url,None,None

def run(in_path,out_path):
    import json
    with open(in_path,"r",encoding="utf-8") as f:
        rows=[json.loads(line) for line in f if line.strip()]
    targets=[r for r in rows if r.get("source")=="flightcentre" and (not r.get("price") or r.get("price")==0) and r.get("url")]
    urls=[r["url"] for r in targets]
    results={}
    if urls:
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            for u,p,c in ex.map(fetch, urls):
                results[u]=(p,c)
    updated=[]
    for r in rows:
        if r.get("url") in results:
            p,c = results[r["url"]]
            if p:
                r["price"]=float(p)
                r["currency"]=c or r.get("currency") or "NZD"
                # best-effort basis inference
                blob=json.dumps(r).lower()
                if re.search(r"\b(per\s+person|pp|twin\s+share)\b", blob): r["price_basis"]="per_person"
        updated.append(r)
    with open(out_path,"w",encoding="utf-8") as out:
        for r in updated: out.write(json.dumps(r,ensure_ascii=False)+"\n")

if __name__=="__main__":
    if len(sys.argv)!=3:
        print("Usage: backfill_prices_flightcentre.py in.jsonl out.jsonl"); sys.exit(1)
    run(sys.argv[1], sys.argv[2])
