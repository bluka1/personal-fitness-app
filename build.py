#!/usr/bin/env python3
"""Sastavlja src/ u index.html (živa aplikacija) ili preview/index.html.

    python3 build.py            # živa aplikacija, bez treninga
    python3 build.py --preview  # preview s modulom za trening

zxing.js ostaje zasebna datoteka. Ne mijenjaj generirane datoteke ručno.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

MARKER = '<script src="seed.js"></script>\n<script src="app.js"></script>'


def read(name: str) -> str:
    return (SRC / name).read_text(encoding="utf-8")


def build(preview: bool) -> int:
    shell = read("shell.html")
    if MARKER not in shell:
        print("GREŠKA: src/shell.html nema očekivane <script> oznake.", file=sys.stderr)
        return 1

    parts = [read("seed.js"), read("app.js")]
    if preview:
        # Trening moduli se ubacuju IZA app.js: calc i seed prije logike.
        parts = [read("training-calc.js"), read("training-seed.js"), read("seed.js"), read("app.js"), read("training.js")]

    html = shell.replace(MARKER, "<script>\n" + "\n".join(parts) + "\n</script>")

    if preview:
        # Preview je online-first: bez service workera (spec §9).
        html = html.replace('if ("serviceWorker" in navigator)', 'if (false && "serviceWorker" in navigator)')
        out_dir = ROOT / "preview"
        out_dir.mkdir(exist_ok=True)
        out = out_dir / "index.html"
    else:
        out = ROOT / "index.html"

    out.write_text(html, encoding="utf-8")
    label = "preview/index.html" if preview else "index.html"
    print(f"{label} sastavljen — {len(html) / 1024:.0f} kB")
    if not preview:
        print("Ne zaboravi podići verziju cachea u sw.js ako se aplikacija promijenila.")
    return 0


def main() -> int:
    return build("--preview" in sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
