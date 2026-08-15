import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ImportRow } from "../src/default/handlers/imports/base-import"

const mocks = vi.hoisted(() => ({
  getObjectStream: vi.fn(),
  headObject: vi.fn(),
  createFromImport: vi.fn(),
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
    createFromImport: (...args: unknown[]) => mocks.createFromImport(...args),
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
  formatVersion: 1,
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
  ...overrides,
})

describe("runFlowImport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateValues = []
    mocks.headObject.mockRejectedValue(new Error("head failed"))
    mocks.createFromImport.mockResolvedValue("new-flow-id")
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

    expect(mocks.createFromImport).toHaveBeenCalledTimes(1)
    expect(mocks.createFromImport).toHaveBeenCalledWith(
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

  test("persists nodes byte for byte (no id rewriting)", async () => {
    const exportJson = buildExportJson()
    mockStream(exportJson)

    await runFlowImport(importRow)

    const insertedNodes = mocks.createFromImport.mock.calls[0]?.[0]?.nodes
    expect(insertedNodes).toEqual(exportJson.flows[0].nodes)
  })

  test("fails the import without inserting a flow when formatVersion is unknown", async () => {
    mockStream(buildExportJson({ formatVersion: 999 }))

    await runFlowImport(importRow)

    expect(mocks.createFromImport).not.toHaveBeenCalled()
    expect(mocks.updateValues.at(-1)).toMatchObject({ status: "failed" })
  })

  test("fails the import when the stream exceeds the byte limit", async () => {
    mocks.headObject.mockResolvedValue({ ContentLength: undefined })
    mocks.getObjectStream.mockResolvedValue({
      contentLength: undefined,
      stream: Readable.from([Buffer.alloc(6 * 1024 * 1024)]),
    })

    await runFlowImport(importRow)

    expect(mocks.createFromImport).not.toHaveBeenCalled()
    expect(mocks.updateValues.at(-1)).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("File exceeds"),
    })
  })
})
