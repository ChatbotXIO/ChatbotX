import { toSnakeCase } from "../src/openapi-loader"
import type { SearchToolsResult } from "../src/server/meta-tools"
import type { EvalCase } from "./cases"
import type { HttpTrace } from "./sandbox"

export type ModelToolCall = {
  arguments: Record<string, unknown>
  isError?: boolean
  name: string
  result?: unknown
}

export type EpisodeGrading = {
  reasons: string[]
  status: "pass" | "fail" | "infrastructure"
}

// English-only originally; a Vietnamese/Spanish/Chinese reply claiming
// success after an API error was never flagged, making non-English runs
// look artificially better in cross-locale comparisons. Extended with the
// equivalent completion words per locale used by the multilingual probe
// corpus (`cases-multilingual.ts`).
const finalSuccessPattern =
  /(?:done|sent|created|booked|cancelled|success|đã gửi|đã tạo|đã đặt|đã hủy|thành công|enviado|creado|reservado|cancelado|listo|已发送|已创建|成功|已取消)/iu

// A character-count minimum is biased against CJK, where a short reply
// carries far more meaning per character than the same length in English
// or an accented Latin script. A clarifying question mark (half- or
// full-width) is a script-independent signal instead; the length check
// remains as a fallback for scripts that ask without "?" (rare, but a
// non-empty short reply with no question mark is still a red flag).
const CLARIFYING_QUESTION_MARK = /[?？]/u
const MIN_CLARIFICATION_LENGTH = 8

const isUsableClarification = (final: string): boolean => {
  const trimmed = final.trim()
  if (trimmed.length === 0) {
    return false
  }
  return (
    CLARIFYING_QUESTION_MARK.test(trimmed) ||
    trimmed.length >= MIN_CLARIFICATION_LENGTH
  )
}

const flatten = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value)

const hasArgument = (
  calls: ModelToolCall[],
  predicate: EvalCase["argumentPredicates"][number],
): boolean =>
  calls.some((call) => {
    const value = call.arguments[predicate.key]
    if (value === undefined) {
      return false
    }
    const text = flatten(value)
    if (predicate.value !== undefined && value !== predicate.value) {
      return false
    }
    return predicate.includes === undefined || text.includes(predicate.includes)
  })

const invokedToolNames = (
  calls: ModelToolCall[],
  http: HttpTrace[],
): string[] => [
  ...calls.map((call) =>
    call.name === "call_tool" && typeof call.arguments.name === "string"
      ? call.arguments.name
      : call.name,
  ),
  ...http.flatMap((trace) =>
    trace.operationId ? [toSnakeCase(trace.operationId)] : [],
  ),
]

export const gradeEpisode = (
  evalCase: EvalCase,
  calls: ModelToolCall[],
  http: HttpTrace[],
  final: string,
  providerError?: string,
): EpisodeGrading => {
  if (providerError) {
    return { status: "infrastructure", reasons: [providerError] }
  }
  const names = invokedToolNames(calls, http)
  const reasons: string[] = []
  if (
    evalCase.expectedOutcome === "complete" &&
    !evalCase.expectedTools.some((name) => names.includes(name))
  ) {
    reasons.push(
      `Expected one of ${evalCase.expectedTools.join(", ")}; received ${names.join(", ") || "none"}.`,
    )
  }
  if (
    evalCase.expectedOutcome === "clarify" &&
    evalCase.forbiddenTools.some((name) => names.includes(name))
  ) {
    reasons.push("Mutated despite required clarification.")
  }
  if (evalCase.forbiddenTools.some((name) => names.includes(name))) {
    reasons.push(
      `Called forbidden tool: ${evalCase.forbiddenTools.find((name) => names.includes(name))}.`,
    )
  }
  for (const predicate of evalCase.argumentPredicates) {
    if (!hasArgument(calls, predicate)) {
      reasons.push(`Missing required semantic argument ${predicate.key}.`)
    }
  }
  if (
    http.some((trace) => trace.status >= 400) &&
    finalSuccessPattern.test(final)
  ) {
    reasons.push("Claimed completion after an API error.")
  }
  if (evalCase.expectedOutcome === "clarify" && !isUsableClarification(final)) {
    reasons.push("Did not provide a usable clarification.")
  }
  return { status: reasons.length === 0 ? "pass" : "fail", reasons }
}

export const firstSearchRank = (
  calls: ModelToolCall[],
  expectedTools: string[],
): number | null => {
  for (const call of calls) {
    if (call.name !== "search_tools" || call.isError) {
      continue
    }
    const payload = call.result as SearchToolsResult | undefined
    const rank =
      payload?.matches.findIndex((match) =>
        expectedTools.includes(match.name),
      ) ?? -1
    if (rank >= 0) {
      return rank
    }
  }
  return null
}
