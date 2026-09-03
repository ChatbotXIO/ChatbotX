"use client"

import { shade as shadeColor } from "../lib/color"

export type ScratchOffPhase = "idle" | "scratching" | "revealed"

type ScratchOffArtProps = {
  machineColor: string
  decorativeColor: string
  phase?: ScratchOffPhase
  /** Caption shown below the gift-box icon, above the scratch panel (e.g. the minigame's translated card title). */
  cardTitle?: string
  /** Color for `cardTitle` — typically the minigame's configured decorative color. Falls back to a dark neutral if omitted. */
  cardTitleColor?: string
  /** The prize/lose art shown underneath the silver panel once the result is known — only rendered while `phase` is "scratching" or "revealed". */
  revealImageUrl?: string
  revealLabel?: string
}

// Intentionally not `@chatbotx.io/ui`'s `hexToRgb`, mirroring the other
// `*-art.tsx` components: this fallback tuple keeps malformed input a
// visible gray instead of silently rendering black.
const FALLBACK_RGB: [number, number, number] = [150, 150, 158]

function shade(hex: string, amount: number): string {
  return shadeColor(hex, amount, FALLBACK_RGB)
}

const REVEAL_FADE_DURATION_MS = 550
const SCRATCH_STROKE_WIDTH_PX = 30
/** Y position of the ticket-stub perforation line — just above the scratch panel (which starts at y=130). */
const SCRATCH_OFF_PERFORATION_Y = 120

const CARD_X = 20
const CARD_Y = 20
const CARD_WIDTH = 240
const CARD_HEIGHT = 220
const CARD_RIGHT = CARD_X + CARD_WIDTH
const CARD_BOTTOM = CARD_Y + CARD_HEIGHT
const CARD_CORNER_RADIUS = 16
const SCALLOP_COUNT = 6
const SCALLOP_RADIUS = 12

const SCALLOP_SPAN_TOP = CARD_Y + CARD_CORNER_RADIUS
const SCALLOP_SPAN_BOTTOM = CARD_BOTTOM - CARD_CORNER_RADIUS
const SCALLOP_SPAN = SCALLOP_SPAN_BOTTOM - SCALLOP_SPAN_TOP
/** Evenly-spaced y centers, shared by both edges, for the bump/notch pattern below. */
const SCALLOP_CENTERS_Y = Array.from({ length: SCALLOP_COUNT }, (_, index) =>
  Math.round(SCALLOP_SPAN_TOP + (SCALLOP_SPAN * (index + 0.5)) / SCALLOP_COUNT),
)

/**
 * Outline of the whole card: the right edge scallops INWARD (6 notches cut
 * in) while the left edge scallops OUTWARD (6 bumps sticking out) at the
 * same heights — like a strip of scratch tickets torn apart, where each
 * ticket's edge interlocks with the complementary shape of the one next to
 * it. Built as one continuous path (rather than a rect + mask) so the fill,
 * stroke, and drop shadow all follow the scalloped edges correctly.
 */
function buildScratchOffCardPath(): string {
  const segments: string[] = [
    `M${CARD_X + CARD_CORNER_RADIUS},${CARD_Y}`,
    `L${CARD_RIGHT - CARD_CORNER_RADIUS},${CARD_Y}`,
    `A${CARD_CORNER_RADIUS},${CARD_CORNER_RADIUS} 0 0 1 ${CARD_RIGHT},${SCALLOP_SPAN_TOP}`,
  ]

  for (const cy of SCALLOP_CENTERS_Y) {
    segments.push(`L${CARD_RIGHT},${cy - SCALLOP_RADIUS}`)
    segments.push(
      `A${SCALLOP_RADIUS},${SCALLOP_RADIUS} 0 0 0 ${CARD_RIGHT},${cy + SCALLOP_RADIUS}`,
    )
  }

  segments.push(
    `L${CARD_RIGHT},${SCALLOP_SPAN_BOTTOM}`,
    `A${CARD_CORNER_RADIUS},${CARD_CORNER_RADIUS} 0 0 1 ${CARD_RIGHT - CARD_CORNER_RADIUS},${CARD_BOTTOM}`,
    `L${CARD_X + CARD_CORNER_RADIUS},${CARD_BOTTOM}`,
    `A${CARD_CORNER_RADIUS},${CARD_CORNER_RADIUS} 0 0 1 ${CARD_X},${SCALLOP_SPAN_BOTTOM}`,
  )

  for (const cy of [...SCALLOP_CENTERS_Y].reverse()) {
    segments.push(`L${CARD_X},${cy + SCALLOP_RADIUS}`)
    segments.push(
      `A${SCALLOP_RADIUS},${SCALLOP_RADIUS} 0 0 1 ${CARD_X},${cy - SCALLOP_RADIUS}`,
    )
  }

  segments.push(
    `L${CARD_X},${SCALLOP_SPAN_TOP}`,
    `A${CARD_CORNER_RADIUS},${CARD_CORNER_RADIUS} 0 0 1 ${CARD_X + CARD_CORNER_RADIUS},${CARD_Y}`,
    "Z",
  )

  return segments.join(" ")
}

