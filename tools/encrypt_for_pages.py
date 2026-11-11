"""Build the GitHub Pages copy of the game with index.html behind the shared password of luca-grella.github.io.

Used by .github/workflows/pages.yml. The repo keeps the plain index.html; only the published copy is encrypted
(StatiCrypt, same password and salt as the site's other private pages, so "Ricordami" on one opens them all).
The wrapper keeps the game's manifest, icons and Home screen tags, so the game can still be installed before unlocking,
and the game's own viewport tag: StatiCrypt writes the game over the wrapper, and on iPhone a different viewport (no
viewport-fit=cover) left touches offset by the status bar height (Luca, 11 Nov 2026).

Usage: STATICRYPT_PASSWORD=... python3 tools/encrypt_for_pages.py <out_dir>   (needs npx)
"""
import os
import pathlib
import re
import shutil
import subprocess
import sys

SALT = "9083e7fa7e5ed6e26babbf9d3d173629"
STATICRYPT = "staticrypt@3.5.4"

out = pathlib.Path(sys.argv[1]).resolve()
src = pathlib.Path(".").resolve()
shutil.copytree(src, out, ignore=shutil.ignore_patterns(".git", ".github"))

plain = (src / "index.html").read_text()
title = re.search(r"<title>(.*?)</title>", plain, re.S).group(1).strip()
keep = re.findall(r'<meta name="(?:theme-color|mobile-web-app-capable|apple-mobile-web-app-[a-z-]+|application-name)"[^>]*>'
                  r'|<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>', plain)

tmp = out.parent / "staticrypt-out"
subprocess.run(["npx", "-y", STATICRYPT, str(src / "index.html"), "-p", os.environ["STATICRYPT_PASSWORD"], "--salt", SALT,
                "-d", str(tmp), "--short",
                "--template-title", title, "--template-instructions", "Inserisci la password per giocare",
                "--template-button", "Apri", "--template-placeholder", "Password",
                "--template-remember", "Ricordami su questo dispositivo",
                "--template-color-primary", "#f2894b", "--template-color-secondary", "#0b0d12"], check=True)
wrap = (tmp / "index.html").read_text()
anchor = '<meta charset="utf-8" />'
assert wrap.count(anchor) == 1
viewport = re.search(r'<meta name="viewport"[^>]*>', plain).group(0)
wrap, n = re.subn(r'<meta name="viewport"[^>]*>', lambda m: viewport, wrap, count=1)
assert n == 1
head = "\n    ".join(['<meta name="robots" content="noindex, nofollow" />'] + keep)
(out / "index.html").write_text(wrap.replace(anchor, anchor + "\n    " + head, 1))
shutil.rmtree(tmp)
print(f"{title}: encrypted index.html, {len(keep)} head tags kept")
