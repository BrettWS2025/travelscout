#!/usr/bin/env python3
import sys, json, math

# Minimal FX conversion; replace with your existing table if you have one.
RATES = {"NZD": 1.0, "AUD": 1.08, "USD": 1.64}

def to_nzd(price, currency):
    c = (currency or "NZD").upper()
    rate = RATES.get(c, 1.0)
    try:
        return float(price) * float(rate)
    except Exception:
        return None

def main(in_path, out_path):
    out = []
    with open(in_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except Exception:
                continue
            price = item.get("price")
            curr  = item.get("currency", "NZD")
            if isinstance(price, (int, float)) and price > 0:
                nz = to_nzd(price, curr)
                item["price_nzd"] = round(nz, 2) if isinstance(nz, (int, float)) else None
            else:
                item["price_nzd"] = None
            out.append(item)
    with open(out_path, "w", encoding="utf-8") as w:
        for it in out:
            w.write(json.dumps(it, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: fx_apply.py <in.jsonl> <out.jsonl>"); sys.exit(1)
    main(sys.argv[1], sys.argv[2])
