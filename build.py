#!/usr/bin/env python3
"""Sastavlja src/ u index.html u korijenu. Bez ovisnosti — samo stdlib.

    python3 build.py

zxing.js ostaje zasebna datoteka (SW je cachira odvojeno, a index.html
tako ostaje čitljiv). Ne mijenjaj index.html ručno — prepisuje se.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

MARKER = '<script src="seed.js"></script>\n<script src="app.js"></script>'


def main() -> int:
    shell = (SRC / "shell.html").read_text(encoding="utf-8")
    seed = (SRC / "seed.js").read_text(encoding="utf-8")
    app = (SRC / "app.js").read_text(encoding="utf-8")

    if MARKER not in shell:
        print("GREŠKA: src/shell.html nema očekivane <script> oznake.", file=sys.stderr)
        return 1

    html = shell.replace(MARKER, "<script>\n" + seed + "\n" + app + "\n</script>")
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print(f"index.html sastavljen — {len(html) / 1024:.0f} kB")
    print("Ne zaboravi podići verziju cachea u sw.js ako se aplikacija promijenila.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
