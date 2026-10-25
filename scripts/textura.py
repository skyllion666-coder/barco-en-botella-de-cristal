"""Ajusta una textura para la web: la reduce (sin cambiar su proporción) y, si se pide, vuelve marrón oscuro
el rojo (tono de madera envejecida), con transición suave para no dejar bordes.

Uso: python3 -I scripts/textura.py entrada.jpg salida.jpg MAX_LADO [marron]
"""
import sys

import numpy as np
from PIL import Image

ent, sal, max_lado = sys.argv[1], sys.argv[2], int(sys.argv[3])
marron = len(sys.argv) > 4 and sys.argv[4] == 'marron'

im = Image.open(ent).convert('RGB')
if max(im.size) > max_lado:
    k = max_lado / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)

if marron:
    hsv = np.asarray(im.convert('HSV')).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # cuánto de «rojo» tiene cada píxel: tono cerca de 0 (o de 1), bien saturado y no negro
    dist = np.minimum(h, 1.0 - h)
    paso = lambda a, b, x: np.clip((x - a) / (b - a), 0.0, 1.0)
    w = (1.0 - paso(0.035, 0.075, dist)) * paso(0.28, 0.45, s) * paso(0.08, 0.18, v)
    # marrón oscuro de madera: tono ~25°, menos saturado y bastante más oscuro
    h2 = h * (1 - w) + 0.07 * w
    s2 = s * (1 - w) + s * 0.70 * w
    v2 = v * (1 - w) + v * 0.52 * w
    im = Image.fromarray((np.stack([h2, s2, v2], -1) * 255).clip(0, 255).astype(np.uint8), 'HSV').convert('RGB')

im.save(sal, quality=85, optimize=True)
