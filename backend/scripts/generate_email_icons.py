r"""Generate the Lucide icon PNGs used inside HTML emails.

Gmail (and most mail apps) do not render inline ``<svg>`` and block ``data:``
image URLs, so email icons are shipped as small PNGs embedded in the message
as CID inline images (see ``app/email_assets.py``). This script draws the
original Lucide SVG geometry (24x24 viewBox, stroke-width 2, round caps/joins,
copied from lucide-react v1.61.0, ISC license) with headless Microsoft Edge at
4x resolution on a transparent background and saves 96x96 PNGs to
``app/email_assets/``. The committed PNGs are what the backend uses; run this
only to change or add icons (Windows + Edge required):

    cd backend
    .\.venv\Scripts\python.exe scripts\generate_email_icons.py
"""

from __future__ import annotations

import os
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ASSET_DIR = BACKEND_DIR / "app" / "email_assets"
SIZE = 96  # pixels (24 * 4) - displayed at 18-32px, so crisp on retina screens

EDGE_CANDIDATES = (
    Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft/Edge/Application/msedge.exe",
    Path(os.environ.get("ProgramFiles", "")) / "Microsoft/Edge/Application/msedge.exe",
)

GREEN = "#15803d"
NAVY = "#152a63"

#: name -> (stroke color, Lucide SVG children)
ICONS: dict[str, tuple[str, str]] = {
    "circle-check": (
        GREEN,
        '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
    ),
    "file-check": (
        GREEN,
        '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 '
        '3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>'
        '<path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m9 15 2 2 4-4"/>',
    ),
    "calendar-days": (
        NAVY,
        '<path d="M8 2v3"/><path d="M16 2v3"/>'
        '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>'
        '<path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/>'
        '<path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>',
    ),
    # Building2 is an alias of "building-complex" in lucide-react v1.x.
    "building-2": (
        NAVY,
        '<path d="M10 12h4"/><path d="M10 8h4"/>'
        '<path d="M14 21v-3a2 2 0 0 0-4 0v3"/>'
        '<path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/>'
        '<path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
    ),
}


# ------------------------------------------------------------ PNG helpers


def read_png_rgba(data: bytes) -> tuple[int, int, list[bytearray]]:
    """Decode an 8-bit RGBA, non-interlaced PNG into rows of RGBA bytes."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, width = 8, b"", 0
    height = color_type = 0
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if depth != 8 or color_type != 6 or interlace:
                raise ValueError(
                    f"expected 8-bit RGBA without interlace (got depth={depth}, "
                    f"color_type={color_type}); is the background transparent?"
                )
        elif kind == b"IDAT":
            idat += chunk
        pos += 12 + length

    raw = zlib.decompress(idat)
    stride, bpp = width * 4, 4
    rows: list[bytearray] = []
    previous = bytearray(stride)
    offset = 0
    for _ in range(height):
        filter_type = raw[offset]
        row = bytearray(raw[offset + 1:offset + 1 + stride])
        offset += 1 + stride
        for i in range(stride):
            left = row[i - bpp] if i >= bpp else 0
            up = previous[i]
            up_left = previous[i - bpp] if i >= bpp else 0
            if filter_type == 1:
                row[i] = (row[i] + left) & 0xFF
            elif filter_type == 2:
                row[i] = (row[i] + up) & 0xFF
            elif filter_type == 3:
                row[i] = (row[i] + ((left + up) >> 1)) & 0xFF
            elif filter_type == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                row[i] = (row[i] + predictor) & 0xFF
        rows.append(row)
        previous = row
    return width, height, rows


def write_png_rgba(width: int, height: int, rows: list[bytes]) -> bytes:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload)) + kind + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


# ---------------------------------------------------------------- render


def render_icon(edge: Path, work: Path, name: str, color: str, children: str) -> bytes:
    page = work / f"{name}.html"
    page.write_text(
        "<!DOCTYPE html><html><head><style>html,body{margin:0;background:transparent}"
        "svg{display:block}</style></head><body>"
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE // 2}" height="{SIZE // 2}" '
        f'viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2" '
        f'stroke-linecap="round" stroke-linejoin="round">{children}</svg></body></html>',
        encoding="utf-8",
    )
    shot = work / f"{name}.png"
    subprocess.run(
        [
            str(edge), "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=2", "--default-background-color=00000000",
            f"--user-data-dir={work / 'profile'}", "--window-size=600,300",
            f"--screenshot={shot}", page.as_uri(),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=60,
    )
    _, _, rows = read_png_rgba(shot.read_bytes())
    cropped = [bytes(row[: SIZE * 4]) for row in rows[:SIZE]]
    if not any(row[i] for row in cropped for i in range(3, SIZE * 4, 4)):
        raise RuntimeError(f"{name}: rendered image is empty")
    return write_png_rgba(SIZE, SIZE, cropped)


def main() -> None:
    edge = next((path for path in EDGE_CANDIDATES if path.is_file()), None)
    if edge is None:
        sys.exit("Microsoft Edge was not found; it is needed to draw the icons.")

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        for name, (color, children) in ICONS.items():
            png = render_icon(edge, work, name, color, children)
            (ASSET_DIR / f"{name}.png").write_bytes(png)
            print(f"  {name}.png  {len(png):>5} bytes  ({color})")
    print(f"Icons written to {ASSET_DIR}")


if __name__ == "__main__":
    main()
