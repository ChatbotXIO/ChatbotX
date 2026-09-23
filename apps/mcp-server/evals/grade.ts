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

const finalSuccessPattern = /(?:done|sent|created|booked|cancelled|success)/i

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
  if (evalCase.expectedOutcome === "clarify" && final.trim().length < 8) {
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
