#!/usr/bin/env bash
# Regenerate the on-device inference assets (gitignored because they are large,
# ~38 MB, and derived from files already in the repo).
#
#   1. exports backend/src/models/best.pt  -> frontend/public/pothole-yolo.onnx
#   2. copies onnxruntime-web's WASM runtime -> frontend/public/ort/
#
# Run once after cloning, or whenever best.pt changes:  bash frontend/setup-onnx.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> exporting YOLO -> ONNX"
"$ROOT/backend/.venv/bin/python" -c "
from ultralytics import YOLO
YOLO('$ROOT/backend/src/models/best.pt').export(format='onnx', imgsz=640, opset=12, simplify=True, dynamic=False)
"
cp "$ROOT/backend/src/models/best.onnx" "$ROOT/frontend/public/pothole-yolo.onnx"

echo "==> copying onnxruntime-web WASM runtime"
mkdir -p "$ROOT/frontend/public/ort"
cp "$ROOT/frontend/node_modules/onnxruntime-web/dist/"*.wasm "$ROOT/frontend/public/ort/"
cp "$ROOT/frontend/node_modules/onnxruntime-web/dist/"*.mjs  "$ROOT/frontend/public/ort/"

echo "==> done. On-device detection assets are in frontend/public/"
