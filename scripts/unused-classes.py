#!/usr/bin/env python3
"""List class selectors in assets/src/css that no template, page, post, plugin, data file or script mentions.
Heuristic: a class counts as used if its name appears as a whole word anywhere in the sites' source. Check the
output by hand: classes built from parts (e.g. "era-" + name) and JS-added ones can show up as false positives."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
css_files = sorted((root/"assets/src/css").glob("*.css"))
corpus_dirs = [root/"blog", root/"www", root/"assets/src/js"]
skip = {"_site", "node_modules", ".jekyll-cache", "css", "js"}
tokens = set()
for d in corpus_dirs:
    for p in d.rglob("*"):
        if not p.is_file() or any(part in skip for part in p.relative_to(root).parts[:-1]): continue
        if p.suffix not in {".html", ".md", ".rb", ".yml", ".yaml", ".js", ".ts", ".json", ".xml", ".svg", ".txt"}: continue
        if p.stat().st_size > 1_500_000: continue
        tokens.update(re.findall(r"[A-Za-z0-9_-]+", p.read_text(errors="ignore")))
unused = {}
for f in css_files:
    text = re.sub(r"/\*.*?\*/", "", f.read_text(), flags=re.S)
    for line in text.splitlines():
        s = line.strip()
        if not (s.endswith("{") or s.endswith(",")) or s.startswith("@") or ":" in s.split(".")[0] and s.startswith("--"): continue
        for m in re.finditer(r"(?<![\w\d.])\.([A-Za-z_][\w-]*)", s):
            c = m.group(1)
            if c not in tokens: unused.setdefault(c, set()).add(f.name)
for c in sorted(unused): print(f"{c}\t{','.join(sorted(unused[c]))}")
