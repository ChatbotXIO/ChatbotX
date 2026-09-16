import {
  FieldReferenceKind,
  parseFieldReference,
} from "@chatbotx.io/flow-config/field-reference"
import { VARIABLE_PLACEHOLDER_SOURCE } from "@chatbotx.io/utils/variables"

const botFieldVariablePlaceholderRegex = new RegExp(
  VARIABLE_PLACEHOLDER_SOURCE,
  "g",
)

export type BotFieldVariableTextParseResult =
  | { status: "malformed" }
  | { fieldIds: string[]; status: "valid" }

/**
 * Validates text containing static content and `{{bot_field:<id>}}` variables
 * only. This stays client-safe for Builder schemas.
 */
export const parseBotFieldVariableText = (
  text: string,
): BotFieldVariableTextParseResult => {
  const variables = Array.from(
    text.matchAll(botFieldVariablePlaceholderRegex),
    (match) => match[1],
  )
  const fieldIds: string[] = []

  for (const variable of variables) {
    if (!variable) {
      return { status: "malformed" }
    }
    const reference = parseFieldReference(variable)
    if (reference.kind !== FieldReferenceKind.botField) {
      return { status: "malformed" }
    }
    fieldIds.push(reference.id)
  }

  const staticText = text.replace(botFieldVariablePlaceholderRegex, "")
  if (staticText.includes("{") || staticText.includes("}")) {
    return { status: "malformed" }
  }

  return { fieldIds, status: "valid" }
}
