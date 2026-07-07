// @vitest-environment node

import {
  customFieldTypes,
  formFieldTypes,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  contactFilterCriteriaSchema,
  customFieldConditionSchema,
  singleContactFilterConditionSchema,
} from "@/features/contact-filter/schemas"
import { staticFieldFilter } from "@/features/contact-filter/schemas/static-field-filter"
import { listContactsRequest } from "@/features/contacts/schemas/query"

describe("staticFieldFilter", () => {
  test("accepts enabled operators for text, dropdown, boolean, and date fields", () => {
    expect(
      staticFieldFilter("fullName").safeParse({
        field: "fullName",
        operator: operatorTypes.enum.startsWith,
        value: "Al",
      }).success,
    ).toBe(true)

    expect(
      staticFieldFilter("tags").safeParse({
        field: "tags",
        operator: operatorTypes.enum.eq,
        value: ["tag-1"],
      }).success,
    ).toBe(true)

    expect(
      staticFieldFilter("blocked").safeParse({
        field: "blocked",
        operator: operatorTypes.enum.eq,
        value: "true",
      }).success,
    ).toBe(true)

    expect(
      staticFieldFilter("lastSeen").safeParse({
        field: "lastSeen",
        operator: operatorTypes.enum.isBetween,
        value: ["2026-05-01T00:00:00Z", "2026-05-31T23:59:59Z"],
      }).success,
    ).toBe(true)
  })

  test("rejects disabled operators and missing interval values", () => {
    expect(
      staticFieldFilter("tags").safeParse({
        field: "tags",
        operator: operatorTypes.enum.contains,
        value: "vip",
      }).success,
    ).toBe(false)

    expect(
      staticFieldFilter("lastSeen").safeParse({
        field: "lastSeen",
        operator: operatorTypes.enum.isBetween,
        value: ["2026-05-01T00:00:00Z"],
      }).success,
    ).toBe(false)
  })

  test("accepts valueless operators without value and applies synthetic fallback only at factory level", () => {
    expect(
      staticFieldFilter("fullName").safeParse({
        field: "fullName",
        operator: operatorTypes.enum.isNotEmpty,
      }).success,
    ).toBe(true)

    expect(
      staticFieldFilter("syntheticField").safeParse({
        field: "syntheticField",
        operator: operatorTypes.enum.contains,
        value: "vip",
      }).success,
    ).toBe(true)
  })

  test("rejects empty operators for non-nullable boolean fields", () => {
    for (const field of ["emailWasVerified", "optedInForEmail"] as const) {
      expect(
        staticFieldFilter(field).safeParse({
          field,
          operator: operatorTypes.enum.isEmpty,
        }).success,
      ).toBe(false)

      expect(
        staticFieldFilter(field).safeParse({
          field,
          operator: operatorTypes.enum.eq,
          value: "true",
        }).success,
      ).toBe(true)
    }

    expect(
      staticFieldFilter("subscribedToBroadcast").safeParse({
        field: "subscribedToBroadcast",
        operator: operatorTypes.enum.isEmpty,
      }).success,
    ).toBe(true)
  })
})

describe("customFieldConditionSchema", () => {
  test.each([
    [
      "short text search",
      {
        customFieldType: customFieldTypes.enum.shortText,
        valueType: formFieldTypes.enum.text,
        operator: operatorTypes.enum.contains,
        value: "vip",
      },
      true,
    ],
    [
      "number range",
      {
        customFieldType: customFieldTypes.enum.number,
        valueType: formFieldTypes.enum.number,
        operator: operatorTypes.enum.isBetween,
        value: ["1", "10"],
      },
      true,
    ],
    [
      "datetime range",
      {
        customFieldType: customFieldTypes.enum.datetime,
        valueType: formFieldTypes.enum.datetime,
        operator: operatorTypes.enum.isBetween,
        value: ["2026-05-01T00:00:00Z", "2026-05-31T23:59:59Z"],
      },
      true,
    ],
    [
      "boolean valueless",
      {
        customFieldType: customFieldTypes.enum.boolean,
        valueType: formFieldTypes.enum.boolean,
        operator: operatorTypes.enum.isNotEmpty,
      },
      true,
    ],
    [
      "long text search disabled",
      {
        customFieldType: customFieldTypes.enum.longText,
        valueType: formFieldTypes.enum.text,
        operator: operatorTypes.enum.contains,
        value: "vip",
      },
      false,
    ],
  ])("validates %s", (_name, values, expected) => {
    const result = customFieldConditionSchema.safeParse({
      field: "customField",
      customFieldId: "cf-1",
      ...values,
    })

    expect(result.success).toBe(expected)
  })

  test("requires customFieldId and two values for interval operators", () => {
    expect(
      customFieldConditionSchema.safeParse({
        field: "customField",
        valueType: formFieldTypes.enum.text,
        operator: operatorTypes.enum.eq,
        value: "vip",
      }).success,
    ).toBe(false)

    expect(
      customFieldConditionSchema.safeParse({
        field: "customField",
        customFieldId: "cf-1",
        valueType: formFieldTypes.enum.number,
        operator: operatorTypes.enum.isBetween,
        value: ["1"],
      }).success,
    ).toBe(false)
  })
})

describe("contact filter union schemas", () => {
  test("accepts static and custom field conditions", () => {
    expect(
      singleContactFilterConditionSchema.safeParse({
        field: "email",
        operator: operatorTypes.enum.eq,
        value: "a@example.com",
      }).success,
    ).toBe(true)

    expect(
      singleContactFilterConditionSchema.safeParse({
        field: "customField",
        customFieldId: "cf-1",
        valueType: formFieldTypes.enum.text,
        operator: operatorTypes.enum.eq,
        value: "vip",
      }).success,
    ).toBe(true)
  })

  test("rejects bogus public field names", () => {
    expect(
      contactFilterCriteriaSchema.safeParse({
        operator: "and",
        conditions: [
          {
            field: "syntheticField",
            operator: operatorTypes.enum.contains,
            value: "vip",
          },
        ],
      }).success,
    ).toBe(false)
  })
})

describe("listContactsRequest contactFilter preprocess", () => {
  const criteria = {
    operator: "and" as const,
    conditions: [
      {
        field: "inbox",
        operator: operatorTypes.enum.eq,
        value: ["123"],
      },
    ],
  }

  test("parses JSON string contactFilter values", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      page: 1,
      perPage: 10,
      contactFilter: JSON.stringify(criteria),
    })

    expect(parsed.contactFilter).toEqual(criteria)
  })

  test("passes through already-object contactFilter values", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      page: 1,
      perPage: 10,
      contactFilter: criteria,
    })

    expect(parsed.contactFilter).toEqual(criteria)
  })

  test("drops invalid JSON contactFilter values without breaking pagination parsing", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      page: 2,
      perPage: 25,
      keyword: "Acme",
      contactFilter: "{invalid",
    })

    expect(parsed.contactFilter).toBeUndefined()
    expect(parsed.keyword).toBe("Acme")
  })
})
