export const ClaudeIconHex = "#D97757"

const RAY_ANGLES = [0, 30, 60, 90, 120, 150] as const

/** Simplified Claude spark: six rays through the centre. */
export const ClaudeIcon = ({
  className,
  fill,
}: {
  className?: string
  fill?: string
}) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke={fill ?? ClaudeIconHex}
    strokeLinecap="round"
    strokeWidth={2.4}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    {RAY_ANGLES.map((angle) => (
      <line
        key={angle}
        transform={`rotate(${angle} 12 12)`}
        x1="12"
        x2="12"
        y1="2.5"
        y2="21.5"
      />
    ))}
  </svg>
)
