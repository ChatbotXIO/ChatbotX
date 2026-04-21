import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import {
  addDays,
  addMilliseconds,
  isValid,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
} from "date-fns"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const DelayType = {
  duration: "D01",
  date: "D02",
  random: "D03",
} as const

export const DelayUnit = {
  seconds: "seconds",
  minutes: "minutes",
  hours: "hours",
  days: "days",
} as const

export const DateType = z.enum(["specific", "dynamic"])

export const OffsetOperator = z.enum(["add", "subtract"])

const MAX_DELAY = 999_999

export const ENQUEUE_DELAY_MS = 5 * 60 * 1000

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
        delayType: z.literal(DelayType.date),
        dateType: DateType,
        datetime: z.iso.datetime().optional(),
        outputFieldId: z.string().trim().min(1).optional(),
        offset: z.boolean().default(false),
        offsetOperator: OffsetOperator.optional(),
        offsetValue: z.coerce.number().int().min(1).max(MAX_DELAY).optional(),
        offsetUnit: z.enum(DelayUnit).optional(),
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

export const buildJobId = (rowId: string) => `smart-delay-${rowId}`

export async function computeTriggerAt(
  step: WaitStepSchema,
  getCustomFieldValue?: (
    customFieldId: string,
  ) => Promise<string | null | undefined>,
): Promise<Date | null> {
  const UNIT_MS: Record<string, number> = {
    [DelayUnit.seconds]: 1000,
    [DelayUnit.minutes]: 60_000,
    [DelayUnit.hours]: 3_600_000,
    [DelayUnit.days]: 86_400_000,
  }
  const toMs = (unit: string) => UNIT_MS[unit] ?? 0

  const timeToSeconds = (time: string) => {
    const [h = 0, m = 0, s = 0] = time.split(":").map(Number)
    return h * 3600 + m * 60 + s
  }

  const setTimeOfDay = (date: Date, totalSec: number) =>
    setMilliseconds(
      setSeconds(
        setMinutes(
          setHours(date, Math.floor(totalSec / 3600)),
          Math.floor((totalSec % 3600) / 60),
        ),
        totalSec % 60,
      ),
      0,
    )

  const getTimeOfDay = (d: Date) =>
    d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()

  if (step.delayType === DelayType.duration) {
    const base = addMilliseconds(Date.now(), step.duration * toMs(step.unit))

    if (!(step.interval && step.startTime && step.endTime)) {
      return base
    }

    const windowStart = timeToSeconds(step.startTime)
    const windowEnd = timeToSeconds(step.endTime)
    const current = getTimeOfDay(base)
    const isOvernightWindow = windowStart > windowEnd

    if (isOvernightWindow) {
      // Valid when current >= 22:00 OR current <= 06:00
      const insideWindow = current >= windowStart || current <= windowEnd
      return insideWindow ? base : setTimeOfDay(base, windowStart)
    }

    if (current < windowStart) {
      return setTimeOfDay(base, windowStart)
    }
    if (current > windowEnd) {
      return setTimeOfDay(addDays(base, 1), windowStart)
    }
    return base
  }

  if (step.delayType === DelayType.random) {
    const rand = Math.floor(
      Math.random() * (step.max - step.min + 1) + step.min,
    )
    return addMilliseconds(Date.now(), rand * toMs(step.unit))
  }

  let triggerAt: Date | null = null
  if (step.delayType === DelayType.date) {
    if (step.dateType === DateType.enum.specific) {
      if (!step.datetime) {
        return null
      }

      triggerAt = new Date(step.datetime)
    }

    if (step.dateType === DateType.enum.dynamic) {
      if (!(step.outputFieldId && getCustomFieldValue)) {
        return null
      }

      const raw = await getCustomFieldValue(step.outputFieldId)

      if (!raw) {
        return null
      }

      const parsed = new Date(raw)
      if (!isValid(parsed)) {
        return null
      }

      triggerAt = parsed

      if (
        step.offset &&
        step.offsetValue &&
        step.offsetUnit &&
        step.offsetOperator
      ) {
        const sign = step.offsetOperator === OffsetOperator.enum.add ? 1 : -1
        triggerAt = addMilliseconds(
          triggerAt,
          sign * step.offsetValue * toMs(step.offsetUnit),
        )
      }
    }
  }

  return triggerAt
}
