import orjson, sys

def to_nzd(amount, ccy):
    # These sources primarily price in NZD; extend if needed.
    return float(amount)

def main(in_path, out_path):
    with open(in_path, "rb") as f, open(out_path, "wb") as out:
        for line in f:
            if not line.strip():
                continue
            item = orjson.loads(line)
            item["price_nzd"] = round(to_nzd(item["price"], item.get("currency","NZD")), 2)
            nights = item.get("nights")
            if nights and item.get("price_basis") == "per_person" and nights > 0:
                item["price_pppn"] = round(item["price_nzd"]/nights, 2)
            out.write(orjson.dumps(item) + b"\n")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
