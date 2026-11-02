import { describe, expect, test } from "vitest"
import { customFieldTypes } from "../src/custom-field"
import {
  FIELD_OPERATION_DEFINITIONS,
  FieldOperationType,
  fieldOperationByApiName,
  fieldOperationCodes,
  fieldOperationsForType,
  isFieldOperationAllowed,
} from "../src/custom-field-operation"
import {
  calculateFieldValue,
  type FieldValueCalculationInput,
  FieldValueRejection,
} from "../src/field-value-calculator"

const NOW = new Date("2026-03-10T05:30:00.000Z")
const clock = { now: NOW, timeZone: "UTC" }

const calculate = (
  overrides: Partial<FieldValueCalculationInput> &
    Pick<FieldValueCalculationInput, "operation">,
) =>
  calculateFieldValue({
    fieldType: "number",
    currentValue: null,
    operand: "",
    clock,
    ...overrides,
  })

describe("operation registry", () => {
  test("O01-O05 keep their stored codes", () => {
    expect(FieldOperationType).toMatchObject({
      set: "O01",
      append: "O02",
      prepend: "O03",
      increase: "O04",
      decrease: "O05",
    })
  })

  test("every operation resolves from its public api name and is unique", () => {
    const names = fieldOperationCodes.map(
      (code) => FIELD_OPERATION_DEFINITIONS[code].apiName,
    )
    expect(new Set(names).size).toBe(names.length)
    for (const code of fieldOperationCodes) {
      expect(
        fieldOperationByApiName(FIELD_OPERATION_DEFINITIONS[code].apiName),
      ).toBe(code)
    }
    expect(fieldOperationByApiName("constructor")).toBeUndefined()
  })

  test.each([
    ["shortText", ["O01", "O02", "O03", "O06"]],
    ["longText", ["O01", "O02", "O03", "O06"]],
    ["email", ["O01", "O06"]],
    ["phoneNumber", ["O01", "O06"]],
    ["boolean", ["O01", "O06"]],
    ["number", ["O01", "O04", "O05", "O06", "O07"]],
    ["date", ["O01", "O06", "O08", "O09", "O10", "O11", "O12"]],
    ["datetime", ["O01", "O06", "O08", "O09", "O10", "O11", "O12"]],
  ] as const)("%s offers its Chatrace operations", (type, expected) => {
    expect(fieldOperationsForType(type)).toEqual(expected)
  })
})

