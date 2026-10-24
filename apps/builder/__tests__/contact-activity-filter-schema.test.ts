import {
  CONTACT_ACTIVITY_FILTERS,
  CONTACT_ACTIVITY_TRACKED_FIELDS,
  type ContactActivityFilterField,
  NO_TOPIC_FIXED_VALUE,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { getFieldConfigs } from "@/features/contact-filter/components/contact-filter-config"
import { staticFieldRules } from "@/features/contact-filter/components/static-field-filter-config"
import {
  CONTACT_FILTER_FIELD_DEFINITIONS,
  contactFilterCriteriaSchema,
} from "@/features/contact-filter/schema"
import { enabledOperatorsForStaticField } from "@/features/contact-filter/schema/static-field-filter"

const ACTIVITY_FIELDS = Object.keys(
  CONTACT_ACTIVITY_FILTERS,
) as ContactActivityFilterField[]

const parse = (condition: Record<string, unknown>) =>
  contactFilterCriteriaSchema.safeParse({
    operator: "and",
    conditions: [condition],
  })

const sampleValue = (field: ContactActivityFilterField) =>
  CONTACT_ACTIVITY_FILTERS[field].valueFormat === "flowId:nodeId" ? "7:9" : "9"

describe("activity-backed filter conditions", () => {
  describe.each(ACTIVITY_FIELDS)("%s", (field) => {
    test.each([
      "in",
      "notIn",
      "eq",
      "ne",
    ])("accepts %s with a valid value", (operator) => {
      expect(
        parse({ field, operator, value: [sampleValue(field)] }).success,
      ).toBe(true)
    })

    test("accepts Has no value without a value", () => {
      expect(parse({ field, operator: "isEmpty" }).success).toBe(true)
    })

    test.each([
      "contains",
      "gt",
      "isNotEmpty",
    ])("rejects the unsupported operator %s", (operator) => {
      expect(
        parse({ field, operator, value: [sampleValue(field)] }).success,
      ).toBe(false)
    })

    test.each([
      ["malformed ids", ["abc"]],
      ["a zero id", ["0"]],
      ["an empty list", []],
      ["no value", undefined],
    ])("rejects %s", (_label, value) => {
      expect(parse({ field, operator: "in", value }).success).toBe(false)
    })
  })

  test("a step value is a flowId:nodeId pair, never a bare node id", () => {
    expect(
      parse({ field: "executedStep", operator: "in", value: ["7:9"] }).success,
    ).toBe(true)
    for (const value of ["9", "7:9:1", "7:", ":9", "7:node"]) {
      expect(
        parse({ field: "executedStep", operator: "in", value: [value] })
          .success,
      ).toBe(false)
    }
  })

  test("noTopic is accepted for email fields only", () => {
    expect(
      parse({
        field: "emailOpened",
        operator: "in",
        value: [NO_TOPIC_FIXED_VALUE, "12"],
      }).success,
    ).toBe(true)
    expect(
      parse({
        field: "executedFlow",
        operator: "in",
        value: [NO_TOPIC_FIXED_VALUE],
      }).success,
    ).toBe(false)
  })

  test("rejects more than 500 values", () => {
    const many = Array.from({ length: 501 }, (_, index) => String(index + 1))
    expect(
      parse({ field: "keywordsReceived", operator: "in", value: many }).success,
    ).toBe(false)
    expect(
      parse({
        field: "keywordsReceived",
        operator: "in",
        value: many.slice(0, 500),
      }).success,
    ).toBe(true)
  })
})

describe("sentMessage conditions", () => {
  test.each([
    "eq",
    "ne",
    "contains",
    "notContains",
    "startsWith",
    "endsWith",
  ])("accepts %s with text", (operator) => {
    expect(
      parse({ field: "sentMessage", operator, value: "hello" }).success,
    ).toBe(true)
  })

  test("accepts Has no value / has a value without text", () => {
    expect(parse({ field: "sentMessage", operator: "isEmpty" }).success).toBe(
      true,
    )
    expect(
      parse({ field: "sentMessage", operator: "isNotEmpty" }).success,
    ).toBe(true)
  })

  test.each([
    ["blank text", "   "],
    ["no text", undefined],
    ["a list", ["hello"]],
    ["oversized text", "x".repeat(1001)],
    ["only combining marks (blank once normalized)", "\u0301"],
  ])("rejects %s", (_label, value) => {
    expect(
      parse({ field: "sentMessage", operator: "contains", value }).success,
    ).toBe(false)
  })
})

describe("lastDelivered conditions", () => {
  test.each([
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
  ])("accepts %s with a date", (operator) => {
    expect(
      parse({ field: "lastDelivered", operator, value: "2026-05-19" }).success,
    ).toBe(true)
  })

  test.each([
    "isBetween",
    "notBetween",
  ])("accepts %s with a date pair", (operator) => {
    expect(
      parse({
        field: "lastDelivered",
        operator,
        value: ["2026-05-01", "2026-05-31"],
      }).success,
    ).toBe(true)
  })

  test("accepts Has no value and has a value", () => {
    for (const operator of ["isEmpty", "isNotEmpty"]) {
      expect(parse({ field: "lastDelivered", operator }).success).toBe(true)
    }
  })

  test("rejects text operators", () => {
    expect(
      parse({ field: "lastDelivered", operator: "contains", value: "x" })
        .success,
    ).toBe(false)
  })
})

describe("Zod and UI operator rules stay in sync for the tracked fields", () => {
  test.each([...CONTACT_ACTIVITY_TRACKED_FIELDS])("%s", (field) => {
    const zodOperators = [...enabledOperatorsForStaticField(field)].sort()
    const uiOperators = [
      ...(staticFieldRules[field]?.enabledOperators ?? []),
    ].sort()
    expect(uiOperators).toEqual(zodOperators)
  })

  test("every tracked field has a definition", () => {
    const defined = new Set(
      CONTACT_FILTER_FIELD_DEFINITIONS.map((def) => def.field as string),
    )
    for (const field of CONTACT_ACTIVITY_TRACKED_FIELDS) {
      expect(defined.has(field)).toBe(true)
    }
  })
})

describe("activity fields in the picker", () => {
  const t = (key: string) => key
  const build = (overrides: Record<string, unknown> = {}) =>
    getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [{ label: "Flow A", value: "7" }],
      flowNodeOptions: [{ label: "Flow A · Welcome", value: "7:9" }],
      customFields: [],
      ...overrides,
    })

  test("offers all ten fields by default, in the analytics and email groups", () => {
    const configs = build()
    for (const field of CONTACT_ACTIVITY_TRACKED_FIELDS) {
      expect(configs.some((config) => config.name === field)).toBe(true)
    }
    const group = (name: string) =>
      configs.find((config) => config.name === name)?.group
    expect(group("executedStep")).toBe("analytics")
    expect(group("emailOpened")).toBe("email")
  })

  test("hides all ten when the kill switch is off, but keeps other fields", () => {
    const configs = build({ activityFiltersEnabled: false })
    for (const field of CONTACT_ACTIVITY_TRACKED_FIELDS) {
      expect(configs.some((config) => config.name === field)).toBe(false)
    }
    expect(configs.some((config) => config.name === "tags")).toBe(true)
    expect(configs.some((config) => config.name === "lastSent")).toBe(true)
  })

  test("executed flow and step options come from the loaded flows", () => {
    const configs = build()
    const options = (name: string) =>
      configs.find((config) => config.name === name)?.options
    expect(options("executedFlow")).toEqual([{ label: "Flow A", value: "7" }])
    expect(options("executedStep")).toEqual([
      { label: "Flow A · Welcome", value: "7:9" },
    ])
  })

  test("email fields always offer the fixed No Topic choice; server-searched fields start empty", () => {
    const configs = build()
    const options = (name: string) =>
      configs.find((config) => config.name === name)?.options
    for (const field of [
      "emailSent",
      "emailDelivered",
      "emailOpened",
      "emailClicked",
    ]) {
      expect(options(field)).toEqual([
        { label: "condition.noTopic", value: NO_TOPIC_FIXED_VALUE },
      ])
    }
    expect(options("keywordsReceived")).toBeUndefined()
    expect(options("completedWhatsAppFlows")).toBeUndefined()
  })

  test("names a chosen No Topic value instead of flagging it deleted", () => {
    const configs = build({
      filterValueLabels: {
        tags: [],
        sequences: [],
        broadcasts: [],
        reflinks: [],
        inboxes: [],
        members: [],
        inboxTeams: [],
        flows: [],
        flowNodes: [],
        keywords: [],
        whatsappFlows: [],
        emailTopics: [{ id: "12", name: "Newsletter" }],
      },
    })
    const labels = configs.find(
      (config) => config.name === "emailSent",
    )?.valueLabels
    expect(labels).toEqual(
      expect.arrayContaining([
        { label: "Newsletter", value: "12" },
        { label: "condition.noTopic", value: NO_TOPIC_FIXED_VALUE },
      ]),
    )
  })
})
