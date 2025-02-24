import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

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

export const waitBlockSchema = z
  .object({
    id: z.string().cuid2(),
    actionType: z.literal(ActionType.Wait),
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

export type WaitBlockSchema = z.infer<typeof waitBlockSchema>

export const waitBlockDefaultValue = (): WaitBlockSchema => ({
  id: createId(),
  actionType: ActionType.Wait,
  delayType: DelayType.Duration,
  ...delayTypeDurationDefaultValue(),
})

export const delayTypeDurationDefaultValue = () => {
  return {
    duration: 1,
    unit: DelayUnit.Hours,
    repeat: false,
    startTime: "00:00:00",
    endTime: "23:00:00",
  }
}
