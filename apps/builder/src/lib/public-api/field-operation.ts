import { isFieldOperandMissing } from "@chatbotx.io/flow-config"
import {
  FIELD_OPERATION_DEFINITIONS,
  fieldOperationApiNames,
  fieldOperationByApiName,
} from "@chatbotx.io/utils/custom-field-operation"
import { z } from "zod"

// The public API speaks friendly operation names (`increase`, not the
// internal `"O04"` opaque code) so an LLM/API consumer never has to know the
// flow-step wire codes. The names come from the operation registry, so the
// contact and bot-field APIs cannot drift apart.
const OPERATIONS_DESCRIPTION = Object.values(FIELD_OPERATION_DEFINITIONS)
  .map(
    ({ apiName, allowedTypes }) => `\`${apiName}\` (${allowedTypes.join("/")})`,
  )
  .join(", ")

export const publicFieldOperationFields = {
  operation: z
    .enum(fieldOperationApiNames as [string, ...string[]])
    .describe(
      `Operation to apply, with the field types it supports: ${OPERATIONS_DESCRIPTION}. \`increase\`/\`decrease\` treat the current value as a number; \`formula\` evaluates \`value\` as math where \`value\` is the current number; \`dateExpression\` evaluates e.g. \`now + 2 days\`; \`addMinutes\`/\`addHours\`/\`addDays\` shift a date by \`value\`; \`clear\` and \`setNow\` need no \`value\`.`,
    ),
  value: z
    .string()
    .trim()
    .default("")
    .describe(
      "Operand: the value to set, append, prepend, add/subtract, the formula or the date expression. Omit it for `clear` and `setNow`.",
    ),
}

/** `superRefine` callback: the operand is required where the registry says so. */
export const requireOperandForOperation = (
  { operation, value }: { operation: string; value: string },
  ctx: z.RefinementCtx,
): void => {
  const code = fieldOperationByApiName(operation)
  if (code && isFieldOperandMissing(code, value)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: `A value is required for \`${operation}\`.`,
    })
  }
}
