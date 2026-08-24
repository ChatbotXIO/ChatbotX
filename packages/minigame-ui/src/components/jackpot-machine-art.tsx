"use client"

import { useEffect, useState } from "react"

type JackpotMachineArtProps = {
  machineColor: string
  decorativeColor: string
  reelSymbols?: [string, string, string]
  spinningReels?: [boolean, boolean, boolean]
  pulling?: boolean
}

const DEFAULT_REEL_SYMBOLS: [string, string, string] = ["7", "7", "7"]
const DEFAULT_SPINNING_REELS: [boolean, boolean, boolean] = [
  false,
  false,
  false,
]

const HEX_COMPONENT_LENGTH = 2
const HEX_PAIR_LENGTH = 6
const FALLBACK_RGB: [number, number, number] = [138, 0, 0]
const MAX_CHANNEL = 255

// Intentionally local rather than `@chatbotx.io/ui`'s `hexToRgb`: this one
// supports 3-digit shorthand hex and falls back to a visible dark-red tuple
// on malformed input instead of silently rendering black.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "")
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean
  if (normalized.length !== HEX_PAIR_LENGTH) {
    return FALLBACK_RGB
  }
  const r = Number.parseInt(normalized.slice(0, HEX_COMPONENT_LENGTH), 16)
  const g = Number.parseInt(
    normalized.slice(HEX_COMPONENT_LENGTH, HEX_COMPONENT_LENGTH * 2),
    16,
  )
  const b = Number.parseInt(
    normalized.slice(HEX_COMPONENT_LENGTH * 2, HEX_COMPONENT_LENGTH * 3),
    16,
  )
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return FALLBACK_RGB
  }
  return [r, g, b]
}

function toHexChannel(value: number): string {
  const clamped = Math.min(MAX_CHANNEL, Math.max(0, Math.round(value)))
  return clamped.toString(16).padStart(HEX_COMPONENT_LENGTH, "0")
}

/** Shifts a hex color toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const target = amount < 0 ? 0 : MAX_CHANNEL
  const weight = Math.abs(amount)
  return `#${toHexChannel(r + (target - r) * weight)}${toHexChannel(g + (target - g) * weight)}${toHexChannel(b + (target - b) * weight)}`
}

const REEL_WINDOWS = [
  { x: 260, symbol: "reel-0", clipId: "reelClip0" },
  { x: 389, symbol: "reel-1", clipId: "reelClip1" },
  { x: 518, symbol: "reel-2", clipId: "reelClip2" },
] as const
const REEL_Y = 404
const REEL_WIDTH = 122
const REEL_HEIGHT = 264
const REEL_SLIDE_DURATION_MS = 100
const LEVER_PULL_DURATION_MS = 1000

function computeReelFontSize(symbol: string): number {
  return symbol.length <= 1
    ? REEL_WIDTH * 0.62
    : Math.min(REEL_WIDTH * 0.62, (REEL_WIDTH * 0.82) / (symbol.length * 0.62))
}

/**
 * Renders one reel's symbol with a top-to-bottom slide transition on every
 * change, clipped to the reel window — mimics a real slot-machine drum
 * instead of the symbol snapping in place.
 */
function ReelWindow({
  x,
  clipId,
  symbol,
  spinning,
}: {
  x: number
  clipId: string
  symbol: string
  spinning: boolean
}) {
  const [displaySymbol, setDisplaySymbol] = useState(symbol)
  const [prevSymbol, setPrevSymbol] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setDisplaySymbol((current) => {
      if (current === symbol) {
        return current
      }
      setPrevSymbol(current)
      setTick((value) => value + 1)
      return symbol
    })
  }, [symbol])

  const textX = x + REEL_WIDTH / 2
  const textY = REEL_Y + REEL_HEIGHT / 2 + 2
  const currentFontSize = computeReelFontSize(displaySymbol)
  const prevFontSize = prevSymbol ? computeReelFontSize(prevSymbol) : 0

  return (
    <g clipPath={`url(#${clipId})`}>
      {prevSymbol !== null && (
        <text
          className="reel-slide-out"
          dominantBaseline="central"
          fill="#dc2626"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={prevFontSize}
          fontWeight={900}
          key={`prev-${tick}`}
          paintOrder="stroke"
          stroke="#111827"
          strokeWidth={prevFontSize * 0.075}
          textAnchor="middle"
          x={textX}
          y={textY}
        >
          {prevSymbol}
        </text>
      )}
      <text
        className={tick > 0 ? "reel-slide-in" : undefined}
        dominantBaseline="central"
        fill="#dc2626"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={currentFontSize}
        fontWeight={900}
        key={`cur-${tick}`}
        paintOrder="stroke"
        stroke="#111827"
        strokeWidth={currentFontSize * 0.075}
        style={spinning ? { filter: "blur(0.8px)" } : undefined}
        textAnchor="middle"
        x={textX}
        y={textY}
      >
        {displaySymbol}
      </text>
    </g>
  )
}

