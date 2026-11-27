import type { WhatsappFlowFieldMapping } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import type { WhatsappFlowScreenResource } from "@/features/integration-whatsapp/flows/schema/query"
import {
  buildFlowFieldMappings,
  collectFlowOutputs,
} from "../build-flow-field-mappings"

const screen = (
  id: string,
  output: Array<{ value: string; label: string; kind?: "file" | "value" }>,
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

  describe("file answers", () => {
    const screens = [
      screen("UPLOAD", [
        { value: "name", label: "Name", kind: "value" },
        { value: "docs", label: "Documents", kind: "file" },
      ]),
    ]

    test("a new file answer starts with the default format", () => {
      expect(buildFlowFieldMappings(screens, [])).toEqual([
        {
          paramKey: "name",
          paramLabel: "Name",
          customFieldId: null,
        },
        {
          paramKey: "docs",
          paramLabel: "Documents",
          customFieldId: null,
          fileFormat: "allUrls",
        },
      ])
    })

    test("keeps the format the user chose when mappings are rebuilt", () => {
      const existing: WhatsappFlowFieldMapping[] = [
        {
          paramKey: "docs",
          paramLabel: "Documents",
          customFieldId: "cf-docs",
          fileFormat: "firstUrl",
        },
      ]

      expect(buildFlowFieldMappings(screens, existing)[1]).toEqual({
        paramKey: "docs",
        paramLabel: "Documents",
        customFieldId: "cf-docs",
        fileFormat: "firstUrl",
      })
    })

    test("a key one screen fills with text and another with files keeps its format", () => {
      const mixed = [
        screen("TEXT", [{ value: "answer", label: "Answer", kind: "value" }]),
        screen("DOCS", [
          { value: "answer", label: "Answer (file)", kind: "file" },
        ]),
      ]
      const existing: WhatsappFlowFieldMapping[] = [
        { paramKey: "answer", customFieldId: "cf-1", fileFormat: "firstUrl" },
      ]

      expect(buildFlowFieldMappings(mixed, existing)).toEqual([
        {
          paramKey: "answer",
          paramLabel: "Answer",
          customFieldId: "cf-1",
          fileFormat: "firstUrl",
        },
      ])
      expect(collectFlowOutputs(mixed)).toEqual([
        { value: "answer", label: "Answer", kind: "file" },
      ])
    })

    test("drops the format of an answer that is no longer a file", () => {
      const existing: WhatsappFlowFieldMapping[] = [
        {
          paramKey: "name",
          customFieldId: "cf-name",
          fileFormat: "firstUrl",
        },
      ]

      expect(buildFlowFieldMappings(screens, existing)[0]).toEqual({
        paramKey: "name",
        paramLabel: "Name",
        customFieldId: "cf-name",
      })
    })
  })
})
