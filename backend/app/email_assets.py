"""Lucide icons for HTML emails, embedded as CID inline images.

Gmail and most mail apps strip inline ``<svg>`` and block ``data:`` image URLs,
so the Lucide icons are stored as small PNGs in ``app/email_assets/`` (drawn
from the original Lucide SVGs by ``scripts/generate_email_icons.py``) and
attached to the message itself as ``multipart/related`` parts. The HTML
references them with ``src="cid:..."``, which Gmail shows without fetching
anything from the internet (the backend may run on localhost).

``app/email_service.build_message`` attaches exactly the icons an HTML body
references, so templates without icons are sent exactly as before.
"""

from __future__ import annotations

import base64
import re
from functools import lru_cache
from pathlib import Path

ASSET_DIR = Path(__file__).resolve().parent / "email_assets"

#: Lucide icon name -> PNG file (96x96, transparent, Lucide stroke-width 2).
ICON_FILES: dict[str, str] = {
    "circle-check": "circle-check.png",
    "file-check": "file-check.png",
    "calendar-days": "calendar-days.png",
    "building-2": "building-2.png",
}

_CID_DOMAIN = "barangay-portal"
_CID_PATTERN = re.compile(r'cid:(icon-([a-z0-9-]+)@' + re.escape(_CID_DOMAIN) + ")")


def icon_cid(name: str) -> str:
    if name not in ICON_FILES:
        raise KeyError(f"Unknown email icon: {name}")
    return f"icon-{name}@{_CID_DOMAIN}"


def icon_img(name: str, size: int, *, alt: str = "") -> str:
    """An email-safe ``<img>`` for a Lucide icon (decorative by default)."""
    return (
        f'<img src="cid:{icon_cid(name)}" width="{size}" height="{size}" alt="{alt}" '
        f'style="display:block;width:{size}px;height:{size}px;border:0;outline:none;'
        f'text-decoration:none;" />'
    )


@lru_cache(maxsize=None)
def icon_png(name: str) -> bytes:
    return (ASSET_DIR / ICON_FILES[name]).read_bytes()


def inline_images_for(html: str) -> list[tuple[str, bytes]]:
    """``(content_id, png_bytes)`` for every icon the HTML references, once each."""
    seen: dict[str, bytes] = {}
    for match in _CID_PATTERN.finditer(html):
        content_id, name = match.group(1), match.group(2)
        if name in ICON_FILES and content_id not in seen:
            seen[content_id] = icon_png(name)
    return list(seen.items())


def html_with_data_uris(html: str) -> str:
    """Swap ``cid:`` references for data URIs (local previews only, never sent)."""

    def replace(match: re.Match[str]) -> str:
        name = match.group(2)
        if name not in ICON_FILES:
            return match.group(0)
        encoded = base64.b64encode(icon_png(name)).decode("ascii")
        return f"data:image/png;base64,{encoded}"

    return _CID_PATTERN.sub(replace, html)
