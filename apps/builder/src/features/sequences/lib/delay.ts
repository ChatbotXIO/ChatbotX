export const DELAY_UNITS = [
  "immediate",
  "minutes",
  "hours",
  "days",
  "specificTime",
] as const

export type DelayUnit = (typeof DELAY_UNITS)[number]

export const MINUTES_PER_HOUR = 60
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
export const MIN_DELAY_VALUE = 1
export const MAX_DELAY_VALUE = 99_999

export type StoredDelayFields = {
  delayDays: number
  delayMinutes: number
  delayUnit?: string | null
  specificDateTime?: Date | null
}

export type DelayView = {
  unit: DelayUnit
  value: number
  specificDateTime: string
}

export type StoredDelay = {
  delayDays: number
  delayMinutes: number
  delayUnit: DelayUnit
  specificDateTime: string | null
}

export type DelayChange = {
  unit: DelayUnit
  value: number
  specificDateTime?: string
}

export function isDelayUnit(value: unknown): value is DelayUnit {
  return (
    typeof value === "string" &&
    (DELAY_UNITS as readonly string[]).includes(value)
  )
}

export function isDelayValueInRange(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_DELAY_VALUE &&
    value <= MAX_DELAY_VALUE
  )
}

type RelativeFields = { delayDays: number; delayMinutes: number }

const CONSISTENCY_PREDICATES: Record<
  DelayUnit,
  (fields: RelativeFields) => boolean
> = {
  immediate: (fields) => fields.delayDays === 0 && fields.delayMinutes === 0,
  minutes: (fields) => fields.delayDays === 0 && fields.delayMinutes > 0,
  hours: (fields) =>
    fields.delayDays === 0 &&
    fields.delayMinutes > 0 &&
    fields.delayMinutes % MINUTES_PER_HOUR === 0,
  days: (fields) => fields.delayMinutes === 0 && fields.delayDays > 0,
  specificTime: (fields) => fields.delayDays === 0 && fields.delayMinutes === 0,
}

export function isStoredDelayConsistent(
  fields: RelativeFields & { delayUnit: DelayUnit },
): boolean {
  return CONSISTENCY_PREDICATES[fields.delayUnit](fields)
}

const STORED_VALUE_CALCULATORS: Record<
  DelayUnit,
  (fields: RelativeFields) => number
> = {
  days: (fields) => fields.delayDays,
  hours: (fields) => fields.delayMinutes / MINUTES_PER_HOUR,
  minutes: (fields) => fields.delayMinutes,
  immediate: () => 1,
  specificTime: () => 1,
}

function isStoredUnitAccepted(
  step: StoredDelayFields,
  unit: DelayUnit,
): boolean {
  if (!isStoredDelayConsistent({ ...step, delayUnit: unit })) {
    return false
  }

  return unit === "specificTime" ? Boolean(step.specificDateTime) : true
}

type InferenceRule = {
  unit: DelayUnit
  matches: (days: number, minutes: number) => boolean
  value: (days: number, minutes: number) => number
}

const IMMEDIATE_RULE: InferenceRule = {
  unit: "immediate",
  matches: () => true,
  value: () => 1,
}

const INFERENCE_RULES: InferenceRule[] = [
  {
    unit: "days",
    matches: (days, minutes) => days > 0 && minutes === 0,
    value: (days) => days,
  },
  {
    unit: "minutes",
    matches: (days, minutes) => days > 0 && minutes > 0,
    value: (days, minutes) => days * MINUTES_PER_DAY + minutes,
  },
  {
    unit: "hours",
    matches: (_days, minutes) =>
      minutes > 0 && minutes % MINUTES_PER_HOUR === 0,
    value: (_days, minutes) => minutes / MINUTES_PER_HOUR,
  },
  {
    unit: "minutes",
    matches: (_days, minutes) => minutes > 0,
    value: (_days, minutes) => minutes,
  },
  IMMEDIATE_RULE,
]

function inferDelayView(
  days: number,
  minutes: number,
): { unit: DelayUnit; value: number } {
  const rule =
    INFERENCE_RULES.find((candidate) => candidate.matches(days, minutes)) ??
    IMMEDIATE_RULE

  return { unit: rule.unit, value: rule.value(days, minutes) }
}

export function stepToDelayView(
  step: StoredDelayFields | undefined,
): DelayView {
  if (!step) {
    return { unit: "days", value: 1, specificDateTime: "" }
  }

  const specificDateTime = step.specificDateTime
    ? toLocalDateTimeInputValue(step.specificDateTime)
    : ""

  const storedUnit = step.delayUnit
  if (isDelayUnit(storedUnit) && isStoredUnitAccepted(step, storedUnit)) {
    return {
      unit: storedUnit,
      value: STORED_VALUE_CALCULATORS[storedUnit](step),
      specificDateTime,
    }
  }

  const inferred = inferDelayView(step.delayDays, step.delayMinutes)
  return { ...inferred, specificDateTime }
}

const RELATIVE_MINUTES_CALCULATORS: Record<
  DelayUnit,
  (value: number) => RelativeFields
> = {
  days: (value) => ({ delayDays: value, delayMinutes: 0 }),
  hours: (value) => ({ delayDays: 0, delayMinutes: value * MINUTES_PER_HOUR }),
  minutes: (value) => ({ delayDays: 0, delayMinutes: value }),
  immediate: () => ({ delayDays: 0, delayMinutes: 0 }),
  specificTime: () => ({ delayDays: 0, delayMinutes: 0 }),
}

export function delayViewToStored(view: {
  unit: DelayUnit
  value: number
  specificDateTimeIso?: string | null
}): StoredDelay {
  const { delayDays, delayMinutes } = RELATIVE_MINUTES_CALCULATORS[view.unit](
    view.value,
  )

  return {
    delayDays,
    delayMinutes,
    delayUnit: view.unit,
    specificDateTime:
      view.unit === "specificTime" ? (view.specificDateTimeIso ?? null) : null,
  }
}

export function toLocalDateTimeInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hour = `${date.getHours()}`.padStart(2, "0")
  const minute = `${date.getMinutes()}`.padStart(2, "0")
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function oneHourFromNowLocal(): string {
  const now = new Date()
  now.setHours(now.getHours() + 1)
  return toLocalDateTimeInputValue(now)
}
