import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ImportRow } from "../src/default/handlers/imports/base-import"

const mocks = vi.hoisted(() => ({
  getObjectStream: vi.fn(),
  headObject: vi.fn(),
  importFlowExport: vi.fn(),
  invalidateCustomFields: vi.fn(),
  invalidateBotFields: vi.fn(),
  updateValues: [] as Record<string, unknown>[],
}))

vi.mock("@chatbotx.io/business", () => ({
  importService: {
    markProcessing: vi.fn(() => {
      mocks.updateValues.push({ status: "processing" })
      return Promise.resolve()
    }),
    fail: vi.fn((_importId: string, error: unknown) => {
      mocks.updateValues.push({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : error,
      })
      return Promise.resolve()
    }),
    complete: vi.fn(
      (input: {
        importId: string
        counters: { processed: number; success: number; failed: number }
        errorSample: Array<{ row: number; reason: string }>
        warningMessage?: string
      }) => {
        mocks.updateValues.push({
          status: "completed",
          ...input.counters,
          errorSample: input.errorSample,
          errorMessage: input.warningMessage ?? null,
        })
        return Promise.resolve()
      },
    ),
  },
  flowService: {
    importFlowExport: (...args: unknown[]) => mocks.importFlowExport(...args),
  },
  customFieldService: {
    invalidate: (...args: unknown[]) => mocks.invalidateCustomFields(...args),
  },
  botFieldService: {
    invalidate: (...args: unknown[]) => mocks.invalidateBotFields(...args),
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    headObject: (...args: unknown[]) => mocks.headObject(...args),
    getObjectStream: (...args: unknown[]) => mocks.getObjectStream(...args),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

const { runFlowImport } = await import(
  "../src/default/handlers/imports/flow-import"
)

const importRow = {
  id: "import-1",
  workspaceId: "workspace-1",
  format: "json",
  meta: {},
  file: {
    path: "imports/flows/flow.json",
  },
} as ImportRow

const buildExportJson = (overrides: Record<string, unknown> = {}) => ({
  formatVersion: 2,
  exportedAt: new Date().toISOString(),
  source: { workspaceId: "source-workspace", flowId: "source-flow" },
  flows: [
    {
      name: "Onboarding",
      active: true,
      enableInInbox: true,
      startNodeId: "1",
      nodes: [
        {
          id: "1",
          position: { x: 0, y: 0 },
          measured: { width: 288, height: 100 },
          type: "sendMessage",
          data: {
            name: "Send Message",
            isStartNode: true,
            details: {
              beforeStep: {
                id: "b1",
                stepType: "chooseChannel",
                channel: "omnichannel",
              },
              steps: [
                {
                  id: "s1",
                  stepType: "subscribeSequence",
                  sequenceId: "999",
                },
              ],
              quickReplies: [],
            },
          },
        },
      ],
      edges: [],
    },
  ],
  customFields: {},
  ...overrides,
})

describe("runFlowImport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateValues = []
    mocks.headObject.mockRejectedValue(new Error("head failed"))
    mocks.importFlowExport.mockImplementation(
      (input: { nodes: unknown[]; edges: unknown[] }) =>
        Promise.resolve({
          flowId: "new-flow-id",
          nodes: input.nodes,
          edges: input.edges,
          createdCustomFieldIds: [],
          createdBotFieldIds: [],
        }),
    )
  })

  const mockStream = (json: unknown) => {
    mocks.getObjectStream.mockResolvedValue({
      contentLength: undefined,
      stream: Readable.from([Buffer.from(JSON.stringify(json))]),
    })
  }

  test("inserts a new flow row and reports a warning for an unresolved sequenceId", async () => {
    mockStream(buildExportJson())

    await runFlowImport(importRow)

    expect(mocks.importFlowExport).toHaveBeenCalledTimes(1)
    expect(mocks.importFlowExport).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        name: "Onboarding",
        startNodeId: "1",
      }),
    )

    const finalUpdate = mocks.updateValues.at(-1)
    expect(finalUpdate).toMatchObject({
      status: "completed",
      success: 1,
      failed: 0,
    })
    expect(finalUpdate?.errorSample).toEqual([
      expect.objectContaining({
        row: 1,
        reason: expect.stringContaining("sequence"),
      }),
    ])
    // A dangling reference must not look like a clean import: the completed
    // row still carries a visible warning message even though failed: 0.
    expect(finalUpdate?.errorMessage).toEqual(
      expect.stringContaining("unresolved reference"),
    )
  })

  test("passes nodes byte for byte when the manifest is empty (no custom-field ids to remap)", async () => {
    const exportJson = buildExportJson()
    mockStream(exportJson)

    await runFlowImport(importRow)

    const passedNodes = mocks.importFlowExport.mock.calls[0]?.[0]?.nodes
    expect(passedNodes).toEqual(exportJson.flows[0].nodes)
  })

  test("fails the import without inserting a flow when formatVersion is unknown", async () => {
    mockStream(buildExportJson({ formatVersion: 999 }))

    await runFlowImport(importRow)

    expect(mocks.importFlowExport).not.toHaveBeenCalled()
    expect(mocks.updateValues.at(-1)).toMatchObject({ status: "failed" })
  })

  test("fails the import when the stream exceeds the byte limit", async () => {
    mocks.headObject.mockResolvedValue({ ContentLength: undefined })
    mocks.getObjectStream.mockResolvedValue({
      contentLength: undefined,
      stream: Readable.from([Buffer.alloc(6 * 1024 * 1024)]),
    })

    await runFlowImport(importRow)

    expect(mocks.importFlowExport).not.toHaveBeenCalled()
    expect(mocks.updateValues.at(-1)).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("File exceeds"),
    })
  })

  test("invalidates the custom-field cache only when new fields were created", async () => {
    mockStream(buildExportJson())

    await runFlowImport(importRow)

    expect(mocks.invalidateCustomFields).not.toHaveBeenCalled()

    mocks.importFlowExport.mockResolvedValueOnce({
      flowId: "new-flow-id",
      nodes: [],
      edges: [],
      createdCustomFieldIds: ["field-1"],
      createdBotFieldIds: [],
    })
    mockStream(buildExportJson())

    await runFlowImport(importRow)

    expect(mocks.invalidateCustomFields).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateCustomFields).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })

  test("invalidates the bot-field cache only when new fields were created", async () => {
    mockStream(buildExportJson())

    await runFlowImport(importRow)

    expect(mocks.invalidateBotFields).not.toHaveBeenCalled()

    mocks.importFlowExport.mockResolvedValueOnce({
      flowId: "new-flow-id",
      nodes: [],
      edges: [],
      createdCustomFieldIds: [],
      createdBotFieldIds: ["bot-field-1"],
    })
    mockStream(buildExportJson())

    await runFlowImport(importRow)

    expect(mocks.invalidateBotFields).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateBotFields).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })

  test("does not warn about a custom-field reference that was successfully remapped", async () => {
    const exportJson = buildExportJson({
      flows: [
        {
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          startNodeId: "1",
          nodes: [
            {
              id: "1",
              position: { x: 0, y: 0 },
              measured: { width: 288, height: 100 },
              type: "sendMessage",
              data: {
                name: "Send Message",
                isStartNode: true,
                details: {
                  beforeStep: {
                    id: "b1",
                    stepType: "chooseChannel",
                    channel: "omnichannel",
                  },
                  steps: [
                    {
                      id: "s1",
                      stepType: "setCustomField",
                      inputFieldId: "source-field-1",
                      operation: "O01",
                      value: "1990-01-01",
                    },
                  ],
                  quickReplies: [],
                },
              },
            },
          ],
          edges: [],
        },
      ],
      customFields: {
        "source-field-1": { name: "Birthday", type: "date" },
      },
    })
    mockStream(exportJson)

    mocks.importFlowExport.mockResolvedValueOnce({
      flowId: "new-flow-id",
      nodes: [
        {
          ...exportJson.flows[0].nodes[0],
          data: {
            ...exportJson.flows[0].nodes[0].data,
            details: {
              ...exportJson.flows[0].nodes[0].data.details,
              steps: [
                {
                  id: "s1",
                  stepType: "setCustomField",
                  inputFieldId: "target-field-1",
                  operation: "O01",
                  value: "1990-01-01",
                },
              ],
            },
          },
        },
      ],
      edges: [],
      createdCustomFieldIds: [],
      createdBotFieldIds: [],
    })

    await runFlowImport(importRow)

    const finalUpdate = mocks.updateValues.at(-1)
    expect(finalUpdate).toMatchObject({ status: "completed" })
    expect(finalUpdate?.errorMessage).toBeNull()
  })

  test("still warns about a customField reference absent from the manifest", async () => {
    const exportJson = buildExportJson({
      flows: [
        {
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          startNodeId: "1",
          nodes: [
            {
              id: "1",
              position: { x: 0, y: 0 },
              measured: { width: 288, height: 100 },
              type: "sendMessage",
              data: {
                name: "Send Message",
                isStartNode: true,
                details: {
                  beforeStep: {
                    id: "b1",
                    stepType: "chooseChannel",
                    channel: "omnichannel",
                  },
                  steps: [
                    {
                      id: "s1",
                      stepType: "setCustomField",
                      inputFieldId: "999",
                      operation: "O01",
                      value: "1990-01-01",
                    },
                  ],
                  quickReplies: [],
                },
              },
            },
          ],
          edges: [],
        },
      ],
      // No manifest entry for "999" — e.g. the field was already deleted in
      // the source workspace at export time.
      customFields: {},
    })
    mockStream(exportJson)

    await runFlowImport(importRow)

    const finalUpdate = mocks.updateValues.at(-1)
    expect(finalUpdate).toMatchObject({ status: "completed" })
    expect(finalUpdate?.errorSample).toEqual([
      expect.objectContaining({
        row: 1,
        reason: expect.stringContaining("customField"),
      }),
    ])
    expect(finalUpdate?.errorMessage).toEqual(
      expect.stringContaining("unresolved reference"),
    )
  })

  test("does not warn about a bot-field reference that was successfully remapped", async () => {
    const exportJson = buildExportJson({
      flows: [
        {
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          startNodeId: "1",
          nodes: [
            {
              id: "1",
              position: { x: 0, y: 0 },
              measured: { width: 288, height: 100 },
              type: "sendMessage",
              data: {
                name: "Send Message",
                isStartNode: true,
                details: {
                  beforeStep: {
                    id: "b1",
                    stepType: "chooseChannel",
                    channel: "omnichannel",
                  },
                  steps: [
                    {
                      id: "s1",
                      stepType: "setCustomField",
                      inputFieldId: "bot_field:7",
                      operation: "O01",
                      value: "42",
                    },
                  ],
                  quickReplies: [],
                },
              },
            },
          ],
          edges: [],
        },
      ],
      customFields: {},
      botFields: {
        "7": { name: "Loyalty Points", type: "number" },
      },
    })
    mockStream(exportJson)

    mocks.importFlowExport.mockResolvedValueOnce({
      flowId: "new-flow-id",
      nodes: [
        {
          ...exportJson.flows[0].nodes[0],
          data: {
            ...exportJson.flows[0].nodes[0].data,
            details: {
              ...exportJson.flows[0].nodes[0].data.details,
              steps: [
                {
                  id: "s1",
                  stepType: "setCustomField",
                  inputFieldId: "bot_field:77",
                  operation: "O01",
                  value: "42",
                },
              ],
            },
          },
        },
      ],
      edges: [],
      createdCustomFieldIds: [],
      createdBotFieldIds: ["77"],
    })

    await runFlowImport(importRow)

    const finalUpdate = mocks.updateValues.at(-1)
    expect(finalUpdate).toMatchObject({ status: "completed" })
    expect(finalUpdate?.errorMessage).toBeNull()
  })

  test("still warns about a bot-field reference absent from the manifest", async () => {
    const exportJson = buildExportJson({
      flows: [
        {
          name: "Onboarding",
          active: true,
          enableInInbox: true,
          startNodeId: "1",
          nodes: [
            {
              id: "1",
              position: { x: 0, y: 0 },
              measured: { width: 288, height: 100 },
              type: "sendMessage",
              data: {
                name: "Send Message",
                isStartNode: true,
                details: {
                  beforeStep: {
                    id: "b1",
                    stepType: "chooseChannel",
                    channel: "omnichannel",
                  },
                  steps: [
                    {
                      id: "s1",
                      stepType: "setCustomField",
                      inputFieldId: "bot_field:999",
                      operation: "O01",
                      value: "42",
                    },
                  ],
                  quickReplies: [],
                },
              },
            },
          ],
          edges: [],
        },
      ],
      customFields: {},
      // No manifest entry for bot_field:999 — e.g. the bot field was already
      // deleted in the source workspace at export time.
      botFields: {},
    })
    mockStream(exportJson)

    await runFlowImport(importRow)

    const finalUpdate = mocks.updateValues.at(-1)
    expect(finalUpdate).toMatchObject({ status: "completed" })
    expect(finalUpdate?.errorSample).toEqual([
      expect.objectContaining({
        row: 1,
        reason: expect.stringContaining("botField"),
      }),
    ])
    expect(finalUpdate?.errorMessage).toEqual(
      expect.stringContaining("unresolved reference"),
    )
  })

  test("an export with no botFields key (produced before the manifest existed) still imports cleanly", async () => {
    const exportJson = buildExportJson()
    // `buildExportJson`'s base shape has no `botFields` key at all —
    // `flowExportSchema`'s `.default({})` must fill it in during parsing.
    expect(exportJson).not.toHaveProperty("botFields")
    mockStream(exportJson)

    await runFlowImport(importRow)

    expect(mocks.importFlowExport).toHaveBeenCalledWith(
      expect.objectContaining({ botFields: {} }),
    )
    const finalUpdate = mocks.updateValues.at(-1)
    expect(finalUpdate).toMatchObject({ status: "completed" })
  })
})
