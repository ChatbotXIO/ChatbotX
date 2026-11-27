import { describe, expect, test } from "vitest"
import {
  flowVersionSchema,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
  whatsappFlowStepDefaultFn,
} from "../src"
import {
  parseTemplateExport,
  TEMPLATE_EXPORT_FORMAT_VERSION,
  TEMPLATE_EXPORT_FORMAT_VERSION_V2,
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

  test("a v2 payload carries its per-item permissions through a parse round-trip", () => {
    const permissions = { flows: { f1: { allowEdit: false } } }

    const result = parseTemplateExport({
      ...buildEnvelope(),
      formatVersion: TEMPLATE_EXPORT_FORMAT_VERSION_V2,
      permissions,
    })

    expect(result.ok && result.data.permissions).toEqual(permissions)
  })

  test("a v2 payload carries its inboxes manifest through a parse round-trip", () => {
    const inboxes = { "11": { channelType: "messenger", name: "Page A" } }
    const envelope = buildEnvelope()
    const result = parseTemplateExport({
      ...envelope,
      formatVersion: TEMPLATE_EXPORT_FORMAT_VERSION_V2,
      manifests: { ...envelope.manifests, inboxes },
    })

    expect(result.ok && result.data.manifests.inboxes).toEqual(inboxes)
  })

  test("a payload without an inboxes manifest parses with none", () => {
    const result = parseTemplateExport(buildEnvelope())

    expect(result.ok && result.data.manifests.inboxes).toEqual({})
  })

  test("a v1 payload still parses and has no permissions", () => {
    const result = parseTemplateExport(buildEnvelope())

    expect(result.ok && result.data.permissions).toBeUndefined()
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

// A draft is saved unvalidated: a flow never published (or with a step still
// being written) must travel in a template as stored; the install keeps it a
// draft.
describe("template flow nodes", () => {
  const flowEntry = (nodes: unknown[]) => ({
    sourceId: "f1",
    name: "Draft only",
    active: false,
    enableInInbox: true,
    startNodeId: "n1",
    published: false,
    nodes,
    edges: [],
  })
  const withFlow = (nodes: unknown[]) => {
    const envelope = buildEnvelope()
    return {
      ...envelope,
      resources: { ...envelope.resources, flows: [flowEntry(nodes)] },
    }
  }
  const incompleteNode = () => {
    const node = sendMessageNodeDefaultFn({ nodeProps: { id: "n1" } })
    return {
      ...node,
      data: {
        ...node.data,
        details: { ...node.data.details, steps: [whatsappFlowStepDefaultFn()] },
      },
    }
  }

  test("a draft node with an incomplete step is kept as stored", () => {
    const node = incompleteNode()
    expect(flowVersionSchema.safeParse(node).success).toBe(false)

    const result = parseTemplateExport(withFlow([node]))

    expect(result.ok).toBe(true)
    expect(result.ok && result.data.resources.flows[0]?.nodes[0]).toEqual(node)
  })

  test("a complete node is parsed exactly as the flow schema parses it", () => {
    const base = sendMessageNodeDefaultFn({ nodeProps: { id: "1" } })
    const node = {
      ...base,
      data: {
        ...base.data,
        details: {
          ...base.data.details,
          steps: [sendTextStepDefaultFn({ text: "Hello" })],
        },
      },
    }
    const expected = flowVersionSchema.parse(node)

    const result = parseTemplateExport(withFlow([node]))

    expect(result.ok && result.data.resources.flows[0]?.nodes[0]).toEqual(
      expected,
    )
  })

  test.each([
    ["no id", { type: "sendMessage", data: {} }],
    ["no type", { id: "n1", data: {} }],
    ["no data object", { id: "n1", type: "sendMessage", data: "x" }],
    ["not an object", "n1"],
  ])("a value that is not a node is refused (%s)", (_label, node) => {
    expect(parseTemplateExport(withFlow([node])).ok).toBe(false)
  })
})