const SCRATCH_OFF_CARD_PATH = buildScratchOffCardPath()

const SCRATCH_STROKE_COUNT = 6
const SCRATCH_STROKE_DX = 40
const SCRATCH_STROKE_SPACING = 32
const SCRATCH_STROKE_START_X = 30
const SCRATCH_STROKE_TOP_Y = 145
const SCRATCH_STROKE_BOTTOM_Y = 215
const SCRATCH_STROKE_DRAW_DURATION_MS = 380
const SCRATCH_STROKE_GAP_MS = 300
/** Each pass fully finishes drawing before the next one starts — not overlapping. */
const SCRATCH_STROKE_DELAY_STEP_MS =
  SCRATCH_STROKE_DRAW_DURATION_MS + SCRATCH_STROKE_GAP_MS
/** Total time for every stroke to finish, exported so the play screen can size its "scratching" phase to match. */
export const SCRATCH_OFF_ANIMATION_DURATION_MS =
  (SCRATCH_STROKE_COUNT - 1) * SCRATCH_STROKE_DELAY_STEP_MS +
  SCRATCH_STROKE_DRAW_DURATION_MS

/**
 * Decorative "$" marks scattered on the card's open white space — placed
 * above the card but below the gift icon/scratch panel so those still sit
 * on top. Sizes are hand-varied (not `Math.random()`) so the illustration
 * stays identical between server and client render — real randomness here
 * would cause a hydration mismatch.
 */
const DOLLAR_MARKS = [
  { x: 36, y: 38, rotationDeg: -18, fontSize: 32 },
  { x: 140, y: 28, rotationDeg: 5, fontSize: 16 },
  { x: 244, y: 40, rotationDeg: 16, fontSize: 22 },
  { x: 24, y: 102, rotationDeg: -8, fontSize: 18 },
  { x: 256, y: 96, rotationDeg: 10, fontSize: 30 },
  { x: 26, y: 166, rotationDeg: -14, fontSize: 26 },
  { x: 254, y: 168, rotationDeg: 12, fontSize: 16 },
  { x: 24, y: 224, rotationDeg: 8, fontSize: 20 },
  { x: 140, y: 226, rotationDeg: 0, fontSize: 34 },
  { x: 256, y: 220, rotationDeg: -10, fontSize: 18 },
] as const

/**
 * A row of parallel scratch strokes — all on the same "7 o'clock ↔ 1
 * o'clock" diagonal, never a zigzag — appearing one after another from left
 * to right. The 1st pass draws 7→1 o'clock, the 2nd draws 1→7 o'clock, the
 * 3rd draws 7→1 again, and so on: the animated tip alternately climbs then
 * descends the same diagonal as it moves across, the way a hand actually
 * rakes a coin back and forth rather than always lifting from one corner.
 */
