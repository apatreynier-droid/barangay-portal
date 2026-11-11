r"""Download road photos labelled as having no potholes (MIT licence).

Source: https://huggingface.co/datasets/Arpitraj01/Pothole_classification
("none" class, roads in Kerala, India). They are used as background images, so
the model learns what an undamaged road looks like and false alarms can be
measured. Every file must be a real JPEG; anything else is rejected.

    .\.venv\Scripts\python.exe ml_training\fetch_negatives.py
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = "Arpitraj01/Pothole_classification"
ML_DIR = Path(__file__).resolve().parent
OUTPUT = ML_DIR / "datasets" / "negatives_v1"
MAX_FILE_BYTES = 20 * 1024 * 1024
HEADERS = {"User-Agent": "barangay-portal-ml-training"}


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read(MAX_FILE_BYTES + 1)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    saved = 0
    for split in ("train", "val", "test"):
        listing = json.loads(
            get(
                f"https://huggingface.co/api/datasets/{REPOSITORY}"
                f"/tree/main/datasets/{split}/none?limit=1000"
            )
        )
        for entry in listing:
            name = Path(entry["path"]).name
            if entry.get("type") != "file" or not name.lower().endswith((".jpg", ".jpeg")):
                continue
            target = OUTPUT / name
            if target.exists():
                saved += 1
                continue
            data = get(
                f"https://huggingface.co/datasets/{REPOSITORY}/resolve/main/"
                f"{urllib.parse.quote(entry['path'])}"
            )
            if not data.startswith(b"\xff\xd8\xff") or len(data) > MAX_FILE_BYTES:
                print(f"rejected (not a JPEG or too large): {name}")
                continue
            target.write_bytes(data)
            saved += 1
    print(f"{saved} images in {OUTPUT}")


if __name__ == "__main__":
    main()
