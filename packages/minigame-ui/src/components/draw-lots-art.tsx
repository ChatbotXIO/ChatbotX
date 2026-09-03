"use client"

import { shade as shadeColor } from "../lib/color"

export type DrawLotsPhase = "idle" | "shuffling" | "drawn"

type DrawLotsArtProps = {
  machineColor: string
  decorativeColor: string
  phase?: DrawLotsPhase
}

// Intentionally not `@chatbotx.io/ui`'s `hexToRgb`, mirroring
// `jackpot-machine-art.tsx`/`gashapon-machine-art.tsx`: this fallback tuple
// keeps malformed input a visible lacquer-red instead of silently rendering
// black.
const FALLBACK_RGB: [number, number, number] = [211, 16, 39]

function shade(hex: string, amount: number): string {
  return shadeColor(hex, amount, FALLBACK_RGB)
}

const JIGGLE_DURATION_MS = 260
const PULL_OUT_DURATION_MS = 900

/** Per-stick delay/duration offsets so the bundle doesn't jiggle in lockstep. */
const STICK_JIGGLE_VARIANTS = [
  { delayMs: 0, durationMs: JIGGLE_DURATION_MS },
  { delayMs: -60, durationMs: JIGGLE_DURATION_MS + 30 },
  { delayMs: -120, durationMs: JIGGLE_DURATION_MS - 20 },
  { delayMs: -30, durationMs: JIGGLE_DURATION_MS + 50 },
  { delayMs: -90, durationMs: JIGGLE_DURATION_MS - 40 },
  { delayMs: -150, durationMs: JIGGLE_DURATION_MS + 20 },
  { delayMs: -45, durationMs: JIGGLE_DURATION_MS + 10 },
] as const

type Stick = { x: number; rotationDeg: number; height: number }

const STICK_COUNT = 10
const STICK_MIN_X = 122
const STICK_MAX_X = 278
const STICK_BASE_HEIGHT = 90
const STICK_HEIGHT_VARIATION = 18
/** Pulls the leftmost/rightmost sticks in from the very edge of the spread. */
const STICK_EDGE_INSET_X = 10

/** Deterministic per-stick tilt, cycling so neighbors don't share the same angle — avoids both a mechanical grid look and `Math.random()` (which would render differently on the server vs. the client and cause a hydration mismatch). */
const STICK_ROTATION_PATTERN_DEG = [
  -10, 4, -6, 9, -2, 7, -8, 3, -4, 8, -9, 2, -7, 5, -3, 10, -5, 6, -1, -8,
] as const

/**
 * Densely packed bundle of sticks spanning the tube's mouth — heights arc up
 * toward the middle and back down (like a loosely gathered handful), x
 * positions spread evenly across the opening, tilt cycles through a fixed
 * pattern rather than repeating in lockstep.
 */
const STICKS: Stick[] = Array.from({ length: STICK_COUNT }, (_, index) => {
  const t = index / (STICK_COUNT - 1)
  const isFirst = index === 0
  const isLast = index === STICK_COUNT - 1
  const edgeOffsetX =
    (isFirst ? 1 : 0) * STICK_EDGE_INSET_X -
    (isLast ? 1 : 0) * STICK_EDGE_INSET_X
  return {
    x: Math.round(STICK_MIN_X + t * (STICK_MAX_X - STICK_MIN_X) + edgeOffsetX),
    rotationDeg:
      STICK_ROTATION_PATTERN_DEG[index % STICK_ROTATION_PATTERN_DEG.length],
    height: Math.round(
      STICK_BASE_HEIGHT + STICK_HEIGHT_VARIATION * Math.sin(t * Math.PI),
    ),
  }
})

const WINNING_STICK_INDEX = STICKS.length - 1

// Geometry lifted from the reference bamboo tube illustration:
// its mouth ellipse sits at (200, 160) in the tube's own 400x550 canvas, with
// ~160px of clear space above it — exactly the headroom the stick bundle
// needs — so the tube artwork is reused at its native coordinates instead of
// being rescaled.
const CAN_CENTER_X = 200
const RIM_TOP_Y = 160
const CAN_RIM_RX = 105
const CAN_RIM_RY = 14

const STICK_SHAFT_WIDTH = 12
/** Matches the reference `stick-1.svg`'s tip-height:shaft-width ratio (60:40 = 1.5). */
const STICK_TIP_HEIGHT = 18
/**
 * How far each stick's body extends BELOW the rim line — without this the
 * stick's bottom edge sits exactly at `RIM_TOP_Y`, so it never actually
 * overlaps the front-rim-half drawn on top of it (zero shared pixels), and
 * the "sticks poke through the rim" effect has nothing to visibly wrap
 * around. Matches `CAN_RIM_RY` so the whole extension stays hidden inside
 * the front rim's own clipped band instead of poking out below it.
 */
