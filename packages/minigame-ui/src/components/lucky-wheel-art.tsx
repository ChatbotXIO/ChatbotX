"use client"

import { shade as shadeColor } from "../lib/color"

export type LuckyWheelSegment = {
  id: string
  label: string
  iconUrl: string
  isNonWinning?: boolean
}

type LuckyWheelArtProps = {
  segments: LuckyWheelSegment[]
  machineColor: string
  decorativeColor: string
  rotationDeg: number
  transitionDurationMs: number
  transitionEasing: string
  onTransitionEnd?: () => void
}

/** Fixed, rotating-by-index palette for prize wedges — no per-prize color field. */
export const LUCKY_WHEEL_SEGMENT_PALETTE = [
  "#FF6B6B",
  "#FFD166",
  "#6BCB77",
  "#4D96FF",
  "#C780FA",
  "#00C2D1",
  "#FF9F45",
  "#FF6FB5",
] as const

/** Fill for the always-present "no prize" wedge. */
export const LUCKY_WHEEL_NONWINNING_COLOR = "#94A3B8"

// Intentionally not `@chatbotx.io/ui`'s `hexToRgb`, mirroring
// `jackpot-machine-art.tsx`: this fallback tuple keeps malformed input a
// visible color instead of silently rendering black.
const FALLBACK_RGB: [number, number, number] = [74, 144, 217]

function shade(hex: string, amount: number): string {
  return shadeColor(hex, amount, FALLBACK_RGB)
}

/** Point at `angleDeg` clockwise from the top (12 o'clock), radius `r` from center. */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

function describeWedgePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polarToCartesian(cx, cy, r, startDeg)
  const end = polarToCartesian(cx, cy, r, endDeg)
  const largeArcFlag = endDeg - startDeg > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`
}

function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) {
    return label
  }
  return `${label.slice(0, Math.max(1, maxChars - 1))}…`
}

const CX = 200
const CY = 195
/** Extra viewBox height below the wheel reserved for the stand/base art. */
const STAND_EXTRA_HEIGHT = 70
const VIEWBOX_WIDTH = CX * 2
const VIEWBOX_HEIGHT = CY * 2 + STAND_EXTRA_HEIGHT
/**
 * The wheel's own center (CY) isn't at the viewBox's vertical midpoint (the
 * stand extends the box further below than above) — `rotate()`'s CSS
 * transform-origin must target this exact percentage, not "50% 50%", or the
 * disc spins around the wrong pivot and visibly swings off-center.
 */
const WHEEL_CENTER_Y_PERCENT = (CY / VIEWBOX_HEIGHT) * 100
const R_FRAME_OUTER = 190
const R_FRAME_INNER = 168
const R_DISC = 164
const R_HUB = 26
const R_HUB_BOLT = 8
const BULB_COUNT = 20
const BULB_RADIUS = 179
const BULB_SIZE = 5.5

const SIZING_TIERS = [
  { maxSegmentCount: 6, iconSize: 34, fontSize: 15 },
  { maxSegmentCount: 10, iconSize: 28, fontSize: 13 },
] as const
const DEFAULT_SIZING_TIER = { iconSize: 22, fontSize: 11 } as const

/** Icon/font/label sizing scales down as more prizes crowd the wheel into more, thinner wedges. */
function sizingFor(segmentCount: number): {
  iconSize: number
  fontSize: number
  maxLabelChars: number
} {
  const tier =
    SIZING_TIERS.find((t) => segmentCount <= t.maxSegmentCount) ??
    DEFAULT_SIZING_TIER
  return {
    iconSize: tier.iconSize,
    fontSize: tier.fontSize,
    maxLabelChars: Math.max(4, Math.round(16 - segmentCount * 0.6)),
  }
}

export function LuckyWheelArt({
  segments,
  machineColor,
  decorativeColor,
  rotationDeg,
  transitionDurationMs,
  transitionEasing,
  onTransitionEnd,
}: LuckyWheelArtProps) {
  const segmentCount = segments.length

  const bodyDark = shade(machineColor, -0.5)
  const bodyBright = shade(machineColor, 0.16)
  const bodyVivid = shade(machineColor, 0.3)

  const trimPale = shade(decorativeColor, 0.5)
  const trimDeep = shade(decorativeColor, -0.3)
  const trimVivid = shade(decorativeColor, 0.3)

  const { iconSize, fontSize, maxLabelChars } = sizingFor(segmentCount)
  const sweep = segmentCount > 0 ? 360 / segmentCount : 360
  const labelRadius = R_DISC * 0.82
  const iconRadius = R_DISC * 0.55

  return (
    <div className="relative aspect-square w-full">
      {/** biome-ignore-start lint/style/noMagicNumbers: hand-authored illustration layout constants */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      >
        <defs>
          <radialGradient cx="35%" cy="30%" id="wheelFrame" r="75%">
            <stop offset="0" stopColor={bodyBright} />
            <stop offset="0.55" stopColor={bodyVivid} />
            <stop offset="1" stopColor={bodyDark} />
          </radialGradient>
          <linearGradient id="wheelStand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={bodyVivid} />
            <stop offset="1" stopColor={bodyDark} />
          </linearGradient>
          <linearGradient id="rimShade" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={trimPale} />
            <stop offset="0.5" stopColor={trimVivid} />
            <stop offset="1" stopColor={trimDeep} />
          </linearGradient>
          <linearGradient id="pointerShade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={trimPale} />
            <stop offset="0.55" stopColor={trimVivid} />
            <stop offset="1" stopColor={trimDeep} />
          </linearGradient>
          <radialGradient cx="32%" cy="26%" id="discGloss" r="70%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
            <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <radialGradient cx="50%" cy="50%" id="discShadowRing" r="50%">
            <stop offset="0" stopColor="#000000" stopOpacity="0" />
            <stop offset="0.82" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
          </radialGradient>
          <filter
            height="600%"
            id="wheelBulbGlow"
            width="600%"
            x="-250%"
            y="-250%"
          >
            <feGaussianBlur result="blur" stdDeviation="2.5" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter height="180%" id="wheelShadow" width="160%" x="-30%" y="-30%">
            <feGaussianBlur in="SourceAlpha" result="blur" stdDeviation="8" />
            <feOffset dx="0" dy="8" in="blur" result="offsetBlur" />
            <feFlood
              floodColor="#000000"
              floodOpacity="0.4"
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
        </defs>

        <path
          d="M170 372H230L252 410Q256 430 236 430H164Q144 430 148 410Z"
          fill="url(#wheelStand)"
          stroke={trimDeep}
          strokeWidth="4"
        />
        <path
          d="M120 430H280L296 452Q298 460 288 460H112Q102 460 104 452Z"
          fill="url(#wheelStand)"
          stroke={trimDeep}
          strokeWidth="4"
        />

        <g filter="url(#wheelShadow)">
          <circle
            cx={CX}
            cy={CY}
            fill="url(#wheelFrame)"
            r={R_FRAME_OUTER}
            stroke="url(#rimShade)"
            strokeWidth="7"
          />
          <circle
            cx={CX}
            cy={CY}
            fill="none"
            opacity="0.55"
            r={R_FRAME_OUTER - 9}
            stroke={bodyDark}
            strokeWidth="2"
          />
          <circle
            cx={CX}
            cy={CY}
            fill="none"
            r={R_FRAME_INNER}
            stroke={trimPale}
            strokeWidth="3"
          />
        </g>

        {Array.from({ length: BULB_COUNT }, (_, index) => {
          const angle = (360 / BULB_COUNT) * index
          const pos = polarToCartesian(CX, CY, BULB_RADIUS, angle)
          return (
            <circle
              cx={pos.x}
              cy={pos.y}
              fill={trimPale}
              filter="url(#wheelBulbGlow)"
              key={`wheel-bulb-${angle}`}
              r={BULB_SIZE}
              stroke={trimDeep}
              strokeWidth="1.5"
            />
          )
        })}
      </svg>

      <div
        className="absolute inset-0"
        onTransitionEnd={(event) => {
          if (event.propertyName === "transform") {
            onTransitionEnd?.()
          }
        }}
        style={{
          transform: `rotate(${rotationDeg}deg)`,
          transformOrigin: `50% ${WHEEL_CENTER_Y_PERCENT}%`,
          transition: `transform ${transitionDurationMs}ms ${transitionEasing}`,
        }}
      >
        <svg
          aria-labelledby="luckyWheelTitle"
          className="h-full w-full"
          role="img"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        >
          <title id="luckyWheelTitle">Lucky wheel</title>
          {segments.map((segment, index) => {
            const centerAngle = sweep * index
            const startAngle = centerAngle - sweep / 2
            const endAngle = centerAngle + sweep / 2
            const fill = segment.isNonWinning
              ? LUCKY_WHEEL_NONWINNING_COLOR
              : LUCKY_WHEEL_SEGMENT_PALETTE[
                  index % LUCKY_WHEEL_SEGMENT_PALETTE.length
                ]
            const flip = centerAngle > 90 && centerAngle < 270
            const iconPos = { x: CX, y: CY - iconRadius }
            const labelPos = { x: CX, y: CY - labelRadius }

            return (
              <g key={segment.id}>
                <path
                  d={describeWedgePath(CX, CY, R_DISC, startAngle, endAngle)}
                  fill={fill}
                  stroke="#ffffff"
                  strokeOpacity="0.35"
                  strokeWidth="2"
                />
                <g transform={`rotate(${centerAngle} ${CX} ${CY})`}>
                  {segment.iconUrl && (
                    <image
                      height={iconSize}
                      href={segment.iconUrl}
                      transform={
                        flip
                          ? `rotate(180 ${iconPos.x} ${iconPos.y})`
                          : undefined
                      }
                      width={iconSize}
                      x={iconPos.x - iconSize / 2}
                      y={iconPos.y - iconSize / 2}
                    />
                  )}
                  <text
                    fill="#ffffff"
                    fontSize={fontSize}
                    fontWeight="600"
                    stroke="#00000055"
                    strokeWidth="0.5"
                    textAnchor="middle"
                    transform={
                      flip
                        ? `rotate(180 ${labelPos.x} ${labelPos.y})`
                        : undefined
                    }
                    x={labelPos.x}
                    y={labelPos.y}
                  >
                    {truncateLabel(segment.label, maxLabelChars)}
                  </text>
                </g>
              </g>
            )
          })}
          <circle cx={CX} cy={CY} fill="url(#discShadowRing)" r={R_DISC} />
          <circle cx={CX} cy={CY} fill="url(#discGloss)" r={R_DISC} />
        </svg>
      </div>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      >
        <path
          d={`M${CX - 16 + 3} ${CY - R_FRAME_OUTER - 6 + 4}L${CX + 16 + 3} ${CY - R_FRAME_OUTER - 6 + 4}L${CX + 3} ${CY - R_FRAME_OUTER + 26 + 4}Z`}
          fill="#000000"
          opacity="0.22"
        />
        <path
          d={`M${CX + 16} ${CY - R_FRAME_OUTER - 6}L${CX + 16 + 5} ${CY - R_FRAME_OUTER - 6 + 3}L${CX + 5} ${CY - R_FRAME_OUTER + 26 + 3}L${CX} ${CY - R_FRAME_OUTER + 26}Z`}
          fill={trimDeep}
          stroke={bodyDark}
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d={`M${CX - 16} ${CY - R_FRAME_OUTER - 6}L${CX + 16} ${CY - R_FRAME_OUTER - 6}L${CX} ${CY - R_FRAME_OUTER + 26}Z`}
          fill="url(#pointerShade)"
          stroke={bodyDark}
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d={`M${CX - 13} ${CY - R_FRAME_OUTER - 3}L${CX - 2} ${CY - R_FRAME_OUTER + 19}`}
          opacity="0.5"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <circle
          cx={CX}
          cy={CY}
          fill="url(#wheelFrame)"
          r={R_HUB}
          stroke={trimVivid}
          strokeWidth="4"
        />
        <circle
          cx={CX}
          cy={CY}
          fill={decorativeColor}
          r={R_HUB_BOLT}
          stroke={bodyDark}
          strokeWidth="2"
        />
      </svg>
      {/** biome-ignore-end lint/style/noMagicNumbers: hand-authored illustration layout constants */}
    </div>
  )
}
