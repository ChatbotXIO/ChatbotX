import {
  dateTimeTriggerTypes,
  operatorTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { customFieldValueChanged } from "../schemas/custom-field-value-changed"
import { dateTimeBasedTrigger } from "../schemas/date-time-based-trigger"

describe("dateTimeBasedTrigger schema timezone", () => {
  test("preserves the editor-captured timezone on the value object", () => {
    // The `value` is a typed `z.object()`, which strips unknown keys. The
    // timezone must be declared in the schema or it never reaches the DB.
    const parsed = dateTimeBasedTrigger.parse({
      type: triggerEventTypes.enum.dateTimeBasedTrigger,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value: {
        triggerType: dateTimeTriggerTypes.enum.before,
        timeValue: 2,
        timeType: "days",
        timezone: "Asia/Ho_Chi_Minh",
      },
    })

    expect(parsed.value.timezone).toBe("Asia/Ho_Chi_Minh")
  })

  test("stays valid for legacy conditions saved before timezone capture", () => {
    const parsed = dateTimeBasedTrigger.parse({
      type: triggerEventTypes.enum.dateTimeBasedTrigger,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value: {
        triggerType: dateTimeTriggerTypes.enum.atTheDayOf,
        at: "9",
      },
    })

    expect(parsed.value.timezone).toBeUndefined()
  })

  test("rejects an over-long timezone string at the boundary", () => {
    const result = dateTimeBasedTrigger.safeParse({
      type: triggerEventTypes.enum.dateTimeBasedTrigger,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value: {
        triggerType: dateTimeTriggerTypes.enum.before,
        timeValue: 2,
        timeType: "days",
        timezone: "A".repeat(65),
      },
    })

    expect(result.success).toBe(false)
  })
})

describe("customFieldValueChanged schema timezone", () => {
  test("passes the { text, timezone } value through unchanged", () => {
    // `value` is `z.unknown()`, so the whole payload is carried verbatim — this
    // is why the schema needed no edit to thread the captured timezone through.
    const value = {
      text: "2026-07-11T03:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
    }

    const parsed = customFieldValueChanged.parse({
      type: triggerEventTypes.enum.customFieldValueChanged,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value,
    })

    expect(parsed.value).toEqual(value)
  })
})
