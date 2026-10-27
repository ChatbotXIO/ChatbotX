import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  AI_FILE_MAX_UPLOAD_BYTES: 100 * 1000 * 1000,
}))

const { listAIFilesResponse } = await import("@/features/ai-files/schema")
const { publicAIFileResource } = await import(
  "@/features/ai-files/schema/public"
)

const processingRun = {
  id: "run-1",
  status: "success",
  error: null,
  queuedAt: "2026-10-24T00:00:00.000Z",
  startedAt: "2026-10-24T00:00:01.000Z",
  heartbeatAt: "2026-10-24T00:00:02.000Z",
  finishedAt: "2026-10-24T00:00:03.000Z",
  stale: false,
}

// What aiFileService.enrichFile returns: the stored row plus the derived
// processing fields. oRPC parses every response through these schemas.
const serviceRow = {
  id: "1",
  name: "prices.csv",
  path: "workspace/1/prices.csv",
  size: 128,
  mimeType: "text/csv",
  chunking: {
    strategy: "tabular",
    chunkerVersion: 1,
    chunkSize: 1000,
    overlapSize: 0,
    chunkCount: 2,
    processedAt: "2026-10-24T00:00:00.000Z",
  },
  chunkingConfig: {
    strategy: "auto",
    chunkSize: 1000,
    overlapSize: 200,
    tabularHeaderRow: 1,
    isDefault: true,
  },
  chunkingOutdated: false,
  indexOutdated: false,
  processingRun,
  workspaceId: "1",
  createdAt: new Date("2026-10-24T00:00:00.000Z"),
  updatedAt: new Date("2026-10-24T00:00:00.000Z"),
  url: "https://files.example.com/prices.csv",
  chunksCount: 2,
  processingStatus: "success",
}

describe("AI file response schemas", () => {
  test("expose chunking, chunkingOutdated and the processing run on get/create", () => {
    const parsed = publicAIFileResource.parse(serviceRow)

    expect(parsed).toMatchObject({
      id: "1",
      workspaceId: "1",
      chunking: serviceRow.chunking,
      chunkingOutdated: false,
      processingRun,
    })
  })

  test("expose the effective chunking parameters and the position flag", () => {
    const parsed = publicAIFileResource.parse({
      ...serviceRow,
      chunkingConfig: {
        ...serviceRow.chunkingConfig,
        chunkSize: 500,
        isDefault: false,
      },
      indexOutdated: true,
    })

    expect(parsed).toMatchObject({
      chunkingConfig: { chunkSize: 500, isDefault: false },
      indexOutdated: true,
    })
  })

  test("accept an extractedChars count inside chunking", () => {
    const parsed = publicAIFileResource.parse({
      ...serviceRow,
      chunking: { ...serviceRow.chunking, extractedChars: 2600 },
    })

    expect(parsed.chunking?.extractedChars).toBe(2600)
  })

  test("expose the same fields on every row of the list response", () => {
    const parsed = listAIFilesResponse.parse({ data: [serviceRow] })

    expect(parsed.data[0]).toMatchObject({
      chunking: serviceRow.chunking,
      chunkingOutdated: false,
      processingRun: { status: "success", stale: false },
    })
  })

  test("accept a file processed before chunking or run tracking existed", () => {
    const parsed = publicAIFileResource.parse({
      ...serviceRow,
      chunking: null,
      chunkingOutdated: true,
      processingRun: null,
    })

    expect(parsed).toMatchObject({ chunking: null, processingRun: null })
  })

  test("reject a run with an unknown error code or a non-UTC timestamp", () => {
    expect(() =>
      publicAIFileResource.parse({
        ...serviceRow,
        processingRun: { ...processingRun, error: "boom" },
      }),
    ).toThrow()
    expect(() =>
      publicAIFileResource.parse({
        ...serviceRow,
        processingRun: {
          ...processingRun,
          queuedAt: "2026-10-24T07:00:00.000+07:00",
        },
      }),
    ).toThrow()
  })
})
