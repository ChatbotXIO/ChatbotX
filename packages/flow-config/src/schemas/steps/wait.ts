import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export enum DelayType {
  Duration = "Duration",
  SpecificDate = "SpecificDate",
  DatetimeCustomField = "DatetimeCustomField",
}

export enum DelayUnit {
  Seconds = "Seconds",
  Minutes = "Minutes",
  Hours = "Hours",
  Days = "Days",
}

export const waitStepSchema = z
  .object({
    id: z.string().cuid2(),
    stepType: z.literal(StepType.Wait),
  })
  .and(
    z.discriminatedUnion("delayType", [
      z.object({
        delayType: z.literal(DelayType.Duration),
        duration: z.number().int(),
        unit: z.nativeEnum(DelayUnit),
        repeat: z.boolean(),
        startTime: z.string().time(),
        endTime: z.string().time(),
      }),
      z.object({
        delayType: z.literal(DelayType.SpecificDate),
        datetime: z.string().datetime(),
      }),
      z.object({
        delayType: z.literal(DelayType.DatetimeCustomField),
        customFieldId: z.string().cuid2(),
      }),
    ]),
  )

export type WaitStepSchema = z.infer<typeof waitStepSchema>

export const waitStepDefaultFn = (): WaitStepSchema => ({
  id: createId(),
  stepType: StepType.Wait,
  delayType: DelayType.Duration,
  ...delayTypeDurationDefaultFn(),
})

export const delayTypeDurationDefaultFn = () => {
  return {
    duration: 1,
    unit: DelayUnit.Hours,
    repeat: false,
    startTime: "00:00:00",
    endTime: "23:00:00",
  }
}
