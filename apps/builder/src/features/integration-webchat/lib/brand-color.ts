const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6})$/

const SRGB_CHANNEL_MAX = 255
const GAMMA_THRESHOLD = 0.039_28
const GAMMA_LINEAR_DIVISOR = 12.92
const GAMMA_OFFSET = 0.055
const GAMMA_SCALE = 1.055
const GAMMA_EXPONENT = 2.4
const LUMINANCE_WEIGHT_RED = 0.2126
const LUMINANCE_WEIGHT_GREEN = 0.7152
const LUMINANCE_WEIGHT_BLUE = 0.0722
const LUMINANCE_THRESHOLD = 0.5

const WHITE_FOREGROUND = "#ffffff"
const BLACK_FOREGROUND = "#0a0a0a"

/**
 * Converts one sRGB channel (0-255) to its linear-light value, per the
 * WCAG relative luminance formula.
 */
const toLinearChannel = (channel: number): number => {
  const normalized = channel / SRGB_CHANNEL_MAX
  return normalized <= GAMMA_THRESHOLD
    ? normalized / GAMMA_LINEAR_DIVISOR
    : ((normalized + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA_EXPONENT
}

/**
 * Relative luminance of a `#RRGGBB` hex color, per WCAG 2.x. Returns
 * `undefined` for anything that isn't a strict 6-digit hex string so callers
 * can fall back safely instead of rendering on a garbage value.
 */
export const getRelativeLuminance = (hexColor: string): number | undefined => {
  const match = HEX_COLOR_REGEX.exec(hexColor)
  if (!match) {
    return
  }

  const value = match[1]
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)

  return (
    LUMINANCE_WEIGHT_RED * toLinearChannel(red) +
    LUMINANCE_WEIGHT_GREEN * toLinearChannel(green) +
    LUMINANCE_WEIGHT_BLUE * toLinearChannel(blue)
  )
}

/**
 * Picks a readable near-black or near-white foreground for a given
 * `brandColor` background. `webchat-wrapper.tsx` overrides the `--primary`
 * design token with the admin's brand color, but `--primary-foreground` is
 * hardcoded near-white in every theme (see packages/ui/src/styles/default.css)
 * — on a light brand color that produces unreadable white-on-yellow text.
 * Falls back to white (the existing default) when the color can't be parsed.
 */
export const readableForeground = (hexColor: string): string => {
  const luminance = getRelativeLuminance(hexColor)
  if (luminance === undefined) {
    return WHITE_FOREGROUND
  }

  return luminance > LUMINANCE_THRESHOLD ? BLACK_FOREGROUND : WHITE_FOREGROUND
}
