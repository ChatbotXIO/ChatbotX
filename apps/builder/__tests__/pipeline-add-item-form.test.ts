import { describe, expect, test } from "vitest"
import {
  addItemFormSchema,
  hasMissingRequiredField,
  initialAddItemFormValues,
  splitAssignees,
} from "@/features/pipelines/lib/add-item-form"

describe("add item form model", () => {
  test("rejects an empty or blank title", () => {
    const base = initialAddItemFormValues()
    expect(addItemFormSchema.safeParse({ ...base, title: "  " }).success).toBe(
      false,
    )
    expect(
      addItemFormSchema.safeParse({ ...base, title: "Deal" }).success,
    ).toBe(true)
  })

  test("rejects a negative value", () => {
    const base = { ...initialAddItemFormValues(), title: "Deal" }
    expect(addItemFormSchema.safeParse({ ...base, value: -1 }).success).toBe(
      false,
    )
    expect(
      addItemFormSchema.safeParse({ ...base, value: 1.2345 }).success,
    ).toBe(true)
  })

  test("splits assignee values into member and team ids", () => {
    expect(splitAssignees(["u_m1", "t_t1", "u_m2"])).toEqual({
      memberIds: ["m1", "m2"],
      teamIds: ["t1"],
    })
  })

  test("a required field without a value blocks the save", () => {
    const fields = [
      { id: "a", required: true },
      { id: "b", required: false },
    ]
    expect(hasMissingRequiredField(fields, { a: "", b: "" })).toBe(true)
    expect(hasMissingRequiredField(fields, { a: "x" })).toBe(false)
  })

  test("seeds every custom field with an empty string", () => {
    expect(initialAddItemFormValues(["a", "b"]).fieldValues).toEqual({
      a: "",
      b: "",
    })
  })
})
