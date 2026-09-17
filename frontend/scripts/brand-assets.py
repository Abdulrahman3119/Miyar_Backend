"""Regenerate public/brand/* and favicons from ../brand/*.png (logo-default, logo-vertical, app-icon).
Run from miyar-app root:  python scripts/brand-assets.py
"""
import os
from PIL import Image, ImageDraw

SRC = os.path.join(os.path.dirname(__file__), '..', '..', 'brand')
DST = os.path.join(os.path.dirname(__file__), '..', 'public', 'brand')
PUB = os.path.join(os.path.dirname(__file__), '..', 'public')
os.makedirs(DST, exist_ok=True)


def trim(im):
    a = im.split()[3]
    return im.crop(a.point(lambda v: 255 if v > 20 else 0).getbbox())


def fit(im, w=None, h=None):
    r = im.width / im.height
    return im.resize((w, round(w / r)) if w else (round(h * r), h), Image.LANCZOS)


def on_dark(im):
    """Light recolor for dark surfaces: greens -> white, greys -> light mint-grey (alpha kept)."""
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            grey = abs(r - g) < 18 and abs(g - b) < 18
            px[x, y] = (205, 216, 212, a) if grey else (255, 255, 255, a)
    return im


logo = trim(Image.open(f'{SRC}/logo-default.png').convert('RGBA'))
fit(logo, w=720).save(f'{DST}/logo.png'); fit(on_dark(logo), w=720).save(f'{DST}/logo-on-dark.png')
vert = trim(Image.open(f'{SRC}/logo-vertical.png').convert('RGBA'))
fit(vert, h=640).save(f'{DST}/logo-vertical.png'); fit(on_dark(vert), h=640).save(f'{DST}/logo-vertical-on-dark.png')

icon = trim(Image.open(f'{SRC}/app-icon.png').convert('RGBA'))
s = max(icon.size); pad = int(s * 0.08)
canvas = Image.new('RGBA', (s + 2 * pad, s + 2 * pad), (0, 0, 0, 0))
canvas.paste(icon, ((canvas.width - icon.width) // 2, (canvas.height - icon.height) // 2), icon)
fit(canvas, w=512).save(f'{DST}/mark.png'); fit(on_dark(canvas), w=512).save(f'{DST}/mark-on-dark.png')

for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (32, 'favicon-32.png')]:
    tile = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    m = fit(canvas, w=int(size * 0.86)); tile.paste(m, ((size - m.width) // 2, (size - m.height) // 2), m)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.2), fill=255)
    tile.putalpha(mask); tile.save(f'{PUB}/{name}')
print('brand assets regenerated')
