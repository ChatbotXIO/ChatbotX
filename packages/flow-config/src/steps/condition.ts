import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const conditionFilterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z
    .union([z.string(), z.array(z.string()), z.tuple([z.string(), z.string()])])
    .optional(),
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
  valueType: z.string().optional(),
})

export const conditionCaseSchema = z.object({
  id: zodBigintAsString(),
  operator: z.enum(["and", "or"]),
  conditions: z.array(conditionFilterConditionSchema).min(1),
  /**
   * IANA timezone captured from the editor's browser when the flow was saved,
   * used to interpret naive date/datetime condition values at runtime (the
   * worker has no browser context). Backend defaults to UTC when absent.
   */
  timezone: z.string().max(64).optional(),
})
export type ConditionCaseSchema = z.infer<typeof conditionCaseSchema>

export const conditionStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.condition),
  cases: z.array(conditionCaseSchema).min(1),
  otherwiseId: zodBigintAsString(),
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
