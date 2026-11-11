r"""Install an evaluated model as the one the portal uses.

    cd backend
    .\.venv\Scripts\python.exe ml_training\promote_model.py --run pothole_v2

Reads ``runs/<run>/evaluation/report.json`` (run evaluate.py first), keeps a
timestamped backup of the current model, then copies the new weights to
``app/ml/weights/best.pt`` and writes ``model_info.json`` with the tuned
threshold. Restart the backend afterwards. To go back, copy a backup over best.pt
and its matching ``.json`` over model_info.json, then restart.

Reports that already exist keep the results they were given at the time.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
WEIGHTS_DIR = ML_DIR.parent / "app" / "ml" / "weights"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, help="Folder name under ml_training/runs")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen")
    args = parser.parse_args()

    run_dir = ML_DIR / "runs" / args.run
    weights = run_dir / "weights" / "best.pt"
    report_path = run_dir / "evaluation" / "report.json"
    if not weights.is_file():
        raise SystemExit(f"Weights not found: {weights}")
    if not report_path.is_file():
        raise SystemExit(f"Not evaluated yet (no {report_path}). Run evaluate.py first.")

    report = json.loads(report_path.read_text(encoding="utf-8"))
    test = report["test_at_threshold"]
    info = {
        "name": args.run,
        "confidence_threshold": report["chosen_threshold"],
        "trained_at": datetime.fromtimestamp(weights.stat().st_mtime).isoformat(timespec="seconds"),
        "test_metrics": report["standard_metrics"]["test"],
        "test_at_threshold": {
            key: test[key]
            for key in ("precision", "recall", "exact_count_rate", "images", "no_pothole_photos_with_false_alarm")
        },
    }
    print(json.dumps(info, indent=1))
    if args.dry_run:
        print("Dry run: nothing was changed.")
        return

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    current = WEIGHTS_DIR / "best.pt"
    current_info = WEIGHTS_DIR / "model_info.json"
    if current.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_dir = WEIGHTS_DIR / "previous"
        backup_dir.mkdir(exist_ok=True)
        shutil.copy2(current, backup_dir / f"best-{stamp}.pt")
        if current_info.exists():
            shutil.copy2(current_info, backup_dir / f"best-{stamp}.json")
        print(f"Previous model kept in {backup_dir}")

    # Written beside the target first, so a failed copy cannot leave half a model.
    temporary = WEIGHTS_DIR / "best.pt.incoming"
    shutil.copy2(weights, temporary)
    temporary.replace(current)
    current_info.write_text(json.dumps(info, indent=1), encoding="utf-8")
    print(f"Installed {args.run} (threshold {info['confidence_threshold']}). Restart the backend.")


if __name__ == "__main__":
    main()
