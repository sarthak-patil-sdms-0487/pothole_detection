/**
 * In-browser pothole detection with ONNX Runtime Web.
 *
 * Runs the same YOLO11 model as the server (exported to ONNX) directly in the
 * browser, so the live Drive Mode overlay needs no network round-trip. The
 * pre- and post-processing here mirror the server's Ultralytics pipeline
 * exactly (letterbox to 640, RGB /255, output [1,5,8400] = cx,cy,w,h,conf,
 * then decode + NMS) so results match what the server would have returned.
 *
 * The server path is unchanged: when this finds potholes, Drive Mode still
 * uploads that frame for storage and reporting.
 */
import * as ort from 'onnxruntime-web';

export interface Detection {
  x1: number; y1: number; x2: number; y2: number; // pixels in the ORIGINAL frame
  confidence: number;
}

const INPUT = 640;

let session: ort.InferenceSession | null = null;
let loading: Promise<ort.InferenceSession> | null = null;

/** Load the model once. Safe to call repeatedly; concurrent calls share one load. */
export async function loadDetector(modelUrl = '/pothole-yolo.onnx'): Promise<ort.InferenceSession> {
  if (session) return session;
  if (loading) return loading;
  // WASM assets ship with the package; point the runtime at the copies Vite serves.
  ort.env.wasm.wasmPaths = '/ort/';
  ort.env.wasm.numThreads = 1; // most reliable across browsers; avoids COOP/COEP needs
  loading = ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  }).then((s) => {
    session = s;
    return s;
  });
  return loading;
}

export function isReady(): boolean {
  return session !== null;
}

/**
 * Letterbox a frame (from a <video> or <canvas>) into a 640x640 RGB float
 * tensor, returning the tensor plus the scale/pad needed to map boxes back.
 */
function preprocess(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
): { tensor: ort.Tensor; scale: number; padX: number; padY: number } {
  const scale = Math.min(INPUT / srcW, INPUT / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((INPUT - newW) / 2);
  const padY = Math.floor((INPUT - newH) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = INPUT;
  canvas.height = INPUT;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgb(114,114,114)'; // same pad colour as Ultralytics
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(source, padX, padY, newW, newH);

  const { data } = ctx.getImageData(0, 0, INPUT, INPUT); // RGBA
  const chw = new Float32Array(3 * INPUT * INPUT);
  const area = INPUT * INPUT;
  for (let i = 0; i < area; i++) {
    chw[i] = data[i * 4] / 255;               // R
    chw[i + area] = data[i * 4 + 1] / 255;     // G
    chw[i + 2 * area] = data[i * 4 + 2] / 255; // B
  }
  const tensor = new ort.Tensor('float32', chw, [1, 3, INPUT, INPUT]);
  return { tensor, scale, padX, padY };
}

/** Decode [1,5,8400], undo letterbox to original-frame pixels, apply NMS. */
function postprocess(
  output: ort.Tensor,
  scale: number,
  padX: number,
  padY: number,
  confThreshold: number,
  iouThreshold: number,
): Detection[] {
  const data = output.data as Float32Array;
  const numBoxes = output.dims[2]; // 8400
  const boxes: Detection[] = [];

  // Layout is channel-major: [cx(8400), cy(8400), w(8400), h(8400), conf(8400)]
  for (let i = 0; i < numBoxes; i++) {
    const conf = data[4 * numBoxes + i];
    if (conf < confThreshold) continue;
    const cx = data[i];
    const cy = data[numBoxes + i];
    const w = data[2 * numBoxes + i];
    const h = data[3 * numBoxes + i];
    // 640-space xywh -> xyxy, remove pad, undo scale -> original pixels
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;
    boxes.push({ x1, y1, x2, y2, confidence: conf });
  }
  return nms(boxes, iouThreshold);
}

function iou(a: Detection, b: Detection): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

function nms(boxes: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];
  for (const box of sorted) {
    if (kept.every((k) => iou(box, k) < iouThreshold)) kept.push(box);
  }
  return kept;
}

/**
 * Detect potholes in a frame. `source` is anything drawImage accepts
 * (a <video> element or a canvas); srcW/srcH are its natural pixel size.
 */
export async function detect(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  confThreshold = 0.4,
  iouThreshold = 0.45,
): Promise<Detection[]> {
  const s = await loadDetector();
  const { tensor, scale, padX, padY } = preprocess(source, srcW, srcH);
  const outputs = await s.run({ [s.inputNames[0]]: tensor });
  const out = outputs[s.outputNames[0]];
  return postprocess(out, scale, padX, padY, confThreshold, iouThreshold);
}
