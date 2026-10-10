/**
 * Google returns enum names (`ONE_PER_CLICK`, `UPLOAD_CLICKS`) as open-ended
 * strings, so a translation map can never be exhaustive: the known values are
 * translated in `google-enum-labels`, and every other one falls back to this
 * sentence-case rendering instead of the raw constant.
 */
export const humanizeGoogleEnum = (value: string): string => {
  const words = value.toLowerCase().replaceAll("_", " ").trim()
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : value
}
