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

const PANEL_X = 40
const PANEL_Y = 130
const PANEL_WIDTH = 200
const PANEL_HEIGHT = 100
const PANEL_BOTTOM = PANEL_Y + PANEL_HEIGHT
const PANEL_RIGHT = PANEL_X + PANEL_WIDTH

const SCRATCH_BAND_COUNT = 6
/**
 * Where the bands sit. Unlike the strokes these replaced, the bands ARE the
 * silver — so together they must cover every pixel of the panel, or the
 * uncovered wedge shows the prize art before the first scratch. Because the
 * bands lean, the binding cases are the two opposite corners: at the panel's
 * top edge the leftmost band has already leaned right (so its anchor has to
 * start left of the panel), and at the bottom edge the rightmost one has
 * leaned back left (so its anchor has to end right of the panel). Between
 * them the spacing must stay under `2 * BAND_HALF_WIDTH_X` so neighbours
 * overlap instead of leaving a silver thread.
 */
const SCRATCH_BAND_SPACING = 45
const SCRATCH_BAND_ANCHOR_X = 4
const SCRATCH_BAND_ANCHOR_Y = 215
/** Perpendicular width of one band — wide enough that the bands overlap at `SCRATCH_BAND_SPACING`. */
const SCRATCH_BAND_WIDTH_PX = 42
/** Segments each band is cut into, so it clears progressively along the diagonal instead of blinking out in one piece. */
const SCRATCH_SEGMENTS_PER_BAND = 5
const SCRATCH_SEGMENT_FADE_MS = 150
const SCRATCH_SEGMENT_STEP_MS = 70
/** Vertical overlap between neighbouring segments, hiding the anti-aliased seam while both are still opaque. */
const SCRATCH_SEGMENT_OVERLAP_Y = 1

/** The rake direction, as a rise/run pair: "7 o'clock → 1 o'clock". */
const RAKE_RUN = 40
const RAKE_RISE = 70
const RAKE_LENGTH = Math.hypot(RAKE_RUN, RAKE_RISE)
/** How far a point on the rake line travels horizontally per unit of height. */
const RAKE_X_PER_Y = RAKE_RUN / RAKE_RISE
/**
 * Half-width of a band measured horizontally rather than perpendicular: a
 * leaning band slices a wider horizontal span than its own width. Comes out
 * just over half `SCRATCH_BAND_SPACING`, which is what makes neighbours
 * overlap.
 */
const BAND_HALF_WIDTH_X =
  ((SCRATCH_BAND_WIDTH_PX / 2) *
    (RAKE_RISE + (RAKE_RUN * RAKE_RUN) / RAKE_RISE)) /
  RAKE_LENGTH

const SCRATCH_BAND_DRAW_DURATION_MS =
  (SCRATCH_SEGMENTS_PER_BAND - 1) * SCRATCH_SEGMENT_STEP_MS +
  SCRATCH_SEGMENT_FADE_MS
const SCRATCH_BAND_GAP_MS = 250
/** Each pass fully finishes before the next one starts — not overlapping. */
const SCRATCH_BAND_DELAY_STEP_MS =
  SCRATCH_BAND_DRAW_DURATION_MS + SCRATCH_BAND_GAP_MS
/** Total time for every band to clear, exported so the play screen can size its "scratching" phase to match. */
export const SCRATCH_OFF_ANIMATION_DURATION_MS =
  (SCRATCH_BAND_COUNT - 1) * SCRATCH_BAND_DELAY_STEP_MS +
  SCRATCH_BAND_DRAW_DURATION_MS

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

/** Horizontal centre of band `index`'s diagonal at height `y`. */
function bandCenterX(index: number, y: number): number {
  const anchorX = SCRATCH_BAND_ANCHOR_X + index * SCRATCH_BAND_SPACING
  return anchorX + (SCRATCH_BAND_ANCHOR_Y - y) * RAKE_X_PER_Y
}

/** One segment of a band, as a parallelogram spanning `yTop` to `yBottom`. */
function bandSegmentPath(index: number, yTop: number, yBottom: number): string {
  const topX = bandCenterX(index, yTop)
  const bottomX = bandCenterX(index, yBottom)
  return [
    `M${topX - BAND_HALF_WIDTH_X},${yTop}`,
    `L${topX + BAND_HALF_WIDTH_X},${yTop}`,
    `L${bottomX + BAND_HALF_WIDTH_X},${yBottom}`,
    `L${bottomX - BAND_HALF_WIDTH_X},${yBottom}`,
    "Z",
  ].join(" ")
}

