// @vitest-environment node

import { describe, expect, test, vi } from "vitest"
import { hashTemplatePayload } from "../src/template/payload-hash"

const payload = {
  formatVersion: 2,
  exportedAt: "2026-01-01T00:00:00.000Z",
  source: { workspaceId: "1", tenantId: "1" },
  resources: { flows: [{ sourceId: "10", name: "A", nodes: [1, 2] }] },
}

describe("hashTemplatePayload", () => {
  test("ignores envelope metadata and key order", async () => {
    const reordered = {
      resources: { flows: [{ nodes: [1, 2], name: "A", sourceId: "10" }] },
      source: { workspaceId: "999", tenantId: "2" },
      exportedAt: "2027-06-01T00:00:00.000Z",
      formatVersion: 2,
    }
    expect(await hashTemplatePayload(reordered)).toBe(
      await hashTemplatePayload(payload),
    )
  })

  test("changes with content, array order and source resource ids", async () => {
    const base = await hashTemplatePayload(payload)
    const rename = structuredClone(payload)
    rename.resources.flows[0].name = "B"
    const reorder = structuredClone(payload)
    reorder.resources.flows[0].nodes = [2, 1]
    const reId = structuredClone(payload)
    reId.resources.flows[0].sourceId = "11"
    for (const changed of [rename, reorder, reId]) {
      expect(await hashTemplatePayload(changed)).not.toBe(base)
    }
  })
})

describe("legacy payloads", () => {
  test("a payload without the newer empty categories hashes like one that lists them", async () => {
    const { parseTemplateExport } = await vi.importActual<
      typeof import("@chatbotx.io/flow-config")
    >("@chatbotx.io/flow-config")
    const legacy = {
      formatVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      source: { workspaceId: "1", tenantId: "1" },
      manifests: {},
      resources: {},
    }
    const parsedLegacy = parseTemplateExport(legacy)
    const parsedNow = parseTemplateExport({
      ...legacy,
      exportedAt: "2027-01-01T00:00:00.000Z",
      manifests: { inboxes: {} },
      resources: {
        sequences: [],
        aiMcpServers: [],
        aiFiles: [],
        questionnaires: [],
        couponTopics: [],
      },
    })
    if (!(parsedLegacy.ok && parsedNow.ok)) {
      throw new Error("fixture should parse")
    }
    expect(await hashTemplatePayload(parsedLegacy.data)).toBe(
      await hashTemplatePayload(parsedNow.data),
    )
  })
})
