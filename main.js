/* Thea · Translations */
(function () {
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* footer counter: orchids stamped today, per local date */
  var tally = document.getElementById("tally");
  var d0 = new Date();
  d0.setMinutes(d0.getMinutes() - d0.getTimezoneOffset());
  var TKEY = "orchids-" + d0.toISOString().slice(0, 10);
  var picked = 0;
  try { picked = parseInt(localStorage.getItem(TKEY), 10) || 0; } catch (e) { picked = 0; }
  if (tally) tally.textContent = picked;
  var count = function () {
    picked++;
    if (tally) tally.textContent = picked;
    try { localStorage.setItem(TKEY, picked); } catch (e) {}
  };

  /* ================= the hero: pixel glass + orchid stamps ================= */
  var paper = document.getElementById("paper");
  if (paper) (function () {
    var T0 = performance.now();                      /* the hero's own zero */

    /* the two blank pills: empty on purpose — clicking one goes to the work, and
       leaves one orchid just under the plate so the click is felt on the paper too */
    var pills = paper.querySelectorAll(".pill");
    var PILL_NEAR = 90;
    for (var pi = 0; pi < pills.length; pi++) {
      pills[pi].setAttribute("data-go", "#index");
      pills[pi].addEventListener("click", function (e) {
        e.stopPropagation();
        var r = paper.getBoundingClientRect(), pb = this.getBoundingClientRect();
        var pl = plate ? plate.getBoundingClientRect() : pb;
        var half = BW * ZOOM() / 2;
        var y = pl.top - r.top - 14 - half;                /* just clear of the plate */
        if (y - half < 8) y = pl.bottom - r.top + 14 + half;
        stamp(pb.left + pb.width / 2 - r.left, y, true);
        var t = document.querySelector("#index");
        if (t) t.scrollIntoView({ block: "start" });
      });
    }
    /* the pointer coming within 90 px lights a 4 px dot at the pill's centre */
    var pillNear = function (lx, ly) {
      var r = paper.getBoundingClientRect();
      for (var i = 0; i < pills.length; i++) {
        var b = pills[i].getBoundingClientRect();
        var dx = lx - (b.left + b.width / 2 - r.left), dy = ly - (b.top + b.height / 2 - r.top);
        pills[i].classList.toggle("is-near", dx * dx + dy * dy <= PILL_NEAR * PILL_NEAR);
      }
    };
    var pillsOff = function () {
      for (var i = 0; i < pills.length; i++) pills[i].classList.remove("is-near");
    };

    /* the hint names the gesture this pointer actually has: a mouse clicks, a
       finger taps (same test the about page uses for its own hint) */
    var hintEl = document.getElementById("paperHint");
    if (hintEl) {
      var finePtr = true;
      try { finePtr = matchMedia("(hover: hover) and (pointer: fine)").matches; } catch (e) { finePtr = true; }
      hintEl.textContent = (finePtr ? "Click" : "Tap") + " — an orchid";
    }

    /* coarse pointer: no hover, or the last pointer that touched the hero was a finger */
    if (matchMedia("(hover: none)").matches || matchMedia("(pointer: coarse)").matches) {
      document.documentElement.classList.add("is-coarse");
    }
    paper.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" || e.pointerType === "pen") {
        document.documentElement.classList.add("is-coarse");
      }
    }, true);

    /* ---------- colours, resolved once through a 1×1 canvas ---------- */
    var probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    var pctx = probe.getContext("2d", { willReadFrequently: true });
    var rgbOf = function (css, fallback) {
      if (!pctx || !css) return fallback;
      try {
        pctx.clearRect(0, 0, 1, 1);
        pctx.fillStyle = "#000";
        pctx.fillStyle = css;
        pctx.fillRect(0, 0, 1, 1);
        var d = pctx.getImageData(0, 0, 1, 1).data;
        if (!d[3]) return fallback;
        return [d[0], d[1], d[2]];
      } catch (e) { return fallback; }
    };
    var cssVar = function (n) {
      try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
      catch (e) { return ""; }
    };
    var INK = rgbOf(cssVar("--color-ink"), [36, 31, 28]);
    var TINT = rgbOf(cssVar("--hero-tint") || "oklch(60% 0.03 240)", [118, 137, 158]);
    var mix = function (a, b, k) {
      return [Math.round(a[0] + (b[0] - a[0]) * k),
              Math.round(a[1] + (b[1] - a[1]) * k),
              Math.round(a[2] + (b[2] - a[2]) * k)];
    };
    var TILE = mix(INK, TINT, 0.42);                 /* ink, cooled */
    var TILE_RGB = TILE[0] + "," + TILE[1] + "," + TILE[2];
    var INK_RGB = INK[0] + "," + INK[1] + "," + INK[2];

    var DP = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));

    /* ---------- layer 1 · the pixel glass field ---------- */
    var CELL = 13, GUT = 1, PITCH = CELL + GUT;      /* 14 px cells, 1 px gutter */
    var A_MIN = 0.03, A_SPAN = 0.13;                 /* alpha 0.03 – 0.16 */
    var BUCKETS = 14, AMAX = 0.35;                   /* 14 steps; the peak tile is .3375 */
    var RIP = 220, RIP2 = RIP * RIP, RIP_A = 0.253;  /* the ripple: wider, and 2.2× the lift */
    var TRAIL_MS = 600, TR_STEP2 = 64;               /* the wake: 600 ms, a point every 8 px
       — at a walking pointer (~200 px/s) that is the last 120 px of travel; at a sweep
       it stretches, which is the whole point of a wake */
    var TR_R = 110, TR_R2 = TR_R * TR_R, TR_MAX = 16;
    var trail = [];
    var tlX = new Float32Array(TR_MAX), tlY = new Float32Array(TR_MAX), tlW = new Float32Array(TR_MAX), tlN = 0;

    var fld = document.getElementById("paperField");
    var fctx = fld && fld.getContext ? fld.getContext("2d", { willReadFrequently: true }) : null;
    var FW = 0, FH = 0, COLS = 0, ROWS = 0, NC = 0;
    var CX = null, CY = null, BEV = null;            /* cell x, cell y, bevel flag */
    var BIDX = null, BLEN = null;                    /* per-bucket cell lists */
    var clock = 0, lastMs = 0;

    var buildGrid = function () {
      COLS = Math.ceil(FW / PITCH) + 1;
      ROWS = Math.ceil(FH / PITCH) + 1;
      NC = COLS * ROWS;
      CX = new Float32Array(NC);
      CY = new Float32Array(NC);
      BEV = new Uint8Array(NC);
      BIDX = [];
      for (var b = 0; b < BUCKETS; b++) BIDX.push(new Int32Array(NC));
      BLEN = new Int32Array(BUCKETS);
      var s = 1234567;
      for (var i = 0; i < NC; i++) {
        CX[i] = (i % COLS) * PITCH;
        CY[i] = ((i / COLS) | 0) * PITCH;
        s = (s * 1103515245 + 12345) & 0x7fffffff;   /* one deterministic bevel in ~60 */
        BEV[i] = (s % 60) === 0 ? 1 : 0;
      }
    };

    var noise = function (x, y, t) {
      return (Math.sin(x * 0.0170 + t * 0.42) +
              Math.sin(y * 0.0225 - t * 0.31) +
              Math.sin((x + y) * 0.0105 + t * 0.23) +
              Math.sin((x - y) * 0.0140 - t * 0.17)) * 0.25;
    };

    /* the ripple centre, following the real pointer by ~120 ms; and the drawn
       cursor cell, following it by ~80 ms (the sheet hides the system cursor) */
    var pxT = 0, pyT = 0, pxS = 0, pyS = 0, ptrOn = false;
    var cxT = 0, cyT = 0, cxS = 0, cyS = 0, curOn = false;

    var fieldFrame = function (t) {
      if (!fctx || !NC) return;
      var m0 = performance.now();
      fctx.clearRect(0, 0, FW, FH);
      var b;
      for (b = 0; b < BUCKETS; b++) BLEN[b] = 0;
      tlN = 0;                                       /* the live wake points, this frame */
      var tnow = performance.now(), u;
      for (u = 0; u < trail.length && tlN < TR_MAX; u++) {
        var pt = trail[u], ag = (tnow - pt[2]) / TRAIL_MS;
        if (ag < 0 || ag >= 1) continue;
        tlX[tlN] = pt[0]; tlY[tlN] = pt[1]; tlW[tlN] = Math.sqrt(1 - ag); tlN++;
      }
      var tL = 0, tR = 0, tT = 0, tB = 0;
      if (tlN) {
        tL = tR = tlX[0]; tT = tB = tlY[0];
        for (u = 1; u < tlN; u++) {
          if (tlX[u] < tL) tL = tlX[u]; else if (tlX[u] > tR) tR = tlX[u];
          if (tlY[u] < tT) tT = tlY[u]; else if (tlY[u] > tB) tB = tlY[u];
        }
        tL -= TR_R; tR += TR_R; tT -= TR_R; tB += TR_R;
      }
      for (var i = 0; i < NC; i++) {
        var x = CX[i], y = CY[i], tt = t, boost = 0;
        if (ptrOn) {
          var dx = x - pxS, dy = y - pyS, d2 = dx * dx + dy * dy;
          if (d2 < RIP2) {
            var f = 1 - d2 / RIP2;
            f *= f;
            boost = RIP_A * f;                       /* the ripple raises alpha */
            tt = t + f * 2.6;                        /* and shifts the phase */
          }
        }
        if (tlN && x > tL && x < tR && y > tT && y < tB) {
          for (var q = 0; q < tlN; q++) {            /* … and the wake behind it */
            var ex = x - tlX[q], ey = y - tlY[q], e2 = ex * ex + ey * ey;
            if (e2 >= TR_R2) continue;
            var g = 1 - e2 / TR_R2;
            g = RIP_A * 0.95 * tlW[q] * g * g;
            if (g > boost) { boost = g; tt = t + (g / RIP_A) * 2.6; }
          }
        }
        var n = 0.5 + 0.5 * noise(x, y, tt);
        var a = A_MIN + A_SPAN * n * n + boost;      /* skewed low: the field stays airy */
        var k = (a / AMAX * BUCKETS) | 0;
        if (k < 1) continue;
        if (k > BUCKETS - 1) k = BUCKETS - 1;
        BIDX[k][BLEN[k]++] = i;
      }
      for (b = 1; b < BUCKETS; b++) {
        var n2 = BLEN[b];
        if (!n2) continue;
        fctx.fillStyle = "rgba(" + TILE_RGB + "," + ((b + 0.5) / BUCKETS * AMAX).toFixed(3) + ")";
        fctx.beginPath();
        var list = BIDX[b];
        for (var j = 0; j < n2; j++) fctx.rect(CX[list[j]], CY[list[j]], CELL, CELL);
        fctx.fill();
      }
      fctx.fillStyle = "rgba(255,255,255,0.55)";     /* the bevel highlight */
      fctx.beginPath();
      for (var h = 0; h < NC; h++) {
        if (!BEV[h]) continue;
        fctx.rect(CX[h] + 2, CY[h] + 2, CELL - 4, 1);
      }
      fctx.fill();

      if (curOn) {                                   /* the pointer: one hollow grid cell */
        var gx = Math.floor(cxS / PITCH) * PITCH, gy = Math.floor(cyS / PITCH) * PITCH;
        fctx.lineWidth = 1;
        fctx.strokeStyle = "rgba(" + INK_RGB + ",0.55)";
        fctx.strokeRect(gx + 0.5, gy + 0.5, PITCH - 1, PITCH - 1);
        fctx.fillStyle = "rgba(" + INK_RGB + ",0.7)";
        fctx.fillRect(gx + PITCH / 2 - 1, gy + PITCH / 2 - 1, 2, 2);
      }
      lastMs = performance.now() - m0;
    };

    /* ---------- layer 2 · one orchid branch, from the shared ORCHID sprites ----------
       Nothing is drawn with paths. Every flower here is one of the shared 64×64 blooms
       or the 160×96 spray from orchid-sprites.js, baked once at 1 px per cell and
       blitted at an integer zoom onto whole pixels — the same sprites /about hangs on
       its walls. The hero takes ONE of them and grows it to ×6: a single branch that
       cascades from the top right down to the lower left, the way a phalaenopsis spray
       hangs. The stem raster is rotated about its own base cell in the low-res space,
       so a ×6 branch is still made of 6 px blocks; the blooms are then hung upright
       from their (rotated) pedicel points, because a flower hangs by gravity, not by
       the angle of the branch it grows on. */
    var OR = window.ORCHID || null;
    var SP = OR ? {
      front: OR.bake(OR.FRONT), lift: OR.bake(OR.LIFT),
      tq:    OR.bake(OR.TQ),    tql:  OR.bake(OR.TQL),
      bud:   OR.bake(OR.BUD),
      spray: OR.bake(OR.SPRAY), stem: OR.bake(OR.SPRAY_STEM),
      open:  OR.OPEN.map(function (r) { return OR.bake(r); }),
      sb:    OR.SPRAY_BLOOMS.map(function (b) {
        return { x: b.x, y: b.y, w: b.w, h: b.h,
                 open: b.open.map(function (r) { return OR.bake(r); }),
                 lift: OR.bake(b.lift) };
      })
    } : null;

    var BW = 64, SW = 160, SH = 96;                  /* the sprites, in cells        */
    var STEP = 90;                                   /* ms per opening frame         */
    var BREATH = 1600;                               /* the two-frame breath         */
    var LEAD = 6 * STEP;
    var RAD = Math.PI / 180;

    /* the branch, in sprite cells: where it foots, where it ends, where a bloom hangs */
    var BX = 11, BY = 51;                            /* the stem's base cell         */
    var SIX = 9, SIY = 9, SIW = 138, SIH = 43;       /* the stem's own ink box       */
    var PIVY = 6;                                    /* a bloom hangs 6 cells down its top */
    var REVEAL = 1200;                               /* the stem draws on in 1.2 s   */
    var BLOOM_WAIT = 400, BLOOM_LEAD = 320;          /* then a bloom every 320 ms    */
    var TILT = 2.5, BLOOM_SWAY = 4;                  /* the wind: branch °, bloom °  */
    var PETAL = [5, 6, 54, 50], PETAL_SCALE = 0.5;  /* a whole FRONT bloom, half the branch scale — blooms fall, not petals */
    var BUD = [137, 12, 9, 19];                      /* the tip bud and its pedicel   */
    var BUD_AX = 144, BUD_AY = 12;                   /* … where they leave the stem   */
    var PETAL_EVERY = 2600, PETAL_JIT = 1800, PETAL_LIFE = 4500, PETAL_FADE = 3000;  /* 2–4 in the air, readable to the end */
    var FAR_HOLD = 12000, FAR_FADE = 2000;           /* the one far bloom, 12 s       */
    var FAR_FIRST = 12000, FAR_EVERY = 20000, FAR_JIT = 10000;
    var CLICK_HOLD = 1000, CLICK_FADE = 3000;        /* open, wait 1 s, fade over 3 s */
    var MAX_STAMPS = 24;
    var stamps = [], variant = 0, dirty = false;

    var stm = document.getElementById("paperStamps");
    var sctx = stm && stm.getContext ? stm.getContext("2d", { willReadFrequently: true }) : null;

    var narrow = function () { return FW < 560; };
    var ZOOM = function () { return narrow() ? 1.5 : 2; };  /* a clicked bloom        */
    /* the branch itself: ×5 – ×6 on a desktop, so it spans about 0.64 of the sheet   */
    var BRZ = function () {
      if (narrow()) return 2.5;
      return Math.max(5, Math.min(6, Math.round(FW / 217)));
    };
    var BROT = function () { return narrow() ? 108 : 180; };
    var BRBASE = function () {
      return narrow() ? [0.75 * FW, 0.16 * FH] : [FW + 12, 0.18 * FH];  /* desktop: the root sits inside the right wall */
    };

    /* six opening frames at 90 ms, then a two-frame breath every 1.6 s */
    var frameOf = function (age, step) {
      if (reduced) return 5;
      var fi = Math.floor(age / step);                     /* a rAF stamp can predate t0 */
      return fi < 0 ? 0 : (fi < 6 ? fi : 5);
    };
    var breathOf = function (age, step) {
      if (reduced) return 0;
      var over = age - 6 * step;
      return over < 0 ? 0 : (Math.floor(over / (BREATH / 2)) % 2);
    };
    var bloomImg = function (fi, br, tq) {
      if (fi < 5) return SP.open[fi];
      return tq ? (br ? SP.tql : SP.tq) : (br ? SP.lift : SP.front);
    };
    var sprayBloomImg = function (b, fi, br) {
      return fi < 5 ? b.open[fi] : (br ? b.lift : b.open[5]);
    };
    var blit = function (img, x, y, w, h) {          /* whole pixels, never smoothed */
      sctx.drawImage(img, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    /* every part of the branch is laid on ONE block lattice: stem, blooms and petals
       all start on a multiple of the zoom, so no seam ever splits a block in two */
    var gsnap = function (v, z) { return Math.round(v / z) * z; };
    var crop = function (img, r) {
      var c = document.createElement("canvas");
      c.width = r[2]; c.height = r[3];
      var g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      return c;
    };
    var petalImg = null, budImg = null, stemNB = null;
    if (SP) {
      petalImg = crop(SP.front, PETAL);              /* a whole bloom, cut from FRONT */
      budImg = crop(SP.stem, BUD);                   /* the tip bud, cut off the stem …   */
      stemNB = document.createElement("canvas");     /* … so the stem can turn without it */
      stemNB.width = SW; stemNB.height = SH;
      var sg = stemNB.getContext("2d");
      sg.imageSmoothingEnabled = false;
      sg.drawImage(SP.stem, 0, 0);
      sg.clearRect(BUD[0], BUD[1], BUD[2] + 1, BUD[3]);
    }

    /* ---------- the wind: the pointer's own speed, smoothed over 250 ms ----------
       It never touches the blit: the lean is baked into the sprite's *own* low-res
       raster (one cached canvas per whole degree) and only then blown up, so a
       swaying branch is still made of whole blocks on the same grid as the field. */
    var WIND_TAU = 0.25, WIND_REL = 0.30, WIND_FULL = 600;
    var wRawX = 0, wRawY = 0, wvx = 0, wvy = 0, wLastX = 0, wLastY = 0, wSeeded = false, drive = 0;
    var windStep = function (dt) {
      if (reduced) { drive = 0; return; }
      var kd = Math.exp(-dt / WIND_REL);
      if (ptrOn) {
        var mx = pxT - wLastX, my = pyT - wLastY;
        if (!wSeeded) { wSeeded = true; mx = my = 0; }
        wLastX = pxT; wLastY = pyT;
        if (dt > 0 && mx * mx + my * my > 0.25) {
          var ivx = mx / dt, ivy = my / dt, im = Math.sqrt(ivx * ivx + ivy * ivy);
          if (im > 2500) { ivx = ivx * 2500 / im; ivy = ivy * 2500 / im; }
          wRawX = ivx; wRawY = ivy;
        } else { wRawX *= kd; wRawY *= kd; }
      } else { wRawX *= kd; wRawY *= kd; wSeeded = false; }
      var kw = 1 - Math.exp(-dt / WIND_TAU);
      wvx += (wRawX - wvx) * kw; wvy += (wRawY - wvy) * kw;
      if (wvx < 0.05 && wvx > -0.05) wvx = 0;
      if (wvy < 0.05 && wvy > -0.05) wvy = 0;
      drive = wvx / WIND_FULL;
      if (drive > 1) drive = 1; else if (drive < -1) drive = -1;
    };
    var gust = function (t, ph, amp) {
      return amp * drive * (0.85 + 0.15 * Math.sin(t + ph));
    };

    /* one rotated raster per (bloom, frame, breath, whole degree), pivoting on the
       pedicel — the point where the bloom meets the rachis, 6 cells down its top */
    var RPAD = 8, rotN = 0, rotC = {};
    var rotOf = function (img, w, h, key, deg) {
      var c = rotC[key];
      if (c) return c;
      if (rotN > 420) { rotC = {}; rotN = 0; }
      c = document.createElement("canvas");
      c.width = w + 2 * RPAD; c.height = h + 2 * RPAD;
      var g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.translate(RPAD + w / 2, RPAD + PIVY);
      g.rotate(deg * RAD);
      g.drawImage(img, -w / 2, -PIVY);
      rotC[key] = c; rotN++;
      return c;
    };

    /* the stem, rotated about its base cell and cropped to its own ink; `cut` is how
       many columns of the sprite have been drawn on so far, which is what makes the
       branch grow out of its base instead of appearing whole */
    var stemC = {};
    var stemBake = function (deg, cut) {
      var a = deg * RAD, co = Math.cos(a), si = Math.sin(a), i;
      var xs = [SIX, SIX + SIW, SIX, SIX + SIW], ys = [SIY, SIY, SIY + SIH, SIY + SIH];
      var mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
      for (i = 0; i < 4; i++) {
        var dx = xs[i] - BX, dy = ys[i] - BY;
        var rx = dx * co - dy * si, ry = dx * si + dy * co;
        if (rx < mnx) mnx = rx;
        if (rx > mxx) mxx = rx;
        if (ry < mny) mny = ry;
        if (ry > mxy) mxy = ry;
      }
      var pad = 3;
      var c = document.createElement("canvas");
      c.width = Math.ceil(mxx - mnx) + 2 * pad;
      c.height = Math.ceil(mxy - mny) + 2 * pad;
      c.ox = Math.round(-mnx) + pad;
      c.oy = Math.round(-mny) + pad;
      var g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.translate(c.ox, c.oy);
      g.rotate(a);
      if (cut >= SW) g.drawImage(stemNB, -BX, -BY);
      else if (cut > 0) g.drawImage(stemNB, 0, 0, cut, SH, -BX, -BY, cut, SH);
      return c;
    };
    var stemAt = function (deg, cut) {
      if (cut < SW) return stemBake(deg, cut);       /* while it draws on: fresh each frame */
      var k = "r" + deg, c = stemC[k];
      if (!c) { c = stemC[k] = stemBake(deg, SW); }
      return c;
    };

    /* a cell of the sprite → a point on the sheet, once the branch is placed and leant */
    var cellAt = function (s, cx, cy, deg) {
      var a = deg * RAD, co = Math.cos(a), si = Math.sin(a);
      var dx = cx - BX, dy = cy - BY;
      return [s.x + (dx * co - dy * si) * s.z, s.y + (dx * si + dy * co) * s.z];
    };
    /* what the branch actually inks, stem and hanging blooms together */
    var branchBox = function (s, deg) {
      var sc = stemAt(deg === undefined ? s.rot : deg, SW), z = s.z, k;
      var x0 = s.x - sc.ox * z, y0 = s.y - sc.oy * z;
      var q = [x0, y0, x0 + sc.width * z, y0 + sc.height * z];
      for (k = 0; k < SP.sb.length; k++) {
        var b = SP.sb[k], p = cellAt(s, b.x + b.w / 2, b.y + PIVY, deg === undefined ? s.rot : deg);
        var bx = p[0] - b.w * z / 2, by = p[1] - PIVY * z;
        if (bx < q[0]) q[0] = bx;
        if (by < q[1]) q[1] = by;
        if (bx + b.w * z > q[2]) q[2] = bx + b.w * z;
        if (by + b.h * z > q[3]) q[3] = by + b.h * z;
      }
      return q;
    };

    var drawStamps = function (now) {
      if (!sctx || !SP) return;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, stm.width, stm.height);
      sctx.imageSmoothingEnabled = false;
      var busy = false, i, k, tsec = now / 1000;
      for (i = 0; i < stamps.length; i++) {
        var s = stamps[i], age = now - s.t0, over = age - s.life, alpha = 1;
        if (over > 0) { alpha = 1 - over / s.fade; busy = true; }
        else if (!reduced) busy = true;
        if (alpha <= 0) { s.dead = 1; s.alpha = 0; continue; }
        s.alpha = alpha;
        sctx.globalAlpha = alpha;
        var z = s.z * DP;
        if (s.kind === "branch") {
          var deg = s.rot, lean = 0;
          if (!reduced && drive) {
            lean = gust(tsec * 2.2, s.ph, TILT);     /* the whole branch leans a little */
            deg = s.rot + Math.round(lean);
          }
          s.lean = lean;
          var cut = reduced ? SW : BX + (SW - BX) * age / REVEAL;
          if (cut > SW) cut = SW;
          s.reveal = Math.max(0, Math.min(1, (cut - BX) / (SIX + SIW - BX)));
          var sc = stemAt(deg, cut);
          blit(sc, gsnap(s.x * DP - sc.ox * z, z), gsnap(s.y * DP - sc.oy * z, z),
               sc.width * z, sc.height * z);
          if (cut >= BUD_AX) {                       /* the bud hangs, it does not point up */
            var bp = cellAt(s, BUD_AX, BUD_AY, deg);
            blit(budImg, gsnap(bp[0] * DP - (BUD_AX - BUD[0]) * z, z), gsnap(bp[1] * DP, z),
                 BUD[2] * z, BUD[3] * z);
          }
          s.frame = 0;
          var sway = 0;
          for (k = 0; k < SP.sb.length; k++) {       /* painted far → near along the branch */
            var b = SP.sb[k];
            var bage = reduced ? age + 6 * STEP            /* still motion: all of it, at once */
                               : age - BLOOM_WAIT - (SP.sb.length - 1 - k) * BLOOM_LEAD;
            if (bage < 0) { s.frames[k] = 0; continue; }
            var bf = frameOf(bage, STEP);
            var br = breathOf(bage + k * (BREATH / 3), STEP);   /* staggered breaths */
            s.frames[k] = bf;
            var p = cellAt(s, b.x + b.w / 2, b.y + PIVY, deg);
            var bim = sprayBloomImg(b, bf, br);
            var bd = 0;
            if (!reduced && drive) {
              var g2 = gust(tsec * 2.9 + k, s.ph, BLOOM_SWAY);
              if (Math.abs(g2) > Math.abs(sway)) sway = g2;
              bd = Math.round(g2);
            }
            if (bd) blit(rotOf(bim, b.w, b.h, k + "." + bf + "." + br + ":" + bd, bd),
                         gsnap(p[0] * DP - (b.w / 2 + RPAD) * z, z),
                         gsnap(p[1] * DP - (PIVY + RPAD) * z, z),
                         (b.w + 2 * RPAD) * z, (b.h + 2 * RPAD) * z);
            else blit(bim, gsnap(p[0] * DP - b.w * z / 2, z), gsnap(p[1] * DP - PIVY * z, z),
                      b.w * z, b.h * z);
            if (k === SP.sb.length - 1) s.frame = bf;
          }
          s.sway = sway;
        } else if (s.kind === "petal") {
          var t = reduced ? 0 : age / 1000;
          s.px = s.x + s.vx * t + 9 * Math.sin(t * 1.6 + s.ph);
          s.py = s.y + s.vy * t;
          var pz = s.pz * DP;
          blit(petalImg, gsnap(s.px * DP - s.w * DP / 2, pz), gsnap(s.py * DP - s.h * DP / 2, pz),
               s.w * DP, s.h * DP);
        } else {
          var fi = frameOf(age, s.step);
          s.frame = fi;
          blit(bloomImg(fi, breathOf(age, s.step), s.tq),
               s.x * DP - BW * z / 2, s.y * DP - BW * z / 2, BW * z, BW * z);
        }
      }
      sctx.globalAlpha = 1;
      for (var j = stamps.length - 1; j >= 0; j--) if (stamps[j].dead) stamps.splice(j, 1);
      dirty = busy;
    };

    /* reduced motion runs no rAF loop: a slow ticker carries the fades instead */
    var rmT = 0;
    var rmTick = function () {
      if (!reduced || rmT) return;
      rmT = setInterval(function () {
        drawStamps(performance.now());
        if (!stamps.length) { clearInterval(rmT); rmT = 0; }
      }, 120);
    };

    var push = function (s) {
      stamps.push(s);
      if (stamps.length > MAX_STAMPS) stamps.splice(0, stamps.length - MAX_STAMPS);
      dirty = true;
      if (reduced) rmTick();
      if (reduced || !raf) drawStamps(performance.now());
      return stamps.length;
    };

    /* a click (or a tap): one bloom, front and three-quarter alternating */
    var stamp = function (x, y, click, hold, fade) {
      if (!SP) return stamps.length;
      var z = ZOOM(), side = BW * z, half = side / 2;
      x = Math.max(half * 0.6, Math.min(FW - half * 0.6, x));
      y = Math.max(half * 0.6, Math.min(FH - half * 0.6, y));
      var tq = (variant % 2) === 1;
      variant = (variant + 1) % 2;
      if (click) count();
      return push({ kind: "bloom", x: x, y: y, z: z, w: side, h: side, tq: tq, step: STEP,
                    t0: performance.now(), click: !!click, dead: 0, alpha: 1, frame: 0,
                    far: !click,
                    life: 6 * STEP + (hold || CLICK_HOLD), fade: fade || CLICK_FADE });
    };

    /* the branch: one spray, grown to ×6, footed where the composition wants it */
    var branchAt = 0;
    var branch = function () {
      if (!SP || !FW || !FH) return;
      var z = BRZ(), rot = BROT(), b = BRBASE();
      var s = { kind: "branch", x: b[0], y: b[1], z: z, rot: rot, step: STEP,
                ph: Math.random() * 6.2832, frames: [0, 0, 0], reveal: 0, sway: 0, lean: 0,
                w: SW * z, h: SH * z,
                t0: performance.now(), click: false, dead: 0, alpha: 1, frame: 0,
                life: 1e9, fade: 1000 };
      var q = branchBox(s, rot);                     /* keep every petal on the sheet */
      if (q[0] < 4) s.x += 4 - q[0];
      if (narrow() && q[2] > FW - 4) s.x -= q[2] - (FW - 4);   /* desktop may run off the right edge: it grows out of the wall */
      if (q[1] < 4) s.y += 4 - q[1];
      if (q[3] > FH - 4) s.y -= q[3] - (FH - 4);
      branchAt = performance.now() - T0;
      push(s);
      return s;
    };
    var theBranch = function () {
      for (var i = 0; i < stamps.length; i++) if (stamps[i].kind === "branch" && !stamps[i].dead) return stamps[i];
      return null;
    };
    var petalsUp = function () {
      var n = 0;
      for (var i = 0; i < stamps.length; i++) if (stamps[i].kind === "petal" && !stamps[i].dead) n++;
      return n;
    };
    var farUp = function () {
      var n = 0;
      for (var i = 0; i < stamps.length; i++) if (stamps[i].far && !stamps[i].dead) n++;
      return n;
    };
    /* loose blooms: they appear in the blank left of the branch, scattered, and drift down
       slowly until they reach the plate, where they fade */
    var petal = function (still) {
      var s = theBranch();
      if (!s || petalsUp() >= (narrow() ? 2 : 4)) return;
      var q = branchBox(s, s.rot), ko = keepOut(), i;
      var pz = Math.max(1, Math.floor(s.z * PETAL_SCALE));
      if (!narrow() && Math.random() < 0.5) pz = Math.max(1, pz - 1);   /* two sizes on desktop */
      var w = PETAL[2] * pz, h = PETAL[3] * pz;
      var xMax = Math.min(q[0] - w / 2 - 16, FW * 0.5), xMin = 16 + w / 2;
      if (xMax < xMin) xMax = Math.max(xMin, FW * 0.42);
      var plateTop = FH, barBot = 0;
      for (i = 0; i < ko.length; i++) { if (ko[i][1] > FH * 0.4) plateTop = Math.min(plateTop, ko[i][1]); else barBot = Math.max(barBot, ko[i][3]); }
      var sp = 22 + Math.random() * 12;
      /* scatter: spread across the blank band, start heights staggered, never on top of another loose bloom */
      var x = xMin, y0 = barBot - h / 2 - 8, tries = 24, ok = false, j;
      while (tries-- > 0 && !ok) {
        x = xMin + Math.random() * (xMax - xMin);
        y0 = still ? barBot + h / 2 + Math.random() * Math.max(40, plateTop - barBot - h)
                   : (Math.random() < 0.5 ? barBot - h / 2 - 8 : barBot + h + Math.random() * Math.max(40, (plateTop - barBot) * 0.5 - h));
        ok = true;
        for (j = 0; j < stamps.length; j++) {
          var o = stamps[j];
          if (o.kind !== "petal" || o.dead) continue;
          if (Math.abs(o.px - x) < (o.w + w) * 0.62 && Math.abs(o.py - y0) < (o.h + h) * 0.7) { ok = false; break; }
        }
      }
      if (!ok) return;
      var dist = Math.max(60, plateTop - 12 - h / 2 - y0);
      var life = still ? 1e9 : Math.max(1500, (dist / sp) * 1000 - PETAL_FADE);
      return push({ kind: "petal", x: x, y: y0, z: s.z, pz: pz, w: w, h: h,
                    vx: still ? 0 : (Math.random() - 0.5) * 8, vy: still ? 0 : sp,
                    speed: still ? 0 : sp, px: x, py: y0,
                    ph: Math.random() * 6.2832, step: STEP,
                    t0: performance.now(), click: false, dead: 0, alpha: 1, frame: 5,
                    life: life, fade: PETAL_FADE });
    };

    /* ---------- input: a click stamps, a drag does nothing ---------- */
    var downAt = null;
    var local = function (e) {
      var r = paper.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    var chrome = function (t) {
      return !!(t && t.closest && t.closest(".pill, .down, a, button"));
    };

    paper.addEventListener("pointerdown", function (e) {
      if (chrome(e.target)) { downAt = null; return; }
      downAt = [e.clientX, e.clientY, e.pointerId];
    });
    paper.addEventListener("pointerup", function (e) {
      if (!downAt || downAt[2] !== e.pointerId) { downAt = null; return; }
      var dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
      downAt = null;
      if (chrome(e.target)) return;
      if (dx * dx + dy * dy > 64) return;                  /* a drag is not a tap */
      var p = local(e);
      stamp(p[0], p[1], true);
    });
    paper.addEventListener("pointercancel", function () { downAt = null; });

    var rmR = 0;
    var rmField = function () {                            /* one repaint, no loop */
      if (!reduced || rmR) return;
      rmR = requestAnimationFrame(function () { rmR = 0; fieldFrame(clock); });
    };
    var aim = function (e, fine) {
      var r = paper.getBoundingClientRect();
      var lx = e.clientX - r.left, ly = e.clientY - r.top;
      if (!reduced) {
        pxT = lx; pyT = ly;
        if (!ptrOn) { pxS = pxT; pyS = pyT; ptrOn = true; wSeeded = false; }
      }
      if (fine) pillNear(lx, ly);
      if (fine) {                                          /* the drawn cursor: mouse or pen only */
        cxT = lx; cyT = ly;
        if (!curOn || reduced) { cxS = lx; cyS = ly; curOn = true; rmField(); }
      }
    };
    paper.addEventListener("pointermove", function (e) {
      aim(e, e.pointerType !== "touch");
    });
    paper.addEventListener("pointerleave", function () {
      ptrOn = false;
      pillsOff();
      if (curOn) { curOn = false; rmField(); }
    });
    paper.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" && curOn) { curOn = false; rmField(); }
    }, true);
    paper.addEventListener("touchmove", function (e) {
      if (!reduced && e.touches && e.touches[0]) aim(e.touches[0], false);
    }, { passive: true });

    /* ---------- fit, pump, pause ---------- */
    var fit = function () {
      var r = paper.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h) return false;
      if (w === FW && h === FH) return false;
      FW = w; FH = h;
      if (fld) {
        fld.width = w * DP; fld.height = h * DP;
        if (fctx) fctx.setTransform(DP, 0, 0, DP, 0, 0);
      }
      if (stm) { stm.width = w * DP; stm.height = h * DP; }
      buildGrid();
      return true;
    };

    var raf = 0, last = 0, frameMs = 0;
    var pump = function (now) {
      raf = requestAnimationFrame(pump);
      if (last && now - last < 28) return;                 /* ~33 fps */
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.03;
      last = now;
      clock += dt;
      if (ptrOn) {                                         /* ~120 ms lag */
        var k = 1 - Math.exp(-dt / 0.12);
        pxS += (pxT - pxS) * k; pyS += (pyT - pyS) * k;
      }
      if (curOn) {                                         /* the cursor cell: ~80 ms lag */
        var kc = 1 - Math.exp(-dt / 0.08);
        cxS += (cxT - cxS) * kc; cyS += (cyT - cyS) * kc;
      }
      windStep(dt);
      while (trail.length && now - trail[0][2] > TRAIL_MS) trail.shift();
      if (ptrOn) {
        var lp = trail.length ? trail[trail.length - 1] : null;
        if (!lp || (pxT - lp[0]) * (pxT - lp[0]) + (pyT - lp[1]) * (pyT - lp[1]) >= TR_STEP2) {
          trail.push([pxT, pyT, now]);
          if (trail.length > TR_MAX) trail.shift();
        }
      }
      var m0 = performance.now();
      fieldFrame(clock);
      if (dirty || stamps.length) drawStamps(now);
      frameMs = performance.now() - m0;
    };
    var stop = function () { if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } };
    var start = function () {
      if (!raf && !reduced && !document.hidden) { last = 0; raf = requestAnimationFrame(pump); }
    };

    if (fctx) {
      fit();
      fieldFrame(0);
      if (!reduced) {
        start();
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) stop(); else start();
        });
      }
    }

    /* ---------- the sheet keeps its own slow clock ---------- */
    var plate = paper.querySelector(".paper__mid");
    var topbar = document.querySelector(".topbar");
    var hint = paper.querySelector(".paper__hint");
    var keepOut = function () {                            /* the three places a flower may not land */
      var r = paper.getBoundingClientRect(), out = [];
      var add = function (el, m) {
        if (!el) return;
        var b = el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        out.push([b.left - r.left - m, b.top - r.top - m,
                  b.right - r.left + m, b.bottom - r.top + m]);
      };
      add(plate, 20);
      add(topbar, 12);
      add(hint, 16);                                       /* the hint line and its ↓ */
      return out;
    };

    /* the one far bloom: ×2, well clear of the branch, breathing for 12 s */
    var farPlace = function () {
      var s = theBranch(), z = ZOOM(), half = BW * z / 2, ko = keepOut(), i, k;
      var q = s ? branchBox(s, s.rot) : null, pad = narrow() ? 20 : 40;
      for (i = 0; i < 80; i++) {
        var x = half + 16 + Math.random() * (FW - 2 * (half + 16));
        var y = half + 16 + Math.random() * (FH - 2 * (half + 16));
        var bad = false;
        if (q && x + half > q[0] - pad && x - half < q[2] + pad &&
                 y + half > q[1] - pad && y - half < q[3] + pad) bad = true;
        for (k = 0; k < ko.length && !bad; k++) {
          var o = ko[k];
          bad = x + half > o[0] && x - half < o[2] && y + half > o[1] && y - half < o[3];
        }
        if (!bad) return [x, y];
      }
      return null;
    };
    var farAt = 0;
    var farOne = function () {
      if (!SP || farUp() >= 1) return;
      var p = farPlace();
      if (!p) return;
      stamp(p[0], p[1], false, FAR_HOLD, FAR_FADE);
      if (!farAt) farAt = performance.now() - T0;
    };

    var seen = true, tFar = 0, tPet = 0;
    var awake = function () { return seen && !document.hidden && FW > 0 && FH > 0; };
    var firePetal = function () {
      tPet = 0;
      if (!awake() || reduced) return;
      petal();
      tPet = setTimeout(firePetal, PETAL_EVERY + Math.random() * PETAL_JIT);
    };
    var fireFar = function () {
      tFar = 0;
      if (!awake()) return;
      farOne();
      tFar = setTimeout(fireFar, FAR_EVERY + Math.random() * FAR_JIT);
    };
    var wake = function () {
      if (!awake()) return;
      if (!tFar) tFar = setTimeout(fireFar, 2000);
      if (!tPet && !reduced) tPet = setTimeout(firePetal, 2000);
    };
    var sleep = function () {
      if (tFar) { clearTimeout(tFar); tFar = 0; }
      if (tPet) { clearTimeout(tPet); tPet = 0; }
    };

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        for (var i = 0; i < es.length; i++) seen = es[i].intersectionRatio >= 0.3;
        if (seen) wake(); else sleep();
      }, { threshold: [0, 0.15, 0.3, 0.6, 1] }).observe(paper);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) sleep(); else wake();
    });

    branch();                                              /* the branch, right now */
    if (reduced) { petal(true); petal(true); }             /* still motion: two petals, still */
    tFar = setTimeout(fireFar, FAR_FIRST);
    if (!reduced) tPet = setTimeout(firePetal, PETAL_EVERY);

    var refit = null;
    window.addEventListener("resize", function () {
      if (refit) return;
      refit = requestAnimationFrame(function () {
        refit = null;
        if (fit()) {
          fieldFrame(clock);
          drawStamps(performance.now());
        }
      });
    });

    var snap = function () {
      var a = [], now = performance.now();
      for (var i = 0; i < stamps.length; i++) {
        var s = stamps[i];
        a.push({ kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h, z: s.z,
                 size: Math.max(s.w, s.h), S: Math.round(s.w / s.z),
                 side: Math.round(s.w * DP), alpha: s.alpha, frame: s.frame,
                 frames: s.frames ? s.frames.slice() : null,
                 reveal: s.reveal, sway: s.sway || 0, far: !!s.far,
                 px: s.px, py: s.py, speed: s.speed || 0,
                 click: !!s.click, age: now - s.t0, life: s.life });
      }
      return a;
    };
    window.__hero = {
      stamps: function () { return theBranch() ? 1 : 0 },
      ambient: farUp,
      clicked: function () {
        var n = 0;
        for (var i = 0; i < stamps.length; i++) if (stamps[i].click && !stamps[i].dead) n++;
        return n;
      },
      list: snap,
      branch: function () {                                /* the one branch, and its box */
        var s = theBranch();
        if (!s) return null;
        return { at: branchAt, x: s.x, y: s.y, z: s.z, rot: s.rot, reveal: s.reveal,
                 frames: s.frames.slice(), sway: s.sway, lean: s.lean, age: performance.now() - s.t0,
                 box: branchBox(s, s.rot + Math.round(s.lean)),
                 rest: branchBox(s, s.rot),
                 baseFrac: [+(s.x / FW).toFixed(3), +(s.y / FH).toFixed(3)] };
      },
      petals: function () {
        var a = [], now = performance.now();
        for (var i = 0; i < stamps.length; i++) {
          var s = stamps[i];
          if (s.kind !== "petal" || s.dead) continue;
          a.push({ x0: s.x, y0: s.y, x: s.px, y: s.py, vx: s.vx, vy: s.vy, speed: s.speed,
                   w: s.w, h: s.h, age: now - s.t0, alpha: s.alpha });
        }
        return a;
      },
      far: farUp,
      farAt: function () { return farAt; },
      keepOut: keepOut,
      wind: function () {
        return { vx: wvx, vy: wvy, mag: Math.sqrt(wvx * wvx + wvy * wvy), drive: drive,
                 deg: BLOOM_SWAY * drive };
      },
      sway: function () {                                  /* what the blooms are actually at */
        var m = 0;
        for (var i = 0; i < stamps.length; i++) {
          var v = Math.abs(stamps[i].sway || 0);
          if (v > m) m = v;
        }
        return m;
      },
      trail: function () { return trail.length; },
      t0: function () { return T0; },
      cursor: function () { return { on: curOn, x: cxS, y: cyS, tx: cxT, ty: cyT, cell: PITCH }; },
      sprites: function () { return SP; },                 /* the baked orchid canvases */
      zoom: ZOOM,
      branchZoom: BRZ,
      rect: function () { return paper.getBoundingClientRect(); },
      awake: awake,
      total: function () { return stamps.length; },
      ms: function () { return frameMs || lastMs; },
      fieldMs: function () { return lastMs; },
      cells: function () { return NC; },
      running: function () { return !!raf; }
    };
  })();

  /* ---------- card miniatures (02/03/04/05): tiny live versions of the works ---------- */
  var CARD_BG = "#f8fafd";                                   /* the cool hero ground */
  var GRID_INK = "rgba(36, 31, 28, 0.035)";                  /* the same 14 px grid */

  /* the picture the burst tears apart: one pixel orchid (ORCHID SPRAY at x1 =
     160x96) standing on the cool ground and its grid — drawn, never loaded */
  var sampleArt = function (w, h) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var g = c.getContext("2d");
    g.fillStyle = CARD_BG; g.fillRect(0, 0, w, h);
    g.fillStyle = GRID_INK;
    for (var gx = 0; gx < w; gx += 14) g.fillRect(gx, 0, 1, h);
    for (var gy = 0; gy < h; gy += 14) g.fillRect(0, gy, w, 1);
    if (window.ORCHID) {
      var sp = window.ORCHID.bake(window.ORCHID.SPRAY);      /* 160 x 96, 1 px per cell */
      /* on the small card tiles the spray is wider than the picture: halve it
         until it fits, so a sprite pixel stays a whole number of pixels */
      var k = 1;
      while ((sp.width * k > w * 0.9 || sp.height * k > h * 0.9) && k > 0.13) k /= 2;
      var dw = Math.round(sp.width * k), dh = Math.round(sp.height * k);
      g.imageSmoothingEnabled = false;
      g.drawImage(sp, 0, 0, sp.width, sp.height,
                  Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    }
    return c;
  };
  /* 04a — Field: white streaks drifting along a small X-shaped flow, short fading tails.
     The flow is a saddle: velocity = (v, u) with u,v the offsets from the centre, so the
     streamlines are hyperbolae asymptotic to the two diagonals — an X. */
  var makeField = function (cv) {
    var g = cv.getContext("2d"), W = cv.width, H = cv.height;
    /* the same machine runs at three sizes (card tile, lab tile): every length
       and speed is measured in K = height / 300, so the picture is the same. */
    var K = H / 300;
    var CX = W / 2, CY = H / 2, S = H * 0.6, SP = 190 * K;
    var N = Math.max(40, Math.min(250, Math.round(250 * (W * H) / 144000)));
    var P = new Float32Array(N * 4);          /* x, y, previous x, previous y */
    var L = new Float32Array(N);              /* life left, seconds */
    var PH = new Float32Array(N);             /* per-streak turbulence phase */

    var seed = function (i, anywhere) {
      var k = i * 4, x, y;
      if (anywhere) { x = Math.random() * W; y = Math.random() * H; }
      else {                                  /* on the incoming diagonal, off to one side */
        var s = Math.random() < 0.5 ? 1 : -1, d = 0.5 + Math.random() * 0.7;
        x = CX + s * d * W * 0.52 + (Math.random() - 0.5) * H * 0.55;
        y = CY - s * d * H * 0.52 + (Math.random() - 0.5) * H * 0.55;
      }
      P[k] = x; P[k + 1] = y; P[k + 2] = x; P[k + 3] = y;
      L[i] = 0.7 + Math.random() * 2.3;
      PH[i] = Math.random() * 6.2832;
    };
    for (var i0 = 0; i0 < N; i0++) seed(i0, true);

    var step = function (dt, t) {
      for (var i = 0; i < N; i++) {
        var k = i * 4, x = P[k], y = P[k + 1];
        var u = (x - CX) / S, v = (y - CY) / S;
        var vx = v * SP + Math.sin(y * 0.021 + t * 0.7 + PH[i]) * 15 * K;
        var vy = u * SP + Math.cos(x * 0.019 - t * 0.6 + PH[i]) * 15 * K;
        var sp = Math.sqrt(vx * vx + vy * vy);
        if (sp > 300 * K) { vx = vx / sp * 300 * K; vy = vy / sp * 300 * K; }
        P[k + 2] = x; P[k + 3] = y;
        x += vx * dt; y += vy * dt;
        L[i] -= dt;
        if (L[i] <= 0 || x < -24 * K || x > W + 24 * K || y < -24 * K || y > H + 24 * K) seed(i, Math.random() < 0.25);
        else { P[k] = x; P[k + 1] = y; }
      }
    };

    var paint = function () {
      g.fillStyle = "rgba(8,8,10,0.17)";      /* the streaks fade into the ground */
      g.fillRect(0, 0, W, H);
      g.lineWidth = Math.max(1, 1.4 * K);
      g.lineCap = "round";
      g.strokeStyle = "rgba(255,255,255,0.72)";
      g.beginPath();
      for (var i = 0; i < N; i++) {
        var k = i * 4, dx = P[k] - P[k + 2], dy = P[k + 1] - P[k + 3];
        if (dx * dx + dy * dy > 900 * K * K || (dx === 0 && dy === 0)) continue;   /* skip re-seeded jumps */
        g.moveTo(P[k + 2], P[k + 3]); g.lineTo(P[k], P[k + 1]);
      }
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.95)";
      var dot = Math.max(1, 1.6 * K);
      for (var j = 0; j < N; j++) g.fillRect(P[j * 4] - dot / 2, P[j * 4 + 1] - dot / 2, dot, dot);
    };

    g.fillStyle = "#08080a"; g.fillRect(0, 0, W, H);
    var lastT = -1;
    return function (t) {
      if (lastT < 0) {                        /* first paint: warm the field into a still frame */
        for (var w = 0; w < 80; w++) { step(1 / 30, w / 30); paint(); }
        lastT = t;
        return;
      }
      var dt = t - lastT;
      lastT = t;
      if (!(dt > 0)) dt = 1 / 30;
      if (dt > 0.1) dt = 0.1;
      step(dt, t); paint();
    };
  };

  /* 04b — Explode: the picture bursts outward, then remembers itself */
  var makeExplode = function (cv) {
    var g = cv.getContext("2d"), W = cv.width, H = cv.height, CX = 8, CY = 6;
    var src = sampleArt(W, H), fw = W / CX, fh = H / CY, frags = [];
    for (var i = 0; i < CX; i++) for (var j = 0; j < CY; j++) {
      var dx = (i + 0.5) * fw - W / 2, dy = (j + 0.5) * fh - H / 2;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      frags.push([i * fw, j * fh, dx / len, dy / len,
                  (50 + Math.random() * 110) * (H / 300), (Math.random() - 0.5) * 2.2]);
    }
    var ease = function (u) { return 1 - Math.pow(1 - u, 3); };
    return function (t) {
      var p = (t % 3.6) / 3.6, k;
      if (p < 0.26) k = ease(p / 0.26);
      else if (p < 0.5) k = 1;
      else if (p < 0.84) k = 1 - ease((p - 0.5) / 0.34);
      else k = 0;
      g.fillStyle = CARD_BG; g.fillRect(0, 0, W, H);
      for (var n = 0; n < frags.length; n++) {
        var f = frags[n];
        g.save();
        g.translate(f[0] + fw / 2 + f[2] * f[4] * k, f[1] + fh / 2 + f[3] * f[4] * k);
        g.rotate(f[5] * k);
        g.drawImage(src, f[0], f[1], fw, fh, -fw / 2, -fh / 2, fw, fh);
        g.restore();
      }
    };
  };

  /* 04c — Bloom: small pastel flowers growing out of a grate in a concrete slab */
  var makeBloom = function (cv) {
    var g = cv.getContext("2d"), W = cv.width, H = cv.height, K = H / 300;

    /* the slab and its grate: drawn once, blitted every frame */
    var slab = document.createElement("canvas");
    slab.width = W; slab.height = H;
    var s = slab.getContext("2d");
    s.fillStyle = "#9c9990"; s.fillRect(0, 0, W, H);
    var GRAIN = Math.max(400, Math.round(2400 * (W * H) / 144000));
    for (var n = 0; n < GRAIN; n++) {          /* concrete grain */
      s.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(40,38,34,0.10)";
      s.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    s.strokeStyle = "rgba(40,38,34,0.22)"; s.lineWidth = 1.2;
    for (var cr = 0; cr < 3; cr++) {          /* a few hairline cracks */
      var x0 = Math.random() * W, y0 = Math.random() * H;
      s.beginPath(); s.moveTo(x0, y0);
      for (var seg = 0; seg < 5; seg++) {
        x0 += (Math.random() - 0.5) * 70; y0 += (Math.random() - 0.5) * 50;
        s.lineTo(x0, y0);
      }
      s.stroke();
    }

    var GX = W * 0.11, GY = H * 0.26, GW = W * 0.78, GH = H * 0.5;
    s.fillStyle = "#57544e"; s.fillRect(GX, GY, GW, GH);                 /* the grate frame */
    s.fillStyle = "rgba(255,255,255,0.14)"; s.fillRect(GX, GY, GW, 3);
    s.fillStyle = "rgba(20,19,18,0.35)"; s.fillRect(GX, GY + GH - 3, GW, 3);
    var SLOTS = 5, pad = GH * 0.12, band = (GH - 2 * pad) / SLOTS, slots = [];
    for (var k = 0; k < SLOTS; k++) {                                    /* the dark slots */
      var sy = GY + pad + k * band, sh = band * 0.56;
      s.fillStyle = "#14151a"; s.fillRect(GX + GW * 0.05, sy, GW * 0.9, sh);
      slots.push([GX + GW * 0.05, sy, GW * 0.9, sh]);
    }

    /* the flowers: mostly along the slot edges, a few loose on the slab */
    var PAL = ["#eff6fb", "#c7e2f6", "#9bcbed", "#6db3e4", "#ffffff"];  /* ORCHID tints */
    var fl = [];
    var NF = Math.max(14, Math.round(30 * K));
    for (var f = 0; f < NF; f++) {
      var x, y;
      if (f < NF * 0.8) {
        var sl = slots[f % SLOTS];
        x = sl[0] + 6 + Math.random() * (sl[2] - 12);
        y = sl[1] + (Math.random() < 0.5 ? 1 : sl[3] - 1) + (Math.random() - 0.5) * 5;
      } else {
        x = 10 + Math.random() * (W - 20); y = 10 + Math.random() * (H - 20);
      }
      fl.push([x, y, (6.5 + Math.random() * 5.5) * K, PAL[(Math.random() * PAL.length) | 0],
               Math.random() * 6.2832, (7 + Math.random() * 9) * K]);
    }

    return function (t) {
      g.drawImage(slab, 0, 0);
      for (var i = 0; i < fl.length; i++) {
        var q = fl[i], r = q[2], sway = Math.sin(t * 1.05 + q[4]) * 0.16;
        g.save();
        g.translate(q[0], q[1] + q[5]);
        g.rotate(sway);
        g.strokeStyle = "#608470"; g.lineWidth = Math.max(0.9, 1.6 * K); g.lineCap = "round";
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(r * 0.2, -q[5] * 0.6, 0, -q[5]); g.stroke();
        g.translate(0, -q[5]);
        g.rotate(q[4]);
        g.fillStyle = q[3];
        for (var p = 0; p < 5; p++) {
          g.save(); g.rotate((p / 5) * 6.2832);
          g.beginPath(); g.ellipse(0, -r * 0.56, r * 0.32, r * 0.56, 0, 0, 6.2832); g.fill();
          g.restore();
        }
        g.fillStyle = "#3c7ebe";
        g.beginPath(); g.arc(0, 0, r * 0.24, 0, 6.2832); g.fill();
        g.restore();
      }
    };
  };

  /* 02 — Unfold: entering the exhibition, first person.
     A flat framed picture (glass, 4:3) floats in the middle; at 0.6 s its four
     sides fold outward into floor, ceiling and two walls — the picture becomes
     the far end of a corridor — and the eye walks in at 30 px/s past four
     hanging frames, each holding one blue orchid, towards a doorway of light.
     7 s loop, 400 ms fade out, then the picture is flat again.

     Geometry: the eye sits at the origin looking down +z; a point (x, y, z)
     lands at (W/2 + F·x/z, H/2 + F·y/z) with F = W, so every length below is
     written in the units of a 320 px card and the whole scene scales with the
     tile. The corridor is x = ±A, y = ±B, from the mouth at z = ZMOUTH to the
     end wall at z = ZEND; at ZEND it projects 120 x 90 — the 4:3 picture. */
  var makeUnfold = function (cv) {
    var g = cv.getContext("2d"), W = cv.width, H = cv.height;
    var F = W, CX = W / 2, CY = H / 2, S = W / 320;
    var LW = Math.max(1, Math.round(S));                   /* one grid pixel of ink */
    var OFF = (LW % 2) ? 0.5 : 0;                          /* so the hairline lands on a pixel */
    var A = 105, B = 79, ZEND = 560, ZMOUTH = 200;
    var HOLD = 0.6, FOLD = 1.0, WALK = 5.0, FADE = 0.4;
    var LOOP = HOLD + FOLD + WALK + FADE;
    var SPEED = 30;                                        /* px along the corridor per second */
    /* the hung pictures: [z of the centre, which wall], 60 deep, 38 tall, hung
       a little above the eye line (y grows downward, the floor is at +B) */
    var HUNG = [[250, -1], [330, 1], [410, -1], [490, 1]];
    var HZ = 30, HY0 = -30, HY1 = 8;
    var INK = "rgba(36, 31, 28, ";
    var last = [];                                         /* what the probe reports */
    var ms = 0;

    /* one open orchid, re-baked in this card's three colours so the corridor
       stays ink / white / blue (the sprite's own palette carries a green stem) */
    var bloom = (function () {
      var O = window.ORCHID;
      if (!O || !O.SPRAY_BLOOMS) return null;
      var rows = O.SPRAY_BLOOMS[2].open[5];                /* the largest bloom, fully open */
      var MAP = { w: "#ffffff", "1": "#dbe8f7", "2": "#bcd6f0", o: "#7fa9d8",
                  p: "#a9c8ea", t: "#5b8ec9", h: "#ffffff", s: "#a9c8ea", S: "#7fa9d8" };
      var w0 = rows[0].length, h0 = rows.length;
      var c = document.createElement("canvas"); c.width = w0; c.height = h0;
      var q = c.getContext("2d");
      for (var y = 0; y < h0; y++) for (var x = 0; x < w0; x++) {
        var col = MAP[rows[y].charAt(x)];
        if (!col) continue;
        q.fillStyle = col; q.fillRect(x, y, 1, 1);
      }
      return c;
    })();

    var vig = g.createRadialGradient(CX, CY, H * 0.30, CX, CY, W * 0.72);
    vig.addColorStop(0, "rgba(36, 31, 28, 0)");
    vig.addColorStop(1, "rgba(36, 31, 28, 0.14)");

    var ease = function (u) {
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(2 - 2 * u, 3) / 2;
    };
    var px = function (x, z) { return CX + F * x / z; };
    var py = function (y, z) { return CY + F * y / z; };

    var path = function (q, off) {
      g.beginPath();
      for (var i = 0; i < q.length; i++) {
        var x = Math.round(q[i][0]) + off, y = Math.round(q[i][1]) + off;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
    };
    var quad = function (q, fill, edge) {
      if (fill) { path(q, 0); g.fillStyle = fill; g.fill(); }
      if (edge) { path(q, OFF); g.lineWidth = LW; g.strokeStyle = edge; g.stroke(); }
    };
    var bbox = function (q) {
      var x0 = q[0][0], x1 = x0, y0 = q[0][1], y1 = y0;
      for (var i = 1; i < q.length; i++) {
        x0 = Math.min(x0, q[i][0]); x1 = Math.max(x1, q[i][0]);
        y0 = Math.min(y0, q[i][1]); y1 = Math.max(y1, q[i][1]);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    /* the orchid inside a hung picture: nearest neighbour, clipped to the quad */
    var putBloom = function (q, a) {
      if (!bloom) return;
      var b = bbox(q), pad = 3 * S;
      var side = Math.min(b.w, b.h) - pad * 2;
      if (side < 4) return;
      g.save();
      path(q, 0); g.clip();
      g.globalAlpha = a;
      g.imageSmoothingEnabled = false;
      g.drawImage(bloom, Math.round(b.x + (b.w - side) / 2), Math.round(b.y + (b.h - side) / 2),
                  Math.round(side), Math.round(side));
      g.restore();
      g.globalAlpha = 1;
    };

    var paint = function (L) {
      var t0 = (window.performance && performance.now()) || 0;
      L = ((L % LOOP) + LOOP) % LOOP;
      var p = L <= HOLD ? 0 : (L < HOLD + FOLD ? ease((L - HOLD) / FOLD) : 1);
      var cam = SPEED * Math.max(0, Math.min(WALK, L - HOLD - FOLD));
      var znear = ZEND + (ZMOUTH - ZEND) * p;              /* the mouth folds toward the eye */
      var zend = ZEND - cam;                               /* the end wall, from where we stand */
      last = [];

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.fillStyle = CARD_BG; g.fillRect(0, 0, W, H);

      var fL = px(-A, zend), fR = px(A, zend), fT = py(-B, zend), fB = py(B, zend);

      if (p > 0.002) {                                     /* the four folded faces */
        var nL = px(-A, znear), nR = px(A, znear), nT = py(-B, znear), nB = py(B, znear);
        var edge = INK + "0.5)";
        quad([[nL, nT], [nR, nT], [fR, fT], [fL, fT]], "rgba(255, 255, 255, 0.62)", edge);  /* ceiling */
        quad([[nL, nB], [nR, nB], [fR, fB], [fL, fB]], INK + "0.10)", edge);                /* floor */
        quad([[nL, nT], [nL, nB], [fL, fB], [fL, fT]], INK + "0.05)", edge);                /* left wall */
        quad([[nR, nT], [nR, nB], [fR, fB], [fR, fT]], "rgba(255, 255, 255, 0.30)", edge);  /* right wall */
      }

      /* the end wall: while it is still flat it is the framed picture, with the
         orchid in it; as the room opens the doorway of light takes over */
      var wall = [[fL, fT], [fR, fT], [fR, fB], [fL, fB]];
      quad(wall, "rgba(255, 255, 255, 0.72)", INK + "0.62)");
      if (p > 0) {                                         /* the far wall settles into shade,
                                                              so the light in the doorway reads */
        path(wall, 0); g.fillStyle = INK + (0.10 * p).toFixed(3) + ")"; g.fill();
      }
      var wb = bbox(wall);
      if (p < 1) {                                         /* the 14 px grid on the glass */
        g.save();
        path(wall, 0); g.clip();
        g.fillStyle = INK + (0.09 * (1 - p)).toFixed(3) + ")";
        for (var gx = wb.x; gx <= wb.x + wb.w; gx += 14 * S) g.fillRect(Math.round(gx), Math.round(wb.y), LW, Math.round(wb.h));
        for (var gy = wb.y; gy <= wb.y + wb.h; gy += 14 * S) g.fillRect(Math.round(wb.x), Math.round(gy), Math.round(wb.w), LW);
        g.restore();
        putBloom(wall, 0.85 * (1 - p));
        g.lineWidth = LW;                                  /* the picture's inner mount */
        g.strokeStyle = INK + (0.45 * (1 - p)).toFixed(3) + ")";
        g.strokeRect(Math.round(wb.x + 5 * S) + OFF, Math.round(wb.y + 5 * S) + OFF,
                     Math.round(wb.w - 10 * S), Math.round(wb.h - 10 * S));
      }
      if (p > 0) {                                         /* the doorway of light */
        var dw = wb.w * 0.42, dh = wb.h * 0.72;
        var dx = Math.round(wb.x + (wb.w - dw) / 2), dy = Math.round(wb.y + wb.h - dh);
        g.globalAlpha = p;
        g.fillStyle = "#eef5ff"; g.fillRect(dx, dy, Math.round(dw), Math.round(dh));
        g.fillStyle = "#ffffff";
        g.fillRect(dx + Math.round(3 * S), dy + Math.round(3 * S),
                   Math.round(dw - 6 * S), Math.round(dh - 3 * S));
        g.lineWidth = LW; g.strokeStyle = INK + "0.55)";
        g.strokeRect(dx + OFF, dy + OFF, Math.round(dw), Math.round(dh));
        g.globalAlpha = 1;
      }

      /* the hung pictures, far ones first so the near ones pass in front */
      for (var i = HUNG.length - 1; i >= 0; i--) {
        var hz = HUNG[i][0] - cam, side = HUNG[i][1];
        var z0 = hz - HZ, z1 = hz + HZ;
        if (z1 <= 40 || z0 >= zend) continue;
        if (z0 < 40) z0 = 40;
        var wx = side * (A - 0.6);                         /* flat against the wall */
        var q = [[px(wx, z0), py(HY0, z0)], [px(wx, z1), py(HY0, z1)],
                 [px(wx, z1), py(HY1, z1)], [px(wx, z0), py(HY1, z0)]];
        var b = bbox(q);
        last.push({ z: +hz.toFixed(2), side: side, x: +b.x.toFixed(2), y: +b.y.toFixed(2),
                    w: +b.w.toFixed(2), h: +b.h.toFixed(2) });
        if (p < 0.02 || b.w < 2 || b.h < 2) continue;
        g.globalAlpha = p;
        quad(q, "rgba(255, 255, 255, 0.78)", INK + "0.6)");
        putBloom(q, 0.55 * p);
        g.globalAlpha = 1;
      }

      g.fillStyle = vig; g.fillRect(0, 0, W, H);           /* the one soft thing here */

      if (L > HOLD + FOLD + WALK) {                        /* the loop closes on a fade */
        g.globalAlpha = Math.min(1, (L - HOLD - FOLD - WALK) / FADE);
        g.fillStyle = CARD_BG; g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }
      ms = ((window.performance && performance.now()) || 0) - t0;
      return L;
    };

    /* the pump hands out one clock for every miniature, so the scene keeps its
       own origin: whenever it is woken after a gap it starts from the picture */
    var origin = null, prev = -1, local = 0;
    var draw = function (t) {
      if (origin === null || t - prev > 0.5 || t < prev) origin = t;
      prev = t;
      local = t - origin;
      paint(local);
    };
    draw.rest = function () { origin = null; prev = -1; local = 0; paint(0); };
    window.__unfold = {
      at: function (l) { return paint(l); },               /* paint one exact moment */
      local: function () { return local; },
      frames: function () { return last; },
      ms: function () { return ms; },
      loop: LOOP, hold: HOLD, fold: FOLD, walk: WALK, fade: FADE,
      size: function () { return { w: W, h: H }; }
    };
    return draw;
  };

  /* 03 — White Noise Oasis: the sound made visible. Thin hand-drawn ink rings
     are born small, flat and faint on a horizon near the top of the card, then
     drift down towards you — the further a ring has come the wider and rounder
     it is, the faster it moves, the darker it draws and the further out from the
     middle it sits, so the card reads as a plane running away from the eye, not
     as a flat target. A new ring every ~700 ms, the oldest fade out; a press
     drops one exactly where you pressed, at the size that depth asks for.
     Ink only, one pixel thick.

     Every length is written for a 320 x 200 card and scaled by K = height / 200,
     so the same machine holds at the lab tile size too. */
  var makeOasis = function (cv) {
    var g = cv.getContext("2d"), W = cv.width, H = cv.height;
    var K = H / 200;
    var RMIN = 12 * K, RMAX = 70 * K, SPAN = RMAX - RMIN;
    var V = 6.5 * K;                    /* the youngest ring's growth, px per second   */
    var FAR = 0.5, NEAR = 2.2;          /* … the oldest runs NEAR/FAR times as fast    */
    var BIRTH = 0.7;                    /* one new ring every ~700 ms                  */
    var CAP = 26;
    var CX = W / 2, CY = H * 0.18, DROP = H * 0.92;   /* the horizon, and the run home */
    var LW = Math.max(1, Math.round(K));
    var FADE_IN = 0.10, FADE_OUT = 0.18;
    var rings = [], birth = 0, lastMs = 0;

    /* where a ring of age p sits, how wide across it lies, how flat it is */
    var xAt = function (r, p) { return CX + r.u * (W / 2) * (0.3 + 0.7 * p); };
    var yAt = function (r, p) { return r.y0 + DROP * Math.pow(p, 1.2); };
    var sqAt = function (p) { return 0.40 + 0.35 * p; };
    var alphaAt = function (p) { return 0.3 + 0.2 * p; };            /* .3 far, .5 near */
    var envAt = function (p) { return Math.min(1, p / FADE_IN) * Math.min(1, (1 - p) / FADE_OUT); };

    var add = function (u, p, y0) {
      var r = { u: u === undefined ? (Math.random() * 2 - 1) * 0.95 : u,
                p: p || 0,
                y0: y0 === undefined ? CY + (Math.random() - 0.5) * 0.06 * H : y0,
                a1: 0.012 + Math.random() * 0.014, a2: 0.006 + Math.random() * 0.010,
                a3: 0.003 + Math.random() * 0.006,
                w1: Math.random() * 6.2832, w2: Math.random() * 6.2832,
                w3: Math.random() * 6.2832 };
      rings.push(r);
      if (rings.length > CAP) rings.shift();
      return r;
    };

    var rest = function () {              /* the still frame: one full run of rings */
      rings.length = 0; birth = 0;
      var U = [-0.55, 0.45, -0.2, 0.7, 0.05];
      for (var i = 0; i < U.length; i++) add(U[i], 0.08 + i * 0.2, CY);
    };
    rest();

    var step = function (dt) {
      for (var i = rings.length - 1; i >= 0; i--) {
        var r = rings[i];
        r.p += (V * (FAR + (NEAR - FAR) * r.p) / SPAN) * dt;
        if (r.p >= 1) rings.splice(i, 1);
      }
      birth += dt;
      while (birth >= BIRTH) { birth -= BIRTH; add(); }
    };

    /* one ring: an ellipse walked in 72 steps, its radius nudged by three slow
       waves, so the line wobbles the way a hand draws it */
    var ring = function (r) {
      var p = r.p, rad = RMIN + SPAN * p, sq = sqAt(p);
      var cx = xAt(r, p), cy = yAt(r, p);
      g.strokeStyle = "rgba(36,31,28," + (alphaAt(p) * envAt(p)).toFixed(3) + ")";
      g.beginPath();
      for (var i = 0; i <= 72; i++) {
        var th = i / 72 * 6.2832;
        var rr = rad * (1 + r.a1 * Math.sin(3 * th + r.w1)
                          + r.a2 * Math.sin(5 * th + r.w2)
                          + r.a3 * Math.sin(8 * th + r.w3));
        var x = cx + rr * Math.cos(th), y = cy + rr * Math.sin(th) * sq;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.stroke();
    };

    var paint = function () {
      var t0 = (window.performance && performance.now()) || 0;
      g.fillStyle = CARD_BG; g.fillRect(0, 0, W, H);
      g.lineWidth = LW;
      for (var i = 0; i < rings.length; i++) ring(rings[i]);
      lastMs = ((window.performance && performance.now()) || 0) - t0;
    };

    var prev = -1;
    var draw = function (t) {
      if (prev < 0 || t - prev > 0.5 || t < prev) prev = t;
      var dt = t - prev;
      prev = t;
      if (dt > 0.1) dt = 0.1;
      step(dt);
      paint();
    };
    draw.rest = function () { prev = -1; rest(); paint(); };
    /* a press drops a ring under the pointer: the depth is read back out of the
       y it was pressed at, so the new ring is the size that spot deserves */
    draw.add = function (x, y) {
      var p = Math.pow(Math.max(0, Math.min(1, (y - CY) / DROP)), 1 / 1.2);
      p = Math.max(0.02, Math.min(0.9, p));
      var u = (x - CX) / ((W / 2) * (0.3 + 0.7 * p));
      add(Math.max(-1.4, Math.min(1.4, u)), p, y - DROP * Math.pow(p, 1.2));
      paint();
    };
    window.__oasis = {
      count: function () { return rings.length; },
      radii: function () { var o = []; for (var i = 0; i < rings.length; i++) o.push(RMIN + SPAN * rings[i].p); return o; },
      alphas: function () {
        var o = [];
        for (var i = 0; i < rings.length; i++) {
          var p = rings[i].p;
          o.push({ p: +p.toFixed(3), nominal: +alphaAt(p).toFixed(3), drawn: +(alphaAt(p) * envAt(p)).toFixed(3) });
        }
        return o;
      },
      centres: function () {
        var o = [];
        for (var i = 0; i < rings.length; i++) {
          var r = rings[i];
          o.push({ p: +r.p.toFixed(2), x: Math.round(xAt(r, r.p)), y: Math.round(yAt(r, r.p)),
                   r: Math.round(RMIN + SPAN * r.p), sq: +sqAt(r.p).toFixed(2) });
        }
        return o;
      },
      rmin: RMIN, rmax: RMAX, cap: CAP, birth: BIRTH, lw: LW,
      ms: function () { return lastMs; },
      size: function () { return { w: W, h: H }; }
    };
    return draw;
  };

  /* drive them: one frame now, then ~30 fps while the card is on screen and awake */
  var minis = [];
  var addMini = function (id, make) {
    var cv = document.getElementById(id);
    if (!cv || !cv.getContext) return;
    var draw = make(cv);
    draw(0);
    minis.push({ cv: cv, row: cv.closest(".row"), draw: draw, vis: true });
  };
  addMini("miniField", makeField);
  addMini("miniExplode", makeExplode);
  addMini("miniBloom", makeBloom);
  addMini("miniUnfold", makeUnfold);
  addMini("miniOasis", makeOasis);

  /* ---------- 02 · the corridor: its buffer follows the card ----------
     Like the tri tiles, the scene is re-made (not re-scaled) at the size the
     layout gives it, so a wall edge is always one whole pixel wide. */
  (function () {
    var cv = document.getElementById("miniUnfold");
    if (!cv || !cv.getContext) return;
    var me = null;
    for (var i = 0; i < minis.length; i++) if (minis[i].cv === cv) me = minis[i];
    if (!me) return;
    var fit = function () {
      var r = cv.getBoundingClientRect();
      if (!r.width) return;
      var dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
      var w = Math.round(r.width * dpr), h = Math.round(r.width * 5 / 8 * dpr);
      if (cv.width === w && cv.height === h) return;
      cv.width = w; cv.height = h;
      me.draw = makeUnfold(cv);
      me.draw(0);
    };
    fit();
    var rt = null;
    addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(fit, 180); });
  })();

  /* ---------- 04 · the oasis: its buffer follows the card, and it listens ----------
     Same as the corridor: the rings are re-made at the size the layout gives the
     card, so a ring stays one whole pixel thick. The press listener is bound to
     the canvas once, and hands the current machine card pixels. */
  (function () {
    var cv = document.getElementById("miniOasis");
    if (!cv || !cv.getContext) return;
    var me = null;
    for (var i = 0; i < minis.length; i++) if (minis[i].cv === cv) me = minis[i];
    if (!me) return;
    var fit = function () {
      var r = cv.getBoundingClientRect();
      if (!r.width) return;
      var dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
      var w = Math.round(r.width * dpr), h = Math.round(r.width * 5 / 8 * dpr);
      if (cv.width === w && cv.height === h) return;
      cv.width = w; cv.height = h;
      me.draw = makeOasis(cv);
      me.draw(0);
    };
    fit();
    var rt = null;
    addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(fit, 180); });
    cv.addEventListener("pointerdown", function (e) {
      if (!me.draw.add) return;
      var r = cv.getBoundingClientRect();
      if (!r.width) return;
      var k = cv.width / r.width;
      me.draw.add((e.clientX - r.left) * k, (e.clientY - r.top) * k);
    });
  })();

  /* ---------- the tri-card (Experiments, now in the Playground; the index has no row for it): three machines share one card ----------
     The three tiles are ordinary minis (they are already in `minis`, so they
     wake and sleep with the row). All this block does is keep their pixel
     buffers matched to the tile the layout gives them, so the field never
     stretches. Re-made, not re-scaled: each machine is rebuilt at the new size. */
  (function () {
    var tri = document.querySelector("#work-experiments .tri");
    if (!tri) return;
    var MAKERS = { miniField: makeField, miniExplode: makeExplode, miniBloom: makeBloom };
    var fit = function () {
      for (var i = 0; i < minis.length; i++) {
        var m = minis[i], cv = m.cv;
        if (!MAKERS[cv.id] || !tri.contains(cv)) continue;
        var r = cv.getBoundingClientRect();
        if (!r.width) continue;
        var w = Math.max(96, Math.round(r.width)), h = Math.max(60, Math.round(r.width * 5 / 8));
        if (cv.width === w && cv.height === h) continue;
        cv.width = w; cv.height = h;
        m.draw = MAKERS[cv.id](cv);
        m.draw(0);
      }
    };
    fit();
    var rt = null;
    addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(fit, 180);
    });
  })();

  /* ---------- the three cases: pixel plates ----------
     Each case gets a machine drawn on an 80 × 50 grid of cells, the size of
     the orchids' pixels, then blown up onto the card with the smoothing off.
     `plate` hands a maker the small context and a `show` that copies it out. */
  var plate = function (cv, cols, rows, body) {
    var g = cv.getContext("2d"), W = cv.width, H = cv.height;
    var s = document.createElement("canvas"); s.width = cols; s.height = rows;
    var q = s.getContext("2d");
    var show = function () {
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, W, H);
      g.drawImage(s, 0, 0, cols, rows, 0, 0, W, H);
    };
    return body(q, cols, rows, show);
  };
  var poly = function (q, pts, fill) {
    q.fillStyle = fill; q.beginPath();
    for (var i = 0; i < pts.length; i++) { if (i) q.lineTo(pts[i][0], pts[i][1]); else q.moveTo(pts[i][0], pts[i][1]); }
    q.closePath(); q.fill();
  };

  /* ---------- 03 · ExplorEdge: a door left ajar ----------
     Night. The mark's three planes — the room, the floor, the door — in the
     brand's navy, teal and blue; the door swings on its hinge and a pale
     light widens across the floor as it opens; the stars keep time. At rest
     the door is a third open. */
  var makeEdge = function (cv) {
    return plate(cv, 80, 50, function (q, W, H, show) {
      var NAVY = "#29335d", ROOM = "#3e476d", BLUE = "#4371db", TEAL = "#4589b3";
      var stars = [];
      for (var i = 0; i < 18; i++) stars.push([Math.floor(Math.random() * W), Math.floor(Math.random() * H * 0.6), Math.random() * 6.2832, 0.8 + Math.random()]);
      var K = 0.42, OX = 5, OY = 0;                           /* the 160 × 120 mark, scaled onto the grid */
      var P = function (x, y) { return [OX + x * K, OY + y * K]; };
      var paint = function (o, t) {
        q.fillStyle = NAVY; q.fillRect(0, 0, W, H);
        for (var i = 0; i < stars.length; i++) {
          var st = stars[i], a = 0.18 + 0.5 * (0.5 + 0.5 * Math.sin(t * st[3] + st[2]));
          q.fillStyle = "rgba(207,227,247," + a.toFixed(2) + ")"; q.fillRect(st[0], st[1], 1, 1);
        }
        poly(q, [P(70, 14), P(132, 26), P(132, 92), P(70, 104)], ROOM);           /* the room */
        poly(q, [P(34, 90), P(70, 104), P(132, 92), P(100, 80)], TEAL);           /* the floor */
        if (o > 0.02) {                                                          /* the light on the floor */
          poly(q, [P(70, 104), P(70 - 44 * o, 118), P(72 + 10 * o, 121)], "rgba(207,227,247," + (0.16 + 0.3 * o).toFixed(2) + ")");
        }
        var k = 1 - 0.62 * o, tn = Math.tan(0.21 * o), fx = 70 - 36 * k;        /* the door, hinged at x = 70 */
        poly(q, [P(fx, 26 - 36 * k * tn), P(70, 14), P(70, 104), P(fx, 90 - 36 * k * tn)], BLUE);
        show();
      };
      var draw = function (t) { paint(0.3 + 0.7 * (0.5 - 0.5 * Math.cos(t * 0.8)), t); };
      draw.rest = function () { paint(0.3, 0); };
      draw.rest();
      return draw;
    });
  };

  /* ---------- 05 · Tutor Oriel: sign-up → students who stay ----------
     Students, two-cell ink squares, walk a path through three doors: sign up,
     pick a course, stay. For the first half of the loop the first door is the
     old one and every other student drops out of it; for the second half it
     is rebuilt, wide and mint, and everyone walks through and gathers at the
     end. At rest: the doors, a queue, a small crowd. */
  var makeOriel = function (cv) {
    return plate(cv, 80, 50, function (q, W, H, show) {
      var MINT = "#3cb28a", INK = "#241f1c", GREY = "rgba(36,31,28,0.28)";
      var Y = 38, GATES = [20, 42, 64], LOOP = 12, HALF = 6, SPEED = 11, EVERY = 0.55;
      var dots = [], stay = 0, born = 0, seq = 0, prev = -1, phase = -1;
      var gate = function (x, wide) {
        var w = wide ? 13 : 7, h = wide ? 24 : 18, top = Y - h;
        if (wide) { q.fillStyle = "rgba(60,178,138,0.16)"; q.fillRect(x - w / 2 - 3, top - 3, w + 6, h + 3); }
        q.fillStyle = MINT;
        q.fillRect(x - w / 2 - 2, top, 2, h); q.fillRect(x + w / 2, top, 2, h); q.fillRect(x - w / 2 - 2, top, w + 4, 2);
      };
      var scene = function (wide) {
        q.fillStyle = CARD_BG; q.fillRect(0, 0, W, H);
        q.fillStyle = "rgba(36,31,28,0.22)";
        for (var x = 2; x < W - 4; x += 3) q.fillRect(x, Y + 1, 1, 1);           /* the path, dotted */
        gate(GATES[0], wide); gate(GATES[1], false); gate(GATES[2], false);
        q.fillStyle = "rgba(60,178,138,0.35)"; q.fillRect(W - 3, Y - 22, 2, 23);   /* the shelf they gather on */
      };
      var dot = function (x, y, col) { q.fillStyle = col; q.fillRect(Math.round(x), Math.round(y), 3, 3); };
      var crowd = function (n) {
        for (var i = 0; i < n; i++) dot(W - 16 + (i % 3) * 4, Y - 2 - Math.floor(i / 3) * 4, i % 2 ? INK : MINT);
      };
      var step = function (dt, ph) {
        born += dt;
        while (born >= EVERY) { born -= EVERY; dots.push({ x: -3, y: Y - 3, id: seq++, fall: 0, a: 1 }); }
        for (var i = dots.length - 1; i >= 0; i--) {
          var d = dots[i];
          if (d.fall) { d.y += 22 * dt; d.a -= 1.6 * dt; if (d.a <= 0) dots.splice(i, 1); continue; }
          var nx = d.x + SPEED * dt;
          if (ph === 0 && d.id % 2 && d.x < GATES[0] && nx >= GATES[0]) d.fall = 1;     /* the old door loses one in two */
          d.x = nx;
          if (d.x > W - 18) { dots.splice(i, 1); if (stay < 12) stay++; }
        }
      };
      var paint = function (ph, t) {
        scene(ph === 1);
        for (var i = 0; i < dots.length; i++) {
          var d = dots[i];
          if (d.fall) dot(d.x, d.y, "rgba(36,31,28," + Math.max(0, d.a * 0.5).toFixed(2) + ")");
          else dot(d.x, d.y - (Math.floor(d.x) % 2), INK);
        }
        crowd(stay);
        show();
      };
      var draw = function (t) {
        var u = t % LOOP, ph = u < HALF ? 0 : 1;
        if (ph !== phase) { if (ph === 0) { dots.length = 0; stay = 0; } else { stay = Math.min(stay, 2); } phase = ph; }
        if (prev < 0 || t < prev || t - prev > 0.5) prev = t;
        var dt = Math.min(0.1, t - prev); prev = t;
        step(dt, ph);
        paint(ph, t);
      };
      draw.rest = function () {
        dots.length = 0; stay = 5; prev = -1; phase = -1;
        for (var i = 0; i < 6; i++) dots.push({ x: 3 + i * 9, y: Y - 3, id: i, fall: 0, a: 1 });
        paint(1, 0);
      };
      draw.rest();
      return draw;
    });
  };

  /* ---------- 06 · Instacart: a list → a comparison ----------
     Three pixel apples on a shelf, a price bar under each. Every 2.6 s the
     unit turns — per pack, per kilo — the bars regrow, the apples hop to
     their new order, and the carrot-orange tag hops to whichever is cheapest
     now. At rest: per pack, still. */
  var makeCart = function (cv) {
    return plate(cv, 80, 50, function (q, W, H, show) {
      var CREAM = "#faf1e5", GREEN = "#0aad0a", CARROT = "#ff7009", KALE = "#003d29";
      var SPR = ["....s....", "...sll...", ".rrr.rrr.", "rrrrrrrrr", "rhrrrrrrr", "rrrrrrrrr", "rrrrrrrrr", ".rrrrrrr.", "..rr.rr.."];
      var APPLES = [
        { r: "#d9302a", h: "#f07a6a", pack: 5.07, kg: 3.73 },          /* Gala, a bag       */
        { r: "#c4231f", h: "#ea6c5c", pack: 4.87, kg: 5.35 },          /* Honeycrisp, 2 lb  */
        { r: "#7cc242", h: "#b9e38a", pack: 6.50, kg: 6.50 }           /* a green one, loose */
      ];
      var SLOT = [15, 40, 65], SHELF = 30, TURN = 2.6, HOP = 0.5, BAR = 18;
      var sprite = function (a, x, y) {
        for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) {
          var ch = SPR[r].charAt(c); if (ch === ".") continue;
          q.fillStyle = ch === "s" ? KALE : ch === "l" ? GREEN : ch === "h" ? a.h : a.r;
          q.fillRect(x - 4 + c, y - 9 + r, 1, 1);
        }
      };
      var order = function (u) {                                     /* apple index per slot, cheapest first */
        var ix = [0, 1, 2]; ix.sort(function (i, j) { return APPLES[i][u] - APPLES[j][u]; }); return ix;
      };
      var ease = function (v) { return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; };
      var paint = function (u0, u1, f) {                              /* from unit u0 to u1, f of the way */
        var o0 = order(u0), o1 = order(u1), max = 0, i;
        for (i = 0; i < 3; i++) max = Math.max(max, APPLES[i][u1], APPLES[i][u0]);
        q.fillStyle = CREAM; q.fillRect(0, 0, W, H);
        q.fillStyle = "rgba(0,61,41,0.35)"; q.fillRect(4, SHELF, W - 8, 1);
        var e = ease(f);
        for (i = 0; i < 3; i++) {
          var s0 = o0.indexOf(i), s1 = o1.indexOf(i);
          var x = SLOT[s0] + (SLOT[s1] - SLOT[s0]) * e;
          var hop = s0 === s1 ? 0 : Math.sin(Math.PI * e) * 5;
          var v = APPLES[i][u0] + (APPLES[i][u1] - APPLES[i][u0]) * e;
          var best = f < 0.5 ? o0[0] === i : o1[0] === i;
          sprite(APPLES[i], Math.round(x), Math.round(SHELF - hop));
          q.fillStyle = best ? GREEN : "rgba(0,61,41,0.28)";
          q.fillRect(Math.round(x) - 9, SHELF + 6, Math.max(2, Math.round(BAR * v / max)), 3);
          if (best) { q.fillStyle = CARROT; q.fillRect(Math.round(x) - 9, SHELF + 11, 5, 2); q.fillRect(Math.round(x) - 8, SHELF + 13, 3, 1); }
        }
        show();
      };
      var draw = function (t) {
        var n = Math.floor(t / TURN), f = t - n * TURN;
        var u0 = n % 2 ? "kg" : "pack", u1 = n % 2 ? "pack" : "kg";
        paint(u0, u1, Math.min(1, f / HOP));
      };
      draw.rest = function () { paint("pack", "pack", 0); };
      draw.rest();
      return draw;
    });
  };
  addMini("miniEdge", makeEdge);
  addMini("miniOriel", makeOriel);
  addMini("miniCart", makeCart);

  if (minis.length && !reduced) {
    var wideMini = matchMedia("(min-width: 60rem)");
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) {
        for (var i = 0; i < es.length; i++) {
          for (var j = 0; j < minis.length; j++) {
            if (minis[j].cv === es[i].target) minis[j].vis = es[i].isIntersecting;
          }
        }
      }, { threshold: 0.1 });
      for (var mi = 0; mi < minis.length; mi++) io.observe(minis[mi].cv);
    }
    var last = 0, t0 = 0;
    var pump = function (now) {
      requestAnimationFrame(pump);
      if (!t0) t0 = now;
      if (now - last < 32) return;
      last = now;
      for (var i = 0; i < minis.length; i++) {
        var m = minis[i];
        var live = m.vis && !(wideMini.matches && m.row && !m.row.classList.contains("is-live"));
        if (!live) {
          if (m.awake && m.draw.rest) m.draw.rest();   /* asleep again: back to the first frame */
          m.awake = false;
          continue;
        }
        m.awake = true;
        m.draw((now - t0) / 1000);
      }
    };
    requestAnimationFrame(pump);
  }

  /* rows wake, titles flip, the film runs */
  var rows = document.querySelectorAll(".row");
  var film = document.getElementById("film");
  var wide = matchMedia("(min-width: 60rem)");

  var setLive = function (row, on) {
    row.classList.toggle("is-live", on);
    if (film && row.contains(film)) {
      if (on) { var p = film.play(); if (p && p.catch) p.catch(function () {}); }
      else film.pause();
    }
  };

  for (var ri = 0; ri < rows.length; ri++) {
    (function (row) {
      var over = false;
      row.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "touch") return;
        over = true;
        setLive(row, true);
      });
      row.addEventListener("pointerleave", function (e) {
        if (e.pointerType === "touch") return;
        over = false;
        setLive(row, false);
      });
      row.addEventListener("focusin", function () { setLive(row, true); });
      row.addEventListener("focusout", function (e) {
        if (!over && !row.contains(e.relatedTarget)) setLive(row, false);
      });
      var title = row.querySelector(".row__title");
      if (title) {
        title.addEventListener("click", function () {
          if (over) return;
          setLive(row, !row.classList.contains("is-live"));
        });
      }
    })(rows[ri]);
  }

  /* the film keeps its native controls hidden everywhere; the pixel button on
     the poster is the whole interface. Desktop hover still autoplays (the
     button fades out while it runs); a tap toggles play/pause. */
  if (film) {
    film.controls = false;
    var filmWrap = document.getElementById("filmWrap");
    var filmPlay = document.getElementById("filmPlay");
    var markFilm = function () {
      var on = !film.paused && !film.ended;
      if (filmWrap) filmWrap.classList.toggle("is-playing", on);
      if (filmPlay) filmPlay.setAttribute("aria-label", on ? "Pause the film" : "Play the film");
    };
    film.addEventListener("play", markFilm);
    film.addEventListener("pause", markFilm);
    film.addEventListener("ended", markFilm);
    if (filmPlay) {
      /* what you meant is what it was doing when you pressed: focusing the
         button already wakes the row (which starts the film), so reading
         film.paused at click time would flip a fresh tap straight back off. */
      var pressedPaused = null;
      filmPlay.addEventListener("pointerdown", function () { pressedPaused = film.paused; });
      filmPlay.addEventListener("click", function (e) {
        e.stopPropagation();
        var wantsPlay = pressedPaused === null ? film.paused : pressedPaused;
        pressedPaused = null;
        if (wantsPlay) { var pr = film.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else film.pause();
      });
    }
    markFilm();
  }

  /* ================= the stem: one orchid down the index =================
     A single plant is drawn in the left margin of the index: the same cool
     green stem as ORCHID.SPRAY, on the same 2 px raster, bending gently as it
     goes. It grows with the reading — the tip stays a little above the eye —
     and at every row a pedicel carries a bud that opens when the row wakes. */
  var stemCv = document.getElementById("stemCanvas");
  var indexSec = document.getElementById("index");
  if (stemCv && indexSec && window.ORCHID && rows.length) (function () {
    var O = window.ORCHID;
    var g = stemCv.getContext("2d");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var wideStem = matchMedia("(min-width: 60rem)");

    /* one crop window, centred on the flower's heart (32, 31), holds the bud,
       all six opening frames and both breaths — so a frame swap never moves */
    var SRC = { x: 4, y: 5, w: 56, h: 52 };
    var SP = {
      bud: O.bake(O.BUD),
      open: [O.bake(O.OPEN[0]), O.bake(O.OPEN[1]), O.bake(O.OPEN[2]),
             O.bake(O.OPEN[3]), O.bake(O.OPEN[4]), O.bake(O.OPEN[5])],
      front: O.bake(O.FRONT),
      lift: O.bake(O.LIFT)
    };
    var GREEN = O.PAL.s[0], GREEN_D = O.PAL.S[0];   /* the spray's own stem green */

    var B = 2;                                      /* every block is 2 px */
    var snap = function (v) { return Math.round(v / B) * B; };

    var COL = 92, S = 1, BASE = 18, AMP = 14;
    var TAPER = 24;                   /* the first 24 px: the blocks come in */
    var PDX = 14, PDY = 10;           /* the pedicel: 17 px long, out at 36° */
    var docTop = 0, SECH = 0, END = 0;
    var anchors = [];                 /* one per row: { cy, cx, sx, sy, ex } */
    var drawn = 0;                    /* stem laid down so far — never shrinks */
    var lastMs = 0;

    /* the bend: three gentle turns from the top of the section to the tip —
       one and a half waves, so no stretch of stem is ever straight for long */
    var curve = function (y) {
      var k = END > 0 ? y / END : 0;
      var th = k * Math.PI * 3 - Math.PI / 2;          /* one and a half waves */
      /* part sine, part triangle: the three bends stay gentle, but the stem
         keeps leaning even at the turns, so no column of blocks runs long */
      var w = 0.55 * Math.sin(th) + 0.45 * (2 / Math.PI) * Math.asin(Math.sin(th));
      return BASE + AMP * w;
    };
    var stemX = function (y) { return snap(curve(y)); };

    /* one block of stem, one of shade; near the top they arrive by halves */
    var drawStemRange = function (y0, y1) {
      if (y1 <= y0) return;
      y0 = Math.max(0, snap(y0)); y1 = Math.min(drawn, y1);
      var prev = y0 > 0 ? stemX(y0 - B) : null;
      for (var y = y0; y < y1; y += B) {
        var x = stemX(y);
        var a = y < TAPER ? 0.2 + 0.8 * (y / TAPER) : 1;
        g.globalAlpha = a;
        g.fillStyle = GREEN;
        if (prev !== null && prev !== x) {
          var lo = Math.min(x, prev), hi = Math.max(x, prev);
          g.fillRect(lo, y, hi - lo + B, B);
        } else {
          g.fillRect(x, y, B, B);
        }
        if (y >= TAPER / 2) {                       /* the shade joins later */
          g.globalAlpha = y < TAPER ? a * 0.8 : 1;
          g.fillStyle = GREEN_D;
          g.fillRect(x + B, y, B, B);
        }
        prev = x;
      }
      g.globalAlpha = 1;
    };

    /* the pedicel: one block thick, out of the stem at 36° for 17 px */
    var drawPedicel = function (a) {
      var n = Math.round(PDX / B), prevY = null;
      g.fillStyle = GREEN_D;
      for (var i = 0; i <= n; i++) {
        var x = a.sx + i * B, y = snap(a.sy + (a.cy - a.sy) * (i / n));
        if (prevY !== null && y !== prevY) g.fillRect(x, Math.min(y, prevY), B, Math.abs(y - prevY) + B);
        else g.fillRect(x, y, B, B);
        prevY = y;
      }
    };

    /* per-row bloom state: f 0..5, dir +1 opening / -1 closing / 0 at rest */
    var states = [];
    for (var si = 0; si < rows.length; si++) states.push({ f: 0, dir: 0, t: 0, breath: 0 });

    var spriteOf = function (st) {
      if (st.dir === 0 && st.f === 0) return SP.bud;
      if (st.dir === 0 && st.f === 5) return st.breath ? SP.lift : SP.front;
      return SP.open[st.f];
    };

    var BW = function () { return SRC.w * S; };
    var BH = function () { return SRC.h * S; };

    var drawBud = function (i) {
      var a = anchors[i]; if (!a || drawn < a.cy) return;
      var img = spriteOf(states[i]);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, SRC.x, SRC.y, SRC.w, SRC.h,
                  Math.round(a.cx - BW() / 2), Math.round(a.cy - BH() / 2), BW(), BH());
    };

    /* a frame costs one band: clear it, put the stem back, draw the flower */
    var paintBud = function (i) {
      var a = anchors[i]; if (!a) return;
      var t0 = performance.now();
      var y0 = Math.max(0, a.cy - BH() / 2 - 12), y1 = Math.min(SECH, a.cy + BH() / 2 + 12);
      g.clearRect(0, y0, COL, y1 - y0);
      drawStemRange(y0, y1);
      if (drawn >= a.cy) { drawPedicel(a); drawBud(i); }
      lastMs = performance.now() - t0;
    };

    var paintAll = function () {
      var t0 = performance.now();
      g.clearRect(0, 0, COL, SECH);
      drawStemRange(0, drawn);
      for (var i = 0; i < anchors.length; i++) {
        if (drawn >= anchors[i].cy) { drawPedicel(anchors[i]); drawBud(i); }
      }
      lastMs = performance.now() - t0;
    };

    var measure = function () {
      var sec = indexSec.getBoundingClientRect();
      COL = Math.round(stemCv.getBoundingClientRect().width) || 92;
      S = COL >= 140 ? 2 : 1;
      BASE = S === 2 ? 30 : 20;
      AMP = S === 2 ? 22 : 18;
      SECH = Math.round(sec.height);
      docTop = sec.top + window.scrollY;
      stemCv.width = Math.round(COL * dpr);
      stemCv.height = Math.round(SECH * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var last = 0, mids = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        mids.push(snap(r.top - sec.top + r.height / 2));
        last = Math.max(last, r.bottom - sec.top);
      }
      END = Math.min(SECH, Math.round(last + 32));
      /* the pedicel leaves the stem where the stem actually is, so the bud
         rides the bend; the bloom is then nudged back inside the column */
      anchors = [];
      var lo = 27 * S, hi = COL - 28 * S;
      for (i = 0; i < rows.length; i++) {
        var cy = mids[i], sy = snap(Math.max(0, cy - PDY)), sx = stemX(sy) + B;
        var ex = sx + PDX;
        anchors.push({ cy: cy, sy: sy, sx: sx, ex: ex,
                       cx: Math.max(lo, Math.min(hi, ex + 16 * S)), row: rows[i] });
      }
      if (drawn > END) drawn = END;
      if (reduced) drawn = END;
    };

    /* how far the reading has got: everything the viewport's 70 % line has
       passed is drawn, and it never comes back up */
    var grow = function () {
      var want = Math.min(END, Math.round(window.scrollY + window.innerHeight * 0.7 - docTop));
      /* at the bottom of the page there is no more scrolling to do: let the
         last stretch finish, so the plant ends 32 px below the final row */
      var maxY = document.documentElement.scrollHeight - window.innerHeight;
      if (window.scrollY >= maxY - 2) want = END;
      if (want <= drawn) return false;
      var y0 = drawn;
      drawn = want;
      drawStemRange(y0, drawn);
      for (var i = 0; i < anchors.length; i++) {
        if (anchors[i].cy >= y0 - BH() / 2 - 12 && anchors[i].cy <= drawn) paintBud(i);
      }
      return true;
    };

    /* which flower is open: the live row on a wide screen (one at a time, the
       most recent wins), the row nearest the middle of the screen on a phone */
    var seq = 0, order = [];
    for (var oi = 0; oi < rows.length; oi++) order.push(0);
    var wantOpen = function () {
      var i, best = -1, bestSeq = 0;
      for (i = 0; i < rows.length; i++) {
        if (rows[i].classList.contains("is-live") && order[i] > bestSeq) { bestSeq = order[i]; best = i; }
      }
      if (best >= 0) return best;
      if (wideStem.matches) return -1;
      var mid = window.innerHeight / 2, bd = 1e9;
      for (i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        var d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };

    var raf = 0;
    var tick = function (now) {
      raf = 0;
      var busy = false;
      for (var i = 0; i < states.length; i++) {
        var st = states[i], moved = false;
        if (st.dir > 0) {
          if (reduced) { st.f = 5; st.dir = 0; st.t = now; moved = true; }
          else { while (now - st.t >= 90 && st.f < 5) { st.f++; st.t += 90; moved = true; }
                 if (st.f >= 5) { st.dir = 0; st.t = now; } }
        } else if (st.dir < 0) {
          if (reduced) { st.f = 0; st.dir = 0; moved = true; }
          else { while (now - st.t >= 70 && st.f > 0) { st.f--; st.t += 70; moved = true; }
                 if (st.f <= 0) { st.dir = 0; } }
        } else if (st.f === 5 && !reduced) {
          var b = Math.floor((now - st.t) / 800) % 2;
          if (b !== st.breath) { st.breath = b; moved = true; }
        }
        if (moved) paintBud(i);
        if (st.dir !== 0 || (st.f === 5 && !reduced)) busy = true;
      }
      if (busy) raf = requestAnimationFrame(tick);
    };
    var wake = function () { if (!raf) raf = requestAnimationFrame(tick); };

    var sync = function () {
      var want = wantOpen(), now = performance.now(), moved = false;
      for (var i = 0; i < states.length; i++) {
        var st = states[i], on = (i === want);
        if (on && st.dir <= 0 && st.f < 5) { st.dir = 1; st.t = now; moved = true; }
        else if (!on && (st.dir > 0 || st.f > 0)) { st.dir = -1; st.t = now; moved = true; }
      }
      if (moved) wake();
    };

    /* hooks: the rows keep their own behaviour, the stem only watches it */
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var idx = Array.prototype.indexOf.call(rows, recs[i].target);
        if (idx >= 0 && rows[idx].classList.contains("is-live")) order[idx] = ++seq;
      }
      sync();
    });
    for (var mi = 0; mi < rows.length; mi++) mo.observe(rows[mi], { attributes: true, attributeFilter: ["class"] });

    var pending = 0;
    var onScroll = function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = 0;
        grow();
        if (!wideStem.matches) sync();
      });
    };

    var relayout = function () { measure(); paintAll(); grow(); sync(); };

    measure();
    paintAll();
    grow();
    sync();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", relayout);
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(indexSec);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

    window.__stem = {
      col: function () { return COL; },
      scale: function () { return S; },
      len: function () { return drawn; },
      end: function () { return END; },
      buds: function () {
        var out = [];
        for (var i = 0; i < anchors.length; i++) {
          var r = rows[i].getBoundingClientRect(), sec = indexSec.getBoundingClientRect();
          out.push({ cx: anchors[i].cx, cy: anchors[i].cy,
                     sx: anchors[i].sx, sy: anchors[i].sy, ex: anchors[i].ex,
                     rowCentre: Math.round(r.top - sec.top + r.height / 2),
                     off: Math.abs(anchors[i].cy - Math.round(r.top - sec.top + r.height / 2)),
                     shown: drawn >= anchors[i].cy });
        }
        return out;
      },
      frames: function () { var o = []; for (var i = 0; i < states.length; i++) o.push(states[i].f); return o; },
      dirs: function () { var o = []; for (var i = 0; i < states.length; i++) o.push(states[i].dir); return o; },
      breaths: function () { var o = []; for (var i = 0; i < states.length; i++) o.push(states[i].breath); return o; },
      open: function () { var o = []; for (var i = 0; i < states.length; i++) if (states[i].f === 5 && states[i].dir === 0) o.push(i); return o; },
      ms: function () { return lastMs; },
      reduced: reduced
    };
  })();
})();
