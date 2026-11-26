// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertInTx: vi.fn(),
  findMany: vi.fn(),
  removed: [] as string[],
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { inboundWebhookModel: { findMany: mocks.findMany } } },
}))
vi.mock("@chatbotx.io/database/schema", () => ({ inboundWebhookModel: {} }))
vi.mock("../src/template/reference-sanitizer", () => ({
  sanitizeEntryReferences: async (input: { value: unknown }) => ({
    value: input.value,
    removed: mocks.removed,
  }),
}))
vi.mock("../src/inbound-webhook/extract", () => ({
  // A custom field is anything that is not a system field.
  classifyMappedTarget: (target: string) =>
    ["gender", "name", "email"].includes(target) ? "richSystem" : "customField",
}))
vi.mock("../src/inbound-webhook/service", () => ({
  inboundWebhookService: {
    insertInTx: (...args: unknown[]) => mocks.insertInTx(...args),
  },
}))

const { INBOUND_WEBHOOK_COLUMNS, inboundWebhooksAdapter } = await import(
  "../src/template/adapters/inbound-webhooks"
)

const entry = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "src-hook",
  name: "Orders",
  identifiers: [{ kind: "phone", jsonPath: "$.phone" }],
  fieldMappings: [
    { jsonPath: "$.name", target: "name" },
    { jsonPath: "$.plan", target: "src-field" },
  ],
  actions: [{ type: "addTag", tagIds: ["src-tag"] }],
  inboxResolution: { mode: "inbox", inboxId: "src-inbox" },
  ...overrides,
})

const BOUND = {
  inbox: new Map([["src-inbox", "tgt-inbox"]]),
  customField: new Map([["src-field", "tgt-field"]]),
  tag: new Map([["src-tag", "tgt-tag"]]),
}

const install = async (
  entryOverrides: Record<string, unknown> = {},
  idMaps: Record<string, Map<string, string>> = BOUND,
) => {
  const warnings: { entityKind: string; path: string; value: string }[] = []
  const tracked: unknown[] = []
  await inboundWebhooksAdapter.insert(
    {
      tx: { tag: "tx" },
      workspaceId: "ws-1",
      installationId: "inst-1",
      idMaps,
      track: (row: unknown) => tracked.push(row),
      warn: (warning: { entityKind: string; path: string; value: string }) =>
        warnings.push(warning),
    } as never,
    [entry(entryOverrides)] as never,
  )
  const call = mocks.insertInTx.mock.calls[0]
  return {
    tx: call?.[0],
    input: call?.[1] as {
      workspaceId: string
      name: string
      config: Record<string, unknown>
    },
    warnings,
    tracked,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.removed = []
  mocks.insertInTx.mockResolvedValue({ id: "new-hook" })
})

describe("inbound webhooks adapter: collect", () => {
  test("ships the config and nothing that identifies or feeds the source", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Orders",
        identifiers: [],
        fieldMappings: [
          { jsonPath: "$.a", target: "name" },
          { jsonPath: "$.b", target: "77" },
        ],
        actions: [{ type: "startAnotherFlow", flowId: "9" }],
        inboxResolution: { mode: "inbox", inboxId: "5" },
      },
    ])

    const result = await inboundWebhooksAdapter.collector.collect("ws-1", ["1"])

    expect(Object.keys(result.entries[0] ?? {}).sort()).toEqual([
      "actions",
      "fieldMappings",
      "identifiers",
      "inboxResolution",
      "name",
      "sourceId",
    ])
    const columns = mocks.findMany.mock.calls[0]?.[0].columns
    expect(columns).not.toHaveProperty("token")
    expect(columns).not.toHaveProperty("sampleJson")
    expect(result.inboxIds).toEqual(["5"])
    expect(result.customFieldIds).toEqual(["77"])
    expect(result.hardDependencies).toEqual([
      { category: "flows", sourceId: "9" },
    ])
  })

  test("a payload-mode rule reports no inbox", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "1",
        name: "Orders",
        identifiers: [],
        fieldMappings: [],
        actions: [],
        inboxResolution: {
          mode: "payload",
          channel: "whatsapp",
          identifierKind: "phone",
          jsonPath: "$.to",
        },
      },
    ])

    const result = await inboundWebhooksAdapter.collector.collect("ws-1", ["1"])

    expect(result.inboxIds).toEqual([])
  })
})

