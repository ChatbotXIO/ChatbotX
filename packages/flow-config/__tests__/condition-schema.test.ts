import { describe, expect, test } from "vitest"
import {
  conditionFilterConditionSchema,
  conditionStepSchema,
} from "../src/steps/condition"
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

describe("pipelineItem in the Condition step", () => {
  const pipelineCondition = {
    field: "pipelineItem",
    operator: "in",
    value: ["open"],
  }

  test("is rejected on a condition", () => {
    const parsed = conditionFilterConditionSchema.safeParse(pipelineCondition)

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(["field"])
  })

  test("fails the whole step so save and publish stop", () => {
    const parsed = conditionStepSchema.safeParse({
      id: "1",
      stepType: "condition",
      otherwiseId: "2",
      cases: [{ id: "3", operator: "and", conditions: [pipelineCondition] }],
    })

    expect(parsed.success).toBe(false)
  })

  test("other fields are unaffected", () => {
    expect(
      conditionStepSchema.safeParse({
        id: "1",
        stepType: "condition",
        otherwiseId: "2",
        cases: [
          {
            id: "3",
            operator: "and",
            conditions: [{ field: "email", operator: "eq", value: "a@b.c" }],
          },
        ],
      }).success,
    ).toBe(true)
  })
})