const SCRATCH_STROKES = Array.from(
  { length: SCRATCH_STROKE_COUNT },
  (_, index) => {
    const x = SCRATCH_STROKE_START_X + index * SCRATCH_STROKE_SPACING
    const lowerLeft = `${x},${SCRATCH_STROKE_BOTTOM_Y}`
    const upperRight = `${x + SCRATCH_STROKE_DX},${SCRATCH_STROKE_TOP_Y}`
    // Same "/" line (7 o'clock ↔ 1 o'clock) every time — only the M/L order
    // swaps, so the animated tip retraces it from the opposite end instead
    // of drawing a different, mirrored "\" diagonal.
    const drawsUpward = index % 2 === 0
    const d = drawsUpward
      ? `M${lowerLeft} L${upperRight}`
      : `M${upperRight} L${lowerLeft}`
    return { d, delayMs: index * SCRATCH_STROKE_DELAY_STEP_MS }
  },
)

/**
 * Static ticket-card chrome for the scratch-off game plus a `phase`-driven
 * self-scratching animation: while "scratching", several parallel strokes —
 * all running along the same "7 o'clock → 1 o'clock" diagonal, not a
 * zigzag — draw themselves through the silver panel one after another from
 * left to right, via an SVG luminance mask animated with
 * `stroke-dashoffset` (normalized by `pathLength="1"` so the timing is
 * independent of each path's actual geometry). This mimics a coin raked
 * repeatedly in the same direction across a real scratch card, revealing
 * the prize/lose art underneath as it goes, rather than a single
 * wipe/shimmer. "revealed" then fades the remaining silver away entirely
 * before the result dialog opens. There is no manual drag-to-scratch
 * interaction; the reveal is fully automatic, driven by the play screen's
 * phase state. `machineColor` recolors the card body (used as-is, not
 * shaded, so the configured color shows accurately) and its border (a
 * slightly darker shade), `decorativeColor` recolors the gift box/ribbon.
 */