describe("inbound webhooks adapter: insert", () => {
  test("goes through the service core on the install transaction and tracks the copy", async () => {
    const { tx, input, tracked } = await install()

    expect(tx).toEqual({ tag: "tx" })
    expect(input).toMatchObject({ workspaceId: "ws-1", name: "Orders" })
    expect(tracked).toEqual([
      expect.objectContaining({
        category: "inboundWebhooks",
        resourceKind: "inboundWebhook",
        resourceId: "new-hook",
        sourceResourceId: "src-hook",
      }),
    ])
  })

  test("ships no token, no switch and no counters: the service core mints them", async () => {
    const { input } = await install()

    expect(Object.keys(input.config).sort()).toEqual([
      "actions",
      "fieldMappings",
      "identifiers",
      "inboxResolution",
    ])
  })

  test("re-binds an inbox rule and remaps what the actions and mappings name", async () => {
    const { input, warnings } = await install()

    expect(input.config.inboxResolution).toEqual({
      mode: "inbox",
      inboxId: "tgt-inbox",
    })
    expect(input.config.fieldMappings).toEqual([
      { jsonPath: "$.name", target: "name" },
      { jsonPath: "$.plan", target: "tgt-field" },
    ])
    expect(input.config.actions).toEqual([
      { type: "addTag", tagIds: ["tgt-tag"] },
    ])
    expect(warnings).toEqual([])
  })

  test("an inbox that was not bound leaves the webhook without a rule, with a warning", async () => {
    const { input, warnings } = await install(
      {},
      { ...BOUND, inbox: new Map() },
    )

    expect(input.config.inboxResolution).toBeNull()
    expect(warnings).toEqual([
      {
        category: "inboundWebhooks",
        entityKind: "inboxBindingRequired",
        path: "inboundWebhooks.src-hook.inboxResolution",
        value: "src-inbox",
      },
    ])
  })

  test("a payload rule holds no ids and is copied as it is", async () => {
    const rule = {
      mode: "payload",
      channel: "whatsapp",
      identifierKind: "phone",
      jsonPath: "$.to",
    }
    const { input, warnings } = await install({ inboxResolution: rule })

    expect(input.config.inboxResolution).toEqual(rule)
    expect(warnings).toEqual([])
  })

  test("a webhook that was never configured stays unconfigured, quietly", async () => {
    const { input, warnings } = await install({ inboxResolution: null })

    expect(input.config.inboxResolution).toBeNull()
    expect(warnings).toEqual([])
  })

  test("a mapping to a custom field that did not come along is dropped, never kept with the source id", async () => {
    const { input, warnings } = await install(
      {},
      { ...BOUND, customField: new Map() },
    )

    expect(input.config.fieldMappings).toEqual([
      { jsonPath: "$.name", target: "name" },
    ])
    expect(warnings).toEqual([
      {
        category: "inboundWebhooks",
        entityKind: "customField",
        path: "inboundWebhooks.src-hook.fieldMappings.1.target",
        value: "src-field",
      },
    ])
  })

  test("a reference in the actions that was removed is reported once", async () => {
    mocks.removed = ["[0].tagIds[0]"]

    const { warnings } = await install()

    expect(warnings).toEqual([
      expect.objectContaining({
        entityKind: "referenceRemoved",
        path: "inboundWebhooks.src-hook.actions.[0].tagIds[0]",
      }),
    ])
  })

  test("a full workspace skips the webhook with a warning and tracks nothing", async () => {
    mocks.insertInTx.mockResolvedValue(null)

    const { warnings, tracked } = await install()

    expect(tracked).toEqual([])
    expect(warnings).toEqual([
      {
        category: "inboundWebhooks",
        entityKind: "inboundWebhookLimitReached",
        path: "inboundWebhooks.src-hook",
        value: "src-hook",
      },
    ])
  })
})

describe("inbound webhooks adapter: registration", () => {
  test("classifies every column of the table", () => {
    expect(INBOUND_WEBHOOK_COLUMNS.token).toBe("reset")
    expect(INBOUND_WEBHOOK_COLUMNS.sampleJson).toBe("drop")
    expect(INBOUND_WEBHOOK_COLUMNS.active).toBe("reset")
  })

  test("is v3, cannot be updated in place, and installs without folders", () => {
    expect(inboundWebhooksAdapter.minFormatVersion).toBe(3)
    expect(inboundWebhooksAdapter.sync.updatable).toBe(false)
    expect(inboundWebhooksAdapter.folderTypes).toEqual([])
  })
})
