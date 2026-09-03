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

    /* the two blank pills: empty on purpose — clicking one goes to the work */
    var pills = paper.querySelectorAll(".pill");
    for (var pi = 0; pi < pills.length; pi++) {
      pills[pi].setAttribute("data-go", "#index");
      pills[pi].addEventListener("click", function (e) {
        e.stopPropagation();
        var t = document.querySelector("#index");
        if (t) t.scrollIntoView({ block: "start" });
      });
    }

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
    var BUCKETS = 10, RIP = 180, RIP2 = RIP * RIP;

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
      for (var i = 0; i < NC; i++) {
        var x = CX[i], y = CY[i], tt = t, boost = 0;
        if (ptrOn) {
          var dx = x - pxS, dy = y - pyS, d2 = dx * dx + dy * dy;
          if (d2 < RIP2) {
            var f = 1 - d2 / RIP2;
            f *= f;
            boost = 0.115 * f;                       /* the ripple raises alpha */
            tt = t + f * 2.6;                        /* and shifts the phase */
          }
        }
        var n = 0.5 + 0.5 * noise(x, y, tt);
        var a = A_MIN + A_SPAN * n * n + boost;      /* skewed low: the field stays airy */
        var k = (a / 0.24 * BUCKETS) | 0;
        if (k < 1) continue;
        if (k > BUCKETS - 1) k = BUCKETS - 1;
        BIDX[k][BLEN[k]++] = i;
      }
      for (b = 1; b < BUCKETS; b++) {
        var n2 = BLEN[b];
        if (!n2) continue;
        fctx.fillStyle = "rgba(" + TILE_RGB + "," + ((b + 0.5) / BUCKETS * 0.24).toFixed(3) + ")";
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

    /* ---------- layer 2 · the orchids, from the shared ORCHID sprites ----------
       Nothing is drawn with paths any more. Every flower here is one of the shared
       64×64 blooms or the 160×96 spray from orchid-sprites.js, baked once at 1 px per
       cell and blitted at an integer zoom onto whole pixels — the same sprites /about
       hangs on its walls. */
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
    var LEAD = 6 * STEP;                             /* one bloom opens, then the next */

    var stm = document.getElementById("paperStamps");
    var sctx = stm && stm.getContext ? stm.getContext("2d", { willReadFrequently: true }) : null;

    var narrow = function () { return FW < 560; };
    var ZOOM = function () { return narrow() ? 1.5 : 2; };  /* bloom 128 / 96 px      */

    var CLICK_HOLD = 1000, CLICK_FADE = 3000;        /* open, wait 1 s, fade over 3 s */
    var AMB_HOLD = 16000, AMB_SPAN = 8000, AMB_FADE = 1500;  /* a spray lives 16–24 s */
    var AMB_MAX = 2;                                 /* one or two sprays at a time   */
    var AMB_GAP = 1.4;                               /* … 1.4 × a spray's width apart */
    var BLOOM_GAP = 1.2;                             /* … a bloom: 1.2 × its own size */
    var MAX_STAMPS = 24;
    var stamps = [], variant = 0, dirty = false;

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

    var drawStamps = function (now) {
      if (!sctx || !SP) return;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, stm.width, stm.height);
      sctx.imageSmoothingEnabled = false;
      var busy = false, i, k;
      for (i = 0; i < stamps.length; i++) {
        var s = stamps[i], age = now - s.t0, over = age - s.life, alpha = 1;
        if (over > 0) { alpha = 1 - over / s.fade; busy = true; }
        else if (!reduced) busy = true;
        if (alpha <= 0) { s.dead = 1; s.alpha = 0; continue; }
        s.alpha = alpha;
        sctx.globalAlpha = alpha;
        var z = s.z * DP;
        if (s.kind === "spray") {
          var X = Math.round(s.x * DP - SW * z / 2), Y = Math.round(s.y * DP - SH * z / 2);
          if (reduced) { blit(SP.spray, X, Y, SW * z, SH * z); s.frame = 5; }
          else {
            blit(SP.stem, X, Y, SW * z, SH * z);     /* the stem and the tip bud     */
            s.frame = 0;
            for (k = 0; k < SP.sb.length; k++) {     /* painted far → near …         */
              var b = SP.sb[k];
              var bage = age - (SP.sb.length - 1 - k) * LEAD;   /* … opened low → high */
              if (bage < 0) continue;
              var bf = frameOf(bage, STEP);
              blit(sprayBloomImg(b, bf, breathOf(bage, STEP)),
                   X + b.x * z, Y + b.y * z, b.w * z, b.h * z);
              if (k === SP.sb.length - 1) s.frame = bf;          /* the lowest bloom  */
            }
          }
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
    var stamp = function (x, y, click) {
      if (!SP) return stamps.length;
      var z = ZOOM(), side = BW * z, half = side / 2;
      x = Math.max(half * 0.6, Math.min(FW - half * 0.6, x));
      y = Math.max(half * 0.6, Math.min(FH - half * 0.6, y));
      var tq = (variant % 2) === 1;
      variant = (variant + 1) % 2;
      if (click) count();
      return push({ kind: "bloom", x: x, y: y, z: z, w: side, h: side, tq: tq, step: STEP,
                    t0: performance.now(), click: !!click, dead: 0, alpha: 1, frame: 0,
                    life: 6 * STEP + CLICK_HOLD, fade: CLICK_FADE });
    };

    /* the ambient one: a whole spray, opening bloom by bloom from the bottom up */
    var spray = function (x, y) {
      if (!SP) return stamps.length;
      var z = ZOOM();
      return push({ kind: "spray", x: x, y: y, z: z, w: SW * z, h: SH * z, step: STEP,
                    t0: performance.now(), click: false, dead: 0, alpha: 1, frame: 0,
                    life: AMB_HOLD + Math.random() * AMB_SPAN, fade: AMB_FADE });
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
        if (!ptrOn) { pxS = pxT; pyS = pyT; ptrOn = true; }
      }
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

    /* ---------- the moodboard grows by itself ---------- */
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
      add(plate, 24);
      add(topbar, 16);
      add(hint, 16);                                       /* the hint line and its ↓ */
      return out;
    };

    var ambLive = function () {
      var n = 0, now = performance.now();
      for (var i = 0; i < stamps.length; i++) {
        var s = stamps[i];
        if (s.kind === "spray" && !s.dead && now - s.t0 <= s.life) n++;
      }
      return n;
    };

    var place = function (w, h) {                          /* rejection sampling, 60 tries */
      var ko = keepOut(), hw = w / 2, hh = h / 2, i, k;
      for (i = 0; i < 60; i++) {
        var pad = (i < 45 ? 24 : 4);                       /* prefer some air at the edges */
        var spanW = FW - 2 * (pad + hw), spanH = FH - 2 * (pad + hh);
        if (spanW <= 0 || spanH <= 0) continue;
        var x = pad + hw + Math.random() * spanW, y = pad + hh + Math.random() * spanH, bad = false;
        for (k = 0; k < ko.length && !bad; k++) {          /* plate, top bar, hint */
          var q = ko[k];
          bad = x + hw > q[0] && x - hw < q[2] && y + hh > q[1] && y - hh < q[3];
        }
        for (k = 0; k < stamps.length && !bad; k++) {
          var o = stamps[k];
          if (o.dead) continue;
          var dx = Math.abs(x - o.x), dy = Math.abs(y - o.y);
          if (o.kind === "spray") {                        /* 1.4 × a spray's width apart */
            var need = AMB_GAP * Math.max(w, o.w);
            bad = dx * dx + dy * dy < need * need;
          } else {                                         /* a bloom: 1.2 × its own size */
            bad = dx < (w + o.w * BLOOM_GAP) / 2 && dy < (h + o.h * BLOOM_GAP) / 2;
          }
        }
        if (!bad) return [x, y];
      }
      return null;                                         /* no room this tick: skip it */
    };

    var grow = function () {
      if (!SP || ambLive() >= AMB_MAX) return;
      var z = ZOOM(), p = place(SW * z, SH * z);
      if (p) spray(p[0], p[1]);
    };

    var seen = true, timer = 0;
    var awake = function () { return seen && !document.hidden && FW > 0 && FH > 0; };
    var fire = function () {
      timer = 0;
      if (!awake()) return;
      grow();
      timer = setTimeout(fire, 5000 + Math.random() * 3000);   /* one every 5 – 8 s */
    };
    var wake = function () { if (awake() && !timer) timer = setTimeout(fire, 600); };
    var sleep = function () { if (timer) { clearTimeout(timer); timer = 0; } };

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        for (var i = 0; i < es.length; i++) seen = es[i].intersectionRatio >= 0.3;
        if (seen) wake(); else sleep();
      }, { threshold: [0, 0.15, 0.3, 0.6, 1] }).observe(paper);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) sleep(); else wake();
    });
    timer = setTimeout(fire, 600);                         /* the first one, ~600 ms in */

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
                 click: !!s.click, age: now - s.t0, life: s.life });
      }
      return a;
    };
    window.__hero = {
      stamps: ambLive,                                     /* the ambient sprays, still living */
      ambient: ambLive,
      clicked: function () {
        var n = 0;
        for (var i = 0; i < stamps.length; i++) if (stamps[i].click && !stamps[i].dead) n++;
        return n;
      },
      list: snap,
      cursor: function () { return { on: curOn, x: cxS, y: cyS, tx: cxT, ty: cyT, cell: PITCH }; },
      sprites: function () { return SP; },                 /* the baked orchid canvases */
      zoom: ZOOM,
      rect: function () { return paper.getBoundingClientRect(); },
      awake: awake,
      total: function () { return stamps.length; },
      ms: function () { return frameMs || lastMs; },
      fieldMs: function () { return lastMs; },
      cells: function () { return NC; },
      running: function () { return !!raf; }
    };
  })();

  /* ---------- card miniatures (03/04/05): tiny live versions of the labs ---------- */
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
  /* 03 — Field: white streaks drifting along a small X-shaped flow, short fading tails.
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

  /* 04 — the picture bursts outward, then remembers itself */
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

  /* 05 — Bloom: small pastel flowers growing out of a grate in a concrete slab */
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

  /* ---------- 03 · the tri-card: three machines share one card ----------
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

  /* ---------- 04 · Tutor Oriel: the cover, mosaicked at 6 px ----------
     The cover is drawn once into an off-screen buffer at one pixel per 6 px
     cell, then blown back up with the smoothing off — nearest neighbour, so
     every cell is one flat colour. While the row is live the whole plate
     breathes between 0.86 and 1 alpha over the card ground. If W2's cover is
     not on disk yet, a pixel mosaic of the registration screen stands in
     (window.__orielCover reports which). */
  (function () {
    var cv = document.getElementById("orielCover");
    if (!cv || !cv.getContext) return;
    var CELL = 6, g = cv.getContext("2d"), src = null, small = null, ready = false;

    var placeholder = function (w, h) {
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var q = c.getContext("2d");
      q.fillStyle = "#e8eef5"; q.fillRect(0, 0, w, h);
      q.fillStyle = "rgba(36,31,28,0.05)";
      for (var gx = 0; gx < w; gx += 12) q.fillRect(gx, 0, 1, h);
      var px = w * 0.18, pw = w * 0.64, py = h * 0.1, ph = h * 0.8;
      q.fillStyle = "#ffffff"; q.fillRect(px, py, pw, ph);                 /* the screen */
      q.fillStyle = "#3c6f9e"; q.fillRect(px, py, pw, ph * 0.16);          /* its header */
      q.fillStyle = "#c7dcee";
      for (var i = 0; i < 4; i++) q.fillRect(px + pw * 0.1, py + ph * (0.3 + i * 0.14), pw * 0.8, ph * 0.08);
      q.fillStyle = "#241f1c"; q.fillRect(px + pw * 0.1, py + ph * 0.86, pw * 0.44, ph * 0.09);
      return c;
    };

    var fit = function () {
      var r = cv.getBoundingClientRect();
      if (!r.width) return false;
      var dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
      var w = Math.round(r.width * dpr), h = Math.round(r.width * 5 / 8 * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; small = null; }
      return true;
    };

    var mosaic = function () {
      var w = cv.width, h = cv.height;
      var dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
      var cell = CELL * dpr;
      var cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
      small = document.createElement("canvas"); small.width = cw; small.height = ch;
      var q = small.getContext("2d");
      /* cover the cell grid with the image, centre-cropped */
      var sw = src.width, sh = src.height;
      var k = Math.max(cw / sw, ch / sh);
      var dw = sw * k, dh = sh * k;
      q.drawImage(src, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    };

    var paint = function (a) {
      if (!ready) return;
      if (!small) mosaic();
      var w = cv.width, h = cv.height;
      var dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
      var cell = CELL * dpr;
      g.globalAlpha = 1;
      g.fillStyle = CARD_BG; g.fillRect(0, 0, w, h);
      g.globalAlpha = a;
      g.imageSmoothingEnabled = false;
      g.drawImage(small, 0, 0, small.width, small.height, 0, 0, small.width * cell, small.height * cell);
      g.globalAlpha = 1;
    };

    /* the plate joins the other minis at once, so it is observed and gated by
       the row exactly as they are; it simply draws nothing until the cover is in */
    minis.push({ cv: cv, row: cv.closest(".row"), vis: true,
                 draw: function (t) { paint(0.86 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.15))); } });

    var start = function (img, kind) {
      src = img; ready = true;
      window.__orielCover = kind;
      fit(); small = null; paint(1);
    };
    var rt = null;
    addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (fit()) { small = null; paint(1); } }, 180);
    });

    var img = new Image();
    img.onload = function () { start(img, "cover"); };
    img.onerror = function () { fit(); start(placeholder(cv.width || 480, Math.round((cv.width || 480) * 5 / 8)), "placeholder"); };
    img.src = "assets/tutor-oriel/cover.png";
  })();

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
