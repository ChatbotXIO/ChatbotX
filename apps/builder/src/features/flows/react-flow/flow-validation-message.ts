import {
  type FlowValidationCode,
  isFlowValidationCode,
} from "@chatbotx.io/flow-config"
import type { ZodError } from "zod"

/**
 * Shown when a rule raised no recognisable code — a plain schema failure such as
 * a missing required field, which has no message of its own.
 */
const GENERIC_MESSAGE_KEY = "messages.flowConfigIncomplete"

/**
 * A validation code doubles as its own translation key: the code names the rule
 * and `messages.<code>` is the text shown for it.
 *
 * That convention is what keeps this file channel- and step-agnostic. A new rule
 * needs a code in `flowValidationCodes` and a string in `messages/*.json`; it
 * never needs an entry here, so this resolver cannot fall behind the rules it
 * translates.
 */
export type FlowValidationMessageKey =
  | `messages.${FlowValidationCode}`
  | typeof GENERIC_MESSAGE_KEY

const getCapabilityValidationCode = (
  issue: ZodError["issues"][number],
): FlowValidationCode | undefined => {
  const capability = (issue as { params?: { capability?: unknown } }).params
    ?.capability
  if (
    typeof capability !== "object" ||
    capability === null ||
    !("code" in capability) ||
    typeof capability.code !== "string" ||
    !isFlowValidationCode(capability.code)
  ) {
    return
  }

  return capability.code
}

export const resolveFlowValidationMessageKey = (
  error: ZodError,
): FlowValidationMessageKey => {
  const code = error.issues
    .map(
      (issue) =>
        getCapabilityValidationCode(issue) ??
        (isFlowValidationCode(issue.message) ? issue.message : undefined),
    )
    .find((message): message is FlowValidationCode => message !== undefined)

  return code ? `messages.${code}` : GENERIC_MESSAGE_KEY
}

/**
 * The translation key for a form error message that is a validation code, or
 * `null` for a plain message that should be shown as it is.
 */
export const resolveFlowValidationCodeKey = (
  message: string,
): `messages.${FlowValidationCode}` | null =>
  isFlowValidationCode(message) ? `messages.${message}` : null
