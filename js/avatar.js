// avatar.js
// ---------------------------------------------------------------------------
// Draws a simple, minimal "bot" face on a <canvas>: a solid black circle with
// two eyes that (a) slide left/right to follow `gazeX` and (b) close on
// `blinkLeft` / `blinkRight`. Everything is hand-drawn with the Canvas 2D API,
// no images or fonts needed, so the whole avatar is a handful of shapes.
//
// This module knows nothing about webcams or MediaPipe -- it just exposes
// `setTarget({ gazeX, blinkLeft, blinkRight })` and runs its own smooth
// render loop, so the bot keeps animating fluidly even if new camera
// readings arrive at an uneven rate.
// ---------------------------------------------------------------------------

export class Avatar {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Current (smoothed/animated) state.
    this.state = {
      gazeX: 0,
      blinkLeft: 0,
      blinkRight: 0,
    };

    // Latest values coming from the tracker; state eases toward this.
    this.target = { ...this.state };

    // How quickly the rendered state chases the target each frame (0-1).
    // Gaze eases a bit for a natural feel; blinks snap almost instantly,
    // since real blinks are fast.
    this.smoothing = {
      gazeX: 0.18,
      blinkLeft: 0.55,
      blinkRight: 0.55,
    };

    // Idle blinking: when no face has been seen for a while, the bot blinks
    // occasionally on its own so it still reads as "alive" rather than frozen.
    this.faceFound = false;
    this._idleBlinkTimer = 0;
    this._nextIdleBlinkAt = this._randomIdleInterval();

    this._resizeForDPR();
    this._lastFrameTime = performance.now();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  /** Called by faceTracker.js once per processed camera frame. */
  setTarget({ gazeX, blinkLeft, blinkRight, faceFound }) {
    this.target.gazeX = gazeX;
    this.target.blinkLeft = blinkLeft;
    this.target.blinkRight = blinkRight;
    this.faceFound = faceFound;
    if (faceFound) {
      this._idleBlinkTimer = 0;
      this._nextIdleBlinkAt = this._randomIdleInterval();
    }
  }

  _randomIdleInterval() {
    return 2500 + Math.random() * 3000; // 2.5s - 5.5s between idle blinks
  }

  _resizeForDPR() {
    const dpr = window.devicePixelRatio || 1;
    const cssSize = this.canvas.clientWidth || this.canvas.width;
    this.canvas.width = cssSize * dpr;
    this.canvas.height = cssSize * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = cssSize;
  }

  _tick(now) {
    const dt = now - this._lastFrameTime;
    this._lastFrameTime = now;

    if (!this.faceFound) {
      this._advanceIdleBlink(dt);
    }

    this._ease("gazeX");
    this._ease("blinkLeft");
    this._ease("blinkRight");

    this._draw();
    requestAnimationFrame(this._tick);
  }

  _advanceIdleBlink(dt) {
    this._idleBlinkTimer += dt;
    if (this._idleBlinkTimer >= this._nextIdleBlinkAt) {
      this._idleBlinkTimer = 0;
      this._nextIdleBlinkAt = this._randomIdleInterval();
      this._playIdleBlink();
    }
  }

  async _playIdleBlink() {
    // A quick synthetic blink pulse when nobody's face is being tracked.
    const steps = [0, 0.9, 1, 0.9, 0];
    for (const v of steps) {
      this.target.blinkLeft = v;
      this.target.blinkRight = v;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 45));
    }
    this.target.blinkLeft = 0;
    this.target.blinkRight = 0;
  }

  _ease(key) {
    const s = this.smoothing[key];
    this.state[key] += (this.target[key] - this.state[key]) * s;
  }

  _draw() {
    const { ctx, size } = this;
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.42;

    // --- Body: a plain black circle, Grok-bot style -------------------
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();

    // Subtle rim light so it doesn't look like a flat sticker.
    const rim = ctx.createRadialGradient(
      cx - radius * 0.35,
      cy - radius * 0.45,
      radius * 0.1,
      cx,
      cy,
      radius
    );
    rim.addColorStop(0, "rgba(255,255,255,0.06)");
    rim.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    // --- Eyes -----------------------------------------------------------
    const eyeOffsetX = radius * 0.42;
    const eyeY = cy + radius * 0.04;
    const eyeWidth = radius * 0.46;
    const eyeHeight = radius * 0.58;
    const maxPupilShift = eyeWidth * 0.5 - eyeWidth * 0.22;

    const gaze = this.state.gazeX; // -1..1
    this._drawEye(cx - eyeOffsetX, eyeY, eyeWidth, eyeHeight, gaze * maxPupilShift, this.state.blinkLeft);
    this._drawEye(cx + eyeOffsetX, eyeY, eyeWidth, eyeHeight, gaze * maxPupilShift, this.state.blinkRight);
  }

  /**
   * Draws one eye: a white rounded "socket" that squashes vertically to
   * simulate a closed eyelid, with a black pupil clipped inside it that
   * slides horizontally by `pupilShift` pixels.
   */
  _drawEye(cx, cy, width, height, pupilShift, blink) {
    const { ctx } = this;
    const openness = Math.max(0.06, 1 - blink); // never fully flatten to zero
    const halfW = width / 2;
    const halfH = (height / 2) * openness;

    ctx.save();

    // Eye socket (white) as a rounded ellipse.
    ctx.beginPath();
    ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f5f6f8";
    ctx.fill();

    // Clip so the pupil is naturally masked by the closing eyelid.
    ctx.clip();

    // Pupil.
    const pupilRadius = Math.min(halfW, height / 2) * 0.46;
    ctx.beginPath();
    ctx.arc(cx + pupilShift, cy, pupilRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#111318";
    ctx.fill();

    // Small highlight for a touch of life.
    ctx.beginPath();
    ctx.arc(
      cx + pupilShift - pupilRadius * 0.35,
      cy - pupilRadius * 0.35,
      pupilRadius * 0.28,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();

    ctx.restore();
  }
}
