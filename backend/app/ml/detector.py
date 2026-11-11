"""Pothole detection with the trained YOLO model.

* The model loads once per process, on first use or at startup via
  :func:`warm_up`. PyTorch and Ultralytics are imported only then, so the rest
  of the API starts and works even if they are not installed.
* One inference runs at a time because the shared predictor is not thread-safe.
  FastAPI runs the pothole endpoints in worker threads, so waiting here does not
  block other API requests.
* Nothing is ever fabricated. If the model cannot run, :class:`DetectionUnavailable`
  or :class:`DetectionFailed` is raised and the caller records that outcome.

The weights in ``app/ml/weights`` are private: no route serves them. They are
Python pickles that run code when loaded, so only install files you trained
yourself (see ``ml_training/README.md``).
"""

from __future__ import annotations

import io
import json
import logging
import os
import threading
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError

from ..config import settings

logger = logging.getLogger(__name__)

#: Used only if neither the environment nor model_info.json sets a threshold.
FALLBACK_THRESHOLD = 0.25
INFERENCE_IMAGE_SIZE = 640
MAX_DETECTIONS = 100
#: Largest photo accepted for decoding (megapixels); stops decompression bombs.
MAX_MEGAPIXELS = 120
#: Stop waiting for a free inference slot after this long.
INFERENCE_WAIT_SECONDS = 30
ANNOTATED_MAX_SIDE = 1600
BOX_COLOR = (229, 57, 53)
LABEL_TEXT_COLOR = (255, 255, 255)


class InvalidPhoto(Exception):
    """The upload has an image signature but cannot be decoded as an image."""


class DetectionUnavailable(Exception):
    """No usable model: the weights or the ML packages are missing."""


class DetectionFailed(Exception):
    """The model is available, but could not process this photo."""


@dataclass(frozen=True)
class Detection:
    number: int
    confidence: float
    x_min: float
    y_min: float
    x_max: float
    y_max: float


@dataclass(frozen=True)
class DetectionResult:
    detections: list[Detection]
    threshold: float
    model_name: str

    @property
    def count(self) -> int:
        return len(self.detections)


