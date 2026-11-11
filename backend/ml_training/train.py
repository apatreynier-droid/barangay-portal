r"""Train the pothole detector locally on this machine's CPU (or GPU if present).

    cd backend
    .\.venv\Scripts\python.exe ml_training\train.py --name pothole_v2 --epochs 100 --patience 25

On the Ryzen 7 5700U used here, one epoch takes about 160 seconds (100 epochs is
about 4.5 hours). Keep the laptop plugged in with the lid open.

If the laptop restarts or the run is interrupted, continue it with:

    .\.venv\Scripts\python.exe ml_training\train.py --name pothole_v2 --resume

Training starts from the official COCO-pretrained YOLO26n weights rather than
an earlier pothole model. An earlier model may already have seen this dataset's
test photos, and building on it would make the test score look too good.

This script never changes the model the portal uses: see promote_model.py.
Do not run training on the production server.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

# No usage analytics or update checks are sent from training runs.
os.environ.setdefault("YOLO_OFFLINE", "true")

ML_DIR = Path(__file__).resolve().parent
DEFAULT_DATA = ML_DIR / "datasets" / "potholes_v1" / "data.yaml"
RUNS_DIR = ML_DIR / "runs"
PRETRAINED_DIR = ML_DIR / "pretrained"


def keep_awake_during_training() -> None:
    """Stop Windows from sleeping on idle, only while this process runs.

    The request ends automatically with the process. Closing the lid can still
    put the laptop to sleep; if that happens, continue with --resume.
    """
    if os.name == "nt":
        import ctypes

        es_continuous, es_system_required = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(es_continuous | es_system_required)


def main() -> None:
    keep_awake_during_training()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="pothole_v2")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--model", default="yolo26n.pt", help="Starting weights")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--patience", type=int, default=25, help="Stop early after N epochs without improvement")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    from ultralytics import YOLO

    if args.resume:
        checkpoint = RUNS_DIR / args.name / "weights" / "last.pt"
        if not checkpoint.exists():
            raise SystemExit(f"Nothing to resume: {checkpoint} does not exist.")
        YOLO(str(checkpoint)).train(resume=True)
        return

    # The official weights download to the working directory on first use.
    PRETRAINED_DIR.mkdir(parents=True, exist_ok=True)
    os.chdir(PRETRAINED_DIR)

    YOLO(args.model).train(
        data=str(args.data.resolve()),
        epochs=args.epochs,
        patience=args.patience,
        imgsz=args.imgsz,
        batch=args.batch,
        workers=args.workers,
        device=args.device,
        seed=args.seed,
        deterministic=True,
        project=str(RUNS_DIR),
        name=args.name,
        exist_ok=False,
        pretrained=True,
        cache="ram",
        plots=True,
        # Augmentation suited to phone photos of roads: lighting and scale vary
        # a lot, cameras tilt a little, and a road is never upside down.
        hsv_h=0.015,
        hsv_s=0.5,
        hsv_v=0.4,
        degrees=5.0,
        translate=0.1,
        scale=0.5,
        perspective=0.0005,
        fliplr=0.5,
        flipud=0.0,
        mosaic=1.0,
        close_mosaic=10,
    )


if __name__ == "__main__":
    main()
