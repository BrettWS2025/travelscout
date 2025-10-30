import orjson, sys

def normalize(item):
    item["currency"] = item.get("currency") or "NZD"
    if item.get("nights") and not item.get("duration_days"):
        item["duration_days"] = item["nights"] + 1
    item["price_basis"] = item.get("price_basis") or "per_person"
    return item

def main(in_path, out_path):
    with open(in_path, "rb") as f, open(out_path, "wb") as out:
        for line in f:
            if not line.strip():
                continue
            item = orjson.loads(line)
            out.write(orjson.dumps(normalize(item)) + b"\n")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
