import {
  normalizeTemporalCustomFieldValue,
  type TemporalCustomFieldType,
  TemporalInputParsing,
} from "../datetime"
import { parseLooseTemporalValue } from "./parse"

export type TemporalStorageNormalizationInput = {
  type: TemporalCustomFieldType
  /** Raw source text as authored. */
  value: string
  /** Zone that anchors a naive value; anything unusable resolves to UTC. */
  timezone: string | null | undefined
  /** Defaults to Strict. */
  parsing?: TemporalInputParsing
}

type TemporalStorageNormalizer = (
  input: TemporalStorageNormalizationInput,
) => string | null

const normalizeCanonicalValue: TemporalStorageNormalizer = ({
  type,
  value,
  timezone,
}) => normalizeTemporalCustomFieldValue(type, value, timezone)

const normalizeLooselyParsedValue: TemporalStorageNormalizer = ({
  type,
  value,
  timezone,
}) => {
  const canonicalValue = parseLooseTemporalValue(type, value, timezone)
  return canonicalValue === null
    ? null
    : normalizeTemporalCustomFieldValue(type, canonicalValue, timezone)
}

/**
 * Strict first, loose only as a fallback — for BOTH field types.
 *
 * The loose parser reaches a canonical string by re-deriving it, which is
 * lossy in two ways the strict normalizer is not:
 * - it renders through a second-precision shape, dropping milliseconds;
 * - it treats an offset-bearing value as an instant and re-projects it, so a
 *   `date` can land on the neighbouring calendar day (`2026-05-19T23:30-04:00`
 *   would become 2026-05-20 in UTC+7).
 *
 * A value the strict normalizer already understands is therefore always kept
 * verbatim: the authored calendar day wins over the re-projected one.
 */
const temporalStorageNormalizers = {
  [TemporalInputParsing.Strict]: normalizeCanonicalValue,
  [TemporalInputParsing.Lenient]: (input) =>
    normalizeCanonicalValue(input) ?? normalizeLooselyParsedValue(input),
} as const satisfies Record<TemporalInputParsing, TemporalStorageNormalizer>

/**
 * Single entry point every write path uses to turn raw temporal input into the
 * string persisted on `ContactCustomFieldValue`. Returns null when the value
 * cannot be normalized, so callers skip it rather than storing garbage into a
 * column the rest of the system reads as canonical ISO.
 */
export const normalizeTemporalValueForStorage = (
  input: TemporalStorageNormalizationInput,
): string | null =>
  temporalStorageNormalizers[input.parsing ?? TemporalInputParsing.Strict](
    input,
  )
