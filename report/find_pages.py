"""Read a rendered PDF and write pages.json with the page of every heading, figure and table caption."""
import json, subprocess, sys, re
pdf, keys, out = sys.argv[1:4]
k = json.load(open(keys))
n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
pages = []
for i in range(1, n + 1):
    t = subprocess.run(["pdftotext", "-layout", "-f", str(i), "-l", str(i), pdf, "-"], capture_output=True, text=True).stdout
    pages.append([l.strip() for l in t.splitlines() if l.strip()])
first = k["headings"][0]
body_start = next(i for i, ls in enumerate(pages) if ls and ls[0] == first)
res = {}
def find(text, prefix=False):
    for i in range(body_start, n):
        for l in pages[i]:
            if (l.startswith(text[:45]) if prefix else l == text):
                return i + 1
    return None
for h in k["headings"]:
    res["H|" + h] = find(h)
for f in k["figures"]:
    res["F|" + f["key"]] = find(f["text"], True)
for t in k["tables"]:
    res["T|" + t["key"]] = find(t["text"], True)
missing = [x for x, v in res.items() if v is None]
print("pages:", n, "body starts on", body_start + 1, "missing:", missing)
json.dump(res, open(out, "w"), indent=1)
