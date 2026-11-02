import type { CustomFieldType } from "../custom-field"
import {
  FIELD_OPERATION_DEFINITIONS,
  FieldOperationType,
  isFieldOperationAllowed,
} from "../custom-field-operation"
import {
  datePartOf,
  isRealCalendarDate,
  resolveFilterTimezone,
} from "../datetime"
import { localDateOf, resolveZonedInstant } from "../recurrence"
import {
  addDateUnit,
  type DateUnit,
  evaluateDateExpression,
} from "./date-expression"
import { evaluateMathExpression } from "./math-expression"

export const FieldValueRejection = {
  operationNotAllowed: "operationNotAllowed",
  operandRequired: "operandRequired",
  operandNotNumber: "operandNotNumber",
  currentNotNumber: "currentNotNumber",
  invalidExpression: "invalidExpression",
  invalidDate: "invalidDate",
  nonFiniteResult: "nonFiniteResult",
} as const
export type FieldValueRejection =
  (typeof FieldValueRejection)[keyof typeof FieldValueRejection]

export type FieldValueCalculationInput = {
  fieldType: CustomFieldType
  operation: FieldOperationType
  /** `""` and `null` both mean empty. */
  currentValue: string | null
  /** Already `{{variable}}`-resolved by the caller. */
  operand: string
  clock: { now: Date; timeZone: string }
}

export type FieldValueCalculationResult =
  | { kind: "set"; value: string }
  | { kind: "clear" }
  | { kind: "unchanged" }
  | { kind: "rejected"; reason: FieldValueRejection }

type FieldValueCalculator = (
  input: FieldValueCalculationInput,
) => FieldValueCalculationResult

const rejected = (
  reason: FieldValueRejection,
): FieldValueCalculationResult => ({ kind: "rejected", reason })

const setTo = (value: string): FieldValueCalculationResult => ({
  kind: "set",
  value,
})

const parseNumber = (text: string): number | null => {
  const value = Number(text)
  return text.trim() === "" || !Number.isFinite(value) ? null : value
}

/** An empty current value counts as 0. */
const currentNumber = (currentValue: string | null): number | null =>
  currentValue === null || currentValue === "" ? 0 : parseNumber(currentValue)

const finiteNumberResult = (value: number): FieldValueCalculationResult =>
  Number.isFinite(value)
    ? setTo(String(value))
    : rejected(FieldValueRejection.nonFiniteResult)

const concatenate =
  (join: (current: string, operand: string) => string): FieldValueCalculator =>
  ({ currentValue, operand }) =>
    operand === ""
      ? { kind: "unchanged" }
      : setTo(join(currentValue ?? "", operand))

const shiftNumber =
  (sign: 1 | -1): FieldValueCalculator =>
  ({ currentValue, operand }) => {
    const current = currentNumber(currentValue)
    const amount = parseNumber(operand)
    if (amount === null) {
      return rejected(FieldValueRejection.operandNotNumber)
    }
    if (current === null) {
      return rejected(FieldValueRejection.currentNotNumber)
    }
    return finiteNumberResult(current + sign * amount)
  }

const formula: FieldValueCalculator = ({ currentValue, operand }) => {
  const current = currentNumber(currentValue)
  if (current === null) {
    return rejected(FieldValueRejection.currentNotNumber)
  }
  const result = evaluateMathExpression(operand, new Map([["value", current]]))
  return result.ok
    ? finiteNumberResult(result.value)
    : rejected(FieldValueRejection.invalidExpression)
}

/** A `date` keeps only the calendar day in the zone; a `datetime` the instant. */
const temporalResult = (
  fieldType: CustomFieldType,
  instant: Date | null,
  timeZone: string,
): FieldValueCalculationResult => {
  if (!instant) {
    return rejected(FieldValueRejection.invalidDate)
  }
  return setTo(
    fieldType === "date"
      ? localDateOf(instant, timeZone)
      : instant.toISOString(),
  )
}

/**
 * The instant arithmetic starts from, or `now` for an empty value. A `date` is
 * stored as its calendar day with the writer's offset, so the day is read from
 * the text and anchored in the clock zone (never re-read as an instant, which
 * shifts the day when the zones differ); a `datetime` is an absolute instant.
 */
const temporalBase = (
  fieldType: CustomFieldType,
  currentValue: string | null,
  clock: FieldValueCalculationInput["clock"],
): Date | null => {
  if (currentValue === null || currentValue === "") {
    return clock.now
  }
  if (fieldType === "date") {
    const day = datePartOf(currentValue)
    return isRealCalendarDate(day)
      ? resolveZonedInstant(day, "00:00", clock.timeZone)
      : null
  }
  const parsed = new Date(currentValue)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const addToTemporal =
  (unit: DateUnit, requiresWholeNumber: boolean): FieldValueCalculator =>
  ({ fieldType, currentValue, operand, clock }) => {
    const amount = parseNumber(operand)
    if (amount === null || (requiresWholeNumber && !Number.isInteger(amount))) {
      return rejected(FieldValueRejection.operandNotNumber)
    }
    const base = temporalBase(fieldType, currentValue, clock)
    return temporalResult(
      fieldType,
      base && addDateUnit(base, unit, amount, clock.timeZone),
      clock.timeZone,
    )
  }

const FIELD_VALUE_CALCULATORS = {
  [FieldOperationType.set]: ({ operand }) => setTo(operand),
  [FieldOperationType.append]: concatenate(
    (current, operand) => current + operand,
  ),
  [FieldOperationType.prepend]: concatenate(
    (current, operand) => operand + current,
  ),
  [FieldOperationType.increase]: shiftNumber(1),
  [FieldOperationType.decrease]: shiftNumber(-1),
  [FieldOperationType.clear]: () => ({ kind: "clear" }),
  [FieldOperationType.formula]: formula,
  [FieldOperationType.setNow]: ({ fieldType, clock }) =>
    temporalResult(fieldType, clock.now, clock.timeZone),
  [FieldOperationType.dateExpression]: ({ fieldType, operand, clock }) =>
    temporalResult(
      fieldType,
      evaluateDateExpression(operand, clock),
      clock.timeZone,
    ),
  [FieldOperationType.addMinutes]: addToTemporal("minute", false),
  [FieldOperationType.addHours]: addToTemporal("hour", false),
  [FieldOperationType.addDays]: addToTemporal("day", true),
} as const satisfies Record<FieldOperationType, FieldValueCalculator>

const guard = (
  input: FieldValueCalculationInput,
): FieldValueCalculationResult | null => {
  const { operation, fieldType, operand } = input
  if (!isFieldOperationAllowed(operation, fieldType)) {
    return rejected(FieldValueRejection.operationNotAllowed)
  }
  if (
    FIELD_OPERATION_DEFINITIONS[operation].requiresOperand &&
    operand.trim() === ""
  ) {
    return rejected(FieldValueRejection.operandRequired)
  }
  return null
}

/**
 * Pure: turns one field operation into the value to persist. All I/O (locking,
 * reading the current value, writing, events) belongs to the business layer.
 */
export const calculateFieldValue = (
  input: FieldValueCalculationInput,
): FieldValueCalculationResult => {
  const clock = {
    now: input.clock.now,
    timeZone: resolveFilterTimezone(input.clock.timeZone),
  }
  const normalizedInput = { ...input, clock }
  return (
    guard(normalizedInput) ??
    FIELD_VALUE_CALCULATORS[input.operation](normalizedInput)
  )
}