describe("calculateFieldValue", () => {
  test("rejects every operation on a type it does not allow", () => {
    for (const operation of fieldOperationCodes) {
      for (const fieldType of customFieldTypes.options) {
        if (isFieldOperationAllowed(operation, fieldType)) {
          continue
        }
        expect(calculate({ operation, fieldType, operand: "1" })).toEqual({
          kind: "rejected",
          reason: FieldValueRejection.operationNotAllowed,
        })
      }
    }
  })

  test("rejects a blank operand where one is required", () => {
    for (const operation of fieldOperationCodes) {
      const definition = FIELD_OPERATION_DEFINITIONS[operation]
      if (!definition.requiresOperand) {
        continue
      }
      const [fieldType] = definition.allowedTypes
      expect(calculate({ operation, fieldType, operand: "  " })).toEqual({
        kind: "rejected",
        reason: FieldValueRejection.operandRequired,
      })
    }
  })

  describe("text", () => {
    test("set returns the operand, even when blank", () => {
      expect(
        calculate({ operation: "O01", fieldType: "shortText", operand: "" }),
      ).toEqual({ kind: "set", value: "" })
    })

    test.each([
      ["O02", "abc", "xyz", "abcxyz"],
      ["O03", "abc", "xyz", "xyzabc"],
      ["O02", null, "xyz", "xyz"],
      ["O03", "", "xyz", "xyz"],
    ] as const)("%s on %j with %j gives %j", (operation, current, operand, expected) => {
      expect(
        calculate({
          operation,
          fieldType: "longText",
          currentValue: current,
          operand,
        }),
      ).toEqual({ kind: "set", value: expected })
    })

    test("an empty operand leaves the value unchanged", () => {
      expect(
        calculate({
          operation: "O02",
          fieldType: "shortText",
          currentValue: "a",
          operand: "",
        }),
      ).toEqual({ kind: "unchanged" })
    })
  })

  describe("number", () => {
    test.each([
      ["O04", "5", "3", "8"],
      ["O05", "5", "3", "2"],
      ["O04", null, "7", "7"],
      ["O04", "", "7", "7"],
      ["O05", "", "7", "-7"],
      ["O05", null, "7", "-7"],
      ["O04", "0.1", "0.2", String(0.1 + 0.2)],
      ["O04", " 5 ", "1e2", "105"],
    ] as const)("%s on %j with %j gives %s", (operation, current, operand, expected) => {
      expect(calculate({ operation, currentValue: current, operand })).toEqual({
        kind: "set",
        value: expected,
      })
    })

    test("rejects a non-numeric operand or current value", () => {
      expect(
        calculate({ operation: "O04", currentValue: "1", operand: "abc" }),
      ).toEqual({
        kind: "rejected",
        reason: FieldValueRejection.operandNotNumber,
      })
      expect(
        calculate({ operation: "O04", currentValue: "abc", operand: "1" }),
      ).toEqual({
        kind: "rejected",
        reason: FieldValueRejection.currentNotNumber,
      })
    })

    test("rejects a result that overflows", () => {
      expect(
        calculate({
          operation: "O04",
          currentValue: "1.7e308",
          operand: "1.7e308",
        }),
      ).toEqual({
        kind: "rejected",
        reason: FieldValueRejection.nonFiniteResult,
      })
    })

    test("formula reads the current value", () => {
      expect(
        calculate({
          operation: "O07",
          currentValue: "4",
          operand: "value * 2 + 1",
        }),
      ).toEqual({ kind: "set", value: "9" })
      expect(
        calculate({
          operation: "O07",
          currentValue: null,
          operand: "value + 5",
        }),
      ).toEqual({ kind: "set", value: "5" })
    })

    test("formula rejects an invalid expression", () => {
      expect(calculate({ operation: "O07", operand: "1 +" })).toEqual({
        kind: "rejected",
        reason: FieldValueRejection.invalidExpression,
      })
    })
  })

  test("clear works on every type", () => {
    for (const fieldType of customFieldTypes.options) {
      expect(calculate({ operation: "O06", fieldType })).toEqual({
        kind: "clear",
      })
    }
  })

  describe("temporal", () => {
    test("set now stores an instant for datetime and the local day for date", () => {
      expect(calculate({ operation: "O08", fieldType: "datetime" })).toEqual({
        kind: "set",
        value: "2026-03-10T05:30:00.000Z",
      })
      expect(
        calculate({
          operation: "O08",
          fieldType: "date",
          clock: { now: NOW, timeZone: "Asia/Ho_Chi_Minh" },
        }),
      ).toEqual({ kind: "set", value: "2026-03-10" })
      expect(
        calculate({
          operation: "O08",
          fieldType: "date",
          clock: {
            now: new Date("2026-03-10T20:00:00.000Z"),
            timeZone: "Asia/Ho_Chi_Minh",
          },
        }),
      ).toEqual({ kind: "set", value: "2026-03-11" })
    })

    test("adds minutes, hours and days to the current value", () => {
      const current = "2026-03-10T00:00:00.000Z"
      const base = { fieldType: "datetime", currentValue: current } as const
      expect(calculate({ ...base, operation: "O10", operand: "90" })).toEqual({
        kind: "set",
        value: "2026-03-10T01:30:00.000Z",
      })
      expect(calculate({ ...base, operation: "O11", operand: "-2" })).toEqual({
        kind: "set",
        value: "2026-03-09T22:00:00.000Z",
      })
      expect(calculate({ ...base, operation: "O12", operand: "3" })).toEqual({
        kind: "set",
        value: "2026-03-13T00:00:00.000Z",
      })
    })

    test("an empty value is based on now", () => {
      expect(
        calculate({
          operation: "O12",
          fieldType: "datetime",
          operand: "1",
        }),
      ).toEqual({ kind: "set", value: "2026-03-11T05:30:00.000Z" })
    })

    test("a date field adds whole days in its own zone", () => {
      const timeZone = "Asia/Ho_Chi_Minh"
      expect(
        calculate({
          operation: "O12",
          fieldType: "date",
          currentValue: "2026-03-10T00:00:00+07:00",
          operand: "1",
          clock: { now: NOW, timeZone },
        }),
      ).toEqual({ kind: "set", value: "2026-03-11" })
    })

    test("a date stored in another zone keeps its calendar day (never shifts)", () => {
      const clockZone = { now: NOW, timeZone: "America/Los_Angeles" }
      for (const currentValue of [
        "2024-03-10T00:00:00+07:00",
        "2024-03-10T00:00:00-05:00",
        "2024-03-10",
      ]) {
        expect(
          calculate({
            operation: "O12",
            fieldType: "date",
            currentValue,
            operand: "1",
            clock: clockZone,
          }),
        ).toEqual({ kind: "set", value: "2024-03-11" })
      }
    })

    test("a date with an invalid stored day is rejected", () => {
      expect(
        calculate({
          operation: "O12",
          fieldType: "date",
          currentValue: "not-a-date",
          operand: "1",
        }),
      ).toEqual({ kind: "rejected", reason: FieldValueRejection.invalidDate })
    })

    test("rejects a fractional day count, an unparsable value and out-of-range results", () => {
      expect(
        calculate({ operation: "O12", fieldType: "date", operand: "1.5" }),
      ).toEqual({
        kind: "rejected",
        reason: FieldValueRejection.operandNotNumber,
      })
      expect(
        calculate({
          operation: "O10",
          fieldType: "datetime",
          currentValue: "garbage",
          operand: "1",
        }),
      ).toEqual({ kind: "rejected", reason: FieldValueRejection.invalidDate })
      expect(
        calculate({
          operation: "O11",
          fieldType: "datetime",
          operand: "99999999999",
        }),
      ).toEqual({ kind: "rejected", reason: FieldValueRejection.invalidDate })
    })

    test("falls back to UTC for an unusable timezone instead of throwing", () => {
      expect(
        calculate({
          operation: "O08",
          fieldType: "date",
          clock: { now: NOW, timeZone: "Not/AZone" },
        }),
      ).toEqual({ kind: "set", value: "2026-03-10" })
    })

    test("date expressions compute from now", () => {
      expect(
        calculate({
          operation: "O09",
          fieldType: "datetime",
          operand: "now + 1 day - 30 min",
        }),
      ).toEqual({ kind: "set", value: "2026-03-11T05:00:00.000Z" })
      expect(
        calculate({
          operation: "O09",
          fieldType: "datetime",
          operand: "nonsense",
        }),
      ).toEqual({ kind: "rejected", reason: FieldValueRejection.invalidDate })
    })
  })
})

describe("fractional temporal operands", () => {
  const base = "2026-01-01T00:00:00.000Z"
  const addTo = (operation: FieldOperationType, operand: string) =>
    calculate({
      fieldType: "datetime",
      operation,
      currentValue: base,
      operand,
    })

  test("add minutes and hours accept fractions", () => {
    expect(addTo(FieldOperationType.addMinutes, "0.5")).toEqual({
      kind: "set",
      value: "2026-01-01T00:00:30.000Z",
    })
    expect(addTo(FieldOperationType.addHours, "0.5")).toEqual({
      kind: "set",
      value: "2026-01-01T00:30:00.000Z",
    })
  })

  test("add days rejects a fraction", () => {
    expect(addTo(FieldOperationType.addDays, "0.5")).toEqual({
      kind: "rejected",
      reason: FieldValueRejection.operandNotNumber,
    })
  })
})

describe("non-finite numbers", () => {
  test("a stored Infinity is not a number", () => {
    expect(
      calculate({
        operation: FieldOperationType.formula,
        currentValue: "Infinity",
        operand: "1 / value",
      }),
    ).toEqual({
      kind: "rejected",
      reason: FieldValueRejection.currentNotNumber,
    })
  })
})