def decode_photo(data: bytes) -> Image.Image:
    """Decode an upload into an upright RGB image, or raise :class:`InvalidPhoto`."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            if width * height > MAX_MEGAPIXELS * 1_000_000:
                raise InvalidPhoto("The image dimensions are too large.")
            # Phones store rotation as metadata; boxes must match the upright photo.
            return ImageOps.exif_transpose(image).convert("RGB")
    except InvalidPhoto:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError) as error:
        raise InvalidPhoto("The file could not be read as an image.") from error


class PotholeDetector:
    def __init__(self, weights_path: Path) -> None:
        self.weights_path = weights_path
        self._model = None
        self._threshold = FALLBACK_THRESHOLD
        self._model_name = weights_path.stem
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()

    def _read_model_info(self) -> dict[str, object]:
        """The model's tuned threshold and name, written by promote_model.py."""
        info_path = self.weights_path.with_name("model_info.json")
        try:
            info = json.loads(info_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            logger.warning(
                "%s not found: using the fallback confidence threshold %.2f",
                info_path.name,
                FALLBACK_THRESHOLD,
            )
            return {}
        except (OSError, ValueError):
            logger.exception("Could not read %s", info_path)
            return {}
        return info if isinstance(info, dict) else {}

    def _ensure_loaded(self):
        if self._model is not None:
            return self._model

        with self._load_lock:
            if self._model is not None:
                return self._model

            if not self.weights_path.is_file():
                raise DetectionUnavailable(f"Model weights not found: {self.weights_path}")

            # No analytics or update checks: this runs on residents' photos.
            os.environ.setdefault("YOLO_OFFLINE", "true")
            try:
                import torch
                from ultralytics import YOLO
            except ImportError as error:
                raise DetectionUnavailable(
                    "The machine-learning packages are not installed "
                    "(pip install -r requirements-ml.txt)."
                ) from error

            torch.set_num_threads(max(1, settings.pothole_inference_threads))
            info = self._read_model_info()
            try:
                model = YOLO(str(self.weights_path), task="detect")
            except Exception as error:  # noqa: BLE001 - a corrupt or incompatible file
                logger.exception("Could not load the pothole model")
                raise DetectionUnavailable("The pothole model could not be loaded.") from error

            configured = settings.pothole_confidence_threshold
            threshold = configured if configured is not None else info.get("confidence_threshold")
            self._threshold = (
                float(threshold) if threshold is not None else FALLBACK_THRESHOLD
            )
            self._model_name = str(info.get("name") or self.weights_path.stem)[:100]
            self._model = model
            logger.info(
                "Pothole model %s loaded (confidence threshold %.2f)",
                self._model_name,
                self._threshold,
            )
            return model

    def warm_up(self) -> None:
        """Load the model ahead of the first resident's upload (best effort)."""
        try:
            self._ensure_loaded()
        except DetectionUnavailable as error:
            logger.warning("Pothole detection is unavailable: %s", error)

    def detect(self, image: Image.Image) -> DetectionResult:
        model = self._ensure_loaded()

        if not self._inference_lock.acquire(timeout=INFERENCE_WAIT_SECONDS):
            raise DetectionFailed("The detector is busy.")
        try:
            import numpy as np

            # Ultralytics expects arrays in BGR channel order.
            results = model.predict(
                source=np.asarray(image)[:, :, ::-1],
                imgsz=INFERENCE_IMAGE_SIZE,
                conf=self._threshold,
                max_det=MAX_DETECTIONS,
                device="cpu",
                verbose=False,
            )
            boxes = results[0].boxes
            pairs = zip(boxes.conf.tolist(), boxes.xyxy.tolist())
        except Exception as error:  # noqa: BLE001 - reported as a failed detection
            logger.exception("Pothole detection failed")
            raise DetectionFailed("The model could not process this photo.") from error
        finally:
            self._inference_lock.release()

        ranked = sorted(pairs, key=lambda pair: -pair[0])
        return DetectionResult(
            detections=[
                Detection(
                    number=index,
                    confidence=round(float(confidence), 4),
                    x_min=round(float(box[0]), 2),
                    y_min=round(float(box[1]), 2),
                    x_max=round(float(box[2]), 2),
                    y_max=round(float(box[3]), 2),
                )
                for index, (confidence, box) in enumerate(ranked, start=1)
            ],
            threshold=self._threshold,
            model_name=self._model_name,
        )


def draw_annotated_jpeg(image: Image.Image, detections: list[Detection]) -> bytes:
    """Return a JPEG of the photo with numbered boxes; carries no metadata."""
    scale = min(1.0, ANNOTATED_MAX_SIDE / max(image.size))
    canvas = image.copy()
    if scale < 1.0:
        canvas = canvas.resize(
            (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
        )

    draw = ImageDraw.Draw(canvas)
    line_width = max(2, round(max(canvas.size) / 320))
    font_size = max(14, round(max(canvas.size) / 48))
    try:
        font = ImageFont.load_default(size=font_size)
    except (ImportError, OSError, TypeError):
        font = ImageFont.load_default()

    for detection in detections:
        box = [
            detection.x_min * scale,
            detection.y_min * scale,
            detection.x_max * scale,
            detection.y_max * scale,
        ]
        draw.rectangle(box, outline=BOX_COLOR, width=line_width)

        label = f"#{detection.number} {detection.confidence * 100:.0f}%"
        left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
        text_width, text_height = right - left, bottom - top
        padding = max(3, line_width)
        tag_height = text_height + padding * 2
        tag_width = text_width + padding * 2
        # Above the box where there is room, otherwise just inside its top edge.
        tag_top = box[1] - tag_height if box[1] >= tag_height else box[1]
        tag_left = min(box[0], max(0, canvas.width - tag_width))
        draw.rectangle(
            [tag_left, tag_top, tag_left + tag_width, tag_top + tag_height], fill=BOX_COLOR
        )
        draw.text(
            (tag_left + padding - left, tag_top + padding - top),
            label,
            fill=LABEL_TEXT_COLOR,
            font=font,
        )

    output = io.BytesIO()
    canvas.save(output, format="JPEG", quality=88)
    return output.getvalue()


detector = PotholeDetector(settings.pothole_model_path)
