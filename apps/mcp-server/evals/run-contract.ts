import { toSnakeCase } from "../src/openapi-loader"
import type { EvalCase } from "./cases"

export type EvalManifest = {
  corpusHash: string
  exposures: string[]
  fixtureOperations: string[]
  generatedAt: string
  harnessHash: string
  instructionsHash: string
  modelIds: string[]
  phase: string
  repeat: number
  runtimeSpecHash: string
  seed: number
  selectedCaseIds: string[]
  sourceHash: string
  specHash: string
}

const requiredComparisonFields: Array<keyof EvalManifest> = [
  "corpusHash",
  "exposures",
  "fixtureOperations",
  "harnessHash",
  "modelIds",
  "repeat",
  "runtimeSpecHash",
  "seed",
  "selectedCaseIds",
  "specHash",
]

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export const assertComparableManifests = (
  baseline: EvalManifest,
  candidate: EvalManifest,
): void => {
  for (const field of requiredComparisonFields) {
    if (!(field in baseline && field in candidate)) {
      throw new Error(`Comparison manifest is missing ${field}.`)
    }
    if (!sameJson(baseline[field], candidate[field])) {
      throw new Error(`Comparison manifest mismatch: ${field}.`)
    }
  }
}

export const validateCaseCoverage = (
  cases: EvalCase[],
  availableTools: Set<string>,
  fixtureOperations: Set<string>,
): string[] => {
  const failures: string[] = []
  for (const evalCase of cases) {
    const tools = new Set(
      [
        ...evalCase.expectedTools,
        ...evalCase.forbiddenTools,
        ...(evalCase.allowedWriteTools ?? []),
        ...evalCase.argumentPredicates.flatMap((predicate) => predicate.tools),
        ...(evalCase.searchQueries?.flatMap(
          (searchQuery) => searchQuery.expectedTools,
        ) ?? []),
        ...(evalCase.sequence?.flat() ?? []),
        ...(evalCase.traceAssertions?.flatMap((assertion) => assertion.tools) ??
          []),
        ...(evalCase.bindings?.flatMap((binding) => [
          binding.tool,
          ...binding.sourceTools,
        ]) ?? []),
      ].map(toSnakeCase),
    )
    for (const tool of tools) {
      if (!availableTools.has(tool)) {
        failures.push(`${evalCase.id}: missing catalog tool ${tool}`)
      }
      if (!fixtureOperations.has(tool)) {
        failures.push(`${evalCase.id}: missing fixture operation ${tool}`)
      }
    }
  }
  return failures
}
