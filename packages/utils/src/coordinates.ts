export const COORDINATE_PAIR_PATTERN =
  /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

/**
 * Parses a "lat,lng" pair (stored, typed, or pasted from Google Maps). Values
 * are parsed with `Number`, so full precision is preserved; null when the text
 * is not a pair or either value is out of range.
 */
export const parseCoordinatePair = (
  text: string,
): { latitude: number; longitude: number } | null => {
  const match = COORDINATE_PAIR_PATTERN.exec(text)
  if (!match) {
    return null
  }

  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null
  }

  return { latitude, longitude }
}
