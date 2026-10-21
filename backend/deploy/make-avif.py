#!/usr/bin/env python3
"""Создаёт .avif рядом с каждым .webp (если AVIF получается хотя бы на 5% легче).

Использование (из папки сайта):  python3 make-avif.py assets/*.webp
Нужен Pillow ≥ 11:  pip install pillow
После этого в разметке оберните картинку так:
  <picture><source type="image/avif" srcset="assets/x.avif"><img src="assets/x.webp" ...></picture>
(для srcset перечислите .avif-версии тех же размеров, что и у .webp).
"""
import io, os, sys
from PIL import Image

done = skipped = 0
for path in sys.argv[1:]:
    if not path.lower().endswith('.webp'):
        continue
    buf = io.BytesIO()
    Image.open(path).save(buf, 'AVIF', quality=60, speed=6)
    if len(buf.getvalue()) < os.path.getsize(path) * 0.95:
        with open(path[:-5] + '.avif', 'wb') as f:
            f.write(buf.getvalue())
        done += 1
    else:
        skipped += 1
print(f'AVIF создано: {done}, пропущено (не выгодно): {skipped}')
