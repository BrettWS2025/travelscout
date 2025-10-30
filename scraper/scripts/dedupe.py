import orjson, sys
from rapidfuzz import fuzz

def key(item):
    title = item.get("title","")
    src = item.get("source","")
    dur = item.get("duration_days","")
    return f"{src}|{title}|{dur}"

def main(in_path, out_path, threshold=92):
    kept = []
    keys = []
    with open(in_path, "rb") as f:
        for line in f:
            if not line.strip():
                continue
            it = orjson.loads(line)
            k = key(it)
            if not keys or max((fuzz.token_set_ratio(k, kk) for kk in keys), default=0) < threshold:
                kept.append(it); keys.append(k)
    with open(out_path, "wb") as out:
        for it in kept:
            out.write(orjson.dumps(it) + b"\n")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
