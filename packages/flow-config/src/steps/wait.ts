import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const DelayType = {
  duration: "D01",
  specify: "D02",
  customField: "D03",
} as const

export const DelayUnit = {
  seconds: "seconds",
  minutes: "minutes",
  hours: "hours",
  days: "days",
} as const

export const waitStepSchema = z
  .object({
    id: z.cuid2(),
    stepType: z.literal(StepType.wait),
  })
  .and(
    z.discriminatedUnion("delayType", [
      z.object({
        delayType: z.literal(DelayType.duration),
        duration: z.number().int(),
        unit: z.enum(DelayUnit),
        interval: z.boolean(),
        startTime: z.iso.time(),
        endTime: z.iso.time(),
      }),
      z.object({
        delayType: z.literal(DelayType.specify),
        datetime: z.iso.datetime(),
      }),
      z.object({
        delayType: z.literal(DelayType.customField),
        outputCfId: z.cuid2(),
      }),
    ]),
  )

export type WaitStepSchema = z.infer<typeof waitStepSchema>

export const waitStepDefaultFn = (): WaitStepSchema => ({
  id: createId(),
  stepType: StepType.wait,
  delayType: DelayType.duration,
  ...delayTypeDurationDefaultFn(),
})

export const delayTypeDurationDefaultFn = () => ({
  duration: 1,
  unit: DelayUnit.hours,
  interval: false,
  startTime: "00:00:00",
  endTime: "23:00:00",
})