export function JackpotMachineArt({
  machineColor,
  decorativeColor,
  reelSymbols = DEFAULT_REEL_SYMBOLS,
  spinningReels = DEFAULT_SPINNING_REELS,
  pulling = false,
}: JackpotMachineArtProps) {
  const [leverPullTick, setLeverPullTick] = useState(0)

  useEffect(() => {
    if (pulling) {
      setLeverPullTick((tick) => tick + 1)
    }
  }, [pulling])

  const redDark = shade(machineColor, -0.55)
  const redDeep = shade(machineColor, -0.35)
  const redBright = shade(machineColor, 0.12)
  const redVivid = shade(machineColor, 0.28)
  const redHighlight = shade(machineColor, 0.4)

  const goldPale = shade(decorativeColor, 0.55)
  const goldDeep = shade(decorativeColor, -0.3)
  const goldDark = shade(decorativeColor, -0.55)
  const goldVivid = shade(decorativeColor, 0.35)

  return (
    <svg
      aria-labelledby="jackpotMachineTitle"
      className="w-full"
      role="img"
      viewBox="39 21 890 1032"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="jackpotMachineTitle">Jackpot machine</title>
      <defs>
        <linearGradient id="redSign" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={redDark} />
          <stop offset="0.28" stopColor={redVivid} />
          <stop offset="0.55" stopColor={redDeep} />
          <stop offset="0.78" stopColor={redVivid} />
          <stop offset="1" stopColor={redDark} />
        </linearGradient>
        <linearGradient id="redBody" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={redDark} />
          <stop offset="0.12" stopColor={redBright} />
          <stop offset="0.25" stopColor={redDeep} />
          <stop offset="0.42" stopColor={redVivid} />
          <stop offset="0.57" stopColor={redDeep} />
          <stop offset="0.76" stopColor={redBright} />
          <stop offset="1" stopColor={redDark} />
        </linearGradient>
        <linearGradient id="redLower" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={redVivid} />
          <stop offset="0.42" stopColor={redDeep} />
          <stop offset="1" stopColor={redBright} />
        </linearGradient>
        <linearGradient id="gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={goldPale} />
          <stop offset="0.2" stopColor={goldVivid} />
          <stop offset="0.48" stopColor={goldDeep} />
          <stop offset="0.72" stopColor={goldVivid} />
          <stop offset="1" stopColor={goldDark} />
        </linearGradient>
        <linearGradient id="goldBright" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={goldPale} />
          <stop offset="0.45" stopColor={goldVivid} />
          <stop offset="1" stopColor={goldDark} />
        </linearGradient>
        <linearGradient id="reelWhite" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f8fbff" />
          <stop offset="1" stopColor="#e6ebf0" />
        </linearGradient>
        <linearGradient id="glassShine" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="buttonGold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={goldPale} />
          <stop offset="0.55" stopColor={goldVivid} />
          <stop offset="1" stopColor={goldDeep} />
        </linearGradient>
        <linearGradient id="buttonRed" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={redHighlight} />
          <stop offset="0.55" stopColor={redVivid} />
          <stop offset="1" stopColor={redDark} />
        </linearGradient>
        <radialGradient cx="35%" cy="28%" id="leverBall" r="72%">
          <stop offset="0" stopColor={redHighlight} />
          <stop offset="0.45" stopColor={redVivid} />
          <stop offset="1" stopColor={redDark} />
        </radialGradient>
        <filter height="180%" id="shadow" width="160%" x="-30%" y="-30%">
          <feGaussianBlur in="SourceAlpha" result="blur" stdDeviation="12" />
          <feOffset dx="0" dy="12" in="blur" result="offsetBlur" />
          <feFlood
            floodColor="#000000"
            floodOpacity="0.48"
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
        <filter height="180%" id="smallShadow" width="160%" x="-30%" y="-30%">
          <feGaussianBlur in="SourceAlpha" result="blur" stdDeviation="4" />
          <feOffset dx="0" dy="4" in="blur" result="offsetBlur" />
          <feFlood
            floodColor="#3f1600"
            floodOpacity="0.65"
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
        <filter height="600%" id="bulbGlow" width="600%" x="-250%" y="-250%">
          <feGaussianBlur result="blur" stdDeviation="4" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter height="180%" id="textShadow" width="140%" x="-20%" y="-30%">
          <feGaussianBlur in="SourceAlpha" result="blur" stdDeviation="3" />
          <feOffset dx="0" dy="5" in="blur" result="offsetBlur" />
          <feFlood
            floodColor="#4a1200"
            floodOpacity="0.9"
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
        <clipPath id="middleBodyClip">
          <rect height="400" rx="19" width="672" x="113" y="337" />
        </clipPath>
        <clipPath id="lowerBodyClip">
          <path d="M100 756H790L829 838V1000Q829 1012 817 1012H80Q68 1012 68 1000V838Z" />
        </clipPath>
        <clipPath id="marqueeClip">
          <path d="M132 104H300Q354 42 449 42Q544 42 598 104H766Q789 104 789 127V283Q789 306 766 306H132Q109 306 109 283V127Q109 104 132 104Z" />
        </clipPath>
        {REEL_WINDOWS.map((reel) => (
          <clipPath id={reel.clipId} key={`reel-clip-${reel.symbol}`}>
            <rect
              height={REEL_HEIGHT}
              width={REEL_WIDTH}
              x={reel.x}
              y={REEL_Y}
            />
          </clipPath>
        ))}
      </defs>
      <style>
        {`
          @keyframes reelSlideIn {
            from { transform: translateY(-${REEL_HEIGHT}px); }
            to { transform: translateY(0); }
          }
          @keyframes reelSlideOut {
            from { transform: translateY(0); }
            to { transform: translateY(${REEL_HEIGHT}px); }
          }
          .reel-slide-in {
            animation: reelSlideIn ${REEL_SLIDE_DURATION_MS}ms linear both;
          }
          .reel-slide-out {
            animation: reelSlideOut ${REEL_SLIDE_DURATION_MS}ms linear both;
          }
          @keyframes leverPull {
            0% { transform: rotate(0deg); }
            35% { transform: rotate(-24deg); }
            65% { transform: rotate(5deg); }
            100% { transform: rotate(0deg); }
          }
          .lever-pull {
            animation: leverPull ${LEVER_PULL_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1);
          }
        `}
      </style>

      {/** biome-ignore-start lint/style/noMagicNumbers: hand-authored illustration layout constants, mirrors the source design file */}
      <g filter="url(#shadow)" id="central-pillar">
        <rect
          fill="url(#redBody)"
          height="590"
          rx="28"
          stroke="url(#goldBright)"
          strokeWidth="10"
          width="460"
          x="220"
          y="268"
        />
        <rect
          fill="#ff5f42"
          height="570"
          opacity="0.065"
          width="36"
          x="238"
          y="278"
        />
        <rect
          fill="#ff5f42"
          height="570"
          opacity="0.065"
          width="36"
          x="316"
          y="278"
        />
        <rect
          fill="#ff5f42"
          height="570"
          opacity="0.065"
          width="36"
          x="394"
          y="278"
        />
        <rect
          fill="#ff5f42"
          height="570"
          opacity="0.065"
          width="36"
          x="472"
          y="278"
        />
        <rect
          fill="#ff5f42"
          height="570"
          opacity="0.065"
          width="36"
          x="550"
          y="278"
        />
        <rect
          fill="#ff5f42"
          height="570"
          opacity="0.065"
          width="34"
          x="628"
          y="278"
        />
        <path
          d="M239 285V841"
          opacity="0.24"
          stroke="#fff2a6"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M661 285V841"
          opacity="0.22"
          stroke="#530000"
          strokeLinecap="round"
          strokeWidth="7"
        />
      </g>
      <g filter="url(#shadow)" id="lever">
        <path
          d="M781 495H828Q854 495 854 521V690Q854 715 829 715H781Z"
          fill="url(#goldBright)"
          stroke="#9a5300"
          strokeWidth="7"
        />
        <path d="M827 527H884V687H827Z" fill="#f1ad31" opacity="0.72" />
        <g
          className={leverPullTick > 0 ? "lever-pull" : undefined}
          id="lever-arm"
          key={leverPullTick}
          style={{ transformOrigin: "855px 540px" }}
        >
          <rect
            fill="url(#goldBright)"
            height="202"
            rx="9"
            stroke="#9a5300"
            strokeWidth="4"
            width="18"
            x="846"
            y="342"
          />
          <circle
            cx="855"
            cy="319"
            fill="url(#leverBall)"
            r="47"
            stroke="#8f000a"
            strokeWidth="5"
          />
          <ellipse
            cx="841"
            cy="301"
            fill="#ff8f97"
            opacity="0.46"
            rx="13"
            ry="10"
          />
        </g>
      </g>
      <g filter="url(#shadow)" id="marquee">
        <path
          d="M132 104H300Q354 42 449 42Q544 42 598 104H766Q789 104 789 127V283Q789 306 766 306H132Q109 306 109 283V127Q109 104 132 104Z"
          fill="url(#redSign)"
          stroke="url(#goldBright)"
          strokeLinejoin="round"
          strokeWidth="11"
        />
        <path
          d="M145 119H309Q365 60 449 60Q533 60 589 119H753Q772 119 772 137V273Q772 291 753 291H145Q126 291 126 273V137Q126 119 145 119Z"
          fill="none"
          opacity="0.95"
          stroke={goldPale}
          strokeWidth="3"
        />
        <g clipPath="url(#marqueeClip)">
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="145"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="206"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="267"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="328"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="389"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="450"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="511"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="572"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="633"
            y="42"
          />
          <rect
            fill="#ff5a3d"
            height="250"
            opacity="0.065"
            width="28"
            x="694"
            y="42"
          />
        </g>
        {[137, 168, 199, 230, 261, 292, 606, 637, 668, 699, 730, 761].map(
          (cx) => (
            <circle
              cx={cx}
              cy="113"
              fill="#fff7c4"
              filter="url(#bulbGlow)"
              key={`bulb-top-${cx}`}
              r="6.6"
              stroke="#ffc22d"
              strokeWidth="2"
            />
          ),
        )}
        {[
          [301, 98],
          [321, 80],
          [345, 65],
          [372, 54],
          [400, 47],
          [425, 43],
          [449, 41],
          [473, 43],
          [498, 47],
          [526, 54],
          [553, 65],
          [577, 80],
          [597, 98],
        ].map(([cx, cy]) => (
          <circle
            cx={cx}
            cy={cy}
            fill="#fff7c4"
            filter="url(#bulbGlow)"
            key={`bulb-arch-${cx}`}
            r="6.6"
            stroke="#ffc22d"
            strokeWidth="2"
          />
        ))}
        {[
          [119, 139],
          [779, 139],
          [119, 170],
          [779, 170],
          [119, 201],
          [779, 201],
          [119, 232],
          [779, 232],
          [119, 263],
          [779, 263],
        ].map(([cx, cy]) => (
          <circle
            cx={cx}
            cy={cy}
            fill="#fff7c4"
            filter="url(#bulbGlow)"
            key={`bulb-side-${cx}-${cy}`}
            r="6.6"
            stroke="#ffc22d"
            strokeWidth="2"
          />
        ))}
        {[
          139, 170, 201, 232, 263, 294, 325, 356, 387, 418, 449, 480, 511, 542,
          573, 604, 635, 666, 697, 728, 759,
        ].map((cx) => (
          <circle
            cx={cx}
            cy="297"
            fill="#fff7c4"
            filter="url(#bulbGlow)"
            key={`bulb-bottom-${cx}`}
            r="6.6"
            stroke="#ffc22d"
            strokeWidth="2"
          />
        ))}
        <g filter="url(#smallShadow)" transform="translate(449 109)">
          <path
            d="M-35 20L-47 -16L-22 3L0 -31L22 3L47 -16L35 20Z"
            fill="url(#goldBright)"
            stroke="#fff2a7"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <rect
            fill="url(#gold)"
            height="15"
            rx="3"
            stroke="#fff2a7"
            strokeWidth="3"
            width="72"
            x="-36"
            y="19"
          />
          <circle cx="-47" cy="-16" fill="#fff5b4" r="5" />
          <circle cx="0" cy="-31" fill="#fff5b4" r="5" />
          <circle cx="47" cy="-16" fill="#fff5b4" r="5" />
        </g>
        <text
          fill="url(#goldBright)"
          filter="url(#textShadow)"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize="77"
          fontWeight="700"
          letterSpacing="2"
          paintOrder="stroke fill"
          stroke="#7f3000"
          strokeWidth="2"
          textAnchor="middle"
          x="449"
          y="239"
        >
          JACKPOT
        </text>
        {[
          [152, 112],
          [245, 112],
          [350, 75],
          [449, 48],
          [548, 75],
          [653, 112],
          [746, 112],
          [132, 205],
          [766, 205],
          [190, 296],
          [313, 296],
          [449, 296],
          [585, 296],
          [708, 296],
        ].map(([tx, ty]) => (
          <g
            filter="url(#bulbGlow)"
            key={`sparkle-${tx}-${ty}`}
            opacity="0.95"
            transform={`translate(${tx} ${ty}) scale(1.00)`}
          >
            <path
              d="M-12 0H12M0-12V12"
              stroke="#fffde5"
              strokeLinecap="round"
              strokeWidth="3"
            />
            <path
              d="M-7-7L7 7M7-7L-7 7"
              stroke="#ffe58a"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </g>
        ))}
      </g>
      <g filter="url(#shadow)" id="main-cabinet">
        <rect
          fill="url(#redBody)"
          height="400"
          rx="19"
          stroke="url(#goldBright)"
          strokeWidth="10"
          width="672"
          x="113"
          y="337"
        />
        <g clipPath="url(#middleBodyClip)">
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="126"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="201"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="276"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="351"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="426"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="501"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="576"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="651"
            y="340"
          />
          <rect
            fill="#ff5f42"
            height="392"
            opacity="0.075"
            width="34"
            x="726"
            y="340"
          />
          <path
            d="M130 350H765"
            opacity="0.18"
            stroke="#ff7a5c"
            strokeWidth="6"
          />
          <path
            d="M126 716H770"
            opacity="0.22"
            stroke="#4e0000"
            strokeWidth="8"
          />
        </g>
        <rect
          fill="url(#goldBright)"
          height="308"
          rx="4"
          stroke="#8c4500"
          strokeWidth="5"
          width="424"
          x="238"
          y="382"
        />
        <rect
          fill="#c47c13"
          height="276"
          rx="2"
          stroke="#ffe78d"
          strokeWidth="4"
          width="394"
          x="253"
          y="398"
        />
        {REEL_WINDOWS.map((reel) => (
          <rect
            fill="url(#reelWhite)"
            height={REEL_HEIGHT}
            key={`reel-window-${reel.symbol}`}
            rx="2"
            stroke="#8f8f8f"
            strokeWidth="2"
            width={REEL_WIDTH}
            x={reel.x}
            y={REEL_Y}
          />
        ))}
        <path
          d="M266 410H376L350 438H278Z"
          fill="url(#glassShine)"
          opacity="0.65"
        />
        <path
          d="M395 410H505L479 438H407Z"
          fill="url(#glassShine)"
          opacity="0.65"
        />
        <path
          d="M524 410H634L608 438H536Z"
          fill="url(#glassShine)"
          opacity="0.65"
        />
        {REEL_WINDOWS.map((reel, index) => (
          <ReelWindow
            clipId={reel.clipId}
            key={`reel-symbol-${reel.symbol}`}
            spinning={spinningReels[index]}
            symbol={reelSymbols[index]}
            x={reel.x}
          />
        ))}
        <rect fill="url(#gold)" height="270" width="7" x="382" y="401" />
        <rect fill="url(#gold)" height="270" width="7" x="511" y="401" />
        <path d="M252 398H647L636 410H264Z" fill="#fff3a2" opacity="0.72" />
        <path d="M253 674H647L636 662H264Z" fill="#9e5200" opacity="0.55" />
        <g filter="url(#smallShadow)" id="arrows">
          <path
            d="M194 510L220 536L194 562L187 555V517Z"
            fill="url(#goldBright)"
            stroke="#7d3a00"
            strokeLinejoin="round"
            strokeWidth="5"
          />
          <path
            d="M708 510L682 536L708 562L715 555V517Z"
            fill="url(#goldBright)"
            stroke="#7d3a00"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        </g>
      </g>
      <g filter="url(#shadow)" id="lower-console">
        <path
          d="M100 756H790L829 838V1000Q829 1012 817 1012H80Q68 1012 68 1000V838Z"
          fill="url(#redLower)"
          stroke="url(#goldBright)"
          strokeLinejoin="round"
          strokeWidth="10"
        />
        <g clipPath="url(#lowerBodyClip)">
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="78"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="160"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="242"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="324"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="406"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="488"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="570"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="652"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="734"
            y="832"
          />
          <rect
            fill="#ff5d3d"
            height="178"
            opacity="0.075"
            width="34"
            x="816"
            y="832"
          />
        </g>
        <path
          d="M101 756H790L829 838H68Z"
          fill="url(#goldBright)"
          stroke="#a45400"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <path d="M108 766H782L790 783H99Z" fill="#fff3ae" opacity="0.55" />
        <g filter="url(#smallShadow)">
          <path
            d="M133 771H243L251 815H123Z"
            fill="url(#buttonGold)"
            stroke="#7a3a00"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <path
            d="M134 776H239"
            opacity="0.55"
            stroke="#fff6b7"
            strokeWidth="4"
          />
        </g>
        <g filter="url(#smallShadow)">
          <path
            d="M292 771H402L410 815H282Z"
            fill="url(#buttonGold)"
            stroke="#7a3a00"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <path
            d="M293 776H398"
            opacity="0.55"
            stroke="#fff6b7"
            strokeWidth="4"
          />
        </g>
        <g filter="url(#smallShadow)">
          <path
            d="M451 771H561L569 815H441Z"
            fill="url(#buttonGold)"
            stroke="#7a3a00"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <path
            d="M452 776H557"
            opacity="0.55"
            stroke="#fff6b7"
            strokeWidth="4"
          />
        </g>
        <g filter="url(#smallShadow)">
          <path
            d="M660 768H770L778 816H650Z"
            fill="url(#buttonRed)"
            stroke="#7a3a00"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <path
            d="M661 773H766"
            opacity="0.55"
            stroke="#fff6b7"
            strokeWidth="4"
          />
        </g>
        <path
          d="M206 899H682"
          opacity="0.08"
          stroke="#ffffff"
          strokeWidth="3"
        />
        <path d="M87 995H812" opacity="0.45" stroke="#ffcf42" strokeWidth="4" />
      </g>
      <g id="highlights" opacity="0.5">
        <path
          d="M133 361H763"
          opacity="0.55"
          stroke="#fff8c6"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M96 783H798"
          opacity="0.48"
          stroke="#fff9c8"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M125 128Q190 117 294 121"
          opacity="0.18"
          stroke="#fff"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </g>
      {/** biome-ignore-end lint/style/noMagicNumbers: hand-authored illustration layout constants, mirrors the source design file */}
    </svg>
  )
}
