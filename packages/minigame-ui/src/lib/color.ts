const HEX_COMPONENT_LENGTH = 2
const HEX_PAIR_LENGTH = 6
const MAX_CHANNEL = 255

/**
 * Supports 3-digit shorthand hex and falls back to `fallbackRgb` on
 * malformed input instead of silently rendering black.
 */
export function hexToRgb(
  hex: string,
  fallbackRgb: [number, number, number],
): [number, number, number] {
  const clean = hex.replace("#", "")
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean
  if (normalized.length !== HEX_PAIR_LENGTH) {
    return fallbackRgb
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
    return fallbackRgb
  }
  return [r, g, b]
}

export function toHexChannel(value: number): string {
  const clamped = Math.min(MAX_CHANNEL, Math.max(0, Math.round(value)))
  return clamped.toString(16).padStart(HEX_COMPONENT_LENGTH, "0")
}

/** Shifts a hex color toward white (amount > 0) or black (amount < 0). */
export function shade(
  hex: string,
  amount: number,
  fallbackRgb: [number, number, number],
): string {
  const [r, g, b] = hexToRgb(hex, fallbackRgb)
  const target = amount < 0 ? 0 : MAX_CHANNEL
  const weight = Math.abs(amount)
  return `#${toHexChannel(r + (target - r) * weight)}${toHexChannel(g + (target - g) * weight)}${toHexChannel(b + (target - b) * weight)}`
}
