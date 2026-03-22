import {
  Condition,
  DateTimeTriggerType,
  Operator,
} from "@aha.chat/database/enums"
import z from "zod"

export const dateTimeBasedTrigger = z
  .object({
    id: z.string().optional(),
    type: z.literal(Condition.dateTimeBasedTrigger),
    sourceId: z.string().optional(),
    operator: z.string(),
    value: z.object({
      triggerType: z.enum(DateTimeTriggerType),
      timeValue: z.coerce.number().min(1).optional(),
      timeType: z.enum(["minutes", "hours", "days"]).optional(),
      at: z.string().optional(),
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.sourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom field is required",
        path: ["sourceId"],
      })
    }
    if (!data.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Value configuration is required",
        path: ["value"],
      })
      return
    }
    if (data.value.triggerType === DateTimeTriggerType.atTheDayOf) {
      if (!data.value.at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'The "at" field is required when triggerType is "atTheDayOf"',
          path: ["value", "at"],
        })
      }
    } else if (!(data.value.timeValue && data.value.timeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'The "timeValue" and "timeType" fields are required when triggerType is "before" or "after"',
      })
    }
  })
export type DateTimeBasedTrigger = z.infer<typeof dateTimeBasedTrigger>

export const defaultFn = (): DateTimeBasedTrigger => ({
  type: Condition.dateTimeBasedTrigger,
  sourceId: "",
  operator: Operator.is,
  value: {
    triggerType: DateTimeTriggerType.before,
    timeValue: 1,
    timeType: "hours",
    at: "",
  },
})
