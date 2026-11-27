import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import {
  FIELD_OPERATION_DEFINITIONS,
  FieldOperationType,
} from "@chatbotx.io/utils/custom-field-operation"
import { z } from "zod"
import { zodFieldReference } from "../field-reference"
import { stepTypes } from "./step-action"

export { FieldOperationType } from "@chatbotx.io/utils/custom-field-operation"

/** Operations whose stored flows and triggers may carry a blank operand. */
const BLANK_OPERAND_LEGACY_OPERATIONS: readonly FieldOperationType[] = [
  FieldOperationType.increase,
  FieldOperationType.decrease,
]

/** True when an operation that cannot run without an operand has none. */
export const isOperandBlank = (
  operation: FieldOperationType,
  value: string | undefined,
): boolean =>
  FIELD_OPERATION_DEFINITIONS[operation].requiresOperand && !value?.trim()

/**
 * Like `isOperandBlank`, but the original increase/decrease stay exempt:
 * stored flows carry blank values for them and must keep parsing (a blank one
 * is skipped at runtime, as before). New input should use `isOperandBlank`.
 */
export const isFieldOperandMissing = (
  operation: FieldOperationType,
  value: string | undefined,
): boolean =>
  !BLANK_OPERAND_LEGACY_OPERATIONS.includes(operation) &&
  isOperandBlank(operation, value)

export const withFieldOperationOperandRule = <
  Schema extends z.ZodType<{ operation: FieldOperationType; value?: string }>,
>(
  schema: Schema,
) =>
  schema.superRefine(({ operation, value }, ctx) => {
    if (isFieldOperandMissing(operation, value)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "A value is required for this operation.",
      })
    }
  })

const setCustomFieldStepObjectSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.setCustomField)
    .describe('Step type discriminator: "setCustomField".'),
  inputFieldId: zodFieldReference(),
  operation: z.enum(FieldOperationType),
  value: z.string().trim(),
  /**
   * IANA timezone captured from the editor's browser when the flow was saved,
   * used to anchor a naive date/datetime `value` at runtime (the worker has no
   * browser context) and to render "now" when `value` is left blank. Backend
   * falls back to the contact/workspace zone when absent.
   */
  timezone: z.string().max(64).optional(),
})

export const setCustomFieldStepSchema = withFieldOperationOperandRule(
  setCustomFieldStepObjectSchema,
)

/**
 * The stored shape of the trigger / inbound-webhook `setCustomField` action.
 * Lenient on legacy rows: a blank or missing `operation` means `set`.
 */
export const setCustomFieldActionSchema = withFieldOperationOperandRule(
  z.object({
    customFieldId: z.string().min(1),
    operation: z.preprocess(
      (operation) => operation || undefined,
      z.enum(FieldOperationType).default(FieldOperationType.set),
    ),
    value: z.string().default(""),
    timezone: z.string().max(64).optional(),
  }),
)
export type SetCustomFieldActionSchema = z.infer<
  typeof setCustomFieldActionSchema
>

export type SetCustomFieldStepSchema = z.infer<typeof setCustomFieldStepSchema>

export const setCustomFieldStepDefaultFn = (): SetCustomFieldStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.setCustomField,
  value: "",
  inputFieldId: "",
  operation: FieldOperationType.set,
})
