# Tela de bandera para el galeón: 'espana' (rojigualda, franjas 1:2:1, con un escudo sencillo hacia el asta) o
# 'borgona' (cruz de Borgoña: aspa roja de troncos nudosos sobre blanco, la de la Armada en tiempos de los galeones).
# Con un poco de textura de tela. Uso: python3 bandera.py espana|borgona salida.png
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter

cual, salida = sys.argv[1], sys.argv[2]
W, H = 512, 340
S = 2  # se dibuja al doble y se reduce (bordes suaves)
im = Image.new('RGB', (W * S, H * S), (240, 236, 226))
d = ImageDraw.Draw(im)
ROJO, ORO = (170, 21, 27), (241, 191, 0)
if cual == 'espana':
    d.rectangle([0, 0, W * S, H * S // 4], fill=ROJO)
    d.rectangle([0, H * S // 4, W * S, H * S * 3 // 4], fill=ORO)
    d.rectangle([0, H * S * 3 // 4, W * S, H * S], fill=ROJO)
    # escudo sencillo (a 1/3 del asta): columnas, corona y cuartelado
    cx, cy, e = W * S * 0.33, H * S * 0.5, H * S * 0.012
    for dx in (-13, 13):
        d.rectangle([cx + (dx - 2) * e, cy - 9 * e, cx + (dx + 2) * e, cy + 11 * e], fill=(225, 225, 220), outline=(120, 90, 30), width=int(e))
    d.rounded_rectangle([cx - 9 * e, cy - 9 * e, cx + 9 * e, cy + 11 * e], radius=int(6 * e), fill=(200, 40, 35), outline=(120, 90, 30), width=int(e))
    d.rectangle([cx, cy - 9 * e, cx + 9 * e, cy + 1 * e], fill=(240, 230, 210))
    d.rectangle([cx - 9 * e, cy + 1 * e, cx, cy + 11 * e], fill=(240, 230, 210))
    d.rectangle([cx - 8 * e, cy - 15 * e, cx + 8 * e, cy - 10 * e], fill=(230, 180, 20), outline=(120, 90, 30), width=int(e))
else:
    # aspa de dos troncos gruesos con muñones (nudos de ramas cortadas) a los lados
    random.seed(7)
    g = H * S * 0.13
    for (x0, y0, x1, y1) in ((0, 0, W * S, H * S), (0, H * S, W * S, 0)):
        L = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / L, (y1 - y0) / L; nx, ny = -uy, ux
        # tronco: borde algo irregular
        izq, der = [], []
        for k in range(61):
            t = k / 60
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            w1 = g * (0.5 + 0.06 * math.sin(k * 2.3) + random.uniform(-0.03, 0.03))
            w2 = g * (0.5 + 0.06 * math.sin(k * 1.7 + 1) + random.uniform(-0.03, 0.03))
            izq.append((px + nx * w1, py + ny * w1)); der.append((px - nx * w2, py - ny * w2))
        d.polygon(izq + der[::-1], fill=ROJO)
        for k in range(1, 8):
            t = k / 8 + random.uniform(-0.02, 0.02)
            if abs(t - 0.5) < 0.09: continue
            sgn = 1 if k % 2 else -1
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            # muñón inclinado hacia fuera
            q = [(px + nx * sgn * g * 0.35 - ux * g * 0.22, py + ny * sgn * g * 0.35 - uy * g * 0.22),
                 (px + nx * sgn * g * 0.82 + ux * g * 0.05, py + ny * sgn * g * 0.82 + uy * g * 0.05),
                 (px + nx * sgn * g * 0.80 + ux * g * 0.30, py + ny * sgn * g * 0.80 + uy * g * 0.30),
                 (px + nx * sgn * g * 0.35 + ux * g * 0.22, py + ny * sgn * g * 0.35 + uy * g * 0.22)]
            d.polygon(q, fill=ROJO)
im = im.resize((W, H), Image.LANCZOS)
# trama de la tela: leve ruido y un poco de sombra en el borde libre
px = im.load()
random.seed(3)
for y in range(H):
    for x in range(W):
        r, g2, b = px[x, y]
        k = 1 + random.uniform(-0.035, 0.035) + 0.02 * math.sin(y * 1.9) - 0.06 * (x / W) ** 3
        px[x, y] = tuple(max(0, min(255, int(v * k))) for v in (r, g2, b))
im.save(salida)
