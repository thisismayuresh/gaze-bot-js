// main.js
// ---------------------------------------------------------------------------
// Glue code: wires the "Start camera" button, status text and preview toggle
// in index.html to FaceTracker (js/faceTracker.js) and Avatar (js/avatar.js).
// Look here first if you want to see the overall flow; the interesting logic
// lives in the two modules it imports.
// ---------------------------------------------------------------------------

import { FaceTracker } from "./faceTracker.js";
import { Avatar } from "./avatar.js";

const canvas = document.getElementById("avatarCanvas");
const startBtn = document.getElementById("startBtn");
const statusText = document.getElementById("statusText");
const hintText = document.getElementById("hintText");
const inputVideo = document.getElementById("inputVideo");
const previewVideo = document.getElementById("previewVideo");
const previewToggle = document.getElementById("previewToggle");

const avatar = new Avatar(canvas);

const tracker = new FaceTracker({
  videoEl: inputVideo,
  onSample: (sample) => avatar.setTarget(sample),
  onStatus: (message) => setStatus(message, "info"),
});

function setStatus(message, state = "info") {
  statusText.textContent = message;
  statusText.dataset.state = state;
}

function setHint(message) {
  hintText.textContent = message;
}

previewToggle.addEventListener("change", () => {
  const show = previewToggle.checked;
  previewVideo.hidden = !show;
  previewVideo.srcObject = show ? inputVideo.srcObject : null;
});

startBtn.addEventListener("click", async () => {
  // getUserMedia requires a secure context (https, or http://localhost).
  if (!window.isSecureContext) {
    setStatus("Camera needs HTTPS or localhost", "error");
    setHint(
      "Open this page via http://localhost:PORT (see README.md) instead of a plain file:// path."
    );
    return;
  }

  startBtn.disabled = true;
  setHint("");

  try {
    setStatus("Starting…", "info");
    await tracker.start();
    setStatus("Tracking — look around & blink", "ready");
    startBtn.textContent = "Restart";
    if (previewToggle.checked) {
      previewVideo.srcObject = inputVideo.srcObject;
    }
  } catch (err) {
    console.error(err);
    if (err.name === "NotAllowedError") {
      setStatus("Camera permission denied", "error");
      setHint("Allow camera access in your browser's address-bar permissions and try again.");
    } else if (err.name === "NotFoundError") {
      setStatus("No camera found", "error");
      setHint("Connect a webcam and reload the page.");
    } else {
      setStatus("Something went wrong", "error");
      setHint(err.message || String(err));
    }
  } finally {
    startBtn.disabled = false;
  }
});
