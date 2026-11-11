# Pothole detection model

How the model behind the Resident Pothole Detection page is built, measured,
installed and replaced. Training runs on a development machine only, never on
the production server. No cloud service is needed.

| Step | Script | Changes the portal? |
|---|---|---|
| Build the dataset | `prepare_dataset.py`, `fetch_negatives.py` | No |
| Train | `train.py` | No |
| Measure and tune | `evaluate.py`, `prepare_external_test.py` | No |
| Install | `promote_model.py` | Yes, after a backend restart |

## Setup

From `backend/`, using the existing virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements-ml.txt
```

Allow about 2 GB of disk space for the packages and 1 GB for the data.

## Retrain or replace the model

```powershell
# 1. Data. Download the archive from https://data.mendeley.com/datasets/tp95cdvgm8/1
.\.venv\Scripts\python.exe ml_training\fetch_negatives.py
.\.venv\Scripts\python.exe ml_training\prepare_dataset.py --zip "$env:USERPROFILE\Downloads\Potholes.zip"
.\.venv\Scripts\python.exe ml_training\prepare_external_test.py

# 2. Train under a NEW name. Keep the laptop plugged in with the lid open.
.\.venv\Scripts\python.exe ml_training\train.py --name pothole_v3
# If it gets interrupted:
.\.venv\Scripts\python.exe ml_training\train.py --name pothole_v3 --resume

# 3. Measure. This also tunes the confidence threshold on the validation split.
.\.venv\Scripts\python.exe ml_training\evaluate.py --weights ml_training\runs\pothole_v3\weights\best.pt

# 4. Look at the photos in runs\pothole_v3\evaluation\false_positives and \missed.

# 5. Install, then restart the backend.
.\.venv\Scripts\python.exe ml_training\promote_model.py --run pothole_v3
```

On an AMD Ryzen 7 5700U with no GPU, one epoch takes about 160 seconds, so 100
epochs take up to 4.5 hours. Detecting potholes in one photo takes about 40 ms.

`promote_model.py` keeps the previous model in `app/ml/weights/previous/`. To roll
back, copy a backup's `.pt` over `app/ml/weights/best.pt` and its `.json` over
`model_info.json`, then restart. Existing reports keep the results they already
have; only new reports use the new model.

**Only install weights you trained or fully trust.** A `.pt` file can run code
when it is loaded. Do not install one downloaded from the internet.

## Improving accuracy

The best improvement available is **photos of your own barangay's roads**, taken
with residents' phones. Admin-verified and rejected reports are a good source:

1. Export photos from `uploads/pothole_reports/`, with permission from the
   barangay and with faces and plate numbers removed or the photos excluded.
2. Draw boxes in a labelling tool such as CVAT or Label Studio, and export in YOLO
   format. Include undamaged roads, shadows, manholes and patched areas.
3. Add them to the dataset, keeping some for the test split only, and retrain.

## How to read the results

- **Precision**: of the boxes drawn, how many are real potholes.
- **Recall**: of the real potholes, how many were found.
- **mAP50**: overall detection quality when a box only has to roughly match.
- **mAP50-95**: the same, with increasingly strict box placement.
- **Exact count rate**: photos where the count equals the labelled count.

Scores only describe the photos they were measured on. Compare models on the same
test set, and be careful with any model that may have seen those photos.

## Data sources

| Dataset | Used for | Licence |
|---|---|---|
| [Annotated Water-Filled and Dry Potholes](https://data.mendeley.com/datasets/tp95cdvgm8/1) | Training, validation, test | CC BY 4.0: credit the authors |
| [Arpitraj01/Pothole_classification](https://huggingface.co/datasets/Arpitraj01/Pothole_classification), "none" class | No-pothole examples | MIT |
| [rupesh002/pothole-detection-dataset](https://huggingface.co/datasets/rupesh002/pothole-detection-dataset) | Independent test only | Listed as MIT, but some photos carry stock-photo watermarks: do not redistribute or train on them |

Facts about this data that affect training:

- Use the dataset's **XML annotations, not its TXT files**. In about 144 of the 713
  images the TXT boxes are badly wrong (one surrounds parked cars).
  `prepare_dataset.py` uses the XML and reports the differences.
- Pothole datasets online share many photos: 664 of 715 photos in the independent
  set were near-copies of the training data and were removed. Always check for
  overlap before trusting a test score.

## Licensing

Ultralytics YOLO is licensed under **AGPL-3.0**. If the portal is offered over a
network, AGPL can require making its source code available to users. Check
[Ultralytics licensing](https://www.ultralytics.com/license) before a public
deployment; there is a paid Enterprise licence as an alternative.

## Limitations

- The model has not been tested on labelled photos from the barangay itself.
- GPS comes from the device or the photo's metadata, never from the image content.
- The count covers potholes visible in one photo. Only an administrator can
  confirm how many unique road defects exist.
- The model sees a pothole as a box. It does not measure size or depth.
