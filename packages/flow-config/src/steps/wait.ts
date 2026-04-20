import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const DelayType = {
  duration: "D01",
  specify: "D02",
  customField: "D03",
  random: "D04",
} as const

export const DelayUnit = {
  seconds: "seconds",
  minutes: "minutes",
  hours: "hours",
  days: "days",
} as const

const MAX_DELAY = 999_999

export const waitStepSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.wait),
  })
  .and(
    z.discriminatedUnion("delayType", [
      z.object({
        delayType: z.literal(DelayType.duration),
        duration: z.coerce.number().int().min(1).max(MAX_DELAY),
        unit: z.enum(DelayUnit),
        interval: z.boolean(),
        startTime: z.iso.time().nullable(),
        endTime: z.iso.time().nullable(),
      }),
      z.object({
        delayType: z.literal(DelayType.specify),
        datetime: z.iso.datetime(),
      }),
      z.object({
        delayType: z.literal(DelayType.customField),
        outputFieldId: z.string().trim().min(1),
      }),
      z.object({
        delayType: z.literal(DelayType.random),
        min: z.coerce.number().int().min(1).max(MAX_DELAY),
        max: z.coerce.number().int().min(1).max(MAX_DELAY),
        unit: z.enum(DelayUnit),
      }),
    ]),
  )
  .superRefine((data, ctx) => {
    if (data.delayType === DelayType.random && data.min > data.max) {
      ctx.addIssue({
        code: "custom",
        path: ["max"],
        message: "Max must be ≥ Min",
      })
    }
  })

export type WaitStepSchema = z.infer<typeof waitStepSchema>

export const waitStepDefaultFn = (): WaitStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.wait,
  delayType: DelayType.duration,
  ...delayTypeDurationDefaultFn(),
})

export const delayTypeDurationDefaultFn = () => ({
  duration: 1,
  unit: DelayUnit.hours,
  interval: false,
  startTime: null,
  endTime: null,
})
