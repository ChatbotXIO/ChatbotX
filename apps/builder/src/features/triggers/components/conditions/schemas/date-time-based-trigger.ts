import { DateTimeTriggerType, TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"

export const dateTimeBasedTrigger = z
  .object({
    type: z.literal(TriggerCondition.dateTimeBasedTrigger),
    triggerType: z.enum(DateTimeTriggerType),
    customFieldId: z.cuid2(),
    timeValue: z.number().min(1).optional(),
    timeType: z.enum(["minutes", "hours", "days"]).optional(),
    at: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.triggerType === DateTimeTriggerType.atTheDayOf) {
      if (!data.at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'The "at" field is required when triggerType is "atTheDayOf"',
          path: ["at"],
        })
      }
    } else if (!(data.timeValue && data.timeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'The "timeValue" and "timeType" fields are required when triggerType is "before" or "after"',
      })
    }
  })
export type DateTimeBasedTrigger = z.infer<typeof dateTimeBasedTrigger>

export const defaultFn = (): DateTimeBasedTrigger => ({
  type: TriggerCondition.dateTimeBasedTrigger,
  triggerType: DateTimeTriggerType.before,
  customFieldId: "",
  timeValue: 1,
  timeType: "hours",
})
