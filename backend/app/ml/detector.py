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
#: Boxes overlapping more than this are merged (Ultralytics default).
NMS_IOU = 0.7
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
        self._backend = "ultralytics"
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

    def _apply_model_info(self) -> None:
        info = self._read_model_info()
        configured = settings.pothole_confidence_threshold
        threshold = configured if configured is not None else info.get("confidence_threshold")
        self._threshold = float(threshold) if threshold is not None else FALLBACK_THRESHOLD
        self._model_name = str(info.get("name") or self.weights_path.stem)[:100]

    def _load_onnx(self, onnx_path: Path) -> bool:
        """Load the exported model with ONNX Runtime (small; no PyTorch needed).

        Returns False when onnxruntime is not installed, so the caller can fall
        back to the PyTorch weights.
        """
        try:
            import onnxruntime as ort
        except ImportError:
            return False

        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, settings.pothole_inference_threads)
        # Smaller memory footprint: matters on 512 MB hosts.
        options.enable_cpu_mem_arena = False
        options.enable_mem_pattern = False
        try:
            session = ort.InferenceSession(
                str(onnx_path), sess_options=options, providers=["CPUExecutionProvider"]
            )
        except Exception as error:  # noqa: BLE001 - corrupt or incompatible file
            logger.exception("Could not load the ONNX pothole model")
            raise DetectionUnavailable("The pothole model could not be loaded.") from error

        self._apply_model_info()
        self._backend = "onnx"
        self._model = session
        logger.info(
            "Pothole model %s loaded with ONNX Runtime (confidence threshold %.2f)",
            self._model_name,
            self._threshold,
        )
        return True

    def _detect_onnx(self, image: Image.Image) -> list[tuple[float, list[float]]]:
        """Letterbox, run the network and decode boxes (same as Ultralytics)."""
        import numpy as np

        size = INFERENCE_IMAGE_SIZE
        width, height = image.size
        ratio = min(size / height, size / width)
        new_width, new_height = round(width * ratio), round(height * ratio)
        # OpenCV's INTER_LINEAR, exactly as Ultralytics letterboxes (Pillow's
        # resize smooths while shrinking, which shifts the confidences).
        import cv2

        resized = cv2.resize(
            np.asarray(image), (new_width, new_height), interpolation=cv2.INTER_LINEAR
        )
        # Like Ultralytics for PyTorch models: pad only to a multiple of 32
        # (not to a full square), so the confidences match the .pt weights.
        pad_w, pad_h = ((size - new_width) % 32) / 2, ((size - new_height) % 32) / 2
        top, bottom = round(pad_h - 0.1), round(pad_h + 0.1)
        left, right = round(pad_w - 0.1), round(pad_w + 0.1)

        canvas = np.full(
            (new_height + top + bottom, new_width + left + right, 3), 114, dtype=np.uint8
        )
        canvas[top : top + new_height, left : left + new_width] = resized
        tensor = canvas.transpose(2, 0, 1)[None].astype(np.float32) / 255.0

        session = self._model
        output = session.run(None, {session.get_inputs()[0].name: tensor})[0]
        rows = output[0]
        if rows.ndim == 2 and rows.shape[1] == 6:
            # End-to-end export: (detections, [x1, y1, x2, y2, score, class]);
            # the network already removed duplicates, so no NMS is needed.
            keep = rows[:, 4] > self._threshold
            rows = rows[keep]
            scores = rows[:, 4]
            boxes = rows[:, :4].copy()
            apply_nms = False
        else:
            predictions = rows.T  # (anchors, 4 + classes) from a raw export
            scores = predictions[:, 4:].max(axis=1)
            keep = scores > self._threshold
            predictions, scores = predictions[keep], scores[keep]
            cx, cy, w, h = (predictions[:, i] for i in range(4))
            boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
            apply_nms = True
        if len(scores) == 0:
            return []

        boxes[:, [0, 2]] -= left
        boxes[:, [1, 3]] -= top
        boxes /= ratio
        boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, width)
        boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, height)

        order = scores.argsort()[::-1]
        if not apply_nms:
            return [
                (float(scores[i]), boxes[i].tolist()) for i in order[:MAX_DETECTIONS]
            ]

        selected: list[int] = []
        areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
        while len(order) and len(selected) < MAX_DETECTIONS:
            best = order[0]
            selected.append(int(best))
            rest = order[1:]
            if not len(rest):
                break
            inter_w = np.minimum(boxes[best, 2], boxes[rest, 2]) - np.maximum(boxes[best, 0], boxes[rest, 0])
            inter_h = np.minimum(boxes[best, 3], boxes[rest, 3]) - np.maximum(boxes[best, 1], boxes[rest, 1])
            inter = inter_w.clip(0) * inter_h.clip(0)
            iou = inter / (areas[best] + areas[rest] - inter + 1e-9)
            order = rest[iou <= NMS_IOU]
        return [(float(scores[i]), boxes[i].tolist()) for i in selected]

    def _ensure_loaded(self):
        if self._model is not None:
            return self._model

        with self._load_lock:
            if self._model is not None:
                return self._model

            onnx_path = self.weights_path.with_suffix(".onnx")
            if onnx_path.is_file() and self._load_onnx(onnx_path):
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
            if self._backend == "onnx":
                pairs = self._detect_onnx(image)
            else:
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
                pairs = list(zip(boxes.conf.tolist(), boxes.xyxy.tolist()))
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
