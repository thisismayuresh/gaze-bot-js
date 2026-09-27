// faceTracker.js
// ---------------------------------------------------------------------------
// Wraps Google's MediaPipe "Face Landmarker" task to turn a webcam feed into
// two simple numbers per frame:
//   gazeX      -1 (looking left)  ... 0 (center) ... +1 (looking right)
//   blinkLeft  0 (open) ... 1 (fully closed)   -- subject's left eye
//   blinkRight 0 (open) ... 1 (fully closed)   -- subject's right eye
//
// It relies on two things the model gives us for free:
//   1. Iris landmarks (indices 468-477) once `refineLandmarks`/iris output is
//      enabled -- these let us find where the pupil sits relative to the
//      corners of each eye.
//   2. Face "blendshapes" -- ready-made expression scores, including
//      `eyeBlinkLeft` / `eyeBlinkRight`, which are far more reliable than
//      computing eye-aspect-ratio by hand.
//
// Everything else in the app (js/avatar.js, js/main.js) only ever sees the
// three numbers above, so this file is the only place that needs to know
// anything about MediaPipe.
// ---------------------------------------------------------------------------

import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// Landmark indices from MediaPipe's 478-point face mesh (with iris refinement).
// See: https://storage.googleapis.com/mediapipe-assets/documentation/facemesh_dataset.png
const LEFT_EYE_INNER_CORNER = 362;
const LEFT_EYE_OUTER_CORNER = 263;
const LEFT_IRIS_CENTER = 473;

const RIGHT_EYE_OUTER_CORNER = 33;
const RIGHT_EYE_INNER_CORNER = 133;
const RIGHT_IRIS_CENTER = 468;

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

/**
 * Maps a value from one range to another, clamping the result.
 */
function mapClamped(value, inMin, inMax, outMin, outMax) {
  const t = (value - inMin) / (inMax - inMin);
  const clampedT = Math.min(1, Math.max(0, t));
  return outMin + clampedT * (outMax - outMin);
}

function findBlendshapeScore(categories, name) {
  const match = categories.find((c) => c.categoryName === name);
  return match ? match.score : 0;
}

export class FaceTracker {
  /**
   * @param {Object} options
   * @param {HTMLVideoElement} options.videoEl - element the webcam stream is attached to.
   * @param {(sample: {gazeX: number, blinkLeft: number, blinkRight: number, faceFound: boolean}) => void} options.onSample
   *   Called once per processed frame with the latest reading.
   * @param {(message: string) => void} [options.onStatus] - human-readable progress/errors.
   */
  constructor({ videoEl, onSample, onStatus = () => {} }) {
    this.videoEl = videoEl;
    this.onSample = onSample;
    this.onStatus = onStatus;
    this.landmarker = null;
    this.stream = null;
    this._running = false;
    this._lastVideoTime = -1;

    // Dead zone + sensitivity: tune these two if the bot feels too twitchy
    // or not responsive enough for your camera / distance from screen.
    this.config = {
      // Fraction of the eye width, centered on the middle, treated as "looking center".
      deadZone: 0.06,
      // How far the iris has to travel (as a fraction of eye width) to reach full left/right.
      sensitivity: 0.32,
      // Flip gaze direction. Set to `false` if the bot moves opposite to your eyes.
      mirrorGaze: true,
    };
  }

  async init() {
    this.onStatus("Loading eye-tracking model…");
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
  }

  async start() {
    if (!this.landmarker) {
      await this.init();
    }

    this.onStatus("Requesting camera access…");
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });

    this.videoEl.srcObject = this.stream;
    await new Promise((resolve) => {
      this.videoEl.onloadeddata = resolve;
    });
    await this.videoEl.play();

    this._running = true;
    this.onStatus("Tracking");
    this._loop();
  }

  stop() {
    this._running = false;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.onStatus("Camera is off");
  }

  _loop = () => {
    if (!this._running) return;

    const now = performance.now();
    if (this.videoEl.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = this.videoEl.currentTime;
      const result = this.landmarker.detectForVideo(this.videoEl, now);
      this._handleResult(result);
    }

    requestAnimationFrame(this._loop);
  };

  _handleResult(result) {
    const landmarks = result.faceLandmarks?.[0];
    const blendshapes = result.faceBlendshapes?.[0]?.categories;

    if (!landmarks || !blendshapes) {
      this.onSample({ gazeX: 0, blinkLeft: 0, blinkRight: 0, faceFound: false });
      return;
    }

    const gazeX = this._computeGazeX(landmarks);
    const blinkLeft = findBlendshapeScore(blendshapes, "eyeBlinkLeft");
    const blinkRight = findBlendshapeScore(blendshapes, "eyeBlinkRight");

    this.onSample({ gazeX, blinkLeft, blinkRight, faceFound: true });
  }

  _computeGazeX(landmarks) {
    const { deadZone, sensitivity, mirrorGaze } = this.config;

    const rightRatio = this._irisRatio(
      landmarks[RIGHT_EYE_OUTER_CORNER],
      landmarks[RIGHT_EYE_INNER_CORNER],
      landmarks[RIGHT_IRIS_CENTER]
    );
    const leftRatio = this._irisRatio(
      landmarks[LEFT_EYE_INNER_CORNER],
      landmarks[LEFT_EYE_OUTER_CORNER],
      landmarks[LEFT_IRIS_CENTER]
    );

    // Average both eyes; each ratio is ~0.5 when looking straight ahead.
    const avgRatio = (rightRatio + leftRatio) / 2;
    let gaze = (avgRatio - 0.5) * 2; // -> roughly -1..1

    // Apply dead zone so tiny jitter near center doesn't move the bot.
    if (Math.abs(gaze) < deadZone) {
      gaze = 0;
    }

    gaze = mapClamped(gaze, -sensitivity, sensitivity, -1, 1);

    return mirrorGaze ? -gaze : gaze;
  }

  /**
   * Returns how far the iris sits between cornerA (0.0) and cornerB (1.0).
   */
  _irisRatio(cornerA, cornerB, iris) {
    const span = cornerB.x - cornerA.x;
    if (Math.abs(span) < 1e-6) return 0.5;
    return (iris.x - cornerA.x) / span;
  }
}
