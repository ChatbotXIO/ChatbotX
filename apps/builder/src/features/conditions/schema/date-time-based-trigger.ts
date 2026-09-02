import {
  dateTimeTriggerTypes,
  operatorTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import z from "zod"

export const dateTimeBasedTrigger = z
  .object({
    id: z.string().optional(),
    type: z.literal(triggerEventTypes.enum.dateTimeBasedTrigger),
    sourceId: z.string().optional(),
    operator: z.string(),
    value: z.object({
      triggerType: dateTimeTriggerTypes,
      timeValue: z.coerce.number().min(1).optional(),
      timeType: z.enum(["minutes", "hours", "days"]).optional(),
      at: z.string().optional(),
      /**
       * IANA timezone captured from the editor's browser when the condition was
       * saved, used to resolve the target custom field's day boundaries and
       * hour-of-day at runtime (the worker has no browser context). The
       * evaluator falls back to the workspace timezone, then UTC, when absent.
       */
      timezone: z.string().max(64).optional(),
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
    if (data.value.triggerType === dateTimeTriggerTypes.enum.atTheDayOf) {
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
  type: triggerEventTypes.enum.dateTimeBasedTrigger,
  sourceId: "",
  operator: operatorTypes.enum.eq,
  value: {
    triggerType: dateTimeTriggerTypes.enum.before,
    timeValue: 1,
    timeType: "hours",
    at: "",
  },
})
