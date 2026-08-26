/* Thea · Translations — three toys. */
(function () {
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 01 · Unfold — fold open + look around ---------- */
  var toyUnfold = document.getElementById("toyUnfold");
  if (toyUnfold) {
    var net = toyUnfold.querySelector(".net");
    var gaze = toyUnfold.querySelector(".gaze");

    toyUnfold.addEventListener("click", function () {
      var open = net.classList.toggle("is-open");
      toyUnfold.setAttribute("aria-pressed", open ? "true" : "false");
    });

    if (!reduced) {
      var raf = null;
      toyUnfold.addEventListener("pointermove", function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          var r = toyUnfold.getBoundingClientRect();
          var px = ((e.clientX - r.left) / r.width) * 2 - 1;
          var py = ((e.clientY - r.top) / r.height) * 2 - 1;
          gaze.style.setProperty("--px", Math.max(-1, Math.min(1, px)).toFixed(3));
          gaze.style.setProperty("--py", Math.max(-1, Math.min(1, py)).toFixed(3));
        });
      });
      toyUnfold.addEventListener("pointerleave", function () {
        gaze.style.setProperty("--px", 0);
        gaze.style.setProperty("--py", 0);
      });
    }
  }

  /* ---------- 02 · Light on Light — tap to draw ---------- */
  var toyDraw = document.getElementById("toyDraw");
  if (toyDraw) {
    var sketch = toyDraw.querySelector(".sketch");
    var kinds = ["d-star", "d-sprout", "d-heart", "d-spiral", "d-sun"];
    var ki = 0, stamped = 0;
    var NS = "http://www.w3.org/2000/svg";
    var XLINK = "http://www.w3.org/1999/xlink";

    toyDraw.addEventListener("click", function (e) {
      var r = sketch.getBoundingClientRect();
      var x, y;
      if (e.clientX || e.clientY) {
        x = ((e.clientX - r.left) / r.width) * 240;
        y = ((e.clientY - r.top) / r.height) * 240;
      } else {
        // keyboard activation — land somewhere near the middle
        x = 90 + Math.random() * 60;
        y = 90 + Math.random() * 60;
      }
      x = Math.max(30, Math.min(210, x));
      y = Math.max(30, Math.min(210, y));

      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "doodle");
      var rot = (Math.random() * 24 - 12).toFixed(1);
      var scl = (0.8 + Math.random() * 0.5).toFixed(2);
      g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + rot + ") scale(" + scl + ")");
      var use = document.createElementNS(NS, "use");
      use.setAttribute("href", "#" + kinds[ki]);
      use.setAttributeNS(XLINK, "xlink:href", "#" + kinds[ki]);
      g.appendChild(use);
      sketch.appendChild(g);

      ki = (ki + 1) % kinds.length;
      stamped++;
      if (stamped % 4 === 0) g.classList.add("is-accent");

      // let the initial dashoffset apply, then draw
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { g.classList.add("is-on"); });
      });

      // keep the paper from crowding — oldest fades away past 12
      var doodles = sketch.querySelectorAll(".doodle");
      if (doodles.length > 12) {
        var old = doodles[0];
        old.classList.add("is-out");
        setTimeout(function () { old.remove(); }, 450);
      }
    });
  }

  /* ---------- 03 · The Energy Exchange — tap to trade ---------- */
  var toySwap = document.getElementById("toySwap");
  if (toySwap) {
    var pulse = toySwap.querySelector(".trade__pulse");
    var arcTop = toySwap.querySelector(".trade__arc--top");
    var arcBot = toySwap.querySelector(".trade__arc--bot");
    var chargeA = toySwap.querySelector(".trade__charge--a");
    var chargeB = toySwap.querySelector(".trade__charge--b");
    var PATH_LR = 'path("M 78 100 Q 120 58 162 100")';
    var PATH_RL = 'path("M 162 140 Q 120 182 78 140")';
    var a = 3, b = 1, flying = false;
    var supportsOffset = window.CSS && CSS.supports && CSS.supports("offset-path", 'path("M 0 0 L 1 1")');

    function paint() {
      chargeA.style.setProperty("--c", (0.3 + 0.19 * a).toFixed(2));
      chargeB.style.setProperty("--c", (0.3 + 0.19 * b).toFixed(2));
    }
    paint();

    toySwap.addEventListener("click", function () {
      if (flying) return;
      var leftToRight = a >= b;
      if ((leftToRight && a === 0) || (!leftToRight && b === 0)) return;

      var settle = function () {
        if (leftToRight) { a--; b++; } else { b--; a++; }
        paint();
        pulse.classList.remove("is-flying");
        arcTop.classList.remove("is-live");
        arcBot.classList.remove("is-live");
        flying = false;
      };

      if (!supportsOffset || reduced) { settle(); return; }

      flying = true;
      var arc = leftToRight ? arcTop : arcBot;
      arc.classList.add("is-live");
      pulse.style.transition = "none";
      pulse.style.offsetPath = leftToRight ? PATH_LR : PATH_RL;
      pulse.style.offsetDistance = "0%";
      pulse.classList.add("is-flying");
      void pulse.getBoundingClientRect();
      pulse.style.transition = "";
      pulse.style.offsetDistance = "100%";

      var done = false;
      var finish = function () { if (!done) { done = true; settle(); } };
      pulse.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, 900); // safety net
    });
  }
})();
