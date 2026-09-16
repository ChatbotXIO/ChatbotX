import type { z } from "zod"

/**
 * Structured compiler diagnostics for the flow-spec DSL. Deliberately NOT
 * routed through `flowValidationCodes`/`resolveFlowValidationMessageKey`
 * (`../validation-codes`) — that mechanism maps a fixed set of codes to a
 * `messages.<code>` i18n key across 20 locales for the builder UI. A
 * flow-spec authoring error is API-consumer-facing (an agent, not a person
 * reading the builder UI), so it is returned as plain structured data
 * instead of paying that i18n tax for a growing, agent-only code set.
 */
export type FlowAuthoringErrorCode =
  | "invalidSpec"
  | "invalidFirstStep"
  | "unreachableStep"
  | "unknownTemplate"
  | "unknownFlow"
  | "unknownCustomField"
  | "invalidGotoTarget"
  | "selfLoopGoto"
  | "duplicateStepId"
  | "invalidStep"
  | "invalidGraph"
  | "compileFailed"
  | "templateNotApproved"

export type FlowAuthoringError = {
  /** Spec-relative path, e.g. `steps[2].templateName` — never a compiled-node path. */
  path: string
  code: FlowAuthoringErrorCode
  message: string
  hint?: string
  candidates?: string[]
}

export class FlowAuthoringException extends Error {
  readonly errors: readonly FlowAuthoringError[]

  constructor(errors: readonly FlowAuthoringError[]) {
    super(
      errors.length > 0
        ? errors.map((error) => `${error.path}: ${error.message}`).join("; ")
        : "Flow authoring failed",
    )
    this.name = "FlowAuthoringException"
    this.errors = errors
  }
}

export const formatZodPathSegment = (
  acc: string,
  segment: PropertyKey,
): string => {
  if (typeof segment === "number") {
    return `${acc}[${segment}]`
  }
  const key = String(segment)
  return acc.length === 0 ? key : `${acc}.${key}`
}

/**
 * Converts a parse failure into `FlowAuthoringError[]` using the caller's
 * diagnostic code. Without `mapPath`, issue paths are used verbatim — correct
 * when validating the spec itself, where paths are already spec-relative.
 * `compileAndValidateSpec` (`apps/builder`) passes `mapPath` when validating
 * the *compiled* node graph instead, to translate a node-graph path back to
 * the spec-relative path an agent actually wrote.
 */
export function zodErrorToFlowAuthoringErrors(
  error: z.ZodError,
  code: FlowAuthoringErrorCode,
  mapPath?: (issuePath: PropertyKey[]) => string | undefined,
): FlowAuthoringError[] {
  return error.issues.map((issue) => ({
    path: mapPath?.(issue.path) ?? issue.path.reduce(formatZodPathSegment, ""),
    code,
    message: issue.message,
  }))
}

// Small edit-distance algorithm — names here are short (workspace entity
// names), so the O(n*m) cost is negligible, and a real distance catches the
// single-character typos a prefix/substring check misses (e.g.
// "welcom_promo" vs "welcome_promo").
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1

  const initialCell = (row: number, col: number): number => {
    if (row === 0) {
      return col
    }
    return col === 0 ? row : 0
  }
  const distances: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => initialCell(i, j)),
  )

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost,
      )
    }
  }

  return distances[a.length][b.length]
}

// A candidate qualifies when it's "close enough": either a prefix/substring
// match, or an edit distance small relative to name length (typo-tolerant
// without matching two genuinely unrelated short names).
const MAX_EDIT_DISTANCE_RATIO = 0.34
const PREFIX_MATCH_BASE_SCORE = 1000
const SUBSTRING_MATCH_BASE_SCORE = 500
const MIN_ALLOWED_EDIT_DISTANCE = 2

function nameSimilarity(target: string, candidate: string): number {
  if (target === candidate) {
    return Number.POSITIVE_INFINITY
  }
  if (candidate.startsWith(target) || target.startsWith(candidate)) {
    return PREFIX_MATCH_BASE_SCORE - Math.abs(candidate.length - target.length)
  }
  if (candidate.includes(target) || target.includes(candidate)) {
    return (
      SUBSTRING_MATCH_BASE_SCORE - Math.abs(candidate.length - target.length)
    )
  }

  const distance = levenshteinDistance(target, candidate)
  const maxLength = Math.max(target.length, candidate.length)
  const allowedDistance = Math.max(
    MIN_ALLOWED_EDIT_DISTANCE,
    Math.ceil(maxLength * MAX_EDIT_DISTANCE_RATIO),
  )
  return distance <= allowedDistance ? maxLength - distance : 0
}

const MAX_CANDIDATES = 3

/** Nearest-name suggestions for an "unknown X" error's `candidates`. */
export function closestNames(
  target: string,
  available: Iterable<string>,
): string[] {
  const targetLower = target.toLowerCase()
  return [...available]
    .map((name) => ({
      name,
      score: nameSimilarity(targetLower, name.toLowerCase()),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map(({ name }) => name)
}
