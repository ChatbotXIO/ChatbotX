"use client"

type JackpotMachineArtProps = {
  machineColor: string
  decorativeColor: string
  reelSymbols?: [string, string, string]
  spinningReels?: [boolean, boolean, boolean]
}

const DEFAULT_REEL_SYMBOLS: [string, string, string] = ["7", "7", "7"]
const DEFAULT_SPINNING_REELS: [boolean, boolean, boolean] = [
  false,
  false,
  false,
]

const VIEW_WIDTH = 200
const VIEW_HEIGHT = 244

const FRAME = { x: 4, y: 4, width: 192, height: 232, rx: 14 }
const INSET = 6

const HOOD = {
  x: FRAME.x + INSET,
  y: 10,
  width: FRAME.width - INSET * 2,
  height: 50,
}
const DIVIDER_1 = {
  x: HOOD.x,
  y: HOOD.y + HOOD.height,
  width: HOOD.width,
  height: 6,
}
const REEL_SECTION = {
  x: HOOD.x,
  y: DIVIDER_1.y + DIVIDER_1.height,
  width: HOOD.width,
  height: 82,
}
const REEL_FRAME = {
  x: REEL_SECTION.x + 12,
  y: REEL_SECTION.y + 8,
  width: REEL_SECTION.width - 24,
  height: 52,
}
const REEL_GAP = 4
const REEL_WIDTH = (REEL_FRAME.width - REEL_GAP * 2) / 3
const REEL_CELLS = [0, 1, 2].map((index) => ({
  x: REEL_FRAME.x + index * (REEL_WIDTH + REEL_GAP),
  y: REEL_FRAME.y + 4,
  width: REEL_WIDTH,
  height: REEL_FRAME.height - 8,
}))
const DIVIDER_2 = {
  x: HOOD.x,
  y: REEL_SECTION.y + REEL_SECTION.height,
  width: HOOD.width,
  height: 6,
}
const LOWER_BODY = {
  x: HOOD.x,
  y: DIVIDER_2.y + DIVIDER_2.height,
  width: HOOD.width,
  height: FRAME.y + FRAME.height - INSET - (DIVIDER_2.y + DIVIDER_2.height),
}
const LEVER_X = FRAME.x + FRAME.width - 2
const LEVER_BALL_Y = REEL_SECTION.y + 6