/**
 * The silver panel, cut into parallel diagonal bands — all on the same "7
 * o'clock ↔ 1 o'clock" line, never a zigzag — that clear one after another
 * from left to right. Each band is itself sliced into segments that go one
 * at a time along the diagonal, so the band wipes away progressively instead
 * of blinking out whole: pass 1 clears 7→1 o'clock, pass 2 clears 1→7
 * o'clock, pass 3 clears 7→1 again, the way a hand rakes a coin back and
 * forth rather than always lifting from one corner.
 *
 * These are ordinary rendered `<path>`s that simply fade out, NOT strokes
 * animated inside an SVG `<mask>`. The mask version rendered correctly in
 * desktop browsers and in webchat but broke in Messenger's in-app WebView,
 * which painted round dots across the untouched panel — a class of bug this
 * shape avoids entirely, since nothing here depends on dash arrays,
 * `pathLength` normalization, line caps, or a mask re-rasterizing while its
 * contents animate.
 */
const SCRATCH_BANDS = Array.from({ length: SCRATCH_BAND_COUNT }, (_, index) => {
  const segmentHeight = PANEL_HEIGHT / SCRATCH_SEGMENTS_PER_BAND
  // Even passes rake upward (bottom segment first), odd passes come back
  // down the same diagonal.
  const clearsUpward = index % 2 === 0

  const segments = Array.from(
    { length: SCRATCH_SEGMENTS_PER_BAND },
    (__, order) => {
      const fromBottom = clearsUpward
        ? order
        : SCRATCH_SEGMENTS_PER_BAND - 1 - order
      const yBottom = PANEL_BOTTOM - fromBottom * segmentHeight
      const yTop = yBottom - segmentHeight
      return {
        // Overlap into the neighbour that clears later, so no hairline of
        // silver survives between two segments.
        d: bandSegmentPath(
          index,
          Math.max(PANEL_Y, yTop - SCRATCH_SEGMENT_OVERLAP_Y),
          Math.min(PANEL_BOTTOM, yBottom + SCRATCH_SEGMENT_OVERLAP_Y),
        ),
        delayMs:
          index * SCRATCH_BAND_DELAY_STEP_MS + order * SCRATCH_SEGMENT_STEP_MS,
      }
    },
  )

  return segments
}).flat()

/**
 * Static ticket-card chrome for the scratch-off game plus a `phase`-driven
 * self-scratching animation: the silver panel is built from parallel
 * diagonal bands — all on the same "7 o'clock → 1 o'clock" line, not a
 * zigzag — and while "scratching" they clear one after another from left to
 * right, each one wiping away segment by segment along its own diagonal.
 * This mimics a coin raked repeatedly across a real scratch card, revealing
 * the prize/lose art underneath as it goes, rather than a single
 * wipe/shimmer. "revealed" then fades the panel's remaining silver and
 * border away before the result dialog opens. There is no manual
 * drag-to-scratch interaction; the reveal is fully automatic, driven by the
 * play screen's phase state. `machineColor` recolors the card body (used as-is, not
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
        {/*
          User-space coordinates, not the default object bounding box: the
          silver is painted by many band segments, and a per-object gradient
          would restart the sheen inside every one of them. Anchored to the
          panel so each segment samples the single gradient that spans it.
        */}
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="scratchOffSilver"
          x1={PANEL_X}
          x2={PANEL_RIGHT}
          y1={PANEL_Y}
          y2={PANEL_BOTTOM}
        >
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
      </defs>
      <style>
        {`
          @keyframes scratchOffBandClear {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          .scratch-off-band {
            animation: scratchOffBandClear ${SCRATCH_SEGMENT_FADE_MS}ms ease-out forwards;
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
      <g className={isRevealed ? "scratch-off-reveal" : undefined}>
        <g clipPath="url(#scratchOffPanelClip)">
          {SCRATCH_BANDS.map((segment) => (
            // The class stays applied through "revealed" as well as
            // "scratching": dropping it would end the animation and snap
            // every cleared segment back to full opacity just as the panel
            // starts fading out.
            <path
              className={showRevealContent ? "scratch-off-band" : undefined}
              d={segment.d}
              fill="url(#scratchOffSilver)"
              key={segment.d}
              // A band segment abuts its neighbours exactly; without a stroke
              // of its own fill color the seam shows as a lighter hairline.
              stroke="url(#scratchOffSilver)"
              strokeWidth="0.5"
              style={
                showRevealContent
                  ? { animationDelay: `${segment.delayMs}ms` }
                  : undefined
              }
            />
          ))}
        </g>
        <rect
          fill="none"
          height={PANEL_HEIGHT}
          rx="10"
          stroke={borderColor}
          strokeWidth="2"
          width={PANEL_WIDTH}
          x={PANEL_X}
          y={PANEL_Y}
        />
      </g>
      {/** biome-ignore-end lint/style/noMagicNumbers: hand-authored illustration layout constants */}
    </svg>
  )
}
