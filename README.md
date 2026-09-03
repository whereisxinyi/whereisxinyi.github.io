# Xinyi Zhang

Personal site. Static, no framework, no build step: plain HTML, CSS and one script.

**Live: <https://whereisxinyi.github.io/>**

## Type

One typeface for the whole site: **Fraunces** (variable — `ital, opsz 9..144, wght 300..600, SOFT, WONK`), in three voices. Display —
`font-weight: 420; font-variation-settings: "opsz" 144, "SOFT" 100, "WONK" 1; font-feature-settings: "dlig" 1, "ss01" 1, "calt" 1; letter-spacing: -0.01em` —
so headings, card titles and the About sentence get the light wonky cut (swash `&`, `ct` ligature, soft
terminals). Body is 400 with `"opsz" 14, "SOFT" 30, "WONK" 0` and `line-height: 1.55`. What used to be mono
(numbers, hints, notes, counters, the footer strip, control labels, the hero name line, the flipped card
faces) is 400 *italic* at small sizes with `"opsz" 12, "SOFT" 0, "WONK" 0` and `letter-spacing: 0.02em`;
digits that align get `font-variant-numeric: tabular-nums` and the old uppercase labels get
`font-variant-caps: all-small-caps`. The values live in `tokens.css` as `--wght-display` / `--vf-display` /
`--ff-display` / `--track-display` / `--vf-body` / `--vf-label` / `--track-label`, with `.u-display`,
`.u-body` and `.u-label` utilities; `--font-body` and `--font-mono` are kept as token names but both
resolve to Fraunces.

## The page

- **Hero** — pixel glass. A grid of translucent glass tiles breathes with a slow noise field and
  ripples under the cursor. Phalaenopsis sprays (pixel-art sprites from `orchid-sprites.js`, white
  petals with blue shade) grow on their own while you are on the sheet — one or two at a time, each
  bloom opening bottom-up in six frames, then breathing; a click opens a single bloom that fades
  out after three seconds.
  The name line `Xinyi Translates [ ] Into [ ]` cycles four pairs of glyphs; clicking a pill scrolls
  to that work. A fixed glass top bar carries the `;` tile + Xinyi Zhang and Work / About.
- **Stem** — one pixel orchid stem grows down the left of the Work list as you scroll; each row hangs a bud that opens while the row is live.
- **Index** — five works in two groups, each on a glass tile that raises and resolves out of a pixel dissolve on
  hover (tap the title on touch).
- **Footer** — counts the orchids stamped today (kept in `localStorage`, per day).

## Works

Translations
- 01 **Light on Light** — fleeting words become visual gifts · <https://light-on-light.vercel.app/>
- 02 **Unfold** — a flat image becomes a space you can walk through · <https://whereisxinyi.github.io/resonance-exhibition/>
- 03 **White Noise Oasis** — white noise, translated into a visual you can play, with its Spotify
  tracks. The card is a live drawing of it: thin hand-wobbled ink rings drift out in perspective
  (wider, lower and faster as they come), a new one every ~700 ms, and a click drops one where you
  press · <https://xinyizhangx.github.io/Links/>

Work
- 04 **Experiments** — Field, Explode, Bloom: three ways an image becomes an event. The card is a
  tri-tile, one live miniature per machine; the CTA opens `lab/` · `lab/`
- 05 **Tutor Oriel** — a tutoring platform's registration and course selection, rebuilt after usability
  tests to stop drop-off. The card is the cover mosaicked at 6 px cells ·
  `work/tutor-oriel/` · archive: <https://xinyizhangx.com/uiux>


`about.html` — the one sentence plus two education lines, on a Barcelona-Pavilion free plan: eight fixed
pixel columns, every click slides in a wall of blooms (onyx / marble / glass), the cursor is you (walls hide
what is behind them, glass does not), a pool reflects everything, the seventh wall reveals *Der Morgen*,
the eighth click clears back to one plane; hover any bloom for a ×4 detail; hold, magnet and double-click `;`.

## The lab pages

Each is standalone: its own CSS and JS, a sample image drawn on load, and an upload by
file picker, drag-and-drop or paste. Everything runs in the browser; no image ever leaves it.

- `lab/` — **Experiments**: the index of the three, each on a glass tile with a live miniature
  (they pause when off-screen).
- `lab/field/` — **Field**: white streaks are carried by a flow read out of the picture,
  leaving trails you can fix and export.
- `lab/explode/` — **Explode**: the picture breaks into fragments that fly apart and settle back.
- `lab/bloom/` — **Bloom**: your photo stays underneath while small flowers grow on top of it.

## Files

```
index.html          hero + index
about.html          one sentence
styles.css          page styles          tokens.css   colours, type, spacing
main.js             hero field, ambient sprays + click blooms, drawn cursor cell, word pills, card miniatures (02 corridor, 03 rings, the 04 tri-tile), the 05 cover mosaic, counter
orchid-sprites.js   shared 64×64 bloom / 160×96 spray pixel sprites (home + about)
lab/index.html      Experiments — the index of the three machines
lab/field/          Field                (one self-contained page each)
lab/explode/        Explode
lab/bloom/          Bloom
work/tutor-oriel/   the Tutor Oriel case
assets/             the Light on Light film + poster, the Tutor Oriel images
```

## Run it locally

```sh
python3 -m http.server 8766
```

Then open <http://localhost:8766/>. (A plain file open works too, but the local server
keeps the `lab/` paths behaving exactly as they do live.)