export function ScratchOffArt({
  machineColor,
  decorativeColor,
  phase = "idle",
  cardTitle,
  cardTitleColor = "#3a3a3a",
  revealImageUrl,
  revealLabel,
}: ScratchOffArtProps) {
  // Used as-is (not lightened) so the configured color shows accurately —
  // e.g. a pure black machineColor must render as black, not a washed-out
  // gray from shading it toward white.
  const cardFill = machineColor
  const borderColor = shade(machineColor, -0.1)
  const giftLight = shade(decorativeColor, 0.3)
  const giftDark = shade(decorativeColor, -0.2)

  const isScratching = phase === "scratching"
  const isRevealed = phase === "revealed"
  const showRevealContent = isScratching || isRevealed

  return (
    <svg
      aria-labelledby="scratchOffTitle"
      className="w-full"
      role="img"
      viewBox="0 0 280 260"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="scratchOffTitle">Scratch-off ticket</title>
      {/** biome-ignore-start lint/style/noMagicNumbers: hand-authored illustration layout constants */}
      <defs>
        <linearGradient id="scratchOffSilver" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#e6e7ea" />
          <stop offset="0.5" stopColor="#b9bbc2" />
          <stop offset="1" stopColor="#e6e7ea" />
        </linearGradient>
        <filter
          height="150%"
          id="scratchOffShadow"
          width="140%"
          x="-20%"
          y="-15%"
        >
          <feGaussianBlur in="SourceAlpha" result="blur" stdDeviation="6" />
          <feOffset dx="0" dy="6" in="blur" result="offsetBlur" />
          <feFlood
            floodColor="#000000"
            floodOpacity="0.2"
            result="shadowColor"
          />
          <feComposite
            in="shadowColor"
            in2="offsetBlur"
            operator="in"
            result="shadowShape"
          />
          <feMerge>
            <feMergeNode in="shadowShape" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="scratchOffPanelClip">
          <rect height="100" rx="10" width="200" x="40" y="130" />
        </clipPath>
        <clipPath id="scratchOffCardClip">
          <path d={SCRATCH_OFF_CARD_PATH} />
        </clipPath>
        <mask id="scratchOffMask" maskUnits="userSpaceOnUse">
          <rect fill="#fff" height="100" width="200" x="40" y="130" />
          {isScratching &&
            SCRATCH_STROKES.map((stroke) => (
              <path
                className="scratch-off-stroke"
                d={stroke.d}
                fill="none"
                key={stroke.d}
                pathLength="1"
                stroke="#000"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={SCRATCH_STROKE_WIDTH_PX}
                style={{ animationDelay: `${stroke.delayMs}ms` }}
              />
            ))}
        </mask>
      </defs>
      <style>
        {`
          @keyframes scratchOffStrokeDraw {
            from { stroke-dashoffset: 1; }
            to { stroke-dashoffset: 0; }
          }
          .scratch-off-stroke {
            stroke-dasharray: 1;
            stroke-dashoffset: 1;
            animation: scratchOffStrokeDraw ${SCRATCH_STROKE_DRAW_DURATION_MS}ms ease-out forwards;
          }
          @keyframes scratchOffReveal {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
          .scratch-off-reveal {
            animation: scratchOffReveal ${REVEAL_FADE_DURATION_MS}ms ease-in both;
          }
        `}
      </style>

      <path
        d={SCRATCH_OFF_CARD_PATH}
        fill={cardFill}
        filter="url(#scratchOffShadow)"
        stroke={borderColor}
        strokeWidth="4"
      />
      <line
        stroke={borderColor}
        strokeDasharray="6 5"
        strokeLinecap="round"
        strokeWidth="2"
        x1="33"
        x2="247"
        y1={SCRATCH_OFF_PERFORATION_Y}
        y2={SCRATCH_OFF_PERFORATION_Y}
      />

      <g clipPath="url(#scratchOffCardClip)" opacity="0.4">
        {DOLLAR_MARKS.map((mark) => (
          <text
            fill={giftDark}
            fontSize={mark.fontSize}
            fontWeight="700"
            key={`${mark.x}-${mark.y}`}
            textAnchor="middle"
            transform={`translate(${mark.x} ${mark.y}) rotate(${mark.rotationDeg})`}
          >
            $
          </text>
        ))}
      </g>

      <g transform="translate(140 62)">
        <rect fill={giftDark} height="34" rx="4" width="46" x="-23" y="-6" />
        <rect fill={giftLight} height="34" width="8" x="-4" y="-6" />
        <path
          d="M-4 -6C-4 -22 -22 -22 -18 -10C-14 -18 -4 -18 -4 -6Z"
          fill={giftLight}
        />
        <path
          d="M4 -6C4 -22 22 -22 18 -10C14 -18 4 -18 4 -6Z"
          fill={giftLight}
        />
      </g>

      {cardTitle && (
        <g clipPath="url(#scratchOffCardClip)">
          <text
            fill={cardTitleColor}
            fontSize="12"
            fontWeight="600"
            textAnchor="middle"
            x="140"
            y="112"
          >
            {cardTitle}
          </text>
        </g>
      )}

      <rect fill="#fdf6e6" height="100" rx="10" width="200" x="40" y="130" />
      {showRevealContent && (
        <g clipPath="url(#scratchOffPanelClip)">
          {revealImageUrl && (
            <image
              height="52"
              href={revealImageUrl}
              preserveAspectRatio="xMidYMid meet"
              width="52"
              x="114"
              y="140"
            />
          )}
          {revealLabel && (
            <text
              dominantBaseline={revealImageUrl ? undefined : "middle"}
              fill="#3a3a3a"
              fontSize={revealImageUrl ? "15" : "18"}
              fontWeight="700"
              textAnchor="middle"
              x="140"
              y={revealImageUrl ? "216" : "180"}
            >
              {revealLabel}
            </text>
          )}
        </g>
      )}
      <rect
        className={isRevealed ? "scratch-off-reveal" : undefined}
        fill="url(#scratchOffSilver)"
        height="100"
        mask={isScratching ? "url(#scratchOffMask)" : undefined}
        rx="10"
        stroke={borderColor}
        strokeWidth="2"
        width="200"
        x="40"
        y="130"
      />
      {/** biome-ignore-end lint/style/noMagicNumbers: hand-authored illustration layout constants */}
    </svg>
  )
}