const STICK_INSERT_DEPTH = CAN_RIM_RY

// The tube body, drawn in the illustration's own local coordinate space
// (wrapped in the same `translate(0, 50)` the reference artwork uses) so its
// bezier control points can be reused verbatim. The grain overlay reuses the
// exact same outline (including the domed cap arc) so the stripes run all
// the way up to the mouth instead of stopping short at the side-seam.
const TUBE_BODY_PATH =
  "M 95,110 C 94,220 94,330 95,430 C 95,445 305,445 305,430 C 306,330 306,220 305,110 C 305,96 95,96 95,110 Z"

function jiggleStyle(index: number, active: boolean) {
  if (!active) {
    return
  }
  const variant = STICK_JIGGLE_VARIANTS[index % STICK_JIGGLE_VARIANTS.length]
  return {
    animationDelay: `${variant.delayMs}ms`,
    animationDuration: `${variant.durationMs}ms`,
  }
}

const STICK_HIGHLIGHT_WIDTH = 2

/**
 * A single wooden fortune stick: a wood-grain shaft (fixed gradient + grain
 * texture matching the reference `stick-1.svg`) with two thin edge
 * highlights for a rounded-dowel look, topped by a lacquered head — same
 * width as the shaft, same rounding ratio as the reference's tip, filled
 * with the shared `decorativeColor`-derived gradient. Shared by the resting
 * bundle and the "drawn" pull-out stick so both stay visually identical.
 */
function StickShape({ x, height }: { x: number; height: number }) {
  const bodyHeight = height + STICK_INSERT_DEPTH
  const bodyTop = RIM_TOP_Y - height
  const tipTop = RIM_TOP_Y - height - STICK_TIP_HEIGHT / 2
  // The tip rect is centered on `bodyTop` (half overlapping the shaft's top
  // edge), so the shaft's edge-highlight strips must start where the tip
  // ends — otherwise they'd streak across the lower half of the red head.
  const highlightTop = bodyTop + STICK_TIP_HEIGHT / 2
  const highlightHeight = bodyHeight - STICK_TIP_HEIGHT / 2

  return (
    <>
      <rect
        fill="url(#drawLotsStickWood)"
        height={bodyHeight}
        rx="4"
        width={STICK_SHAFT_WIDTH}
        x={x - STICK_SHAFT_WIDTH / 2}
        y={bodyTop}
      />
      <rect
        fill="url(#drawLotsGrain)"
        height={bodyHeight}
        rx="4"
        width={STICK_SHAFT_WIDTH}
        x={x - STICK_SHAFT_WIDTH / 2}
        y={bodyTop}
      />
      <rect
        fill="url(#drawLotsStickTip)"
        height={STICK_TIP_HEIGHT}
        rx="1"
        width={STICK_SHAFT_WIDTH}
        x={x - STICK_SHAFT_WIDTH / 2}
        y={tipTop}
      />
      <rect
        fill="#fff"
        height={highlightHeight}
        opacity="0.35"
        width={STICK_HIGHLIGHT_WIDTH}
        x={x - 5}
        y={highlightTop}
      />
      <rect
        fill="#5a3510"
        height={highlightHeight}
        opacity="0.2"
        width={STICK_HIGHLIGHT_WIDTH}
        x={x + 3}
        y={highlightTop}
      />
    </>
  )
}

/**
 * A bundle of lacquer-tipped fortune sticks gathered in a bamboo tube,
 * redrawn from two reference illustrations — `ong_tre_rieng.svg` for the
 * tube and `stick-1.svg` for a single stick — the "draw lots" gameplay
 * illustration. The tube and stick shafts use the reference artwork's own
 * fixed wood gradients rather than `machineColor`: bamboo and raw wood are
 * material colors, not a themeable machine shell. `decorativeColor` is used,
 * though — it colors the stick's painted head, the one part of the
 * illustration meant to read as a themeable accent.
 */
