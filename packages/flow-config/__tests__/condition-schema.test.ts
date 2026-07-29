import { describe, expect, test } from "vitest"
import { conditionFilterConditionSchema } from "../src/steps/condition"
import {
  FieldOperationType,
  setCustomFieldStepSchema,
} from "../src/steps/set-custom-field"

// The condition node stores the precise custom-field type (`date` | `datetime`)
// so the runtime filter can pick wall-clock vs zone-aware comparison. Zod strips
// unknown keys, so a missing `customFieldType` in the schema silently drops it
// on save and every date field is mis-evaluated on the datetime path.
describe("conditionFilterConditionSchema", () => {
  test("preserves customFieldType so date fields keep wall-clock semantics", () => {
    const parsed = conditionFilterConditionSchema.parse({
      field: "customField",
      operator: "eq",
      customFieldId: "42",
      valueType: "datetime",
      customFieldType: "date",
      value: "2026-07-20 09:30",
    })

    expect(parsed.customFieldType).toBe("date")
    expect(parsed.valueType).toBe("datetime")
  })

  test("stays optional for non-custom-field conditions", () => {
    const parsed = conditionFilterConditionSchema.parse({
      field: "lastSeen",
      operator: "gt",
      value: "2026-07-20",
    })

    expect(parsed.customFieldType).toBeUndefined()
  })

  test("preserves topicId so coupon topic conditions keep their selected topic", () => {
    const parsed = conditionFilterConditionSchema.parse({
      field: "couponTopic",
      operator: "used",
      topicId: "11619011544072192",
    })

    expect(parsed.topicId).toBe("11619011544072192")
  })
})

describe("setCustomFieldStepSchema", () => {
  test("preserves the editor timezone so worker temporal writes keep their source zone", () => {
    const parsed = setCustomFieldStepSchema.parse({
      id: "1",
      stepType: "setCustomField",
      inputFieldId: "cf-birthday",
      operation: FieldOperationType.set,
      value: "23/07/2026 09:30",
      timezone: "Asia/Ho_Chi_Minh",
    })

    expect(parsed.timezone).toBe("Asia/Ho_Chi_Minh")
  })
})
