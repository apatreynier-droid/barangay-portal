r"""Build the YOLO train/val/test dataset from the downloaded pothole archive.

Nothing here touches the running portal or the database.

    cd backend
    .\.venv\Scripts\python.exe ml_training\prepare_dataset.py --zip "%USERPROFILE%\Downloads\Potholes.zip"

What it does, and why:

* Extracts only images, annotations and the two dashcam videos, refusing unsafe
  paths. The nested duplicate ``Potholes.zip`` is skipped.
* Treats the Pascal VOC XML as the source of truth and cross-checks it against
  the supplied YOLO TXT files and the real image sizes, so label problems are
  reported rather than silently trained on.
* Groups near-duplicate photos with a perceptual hash and keeps each group in a
  single split. Otherwise nearly identical images can land in both train and
  test and make the test score look better than it really is.
* Writes ``split_manifest.json`` so the split can be reproduced and audited.
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import statistics
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

from PIL import Image, ImageOps

ML_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = ML_DIR / "datasets" / "potholes_v1"
SPLITS = {"train": 0.70, "val": 0.15, "test": 0.15}
#: Bits (of 64) two photos may differ by and still count as near-duplicates.
NEAR_DUPLICATE_BITS = 6
#: Largest allowed difference between the XML and TXT box edges (image fraction).
LABEL_TOLERANCE = 0.01

#: Undamaged-road photos (see fetch_negatives.py), used as background images.
NEGATIVES_DIR = ML_DIR / "datasets" / "negatives_v1"
#: Removed after a manual check: dark marks that may be small real defects.
NEGATIVES_EXCLUDED = {"IMG_1261", "IMG_1262", "IMG_1266", "IMG_1288", "IMG_1289"}
#: Consecutive shots overlap, so each split takes one unbroken run of photos.
NEGATIVE_SPLIT_RANGES = {"train": (1246, 1270), "val": (1271, 1279), "test": (1280, 1295)}


def add_negatives(output: Path) -> dict[str, list[str]]:
    """Copy the background photos into the splits with empty label files."""
    added: dict[str, list[str]] = {split: [] for split in SPLITS}
    for path in sorted(NEGATIVES_DIR.glob("IMG_*.jp*g")):
        if path.stem in NEGATIVES_EXCLUDED:
            continue
        number = int(path.stem.split("_")[1])
        for split, (first, last) in NEGATIVE_SPLIT_RANGES.items():
            if first <= number <= last:
                shutil.copy2(path, output / "images" / split / f"neg_{path.stem}.jpg")
                (output / "labels" / split / f"neg_{path.stem}.txt").write_text("", encoding="utf-8")
                added[split].append(path.stem)
    return added


def extract(zip_path: Path, raw_dir: Path) -> None:
    """Extract only the folders we need, flattening the long top-level folder."""
    wanted = {"IMG": ".jpg", "XML": ".xml", "TXT": ".txt"}
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            parts = PurePosixPath(info.filename).parts
            if info.filename.startswith(("/", "\\")) or ".." in parts:
                raise ValueError(f"Unsafe path in archive: {info.filename}")
            name = parts[-1]
            folder = parts[-2] if len(parts) >= 2 else ""
            if wanted.get(folder) == PurePosixPath(name).suffix.lower():
                target = raw_dir / folder / name
            elif name.lower().endswith(".mp4"):
                target = raw_dir / "videos" / name
            elif name.lower() == "readme.txt":
                target = raw_dir / name
            else:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.stat().st_size != info.file_size:
                with archive.open(info) as source, open(target, "wb") as destination:
                    shutil.copyfileobj(source, destination)


def parse_xml(path: Path) -> tuple[int, int, list[tuple[str, float, float, float, float]]]:
    root = ET.parse(path).getroot()
    size = root.find("size")
    width, height = int(size.findtext("width")), int(size.findtext("height"))
    boxes = []
    for item in root.findall("object"):
        box = item.find("bndbox")
        boxes.append(
            (
                (item.findtext("name") or "").strip().lower(),
                float(box.findtext("xmin")),
                float(box.findtext("ymin")),
                float(box.findtext("xmax")),
                float(box.findtext("ymax")),
            )
        )
    return width, height, boxes


def difference_hash(path: Path) -> int:
    with Image.open(path) as image:
        small = ImageOps.exif_transpose(image).convert("L").resize((9, 8))
        pixels = small.tobytes()
    value = 0
    for row in range(8):
        for column in range(8):
            value = (value << 1) | int(pixels[row * 9 + column] > pixels[row * 9 + column + 1])
    return value


def group_near_duplicates(hashes: dict[str, int]) -> list[list[str]]:
    stems = list(hashes)
    parent = {stem: stem for stem in stems}

    def find(item: str) -> str:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    for index, first in enumerate(stems):
        for second in stems[index + 1 :]:
            if (hashes[first] ^ hashes[second]).bit_count() <= NEAR_DUPLICATE_BITS:
                parent[find(first)] = find(second)

    groups: dict[str, list[str]] = defaultdict(list)
    for stem in stems:
        groups[find(stem)].append(stem)
    return list(groups.values())


def assign_splits(groups: list[list[str]], seed: int) -> dict[str, str]:
    """Largest groups first, each into the split furthest below its target."""
    random.Random(seed).shuffle(groups)
    groups = sorted(groups, key=len, reverse=True)
    total = sum(len(group) for group in groups)
    counts = dict.fromkeys(SPLITS, 0)
    assignment: dict[str, str] = {}
    for group in groups:
        split = max(SPLITS, key=lambda name: SPLITS[name] * total - counts[name])
        counts[split] += len(group)
        for stem in group:
            assignment[stem] = split
    return assignment


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True, help="Path to Potholes.zip")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    raw_dir = args.output / "raw"
    extract(args.zip, raw_dir)

    problems: Counter[str] = Counter()
    examples: dict[str, list[str]] = defaultdict(list)

    def report(kind: str, stem: str) -> None:
        problems[kind] += 1
        if len(examples[kind]) < 5:
            examples[kind].append(stem)

    labels: dict[str, list[tuple[float, float, float, float]]] = {}
    image_paths: dict[str, Path] = {}
    class_names: Counter[str] = Counter()

    for image_path in sorted((raw_dir / "IMG").glob("*.jpg")):
        stem = image_path.stem
        xml_path = raw_dir / "XML" / f"{stem}.xml"
        if not xml_path.exists():
            report("image without XML", stem)
            continue
        try:
            with Image.open(image_path) as image:
                image.verify()
            with Image.open(image_path) as image:
                actual_size = ImageOps.exif_transpose(image).size
                orientation = image.getexif().get(274, 1)
        except Exception:  # noqa: BLE001 - any decode failure means an unusable image
            report("unreadable image", stem)
            continue
        if orientation not in (1, None):
            report("EXIF rotation present", stem)

        try:
            width, height, boxes = parse_xml(xml_path)
        except (ET.ParseError, AttributeError, TypeError, ValueError):
            report("unparseable XML", stem)
            continue
        if (width, height) != actual_size:
            report("XML size differs from image", stem)
            width, height = actual_size

        converted = []
        for name, xmin, ymin, xmax, ymax in boxes:
            class_names[name] += 1
            xmin, xmax = max(0.0, xmin), min(float(width), xmax)
            ymin, ymax = max(0.0, ymin), min(float(height), ymax)
            if xmax - xmin < 2 or ymax - ymin < 2:
                report("degenerate box dropped", stem)
                continue
            converted.append(
                (
                    (xmin + xmax) / 2 / width,
                    (ymin + ymax) / 2 / height,
                    (xmax - xmin) / width,
                    (ymax - ymin) / height,
                )
            )
        if not converted:
            report("image with no boxes", stem)

        txt_path = raw_dir / "TXT" / f"{stem}.txt"
        if txt_path.exists():
            supplied = [
                tuple(float(value) for value in line.split()[1:5])
                for line in txt_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            if len(supplied) != len(converted):
                report("XML/TXT box count differs", stem)
            elif any(
                abs(a - b) > LABEL_TOLERANCE
                for left, right in zip(sorted(converted), sorted(supplied))
                for a, b in zip(left, right)
            ):
                report("XML/TXT box position differs", stem)
        else:
            report("missing TXT", stem)

        labels[stem] = converted
        image_paths[stem] = image_path

    hashes = {stem: difference_hash(path) for stem, path in image_paths.items()}
    groups = group_near_duplicates(hashes)
    assignment = assign_splits(groups, args.seed)

    for split in SPLITS:
        for kind in ("images", "labels"):
            directory = args.output / kind / split
            if directory.exists():
                shutil.rmtree(directory)
            directory.mkdir(parents=True)

    for stem, split in assignment.items():
        shutil.copy2(image_paths[stem], args.output / "images" / split / f"{stem}.jpg")
        (args.output / "labels" / split / f"{stem}.txt").write_text(
            "".join(f"0 {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n" for x, y, w, h in labels[stem]),
            encoding="utf-8",
        )

    negatives = add_negatives(args.output)

    (args.output / "data.yaml").write_text(
        f"path: {args.output.resolve().as_posix()}\n"
        "train: images/train\nval: images/val\ntest: images/test\n"
        "names:\n  0: pothole\n",
        encoding="utf-8",
    )

    def box_area_bucket(box: tuple[float, float, float, float]) -> str:
        area = box[2] * box[3]
        return "small (<1% of image)" if area < 0.01 else "large (>10%)" if area > 0.10 else "medium"

    summary: dict[str, object] = {}
    for split in SPLITS:
        stems = [stem for stem, value in assignment.items() if value == split]
        boxes = [box for stem in stems for box in labels[stem]]
        summary[split] = {
            "images": len(stems),
            "no_pothole_images": len(negatives[split]),
            "boxes": len(boxes),
            "images_with_multiple_potholes": sum(len(labels[stem]) > 1 for stem in stems),
            "max_boxes_in_one_image": max((len(labels[stem]) for stem in stems), default=0),
            "box_sizes": dict(Counter(box_area_bucket(box) for box in boxes)),
        }

    duplicate_groups = [sorted(group) for group in groups if len(group) > 1]
    manifest = {
        "seed": args.seed,
        "near_duplicate_bits": NEAR_DUPLICATE_BITS,
        "summary": summary,
        "near_duplicate_groups": duplicate_groups,
        "no_pothole_images": negatives,
        "assignment": dict(sorted(assignment.items())),
    }
    (args.output / "split_manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    all_counts = [len(boxes) for boxes in labels.values()]
    print(f"usable images: {len(labels)}  total boxes: {sum(all_counts)}")
    print(f"boxes per image: median {statistics.median(all_counts)}, max {max(all_counts)}")
    print(f"class names in XML: {dict(class_names)}")
    print(f"near-duplicate groups: {len(duplicate_groups)} covering "
          f"{sum(len(group) for group in duplicate_groups)} images")
    print("data problems:" if problems else "data problems: none")
    for kind, count in problems.most_common():
        print(f"  {kind}: {count}  e.g. {examples[kind]}")
    for split, values in summary.items():
        print(f"{split}: {values}")


if __name__ == "__main__":
    main()
