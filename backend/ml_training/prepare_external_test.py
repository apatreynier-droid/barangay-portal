r"""Build an independent test set from a different pothole dataset.

Source: https://huggingface.co/datasets/rupesh002/pothole-detection-dataset (MIT)

The set is used only for measuring, never for training or tuning. Any photo that
is a near-duplicate of one in the training dataset is removed, so that neither
model is being tested on something it may have seen.

    .\.venv\Scripts\python.exe ml_training\prepare_external_test.py
"""

from __future__ import annotations

import io
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

from PIL import Image, ImageOps

ML_DIR = Path(__file__).resolve().parent
OUTPUT = ML_DIR / "datasets" / "external_v1"
ZIP_PATH = OUTPUT / "source" / "pothole_dataset.zip"
TRAINING_IMAGES = ML_DIR / "datasets" / "potholes_v1" / "raw" / "IMG"
URL = (
    "https://huggingface.co/datasets/rupesh002/pothole-detection-dataset"
    "/resolve/main/pothole_dataset.zip"
)
NEAR_DUPLICATE_BITS = 6
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def difference_hash(image: Image.Image) -> int:
    small = ImageOps.exif_transpose(image).convert("L").resize((9, 8))
    pixels = small.tobytes()
    value = 0
    for row in range(8):
        for column in range(8):
            value = (value << 1) | int(pixels[row * 9 + column] > pixels[row * 9 + column + 1])
    return value


def main() -> None:
    ZIP_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not ZIP_PATH.exists():
        request = urllib.request.Request(URL, headers={"User-Agent": "barangay-portal-ml-training"})
        with urllib.request.urlopen(request, timeout=300) as response, open(ZIP_PATH, "wb") as output:
            shutil.copyfileobj(response, output)

    training_hashes = []
    for path in TRAINING_IMAGES.glob("*.jpg"):
        with Image.open(path) as image:
            training_hashes.append(difference_hash(image))

    images_dir = OUTPUT / "images" / "test"
    labels_dir = OUTPUT / "labels" / "test"
    for directory in (images_dir, labels_dir):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True)

    with zipfile.ZipFile(ZIP_PATH) as archive:
        names = [info.filename for info in archive.infolist() if not info.is_dir()]
        for name in names:
            parts = PurePosixPath(name).parts
            if name.startswith(("/", "\\")) or ".." in parts:
                raise ValueError(f"Unsafe path in archive: {name}")

        print("archive files:", len(names))
        print("sample:", names[:6])
        for doc in [n for n in names if n.lower().endswith((".yaml", ".yml"))][:2]:
            print(f"--- {doc} ---\n{archive.read(doc).decode('utf-8', 'replace')[:500]}")

        by_key = {}
        for name in names:
            path = PurePosixPath(name)
            if path.suffix.lower() == ".txt":
                by_key[str(path.with_suffix("")).replace("labels/", "images/", 1).replace("/labels/", "/images/")] = name

        kept = removed_duplicates = no_label = 0
        boxes = classes = None
        boxes, classes = 0, set()
        for name in names:
            path = PurePosixPath(name)
            if path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            label_name = by_key.get(str(path.with_suffix("")))
            if label_name is None:
                no_label += 1
                continue
            data = archive.read(name)
            try:
                with Image.open(io.BytesIO(data)) as image:
                    image.load()
                    value = difference_hash(image)
            except Exception:  # noqa: BLE001 - skip anything unreadable
                continue
            if any((value ^ other).bit_count() <= NEAR_DUPLICATE_BITS for other in training_hashes):
                removed_duplicates += 1
                continue

            lines = [
                line.split()
                for line in archive.read(label_name).decode("utf-8", "replace").splitlines()
                if line.strip()
            ]
            # Detection labels only: exactly class + 4 box values.
            if any(len(line) != 5 for line in lines):
                no_label += 1
                continue
            stem = f"ext_{kept:04d}"
            (images_dir / f"{stem}{path.suffix.lower()}").write_bytes(data)
            (labels_dir / f"{stem}.txt").write_text(
                "".join(f"0 {' '.join(line[1:])}\n" for line in lines), encoding="utf-8"
            )
            classes.update(line[0] for line in lines)
            boxes += len(lines)
            kept += 1

    (OUTPUT / "data.yaml").write_text(
        f"path: {OUTPUT.resolve().as_posix()}\ntrain: images/test\nval: images/test\ntest: images/test\n"
        "names:\n  0: pothole\n",
        encoding="utf-8",
    )
    summary = {
        "kept_images": kept,
        "boxes": boxes,
        "class_ids_seen": sorted(classes),
        "removed_near_duplicates_of_training_data": removed_duplicates,
        "skipped_no_usable_label": no_label,
    }
    (OUTPUT / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(summary)


if __name__ == "__main__":
    main()
