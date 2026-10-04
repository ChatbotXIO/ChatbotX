import {
  dateTimeTriggerTypes,
  operatorTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import z from "zod"

export const dateTimeBasedTrigger = z
  .object({
    id: z
      .string()
      .optional()
      .describe(
        "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
      ),
    type: z
      .literal(triggerEventTypes.enum.dateTimeBasedTrigger)
      .describe('Condition type "dateTimeBasedTrigger".'),
    sourceId: z
      .string()
      .optional()
      .describe(
        "Id of the date/datetime custom field (from `customFields.list`) the trigger is timed against. Required.",
      ),
    operator: z
      .string()
      .describe("Comparison operator; use `eq` (not used for timing)."),
    value: z.object({
      triggerType: dateTimeTriggerTypes.describe(
        "`before`/`after` fire `timeValue` `timeType` before/after the field's date; `atTheDayOf` fires on the same day at hour `at`.",
      ),
      timeValue: z.coerce
        .number()
        .min(1)
        .optional()
        .describe(
          "Offset amount in `timeType`s. Required for `before`/`after`.",
        ),
      timeType: z
        .enum(["minutes", "hours", "days"])
        .optional()
        .describe("Unit for `timeValue`. Required for `before`/`after`."),
      at: z
        .string()
        .optional()
        .describe(
          "Hour of the day (0-23, as a string) to fire. Required for `atTheDayOf`.",
        ),
      /**
       * IANA timezone captured from the editor's browser when the condition was
       * saved, used to resolve the target custom field's day boundaries and
       * hour-of-day at runtime (the worker has no browser context). The
       * evaluator falls back to the workspace timezone, then UTC, when absent.
       */
      timezone: z
        .string()
        .max(64)
        .optional()
        .describe(
          "IANA timezone (e.g. Asia/Ho_Chi_Minh) used to interpret the date; defaults to the workspace timezone, then UTC.",
        ),
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
