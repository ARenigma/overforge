/**
 * face-detect-worker.js — Web Worker for in-browser face detection.
 *
 * Loads MediaPipe FaceLandmarker via @mediapipe/tasks-vision from the
 * official jsDelivr CDN. Accepts ImageBitmap or ImageData frames posted
 * from the main thread, runs face landmark detection, and replies with:
 *   { faceCount: number, lookingAway: boolean }
 *
 * PRIVACY: No frame data ever leaves this worker. Only the numeric result
 * { faceCount, lookingAway } is posted back; the bitmap is closed immediately.
 *
 * TODO (follow-up): self-host the WASM bundle + face_landmarker.task model
 * file so the worker works offline and eliminates the CDN dependency.
 * Ref: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
 */

// ── Constants ──────────────────────────────────────────────────────────────────

// Head-pose yaw/pitch threshold in degrees. Beyond this the candidate is
// considered to be looking away. Tuned conservatively to avoid false-positives
// from natural glances at notes vs deliberate screen-switch behaviour.
const LOOK_AWAY_DEG = 20;

// CDN base for MediaPipe WASM + model assets.
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// ── State ──────────────────────────────────────────────────────────────────────

/** @type {import('@mediapipe/tasks-vision').FaceLandmarker | null} */
let landmarker = null;
let initFailed = false;
let initStarted = false;

// ── Initialisation ─────────────────────────────────────────────────────────────

async function init() {
  if (initStarted) return;
  initStarted = true;
  try {
    // Dynamic import from CDN — tasks-vision ships a self-contained ESM bundle.
    const { FaceLandmarker, FilesetResolver } = await import(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs`
    );

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'CPU', // voice worker runs on CPU-only host; GPU is not available
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true, // used for head-pose yaw/pitch
      runningMode: 'IMAGE',
      numFaces: 2, // detect up to 2 faces (multi-person alert)
    });

    self.postMessage({ type: 'ready' });
  } catch (err) {
    initFailed = true;
    self.postMessage({ type: 'init_failed', error: String(err) });
  }
}

// ── Head-pose helper ───────────────────────────────────────────────────────────

/**
 * Derives yaw and pitch (degrees) from a 4×4 facial transformation matrix
 * returned by MediaPipe FaceLandmarker.
 *
 * The matrix is column-major (WebGL convention). We extract the rotation
 * sub-matrix and compute Euler angles via atan2.
 *
 * @param {number[]} m - flat array of 16 floats (column-major 4×4)
 * @returns {{ yaw: number, pitch: number }}
 */
function headPoseFromMatrix(m) {
  // Column-major layout: m[col*4 + row]
  // R = [ m[0] m[4] m[8]  ]
  //     [ m[1] m[5] m[9]  ]
  //     [ m[2] m[6] m[10] ]
  const r00 = m[0];
  const r10 = m[1];
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];

  // pitch = atan2(-r20, sqrt(r21²+r22²))  — rotation around X
  // yaw   = atan2(r10,  r00)               — rotation around Y
  const pitch = (Math.atan2(-r20, Math.sqrt(r21 * r21 + r22 * r22)) * 180) / Math.PI;
  const yaw = (Math.atan2(r10, r00) * 180) / Math.PI;
  return { yaw, pitch };
}

/**
 * Fallback head-pose estimate using eye and nose-tip landmarks when the
 * transformation matrix is unavailable.
 *
 * Landmark indices (MediaPipe 478-point model):
 *   33  = left eye outer corner
 *   263 = right eye outer corner
 *   1   = nose tip
 *   152 = chin
 *
 * @param {Array<{x:number,y:number,z:number}>} landmarks
 * @returns {{ yaw: number, pitch: number }}
 */
function headPoseFromLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 263) return { yaw: 0, pitch: 0 };

  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const chin = landmarks[152];

  // Normalised face width
  const faceWidth = Math.abs(rightEye.x - leftEye.x) || 0.001;
  const faceMidX = (leftEye.x + rightEye.x) / 2;

  // Yaw: nose horizontal offset from eye midpoint, normalised by face width.
  // Full face-width offset ≈ 90°.
  const yawRatio = (nose.x - faceMidX) / faceWidth;
  const yaw = yawRatio * 90;

  // Pitch: nose vertical position relative to the eye-chin range.
  const faceHeight = Math.abs(chin.y - (leftEye.y + rightEye.y) / 2) || 0.001;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const pitchRatio = (nose.y - eyeMidY) / faceHeight - 0.3; // 0.3 = neutral offset
  const pitch = pitchRatio * 90;

  return { yaw, pitch };
}

// ── Message handler ────────────────────────────────────────────────────────────

/**
 * Expected incoming message shape:
 *   { frame: ImageBitmap | ImageData }
 *
 * Reply shape:
 *   { faceCount: number, lookingAway: boolean }
 */
self.onmessage = async function (event) {
  // Kick off initialisation on first message if not already started.
  if (!initStarted) {
    void init();
  }

  const { frame } = event.data;
  if (!frame) return;

  // Clean up the transferred bitmap even on early-exit paths.
  const releaseBitmap = () => {
    if (frame instanceof ImageBitmap) frame.close();
  };

  // If the model hasn't loaded yet (or failed), return a neutral result so
  // the caller sees "no signals" rather than an error.
  if (!landmarker) {
    releaseBitmap();
    self.postMessage({ faceCount: 0, lookingAway: false });
    return;
  }

  if (initFailed) {
    releaseBitmap();
    self.postMessage({ faceCount: 0, lookingAway: false });
    return;
  }

  try {
    const result = landmarker.detect(frame);
    releaseBitmap();

    const faceCount = result.faceLandmarks?.length ?? 0;

    let lookingAway = false;

    if (faceCount >= 1) {
      const matrices = result.facialTransformationMatrixes;
      if (matrices && matrices.length > 0 && matrices[0]?.data?.length === 16) {
        const { yaw, pitch } = headPoseFromMatrix(Array.from(matrices[0].data));
        lookingAway = Math.abs(yaw) > LOOK_AWAY_DEG || Math.abs(pitch) > LOOK_AWAY_DEG;
      } else {
        // Fallback: estimate from landmarks
        const { yaw, pitch } = headPoseFromLandmarks(result.faceLandmarks[0]);
        lookingAway = Math.abs(yaw) > LOOK_AWAY_DEG || Math.abs(pitch) > LOOK_AWAY_DEG;
      }
    }

    self.postMessage({ faceCount, lookingAway });
  } catch {
    releaseBitmap();
    // Swallow detection errors — never crash the worker.
    self.postMessage({ faceCount: 0, lookingAway: false });
  }
};

// Start loading the model immediately so the first frame isn't delayed.
void init();
