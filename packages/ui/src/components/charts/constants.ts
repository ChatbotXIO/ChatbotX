export const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

const GOLDEN_ANGLE = 137.508
const EXTRA_LIGHTNESS = 62
const EXTRA_CHROMA = 0.15
const HUE_OFFSET = 25

/**
 * Colour for the series at `index`. The first five are the theme chart tokens
 * (unchanged); beyond that a deterministic golden-angle hue rotation keeps
 * extra series visually distinct.
 */
export function getSeriesColor(index: number): string {
  if (index < COLORS.length) {
    return COLORS[index] as string
  }
  const hue = Math.round(
    (HUE_OFFSET + (index - COLORS.length) * GOLDEN_ANGLE) % 360,
  )
  return `oklch(${EXTRA_LIGHTNESS}% ${EXTRA_CHROMA} ${hue})`
}

const CATEGORICAL_HUES = [255, 25, 150, 325, 85, 200, 290, 355]
const CATEGORICAL_EXTRA_HUE_OFFSET = 12
const CATEGORICAL_LIGHTNESS = 62
const CATEGORICAL_CHROMA = 0.17

/**
 * Colour for series that must be told apart at a glance (e.g. one bar per
 * agent): well-separated hues at one lightness/chroma that stays readable on
 * both light and dark surfaces. Deterministic from index 0; beyond the fixed
 * hue list it continues with a golden-angle rotation.
 */
export function getCategoricalColor(index: number): string {
  const hue =
    index < CATEGORICAL_HUES.length
      ? (CATEGORICAL_HUES[index] as number)
      : Number(
          (
            (CATEGORICAL_EXTRA_HUE_OFFSET +
              (index - CATEGORICAL_HUES.length) * GOLDEN_ANGLE) %
            360
          ).toFixed(1),
        )
  return `oklch(${CATEGORICAL_LIGHTNESS}% ${CATEGORICAL_CHROMA} ${hue})`
}

export const OPACITY = 0.7

/**
 * Colour index of a series. Without `colorKeys` it is the series' own position;
 * with them, listed labels keep their listed index in every chart and unlisted
 * ones follow after the listed ones.
 */
export function resolveColorIndex(
  label: string,
  position: number,
  allLabels: readonly string[],
  colorKeys?: readonly string[],
): number {
  if (!colorKeys) {
    return position
  }
  const keyed = colorKeys.indexOf(label)
  if (keyed !== -1) {
    return keyed
  }
  const unlisted = allLabels.filter(
    (candidate) => !colorKeys.includes(candidate),
  )
  return colorKeys.length + unlisted.indexOf(label)
}
