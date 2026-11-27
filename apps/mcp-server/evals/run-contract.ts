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

const decodeMcp = (result: unknown): unknown => {
  if (
    !result ||
    typeof result !== "object" ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return result
  }

  const text = result.content
    .flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        return [item.text]
      }
      return []
    })
    .join("\n")
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const confirmationRequired = (result: unknown): boolean => {
  const decoded = decodeMcp(result)
  return (
    typeof decoded === "object" &&
    decoded !== null &&
    "code" in decoded &&
    decoded.code === "CONFIRMATION_REQUIRED"
  )
}

export const withConfirmationArgument = (
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> => {
  if (toolName !== "call_tool") {
    return { ...args, _confirm: true }
  }

  const nestedArgs = args.arguments
  if (
    typeof nestedArgs !== "object" ||
    nestedArgs === null ||
    Array.isArray(nestedArgs)
  ) {
    return args
  }
  return {
    ...args,
    arguments: { ...nestedArgs, _confirm: true },
  }
}

export const getFinalStepUsage = async (result: {
  finalStep: { usage: unknown } | PromiseLike<{ usage: unknown }>
}): Promise<unknown> => (await result.finalStep).usage

export const getAggregateUsage = (result: { usage: unknown }): unknown =>
  result.usage

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
