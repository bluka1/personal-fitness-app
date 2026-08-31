#!/usr/bin/env python3
"""Sastavlja src/ u index.html (živa aplikacija, uključujući trening).

    python3 build.py

Trening moduli (training-calc.js, training-seed.js, training.js) inline se u
istu <script> oznaku kao seed.js i app.js. zxing.js ostaje zasebna datoteka.
Ne mijenjaj generirane datoteke ručno.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

MARKER = '<script src="seed.js"></script>\n<script src="app.js"></script>'


def read(name: str) -> str:
    return (SRC / name).read_text(encoding="utf-8")


def build() -> int:
    shell = read("shell.html")
    if MARKER not in shell:
        print("GREŠKA: src/shell.html nema očekivane <script> oznake.", file=sys.stderr)
        return 1

    # Redoslijed: calc + seed treninga prije logike; training.js iza app.js
    # (registrira se sam na kraju, kad je start gotov i #nav je u DOM-u).
    parts = [
        read("i18n.js"),
        read("training-calc.js"),
        read("training-seed.js"),
        read("seed.js"),
        read("app.js"),
        read("training.js"),
    ]
    html = shell.replace(MARKER, "<script>\n" + "\n".join(parts) + "\n</script>")

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"index.html sastavljen — {len(html) / 1024:.0f} kB")
    print("Ne zaboravi podići verziju cachea u sw.js ako se aplikacija promijenila.")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
