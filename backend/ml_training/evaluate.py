r"""Measure a trained model honestly and choose its confidence threshold.

    cd backend
    .\.venv\Scripts\python.exe ml_training\evaluate.py --weights ml_training\runs\pothole_v2\weights\best.pt

The threshold is tuned on the VALIDATION split only; the TEST split is then
measured once at that threshold, so the reported numbers were not used to make
any decision about the model. Results go to <weights folder>/../evaluation/:

* report.json: every number below.
* false_positives/ and missed/: annotated photos of each kind of mistake, for
  looking at what actually goes wrong. Green = correct label, red = prediction.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

os.environ.setdefault("YOLO_OFFLINE", "true")

ML_DIR = Path(__file__).resolve().parent
DEFAULT_DATA = ML_DIR / "datasets" / "potholes_v1" / "data.yaml"
#: A prediction counts as correct when it overlaps a label by at least this.
MATCH_IOU = 0.5
#: Candidate thresholds. Predictions are collected at the lowest one.
THRESHOLDS = [round(0.05 * step, 2) for step in range(2, 18)]


def box_size_bucket(box: list[float], width: int, height: int) -> str:
    area = (box[2] - box[0]) * (box[3] - box[1]) / (width * height)
    return "small" if area < 0.01 else "large" if area > 0.10 else "medium"


def iou(a: list[float], b: list[float]) -> float:
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = width * height
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def load_labels(label_path: Path, width: int, height: int) -> list[list[float]]:
    boxes = []
    if label_path.exists():
        for line in label_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                _, x, y, w, h = (float(value) for value in line.split()[:5])
                boxes.append(
                    [(x - w / 2) * width, (y - h / 2) * height, (x + w / 2) * width, (y + h / 2) * height]
                )
    return boxes


def predict_split(model, data_root: Path, split: str, imgsz: int) -> tuple[list[dict], list[float]]:
    """Predictions at the lowest candidate threshold for every photo in a split."""
    records = []
    seconds = []
    for image_path in sorted((data_root / "images" / split).iterdir()):
        started = time.perf_counter()
        result = model.predict(
            str(image_path), imgsz=imgsz, conf=THRESHOLDS[0], iou=0.5, device="cpu", verbose=False
        )[0]
        seconds.append(time.perf_counter() - started)
        height, width = result.orig_shape
        records.append(
            {
                "name": image_path.name,
                "path": image_path,
                "width": width,
                "height": height,
                "labels": load_labels(data_root / "labels" / split / f"{image_path.stem}.txt", width, height),
                "boxes": result.boxes.xyxy.tolist(),
                "scores": result.boxes.conf.tolist(),
            }
        )
    return records, sorted(seconds)


def score(records: list[dict], threshold: float) -> dict:
    """Precision/recall/counting accuracy at one threshold (greedy IoU matching)."""
    true_positive = false_positive = false_negative = 0
    exact_counts = 0
    absolute_count_error = 0
    by_size = {"small": [0, 0], "medium": [0, 0], "large": [0, 0]}
    single = [0, 0]
    multiple = [0, 0]
    negative_images = negative_images_with_alarm = 0
    per_image = []

    for record in records:
        kept = sorted(
            (pair for pair in zip(record["scores"], record["boxes"]) if pair[0] >= threshold),
            key=lambda pair: -pair[0],
        )
        matched: set[int] = set()
        wrong_boxes = []
        for box_score, box in kept:
            best, best_iou = None, MATCH_IOU
            for index, label in enumerate(record["labels"]):
                overlap = iou(box, label)
                if index not in matched and overlap >= best_iou:
                    best, best_iou = index, overlap
            if best is None:
                wrong_boxes.append((box_score, box))
            else:
                matched.add(best)

        missed = [label for index, label in enumerate(record["labels"]) if index not in matched]
        true_positive += len(matched)
        false_positive += len(wrong_boxes)
        false_negative += len(missed)

        for index, label in enumerate(record["labels"]):
            bucket = by_size[box_size_bucket(label, record["width"], record["height"])]
            bucket[0] += index in matched
            bucket[1] += 1

        if not record["labels"]:
            negative_images += 1
            negative_images_with_alarm += bool(kept)
        elif len(record["labels"]) == 1:
            single[0] += len(matched)
            single[1] += 1
        else:
            multiple[0] += len(matched)
            multiple[1] += len(record["labels"])

        exact_counts += len(kept) == len(record["labels"])
        absolute_count_error += abs(len(kept) - len(record["labels"]))
        per_image.append({"record": record, "kept": kept, "wrong": wrong_boxes, "missed": missed})

    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)
    return {
        "threshold": threshold,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(2 * precision * recall / max(1e-9, precision + recall), 4),
        "true_positives": true_positive,
        "false_positives": false_positive,
        "missed_potholes": false_negative,
        "images": len(records),
        "exact_count_images": exact_counts,
        "exact_count_rate": round(exact_counts / max(1, len(records)), 4),
        "mean_absolute_count_error": round(absolute_count_error / max(1, len(records)), 3),
        "recall_by_size": {key: {"found": v[0], "total": v[1]} for key, v in by_size.items()},
        "recall_single_pothole_photos": {"found": single[0], "total": single[1]},
        "recall_multi_pothole_photos": {"found": multiple[0], "total": multiple[1]},
        "no_pothole_photos": negative_images,
        "no_pothole_photos_with_false_alarm": negative_images_with_alarm,
        "_per_image": per_image,
    }


def save_mistakes(result: dict, output: Path) -> None:
    from PIL import Image, ImageDraw, ImageOps

    for folder, key in (("false_positives", "wrong"), ("missed", "missed")):
        directory = output / folder
        directory.mkdir(parents=True, exist_ok=True)
        for item in result["_per_image"]:
            if not item[key]:
                continue
            record = item["record"]
            with Image.open(record["path"]) as image:
                canvas = ImageOps.exif_transpose(image).convert("RGB")
            draw = ImageDraw.Draw(canvas)
            line = max(3, canvas.width // 250)
            for label in record["labels"]:
                draw.rectangle(label, outline=(0, 220, 0), width=line)
            for _, box in item["kept"]:
                draw.rectangle(box, outline=(255, 0, 0), width=line)
            canvas.thumbnail((900, 900))
            canvas.save(directory / record["name"], quality=85)


def public(result: dict) -> dict:
    return {key: value for key, value in result.items() if not key.startswith("_")}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--threshold", type=float, default=None, help="Skip tuning and use this value")
    parser.add_argument(
        "--external",
        action="store_true",
        help="The data has only a test split (an independent set): needs --threshold",
    )
    args = parser.parse_args()
    if args.external and args.threshold is None:
        parser.error("--external needs the --threshold tuned on the main validation split")

    from ultralytics import YOLO

    data_root = args.data.resolve().parent
    output = args.output or args.weights.resolve().parent.parent / "evaluation"
    output.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(args.weights))

    # Standard metrics (precision, recall, mAP) from Ultralytics, on each split.
    standard = {}
    for split in ("test",) if args.external else ("val", "test"):
        metrics = model.val(
            data=str(args.data.resolve()), split=split, imgsz=args.imgsz, batch=8,
            device="cpu", plots=False, verbose=False, project=str(output), name=f"ultralytics_{split}",
            exist_ok=True, workers=0,
        )
        standard[split] = {
            "precision": round(float(metrics.box.mp), 4),
            "recall": round(float(metrics.box.mr), 4),
            "mAP50": round(float(metrics.box.map50), 4),
            "mAP50-95": round(float(metrics.box.map), 4),
        }

    val_records: list[dict] = []
    sweep: list[dict] = []
    if not args.external:
        val_records, _ = predict_split(model, data_root, "val", args.imgsz)
        sweep = [score(val_records, threshold) for threshold in THRESHOLDS]
    if args.threshold is None:
        chosen = max(sweep, key=lambda row: (row["f1"], row["recall"]))["threshold"]
    else:
        chosen = args.threshold

    test_records, seconds = predict_split(model, data_root, "test", args.imgsz)
    test_result = score(test_records, chosen)
    save_mistakes(test_result, output)

    report = {
        "weights": str(args.weights),
        "chosen_threshold": chosen,
        "standard_metrics": standard,
        "threshold_sweep_on_validation": [
            {key: row[key] for key in ("threshold", "precision", "recall", "f1", "false_positives", "missed_potholes")}
            for row in sweep
        ],
        "validation_at_threshold": public(score(val_records, chosen)) if val_records else None,
        "test_at_threshold": public(test_result),
        "cpu_seconds_per_photo": {
            "median": round(seconds[len(seconds) // 2], 3),
            "slowest": round(seconds[-1], 3),
        },
    }
    (output / "report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(json.dumps({key: report[key] for key in report if key != "threshold_sweep_on_validation"}, indent=1))
    print(f"\nSaved to {output}")


if __name__ == "__main__":
    main()