export function JackpotMachineArt({
  machineColor,
  decorativeColor,
  reelSymbols = DEFAULT_REEL_SYMBOLS,
  spinningReels = DEFAULT_SPINNING_REELS,
}: JackpotMachineArtProps) {
  return (
    <svg
      className="w-full"
      role="img"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
    >
      <title>Jackpot machine</title>
      <defs>
        <linearGradient id="jackpotChrome" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="45%" stopColor="#cbd5e1" />
          <stop offset="55%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="jackpotGloss" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="jackpotShade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.35" />
          <stop offset="18%" stopColor="#000000" stopOpacity="0" />
          <stop offset="82%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/** biome-ignore-start lint/style/noMagicNumbers: hand-authored illustration layout constants */}
      <rect
        fill="url(#jackpotChrome)"
        height={FRAME.height}
        rx={FRAME.rx}
        width={FRAME.width}
        x={FRAME.x}
        y={FRAME.y}
      />

      <rect
        fill={machineColor}
        height={HOOD.height}
        width={HOOD.width}
        x={HOOD.x}
        y={HOOD.y}
      />
      <rect
        fill={decorativeColor}
        height={2}
        rx={1}
        width={HOOD.width - 8}
        x={HOOD.x + 4}
        y={HOOD.y + 4}
      />
      <rect
        fill="url(#jackpotGloss)"
        height={HOOD.height}
        width={HOOD.width}
        x={HOOD.x}
        y={HOOD.y}
      />

      <rect
        fill="url(#jackpotChrome)"
        height={DIVIDER_1.height}
        width={DIVIDER_1.width}
        x={DIVIDER_1.x}
        y={DIVIDER_1.y}
      />

      <rect
        fill={machineColor}
        height={REEL_SECTION.height}
        width={REEL_SECTION.width}
        x={REEL_SECTION.x}
        y={REEL_SECTION.y}
      />
      <rect
        fill="url(#jackpotGloss)"
        height={REEL_SECTION.height}
        width={REEL_SECTION.width}
        x={REEL_SECTION.x}
        y={REEL_SECTION.y}
      />

      <rect
        fill="#1f2937"
        height={REEL_FRAME.height}
        rx={4}
        width={REEL_FRAME.width}
        x={REEL_FRAME.x}
        y={REEL_FRAME.y}
      />

      {REEL_CELLS.map((cell, index) => {
        const symbol = reelSymbols[index]
        // Multi-character symbols (e.g. "BAR") need a smaller font than a
        // single glyph (e.g. "7") to stay inside the cell — sizing purely by
        // cell height (as before) let long symbols overflow the cell width.
        const fontSize =
          symbol.length <= 1
            ? cell.height * 0.62
            : Math.min(
                cell.height * 0.62,
                (cell.width * 0.82) / (symbol.length * 0.62),
              )

        return (
          <g key={`reel-${index.toString()}`}>
            <rect
              fill="#fdfdfb"
              height={cell.height}
              rx={2.5}
              width={cell.width}
              x={cell.x}
              y={cell.y}
            />
            <text
              dominantBaseline="central"
              fill="#dc2626"
              fontFamily="Arial, Helvetica, sans-serif"
              fontSize={fontSize}
              fontWeight={900}
              paintOrder="stroke"
              stroke="#111827"
              strokeWidth={fontSize * 0.075}
              style={
                spinningReels[index] ? { filter: "blur(0.6px)" } : undefined
              }
              textAnchor="middle"
              x={cell.x + cell.width / 2}
              y={cell.y + cell.height / 2 + 1}
            >
              {symbol}
            </text>
            <rect
              fill="url(#jackpotShade)"
              height={cell.height}
              rx={2.5}
              width={cell.width}
              x={cell.x}
              y={cell.y}
            />
          </g>
        )
      })}

      <g>
        <rect
          fill="url(#jackpotChrome)"
          height={4}
          rx={2}
          width={16}
          x={REEL_SECTION.x + 18}
          y={REEL_SECTION.y + REEL_SECTION.height - 8}
        />
        <rect
          fill="url(#jackpotChrome)"
          height={4}
          rx={2}
          width={16}
          x={REEL_SECTION.x + 40}
          y={REEL_SECTION.y + REEL_SECTION.height - 8}
        />
        <rect
          fill="url(#jackpotChrome)"
          height={4}
          rx={2}
          width={16}
          x={REEL_SECTION.x + 62}
          y={REEL_SECTION.y + REEL_SECTION.height - 8}
        />
        <circle
          cx={REEL_SECTION.x + REEL_SECTION.width - 20}
          cy={REEL_SECTION.y + REEL_SECTION.height - 6}
          fill="url(#jackpotChrome)"
          r={5}
          stroke="#1f2937"
          strokeWidth={1}
        />
      </g>

      <rect
        fill="url(#jackpotChrome)"
        height={DIVIDER_2.height}
        width={DIVIDER_2.width}
        x={DIVIDER_2.x}
        y={DIVIDER_2.y}
      />

      <rect
        fill={machineColor}
        height={LOWER_BODY.height}
        width={LOWER_BODY.width}
        x={LOWER_BODY.x}
        y={LOWER_BODY.y}
      />
      <rect
        fill="url(#jackpotGloss)"
        height={LOWER_BODY.height}
        width={LOWER_BODY.width}
        x={LOWER_BODY.x}
        y={LOWER_BODY.y}
      />

      <rect
        fill="url(#jackpotChrome)"
        height={5}
        rx={2}
        width={FRAME.width - INSET * 2}
        x={FRAME.x + INSET}
        y={FRAME.y + FRAME.height - INSET - 5}
      />

      <path
        d={`M ${FRAME.x + 40} ${FRAME.y + FRAME.height} L ${
          FRAME.x + FRAME.width - 40
        } ${FRAME.y + FRAME.height} L ${FRAME.x + FRAME.width - 52} ${
          FRAME.y + FRAME.height + 8
        } L ${FRAME.x + 52} ${FRAME.y + FRAME.height + 8} Z`}
        fill="url(#jackpotChrome)"
      />

      <rect
        fill="url(#jackpotChrome)"
        height={44}
        rx={2.5}
        width={5}
        x={LEVER_X - 2.5}
        y={LEVER_BALL_Y + 5}
      />
      <circle
        cx={LEVER_X}
        cy={LEVER_BALL_Y}
        fill={machineColor}
        r={7}
        stroke="url(#jackpotChrome)"
        strokeWidth={1.5}
      />
      <circle
        cx={LEVER_X}
        cy={LEVER_BALL_Y + 49}
        fill="#475569"
        r={4.5}
        stroke="#1f2937"
        strokeWidth={1}
      />
      {/** biome-ignore-end lint/style/noMagicNumbers: hand-authored illustration layout constants */}
    </svg>
  )
}
