import type { WhatsappFlowFieldMapping } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import type { WhatsappFlowScreenResource } from "@/features/integration-whatsapp/flows/schema/query"
import { buildFlowFieldMappings } from "../build-flow-field-mappings"

const screen = (
  id: string,
  output: Array<{ value: string; label: string }>,
): WhatsappFlowScreenResource => ({
  id,
  title: id,
  terminal: false,
  output,
})

describe("buildFlowFieldMappings", () => {
  test("aggregates outputs across all screens when the entry screen has none", () => {
    // The template's navigate_screen (entry) collects nothing; the response
    // fields live on later screens — the exact case that rendered blank before.
    const screens = [
      screen("RECOMMEND", []),
      screen("FEEDBACK_1", [
        { value: "purchase_experience", label: "Purchase experience" },
        { value: "delivery", label: "Delivery" },
      ]),
      screen("FEEDBACK_2", [{ value: "comment", label: "Leave a comment" }]),
    ]

    const result = buildFlowFieldMappings(screens, [])

    expect(result.map((mapping) => mapping.paramKey)).toEqual([
      "purchase_experience",
      "delivery",
      "comment",
    ])
    expect(result.every((mapping) => mapping.customFieldId === null)).toBe(true)
  })

  test("dedupes fields that repeat across screens by paramKey", () => {
    const screens = [
      screen("A", [{ value: "email", label: "Email" }]),
      screen("B", [
        { value: "email", label: "Email (again)" },
        { value: "phone", label: "Phone" },
      ]),
    ]

    const result = buildFlowFieldMappings(screens, [])

    expect(result.map((mapping) => mapping.paramKey)).toEqual([
      "email",
      "phone",
    ])
    // First occurrence wins.
    expect(result[0].paramLabel).toBe("Email")
  })

  test("preserves already-selected custom fields and nulls new ones", () => {
    const existing: WhatsappFlowFieldMapping[] = [
      { paramKey: "email", paramLabel: "Email", customFieldId: "cf-email" },
    ]
    const screens = [
      screen("A", [
        { value: "email", label: "Email" },
        { value: "phone", label: "Phone" },
      ]),
    ]

    const result = buildFlowFieldMappings(screens, existing)

    expect(result).toEqual([
      { paramKey: "email", paramLabel: "Email", customFieldId: "cf-email" },
      { paramKey: "phone", paramLabel: "Phone", customFieldId: null },
    ])
  })

  test("returns an empty list when no screen declares outputs", () => {
    expect(
      buildFlowFieldMappings([screen("A", []), screen("B", [])], []),
    ).toEqual([])
    expect(buildFlowFieldMappings([], [])).toEqual([])
  })
})
