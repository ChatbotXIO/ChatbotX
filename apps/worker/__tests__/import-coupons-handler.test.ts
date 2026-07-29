import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type {
  ImportRow,
  ImportTypeHandler,
} from "../src/default/handlers/imports/base-import"
import { extractCouponRow } from "../src/default/handlers/imports/handler/coupons/extractor"

const mocks = vi.hoisted(() => ({
  createImportRowParser: vi.fn(),
  getObjectStream: vi.fn(),
  headObject: vi.fn(),
  processBatch: vi.fn(),
  updateValues: [] as Record<string, unknown>[],
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updateValues.push(values)
        return {
          where: vi.fn(async () => undefined),
        }
      },
    }),
  },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  importModel: {},
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    headObject: (...args: unknown[]) => mocks.headObject(...args),
    getObjectStream: (...args: unknown[]) => mocks.getObjectStream(...args),
  },
}))

vi.mock("@chatbotx.io/imports", () => ({
  getImportEntry: () => ({
    config: {
      maxFileSizeMB: 0.000_01,
      maxRows: 100,
    },
  }),
}))

vi.mock("@chatbotx.io/imports/parsers", () => ({
  cleanText: (value: unknown, maxLength: number) =>
    String(value ?? "")
      .trim()
      .slice(0, maxLength),
  createImportRowParser: (...args: unknown[]) =>
    mocks.createImportRowParser(...args),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

const { runImportPipeline } = await import(
  "../src/default/handlers/imports/base-import"
)

const importRow = {
  id: "import-1",
  workspaceId: "workspace-1",
  format: "csv",
  meta: {},
  file: {
    path: "imports/coupons.csv",
  },
} as ImportRow

const handler: ImportTypeHandler<
  Record<string, never>,
  Record<string, never>,
  { code: string }
> = {
  type: "coupons",
  parseMeta: () => ({}),
  prepare: async () => ({ ok: true, deps: {} }),
  processRow: () => ({ code: "CODE-1" }),
  processBatch: (...args) => mocks.processBatch(...args),
}

describe("coupon import extraction", () => {
  test.each([
    ["coupon", { coupon: " SAVE10 " }],
    ["code", { code: "SAVE10" }],
    ["Coupon Code", { "Coupon Code": "SAVE10" }],
  ])("accepts the %s header alias", (_label, rawRow) => {
    expect(extractCouponRow(rawRow)).toEqual({ code: "SAVE10" })
  })
})

describe("runImportPipeline coupon stream guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateValues = []
    mocks.processBatch.mockResolvedValue({ success: 1, failed: 0 })
    mocks.headObject.mockRejectedValue(new Error("head failed"))
    mocks.getObjectStream.mockResolvedValue({
      contentLength: undefined,
      stream: Readable.from([Buffer.alloc(20)]),
    })
    mocks.createImportRowParser.mockImplementation((_format, stream) =>
      (async function* () {
        for await (const _chunk of stream as AsyncIterable<unknown>) {
          // Consume the guarded stream so oversize errors surface here.
        }
        yield { coupon: "SAVE10" }
      })(),
    )
  })

  test("fails an unknown-length stream after it exceeds the byte limit", async () => {
    await runImportPipeline(importRow, handler)

    expect(mocks.processBatch).not.toHaveBeenCalled()
    expect(mocks.updateValues.at(-1)).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("File exceeds"),
      totalCount: 0,
      processedCount: 0,
    })
  })
})
