import { describe, expect, test } from "vitest"
import {
  parseTemplateExport,
  TEMPLATE_EXPORT_FORMAT_VERSION,
} from "../src/import-export/template-schema"

const buildEnvelope = () => ({
  formatVersion: TEMPLATE_EXPORT_FORMAT_VERSION,
  exportedAt: new Date().toISOString(),
  source: { workspaceId: "1", tenantId: "1" },
  manifests: {
    customFields: {},
    tags: {},
    productCategories: {},
    folders: {},
  },
  resources: {
    flows: [],
    products: [],
    aiFunctions: [],
    aiAgents: [],
    calendars: [],
    webchats: [],
    keywords: [],
    entryPointLinks: [],
    triggers: [],
    fbCommentAutomations: [],
    settings: { savedReplies: [], botFields: [] },
  },
})

describe("parseTemplateExport", () => {
  test("accepts a well-formed empty envelope", () => {
    const result = parseTemplateExport(buildEnvelope())
    expect(result.ok).toBe(true)
  })

  test("never throws on malformed input", () => {
    expect(() => parseTemplateExport({ not: "a template" })).not.toThrow()
    const result = parseTemplateExport({ not: "a template" })
    expect(result.ok).toBe(false)
  })

  test("rejects an unknown formatVersion before full validation", () => {
    const result = parseTemplateExport({
      ...buildEnvelope(),
      formatVersion: 999,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain(
        "Unsupported template export format version",
      )
    }
  })

  test("keys manifest entries by folderType, not name alone", () => {
    const envelope = buildEnvelope()
    envelope.manifests.folders = {
      "src-1": {
        name: "VIP",
        folderType: "automatedResponse",
        parentSourceId: null,
      },
      "src-2": {
        name: "VIP",
        folderType: "outboundAutomatedResponse",
        parentSourceId: null,
      },
    }
    const result = parseTemplateExport(envelope)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.data.manifests.folders)).toHaveLength(2)
    }
  })

  test("requires each resource entry to carry a sourceId join key", () => {
    const envelope = buildEnvelope()
    envelope.resources.products = [{ name: "no source id" } as never]
    const result = parseTemplateExport(envelope)
    expect(result.ok).toBe(false)
  })
})
