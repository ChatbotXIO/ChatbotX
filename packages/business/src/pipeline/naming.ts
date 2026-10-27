import {
  PIPELINE_LIMITS,
  PIPELINE_REFERENCE_NAME_MAX,
} from "@chatbotx.io/database/partials"

type SuffixStyle = "name" | "referenceName"

const SUFFIX: Record<SuffixStyle, (n: number) => string> = {
  name: (n) => ` ${n}`,
  referenceName: (n) => `_${n}`,
}

const MAX_LENGTH: Record<SuffixStyle, number> = {
  name: PIPELINE_LIMITS.name,
  referenceName: PIPELINE_REFERENCE_NAME_MAX,
}

/** `candidate`, or `candidate 2`, `candidate 3`… the first one not in `taken`. */
export function allocateUniqueName(
  candidate: string,
  taken: Iterable<string>,
  style: SuffixStyle,
): string {
  const used = new Set(taken)
  if (used.has(candidate)) {
    for (let attempt = 2; ; attempt += 1) {
      const suffix = SUFFIX[style](attempt)
      const next = `${candidate.slice(0, MAX_LENGTH[style] - suffix.length)}${suffix}`
      if (!used.has(next)) {
        return next
      }
    }
  }
  return candidate
}

/** After the highest position, not the count: a deleted field leaves a gap. */
export const nextFieldPosition = (fields: readonly { position: number }[]) =>
  fields.reduce((next, field) => Math.max(next, field.position + 1), 0)
