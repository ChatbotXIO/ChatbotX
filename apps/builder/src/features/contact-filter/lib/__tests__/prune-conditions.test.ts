import { contactFilterFields } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import type { ContactFilterCondition } from "../../schemas"
import { pruneExcludedConditions } from "../prune-conditions"

describe("pruneExcludedConditions", () => {
  test("drops conditions whose field is excluded", () => {
    const conditions = [
      {
        field: contactFilterFields.enum.currentChannel,
        operator: "in",
        value: ["whatsapp"],
      },
      {
        field: contactFilterFields.enum.inbox,
        operator: "in",
        value: ["inbox-1"],
      },
      {
        field: contactFilterFields.enum.fullName,
        operator: "contains",
        value: "Ada",
      },
    ] as ContactFilterCondition[]

    expect(
      pruneExcludedConditions(conditions, [contactFilterFields.enum.inbox]),
    ).toEqual([
      {
        field: contactFilterFields.enum.currentChannel,
        operator: "in",
        value: ["whatsapp"],
      },
      {
        field: contactFilterFields.enum.fullName,
        operator: "contains",
        value: "Ada",
      },
    ])
  })

  test("keeps custom field conditions when static fields are excluded", () => {
    const conditions = [
      {
        field: contactFilterFields.enum.inbox,
        operator: "in",
        value: ["inbox-1"],
      },
      {
        field: contactFilterFields.enum.customField,
        customFieldId: "custom-1",
        valueType: "text",
        operator: "contains",
        value: "VIP",
      },
    ] as ContactFilterCondition[]

    expect(
      pruneExcludedConditions(conditions, [contactFilterFields.enum.inbox]),
    ).toEqual([
      {
        field: contactFilterFields.enum.customField,
        customFieldId: "custom-1",
        valueType: "text",
        operator: "contains",
        value: "VIP",
      },
    ])
  })
})