export function DrawLotsArt({
  decorativeColor,
  phase = "idle",
}: DrawLotsArtProps) {
  const isShuffling = phase === "shuffling"
  const isDrawn = phase === "drawn"

  // Mirrors the reference `stick-1.svg`'s `stickRed` gradient shape (dark →
  // base → bright highlight → dark) so the lacquered head keeps its glossy,
  // rounded look while following `decorativeColor` instead of a fixed red.
  const stickTipDeep = shade(decorativeColor, -0.15)
  const stickTipLight = shade(decorativeColor, 0.35)
  const stickTipDark = shade(decorativeColor, -0.35)

  return (
    <svg
      aria-labelledby="drawLotsTitle"
      className="w-full"
      role="img"
      viewBox="0 0 400 550"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="drawLotsTitle">Draw lots</title>
      {/** biome-ignore-start lint/style/noMagicNumbers: hand-authored illustration layout constants, lifted from the reference SVGs' own coordinates */}
      <defs>
        <linearGradient id="drawLotsBambooBody" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#d69742" />
          <stop offset="0.08" stopColor="#f2c779" />
          <stop offset="0.3" stopColor="#ffeaae" />
          <stop offset="0.6" stopColor="#f5d388" />
          <stop offset="0.85" stopColor="#e8b762" />
          <stop offset="1" stopColor="#b57321" />
        </linearGradient>
        <linearGradient id="drawLotsBambooRim" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#d4943f" />
          <stop offset="0.15" stopColor="#f6cb7c" />
          <stop offset="0.45" stopColor="#ffe5a3" />
          <stop offset="0.8" stopColor="#eebf6d" />
          <stop offset="1" stopColor="#be7b28" />
        </linearGradient>
        {/* Fixed wood-grain texture (not theme-tied) — thin vertical stripes reused for both the tube body and the sticks, matching the reference SVGs' shared `bambooGrain` pattern. */}
        <pattern
          height="10"
          id="drawLotsGrain"
          patternUnits="userSpaceOnUse"
          width="10"
        >
          <line
            stroke="#7a4a1a"
            strokeOpacity="0.35"
            strokeWidth="1"
            x1="2"
            x2="2"
            y1="0"
            y2="10"
          />
          <line
            stroke="#fff"
            strokeOpacity="0.25"
            strokeWidth="0.8"
            x1="5"
            x2="5"
            y1="0"
            y2="10"
          />
          <line
            stroke="#5a3510"
            strokeOpacity="0.3"
            strokeWidth="0.7"
            x1="8"
            x2="8"
            y1="0"
            y2="10"
          />
        </pattern>
        {/* Fixed wood tone for the stick shaft, matching the reference `stick-1.svg`'s `stickWoodBody` gradient exactly. */}
        <linearGradient id="drawLotsStickWood" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#c8924b" />
          <stop offset="0.2" stopColor="#f0cb8b" />
          <stop offset="0.5" stopColor="#ffe4b0" />
          <stop offset="0.8" stopColor="#e8bf7d" />
          <stop offset="1" stopColor="#b67f38" />
        </linearGradient>
        <linearGradient id="drawLotsStickTip" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={stickTipDeep} />
          <stop offset="0.25" stopColor={decorativeColor} />
          <stop offset="0.7" stopColor={stickTipLight} />
          <stop offset="1" stopColor={stickTipDark} />
        </linearGradient>
        {/* Reused for the body's vertical sheen streak, matching the reference `stickHighlight` gradient. */}
        <linearGradient id="drawLotsStickHighlight" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="drawLotsRimBackClip">
          <rect
            height={CAN_RIM_RY + 1}
            width={CAN_RIM_RX * 2}
            x={CAN_CENTER_X - CAN_RIM_RX}
            y={RIM_TOP_Y - CAN_RIM_RY}
          />
        </clipPath>
        <clipPath id="drawLotsRimFrontClip">
          <rect
            height={CAN_RIM_RY + 1}
            width={CAN_RIM_RX * 2}
            x={CAN_CENTER_X - CAN_RIM_RX}
            y={RIM_TOP_Y - 1}
          />
        </clipPath>
      </defs>
      <style>
        {`
          @keyframes drawLotsJiggle {
            0% { transform: translate(0, 0) rotate(0deg); }
            25% { transform: translate(2px, -1px) rotate(-3deg); }
            50% { transform: translate(-2px, 1px) rotate(3deg); }
            75% { transform: translate(1px, -1px) rotate(-2deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
          }
          .draw-lots-jiggle {
            animation-name: drawLotsJiggle;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
            transform-box: fill-box;
            transform-origin: 50% 100%;
          }
          @keyframes drawLotsPullOut {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            60% { transform: translateY(-70px) rotate(-8deg); opacity: 1; }
            100% { transform: translateY(-140px) rotate(-14deg); opacity: 0; }
          }
          .draw-lots-pull-out {
            animation: drawLotsPullOut ${PULL_OUT_DURATION_MS}ms cubic-bezier(0.34, 1.2, 0.64, 1) both;
            transform-box: fill-box;
            transform-origin: 50% 100%;
          }
        `}
      </style>

      <ellipse cx="200" cy="546" fill="#000" opacity="0.15" rx="110" ry="12" />

      {/* Pedestal foot, lifted verbatim from the reference tube illustration. */}
      <g transform="translate(0, 50)">
        <path
          d="M 100,428 C 100,415 300,415 300,428 L 298,458 C 298,472 102,472 102,458 Z"
          fill="url(#drawLotsBambooRim)"
        />
        <path
          d="M 97,428 Q 200,444 303,428"
          fill="none"
          opacity="0.6"
          stroke="#7e4313"
          strokeWidth="3"
        />
        <path
          d="M 97,430 Q 200,446 303,430"
          fill="none"
          opacity="0.4"
          stroke="#fff"
          strokeWidth="1.5"
        />
        <path
          d="M 98,458 C 98,445 302,445 302,458 L 300,490 C 300,506 100,506 100,490 Z"
          fill="url(#drawLotsBambooRim)"
        />
        <path
          d="M 100,458 Q 200,474 300,458"
          fill="none"
          opacity="0.6"
          stroke="#7e4313"
          strokeWidth="3"
        />
        <path
          d="M 100,460 Q 200,476 300,460"
          fill="none"
          opacity="0.4"
          stroke="#fff"
          strokeWidth="1.5"
        />
      </g>

      {/* Tube body, drawn BEFORE the sticks so they sit visibly rooted in front of/inside it. */}
      <g transform="translate(0, 50)">
        <path d={TUBE_BODY_PATH} fill="url(#drawLotsBambooBody)" />
        <path d={TUBE_BODY_PATH} fill="url(#drawLotsGrain)" />
      </g>

      {STICKS.map((stick, index) => {
        if (isDrawn && index === WINNING_STICK_INDEX) {
          return null
        }
        return (
          <g
            className={isShuffling ? "draw-lots-jiggle" : undefined}
            key={`stick-${stick.x}`}
            style={jiggleStyle(index, isShuffling)}
            transform={`rotate(${stick.rotationDeg} ${stick.x} ${RIM_TOP_Y})`}
          >
            <StickShape height={stick.height} x={stick.x} />
          </g>
        )
      })}

      {/*
        Re-paints the tube body's FILL ONLY on top of the sticks, sealing
        over any sliver that a stick's rotation swings past the rim line.
        The decorative bands/highlight below are re-drawn AFTER this repaint
        (not before) so they stay visible instead of being painted over.
      */}
      <g transform="translate(0, 50)">
        <path d={TUBE_BODY_PATH} fill="url(#drawLotsBambooBody)" />
        <path d={TUBE_BODY_PATH} fill="url(#drawLotsGrain)" />
      </g>

      <g transform="translate(0, 50)">
        {/* Mouth groove — curves the same way as the dome cap itself (upward, not down into the body) so it reads as a groove on the mouth. */}
        <path
          d="M 95,108 Q 200,94 305,108"
          fill="none"
          opacity="0.4"
          stroke="#874712"
          strokeWidth="2.5"
        />
        <path
          d="M 95,106 Q 200,92 305,106"
          fill="none"
          opacity="0.4"
          stroke="#fff"
          strokeWidth="1.5"
        />
        {/* Decorative waist band, just below the rim. */}
        <path
          d="M 95,145 Q 200,162 305,145"
          fill="none"
          opacity="0.4"
          stroke="#874712"
          strokeWidth="2.5"
        />
        <path
          d="M 95,147 Q 200,164 305,147"
          fill="none"
          opacity="0.4"
          stroke="#fff"
          strokeWidth="1.5"
        />
        {/* Vertical sheen streak down the body's left side. */}
        <path
          d="M 125,115 L 128,425 L 155,425 L 150,115 Z"
          fill="url(#drawLotsStickHighlight)"
          opacity="0.35"
        />
        {/* Lower waist band. */}
        <path
          d="M 95,395 Q 200,412 305,395"
          fill="none"
          opacity="0.4"
          stroke="#874712"
          strokeWidth="2.5"
        />
        <path
          d="M 95,397 Q 200,414 305,397"
          fill="none"
          opacity="0.4"
          stroke="#fff"
          strokeWidth="1.5"
        />
        {/* Bottom body edge. */}
        <path
          d="M 95,428 Q 200,444 305,428"
          fill="none"
          opacity="0.5"
          stroke="#7e4313"
          strokeWidth="2.5"
        />
        <path
          d="M 95,430 Q 200,446 305,430"
          fill="none"
          opacity="0.4"
          stroke="#fff"
          strokeWidth="1.5"
        />
      </g>

      {isDrawn && (
        <g
          className="draw-lots-pull-out"
          transform={`rotate(${STICKS[WINNING_STICK_INDEX].rotationDeg} ${STICKS[WINNING_STICK_INDEX].x} ${RIM_TOP_Y})`}
        >
          <StickShape
            height={STICKS[WINNING_STICK_INDEX].height}
            x={STICKS[WINNING_STICK_INDEX].x}
          />
        </g>
      )}
      {/** biome-ignore-end lint/style/noMagicNumbers: hand-authored illustration layout constants, lifted from the reference SVGs' own coordinates */}
    </svg>
  )
}
