
import orjson, sys

def to_nzd(amount, ccy):
    try:
        return float(amount)
    except Exception:
        return None

def main(in_path, out_path):
    with open(in_path, "rb") as f, open(out_path, "wb") as out:
        for line in f:
            if not line.strip():
                continue
            item = orjson.loads(line)
            price = item.get("price")
            price_nzd = to_nzd(price, item.get("currency","NZD")) if price is not None else None
            if isinstance(price_nzd, (int, float)):
                item["price_nzd"] = round(price_nzd, 2)
                nights = item.get("nights")
                if (
                    isinstance(nights, int) and nights > 0
                    and item.get("price_basis") == "per_person"
                ):
                    item["price_pppn"] = round(item["price_nzd"]/nights, 2)
            out.write(orjson.dumps(item) + b"\n")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
