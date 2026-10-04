import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const conditionFilterConditionSchema = z.object({
  field: z
    .string()
    .min(1)
    .describe(
      "Contact field to test: a static field name from `GET /v1/contacts/filter-fields`, or `customField` together with `customFieldId` (the custom field id) to test a workspace custom field.",
    ),
  operator: z
    .string()
    .min(1)
    .describe(
      "Operator valid for this field, as listed by `GET /v1/contacts/filter-fields`.",
    ),
  value: z
    .union([z.string(), z.array(z.string()), z.tuple([z.string(), z.string()])])
    .optional()
    .describe(
      "Comparison value. Omit for valueless operators (e.g. isEmpty). A two-element tuple is a between-range; an array is a multi-value match.",
    ),
  customFieldId: zodBigintAsString().optional(),
  /**
   * Runtime coupon topic id for dynamic coupon-topic filter rows. Kept so
   * publish validation does not strip the selected topic before worker match.
   */
  topicId: zodBigintAsString().optional(),
  /**
   * Precise custom-field type (`date` | `datetime`). Kept alongside `valueType`
   * so the runtime filter compares a date field by wall clock rather than the
   * zone-aware datetime path. Without it here, zod strips the key on save and
   * date conditions are silently mis-evaluated.
   */
  customFieldType: z.string().optional(),
  /**
   * Runtime bot field (account field) id for dynamic bot-field filter rows —
   * workspace-scoped, mirrors `customFieldId` for the `customField` branch.
   */
  botFieldId: zodBigintAsString().optional(),
  /**
   * Precise bot-field type (`date` | `datetime` | ...), mirroring
   * `customFieldType`. Kept alongside `valueType` so the runtime filter
   * compares a date field by wall clock rather than the zone-aware datetime
   * path.
   */
  botFieldType: z.string().optional(),
  valueType: z.string().optional(),
})

export const conditionCaseSchema = z.object({
  id: zodBigintAsString().describe(
    "Case id (numeric string); also the `sourceHandle` of the edge taken when this case matches.",
  ),
  operator: z
    .enum(["and", "or"])
    .describe(
      "Whether all (`and`) or any (`or`) of `conditions` must match. Cases are evaluated in order; the first match wins.",
    ),
  conditions: z
    .array(conditionFilterConditionSchema)
    .min(1)
    .describe("Contact-filter conditions for this case (at least one)."),
  /**
   * IANA timezone captured from the editor's browser when the flow was saved,
   * used to interpret naive date/datetime condition values at runtime (the
   * worker has no browser context). Backend defaults to UTC when absent.
   */
  timezone: z.string().max(64).optional(),
})
export type ConditionCaseSchema = z.infer<typeof conditionCaseSchema>

export const conditionStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.condition)
    .describe('Step type discriminator: "condition".'),
  cases: z
    .array(conditionCaseSchema)
    .min(1)
    .describe("Ordered cases; the first whose conditions match is taken."),
  otherwiseId: zodBigintAsString().describe(
    "Id (numeric string) used as the `sourceHandle` of the edge taken when no case matches.",
  ),
})
export type ConditionStepSchema = z.infer<typeof conditionStepSchema>

export const conditionCaseDefaultFn = (): ConditionCaseSchema => ({
  id: createId(),
  operator: "and",
  conditions: [],
})

export const conditionStepDefaultFn = (
  props?: Partial<ConditionStepSchema>,
): ConditionStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.condition,
  cases: [conditionCaseDefaultFn()],
  otherwiseId: createId(),
  ...props,
})
