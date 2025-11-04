#!/usr/bin/env python3
import sys, json

def coerce(in_path, out_path):
    with open(in_path, "r", encoding="utf-8") as f:
        lines = [l for l in f if l.strip()]
    out = []
    for line in lines:
        try:
            item = json.loads(line)
        except Exception:
            continue
        if "price" not in item or item["price"] is None:
            item["price"] = 0.0
        # make sure currency exists too
        item["currency"] = item.get("currency") or "NZD"
        out.append(item)
    with open(out_path, "w", encoding="utf-8") as w:
        for it in out:
            w.write(json.dumps(it, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: ensure_price_field.py <in.jsonl> <out.jsonl>"); sys.exit(1)
    coerce(sys.argv[1], sys.argv[2])
