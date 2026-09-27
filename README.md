# Gaze Bot — webcam eye-tracking avatar

A simple black circular bot (Grok-style) whose two eyes slide left/right to
follow your gaze, and close when you blink — driven live by your webcam.
Runs entirely in the browser, no server-side processing, no account, no data
leaves your machine.

## How it works, in one paragraph

Your webcam feed is fed into Google's open-source **MediaPipe Face Landmarker**
model (runs locally in the browser via WebAssembly/WebGL — nothing is
uploaded anywhere). That model returns, per frame, 478 facial landmark points
(including iris position) plus a set of "blendshape" expression scores. We
use the iris landmarks to work out how far left/right your pupils have
moved inside your eyes, and we use the `eyeBlinkLeft`/`eyeBlinkRight`
blendshape scores to detect blinking. Those three numbers (`gazeX`,
`blinkLeft`, `blinkRight`) drive a small hand-drawn canvas avatar.

## Project structure

```
eye-tracking-avatar/
├── index.html          Page markup: canvas, start button, status, preview
├── css/
│   └── style.css       Dark theme, layout, avatar container styling
├── js/
│   ├── main.js          Entry point: wires UI <-> faceTracker <-> avatar
│   ├── faceTracker.js    Webcam + MediaPipe Face Landmarker -> {gazeX, blinkLeft, blinkRight}
│   └── avatar.js         Canvas renderer: draws the bot, smooths & animates it
├── server.py            Zero-dependency local static server (see below)
└── README.md            This file
```

Each file has one job:

- **`faceTracker.js`** is the only file that knows about MediaPipe. It turns
  a video element into a stream of `{ gazeX, blinkLeft, blinkRight, faceFound }`
  readings via `onSample(...)`.
- **`avatar.js`** knows nothing about webcams. It just exposes
  `setTarget(sample)` and independently renders/animates the bot at 60fps
  with easing, so the animation stays smooth even if camera frames arrive
  irregularly. It also throws in idle blinks when no face is detected, so
  the bot doesn't look frozen.
- **`main.js`** is the thin glue: button clicks, permission errors, status
  text.

## Running it

Browsers only allow camera access on a "secure context" (`https://`, or
`http://localhost`) — opening `index.html` straight from disk (`file://`)
will silently fail. Two easy options:

**Option A — bundled server (no install needed, just Python 3):**

```bash
cd eye-tracking-avatar
python3 server.py
# then open the printed http://localhost:8000
```

**Option B — any other static server you already have**, e.g.:

```bash
npx serve .
# or
php -S localhost:8000
```

Then click **Start camera**, allow the permission prompt, and look around /
blink. The first load takes a few seconds — it's downloading the ~10 MB
face-landmark model from Google's CDN (`js/faceTracker.js` has both URLs at
the top if you'd rather self-host them).

## Tuning it

Open `js/faceTracker.js` and look at the `config` object in the
`FaceTracker` constructor:

| Setting | What it does |
|---|---|
| `deadZone` | How much eye movement near dead-center is ignored, to stop jitter when you're looking "straight ahead". Increase if the bot twitches when it shouldn't. |
| `sensitivity` | How far your iris has to travel before the bot's eyes hit full left/right. Decrease to make the bot more responsive to small eye movements; increase if it maxes out too easily. |
| `mirrorGaze` | If the bot's eyes move opposite to your own, flip this boolean. |

In `js/avatar.js`, the `smoothing` object controls how quickly the rendered
eyes chase the latest reading — lower is smoother/laggier, higher is
snappier/twitchier. Blink smoothing is intentionally higher than gaze
smoothing because real blinks are fast.

The bot's look (circle size, eye size/spacing, colors) is all in
`Avatar._draw()` / `Avatar._drawEye()` in `js/avatar.js` — no build step, just
edit and refresh.

## Troubleshooting

- **"Camera needs HTTPS or localhost"** — you opened the file directly.
  Use `server.py` or another static server (see above).
- **"Camera permission denied"** — check your browser's site settings/address
  bar for a blocked camera icon and re-allow, then click Start again.
- **Bot doesn't react much** — make sure you're reasonably well lit and
  facing the camera; then lower `sensitivity` in `faceTracker.js`.
- **Bot moves the wrong direction** — flip `mirrorGaze` in `faceTracker.js`.

## Credits / dependencies

- [MediaPipe Tasks Vision — Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
  (Apache-2.0), loaded from jsDelivr's CDN at runtime — no npm install
  required for this project as shipped.
