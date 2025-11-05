#!/usr/bin/env python3
import sys, json, re

def coerce(in_path, out_path):
    with open(in_path, "r", encoding="utf-8") as f:
        lines = [l for l in f if l.strip()]

    out = []
    for line in lines:
        try:
            item = json.loads(line)
        except Exception:
            continue

        # Guarantee a numeric price field so fx_apply.py never KeyErrors
        price = item.get("price", 0.0)
        try:
            price = float(price) if price is not None else 0.0
        except Exception:
            price = 0.0
        item["price"] = price

        # Guarantee currency
        item["currency"] = (item.get("currency") or "NZD")

        out.append(item)

    with open(out_path, "w", encoding="utf-8") as w:
        for it in out:
            w.write(json.dumps(it, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    if len(sys.argv) != 2 and len(sys.argv) != 3:
        print("Usage: ensure_price_field.py <in.jsonl> <out.jsonl>"); sys.exit(1)
    in_path  = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) == 3 else in_path.replace(".jsonl", ".coerced.jsonl")
    coerce(in_path, out_path)
