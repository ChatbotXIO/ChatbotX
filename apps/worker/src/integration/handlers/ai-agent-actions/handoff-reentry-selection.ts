import type { AIAgentActionRule } from "@chatbotx.io/database/partials"
import { type Tool, tool } from "ai"
import { z } from "zod"

const MEANINGFUL_CHARACTER = /[\p{L}\p{N}]/u

export type HandoffReentrySelection = {
  returnToBotEvidence: string
  ruleId: string
  whenEvidence: string
}

type HandoffReentrySelectionInput = {
  matches: HandoffReentrySelection[]
}

type HandoffReentrySelectionOutput = {
  selected: boolean
}

function buildSelectionSchema(
  rules: AIAgentActionRule[],
): z.ZodType<HandoffReentrySelectionInput> {
  const matchSchemas = rules.map((rule) =>
    z
      .object({
        ruleId: z.literal(rule.id),
        whenEvidence: z.string().trim().max(500),
        returnToBotEvidence: z.string().trim().max(500),
      })
      .strict(),
  )
  const [firstMatchSchema, ...remainingMatchSchemas] = matchSchemas
  if (!firstMatchSchema) {
    throw new Error("Handoff re-entry selection requires at least one rule")
  }

  const matchSchema = remainingMatchSchemas.length
    ? z.union([firstMatchSchema, ...remainingMatchSchemas])
    : firstMatchSchema

  return z
    .object({
      matches: z.array(matchSchema).max(1),
    })
    .strict()
}

function buildSelectionDescription(rules: AIAgentActionRule[]): string {
  const configuredRules = rules
    .map(
      (rule, index) =>
        `${index + 1}. ruleId: ${rule.id}\n   When: ${rule.when}`,
    )
    .join("\n")

  return [
    "Select at most one configured return-to-bot rule.",
    "Return matches: [] unless the current customer message clearly satisfies a configured When condition and directly requests automated assistance instead of continuing the human handoff.",
    "For a match, whenEvidence and returnToBotEvidence must each be exact quotes from the current customer message.",
    "Configured rules in persisted order:",
    configuredRules,
  ].join("\n")
}

/**
 * The handoff classifier may select a rule but can never execute it. The
 * worker validates the selected evidence before it invokes the action tool.
 */
export function createHandoffReentrySelectionTool(input: {
  onSelection: (selection: HandoffReentrySelection | null) => void
  rules: AIAgentActionRule[]
}): Tool<HandoffReentrySelectionInput, HandoffReentrySelectionOutput> {
  return tool({
    description: buildSelectionDescription(input.rules),
    inputSchema: buildSelectionSchema(input.rules),
    execute: (call: HandoffReentrySelectionInput) => {
      input.onSelection(call.matches[0] ?? null)
      return { selected: call.matches.length === 1 }
    },
  })
}

function normalizeEvidence(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replaceAll(/\s+/g, " ")
    .trim()
}

function meaningfulCharacterCount(value: string): number {
  return [...value].filter((character) => MEANINGFUL_CHARACTER.test(character))
    .length
}

export function hasValidHandoffReentryEvidence(
  message: string,
  evidence: string,
): boolean {
  const normalizedEvidence = normalizeEvidence(evidence)
  return (
    meaningfulCharacterCount(normalizedEvidence) >= 8 &&
    normalizeEvidence(message).includes(normalizedEvidence)
  )
}
