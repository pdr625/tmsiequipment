#!/usr/bin/env python3
"""Contraste WCAG dos tokens de tema (claro e escuro) de app/src/app/globals.css.

Lê os valores DIRECTAMENTE do CSS (nunca de uma cópia) e falha (exit 1) se um
par de texto ficar abaixo de 4,5:1 — ou de 3:1 nos pares só de elementos
gráficos/texto grande. Corre no VPS: só Python da biblioteca padrão, sem Node.

Porque existe (2026-10-04): os tokens do Itinera, copiados às cegas, dariam
--fg-muted = #94a3b8, que sobre branco é 2,56:1. A medição apanhou-o antes de
ir para produção; este script guarda a medição para a próxima vez que alguém
mexer numa cor.
"""
import re, sys, pathlib

# Argumento opcional: outro ficheiro CSS (usado para provar que o script falha).
CSS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else (
    pathlib.Path(__file__).resolve().parent.parent / "app" / "src" / "app" / "globals.css")

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def lum(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def ratio(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)

def block(css, selector):
    m = re.search(re.escape(selector) + r"\s*\{(.*?)\n\}", css, re.S)
    if not m:
        sys.exit(f"bloco não encontrado: {selector}")
    t = dict(re.findall(r"--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;", m.group(1)))
    # Tokens rgba(r, g, b, a): fundem-se sobre o trilho (--nav) para medir o contraste real.
    for nome, r, g, b, a in re.findall(
        r"--([a-z-]+):\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\s*\)\s*;", m.group(1)
    ):
        fundo = t["nav"].lstrip("#")
        fb = [int(fundo[i:i + 2], 16) for i in (0, 2, 4)]
        mix = [round(float(a) * int(c) + (1 - float(a)) * f) for c, f in zip((r, g, b), fb)]
        t[nome] = "#%02x%02x%02x" % tuple(mix)
    return t

# (rótulo, texto, fundo, mínimo)
PARES = [
    ("fg / page", "fg", "page", 4.5), ("fg / surface", "fg", "surface", 4.5),
    ("fg / surface-alt", "fg", "surface-alt", 4.5),
    ("fg-soft / surface", "fg-soft", "surface", 4.5), ("fg-soft / surface-alt", "fg-soft", "surface-alt", 4.5),
    ("fg-muted / surface", "fg-muted", "surface", 4.5), ("fg-muted / surface-alt", "fg-muted", "surface-alt", 4.5),
    ("fg-muted / page", "fg-muted", "page", 4.5),
    ("on-primary / primary (botão)", "on-primary", "primary", 4.5),
    ("primary-fg / surface (ligação)", "primary-fg", "surface", 4.5), ("primary-fg / page", "primary-fg", "page", 4.5),
    ("primary-fg / primary-soft (etiqueta)", "primary-fg", "primary-soft", 4.5),
    ("success / success-soft", "success", "success-soft", 4.5), ("success / surface", "success", "surface", 4.5),
    ("danger / danger-soft", "danger", "danger-soft", 4.5), ("danger / surface", "danger", "surface", 4.5),
    ("warning / warning-soft", "warning", "warning-soft", 4.5), ("warning / surface", "warning", "surface", 4.5),
    # Menu lateral: texto do trilho, item activo (coral sobre o trilho já tingido).
    ("nav-fg / nav", "nav-fg", "nav", 4.5), ("nav-fg-hover / nav", "nav-fg-hover", "nav", 4.5),
    ("nav-active-fg / nav-active-bg (item activo)", "nav-active-fg", "nav-active-bg", 4.5),
    ("nav-active-fg / nav", "nav-active-fg", "nav", 4.5),
    # O coral é identidade/realce (item activo, marca) — nunca texto pequeno.
    ("accent / surface (só texto grande/gráfico)", "accent", "surface", 3.0),
]

def main():
    css = CSS.read_text()
    temas = {"claro": block(css, ":root"), "escuro": block(css, ":root[data-theme='dark']")}
    falhas = 0
    for nome, t in temas.items():
        print(f"== {nome}")
        for rot, a, b, minimo in PARES:
            v = ratio(t[a], t[b])
            ok = v >= minimo
            falhas += 0 if ok else 1
            print(f"{'OK ' if ok else 'XX '} {v:5.2f} (min {minimo}) {rot}")
    print(f"falhas: {falhas}")
    sys.exit(1 if falhas else 0)

main()
