import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(),
  exportPage: vi.fn(),
  updateExportFile: vi.fn(),
}))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  leaderboardService: {
    exportPage: (...args: unknown[]) => mocks.exportPage(...args),
    updateExportFile: (...args: unknown[]) => mocks.updateExportFile(...args),
  },
}))

vi.mock("@chatbotx.io/filesystem/node-upload", () => ({
  createUpload: (...args: unknown[]) => mocks.createUpload(...args),
}))

const { exportLeaderboardParticipants } = await import(
  "../src/default/handlers/export-leaderboard-participants"
)

type ExportData = Parameters<typeof exportLeaderboardParticipants>[0]

const data = (overrides: Partial<ExportData> = {}): ExportData =>
  ({
    workspaceId: "ws-1",
    leaderboardId: "lb-1",
    fileId: "file-1",
    outputPath: "exports/leaderboard.csv",
    includeContactInfo: false,
    ...overrides,
  }) as ExportData

const participant = (overrides: Record<string, unknown> = {}) => ({
  contactId: "c-1",
  fullName: "Nguyễn Văn Bình",
  phoneNumber: "+84987654321",
  email: "binh@example.com",
  score: 10,
  isBanned: false,
  breakdown: { referral: 2, purchase: 0 },
  createdAt: "2026-01-01T00:00:00.000Z",
  lastActivityAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
})

/** Captures every byte the handler streams to the uploader. */
const captureUpload = () => {
  const chunks: Buffer[] = []
  const stream = new PassThrough()
  stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
  // Like a real upload, settles once the stream finishes or is destroyed.
  const done = new Promise<void>((resolve) => stream.on("close", resolve))
  mocks.createUpload.mockReturnValue({ stream, done })
  return () => Buffer.concat(chunks)
}

const lastValues = () =>
  mocks.updateExportFile.mock.calls.at(-1)?.[0].values as Record<
    string,
    unknown
  >

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateExportFile.mockResolvedValue(undefined)
})

describe("exportLeaderboardParticipants", () => {
  test("writes a BOM-prefixed CSV, ranks only unbanned rows, and reports the byte size", async () => {
    const bytes = captureUpload()
    mocks.exportPage.mockResolvedValueOnce([
      participant(),
      participant({ contactId: "c-2", fullName: "Banned", isBanned: true }),
      participant({ contactId: "c-3", fullName: "=evil()", score: 5 }),
    ])

    await exportLeaderboardParticipants(data())

    const file = bytes()
    expect([...file.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(file.subarray(3).toString("utf8").split("\n")).toEqual([
      '"Rank","Contact ID","Name","Score","Banned","Breakdown","Joined at","Last activity"',
      '"1","c-1","Nguyễn Văn Bình","10","no","referral: 2","2026-01-01T00:00:00.000Z","2026-01-02T00:00:00.000Z"',
      '"","c-2","Banned","10","yes","referral: 2","2026-01-01T00:00:00.000Z","2026-01-02T00:00:00.000Z"',
      `"2","c-3","'=evil()","5","no","referral: 2","2026-01-01T00:00:00.000Z","2026-01-02T00:00:00.000Z"`,
      "",
    ])
    expect(lastValues()).toMatchObject({
      status: "uploaded",
      fileSize: String(file.length),
      meta: { totalRecords: 3 },
    })
  })

  test("adds the phone and email columns only when contact info is included", async () => {
    const bytes = captureUpload()
    mocks.exportPage.mockResolvedValueOnce([participant()])

    await exportLeaderboardParticipants(data({ includeContactInfo: true }))

    const [header, row] = bytes().subarray(3).toString("utf8").split("\n")
    expect(header).toBe(
      '"Rank","Contact ID","Name","Phone","Email","Score","Banned","Breakdown","Joined at","Last activity"',
    )
    expect(row).toContain(
      `"Nguyễn Văn Bình","'+84987654321","binh@example.com"`,
    )
  })

  test("pages with offsets until a short page", async () => {
    captureUpload()
    const fullPage = Array.from({ length: 1000 }, (_, index) =>
      participant({ contactId: `c-${index}` }),
    )
    mocks.exportPage
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([participant()])

    await exportLeaderboardParticipants(data())

    expect(mocks.exportPage).toHaveBeenNthCalledWith(1, {
      leaderboardId: "lb-1",
      limit: 1000,
      offset: 0,
    })
    expect(mocks.exportPage).toHaveBeenNthCalledWith(2, {
      leaderboardId: "lb-1",
      limit: 1000,
      offset: 1000,
    })
    expect(lastValues()).toMatchObject({ meta: { totalRecords: 1001 } })
  })

  test("marks the file failed and rethrows when a page query fails", async () => {
    captureUpload()
    mocks.exportPage.mockRejectedValueOnce(new Error("db down"))

    await expect(exportLeaderboardParticipants(data())).rejects.toThrow(
      "db down",
    )
    expect(mocks.updateExportFile).toHaveBeenLastCalledWith({
      workspaceId: "ws-1",
      fileId: "file-1",
      values: { status: "failed", meta: { totalRecords: 0 } },
    })
  })

  test("fails instead of hanging when the upload dies while a write waits on backpressure", async () => {
    // Nothing drains the stream, as when every multipart part upload failed.
    const stream = new PassThrough({ highWaterMark: 1 })
    let failUpload: (error: Error) => void = () => undefined
    const done = new Promise<void>((_, reject) => {
      failUpload = reject
    })
    mocks.createUpload.mockReturnValue({ stream, done })
    mocks.exportPage.mockResolvedValueOnce([participant()])

    const exported = exportLeaderboardParticipants(data())
    await vi.waitFor(() => expect(stream.writableNeedDrain).toBe(true))
    failUpload(new Error("s3 part upload failed"))

    await expect(exported).rejects.toThrow("s3 part upload failed")
    expect(lastValues()).toMatchObject({ status: "failed" })
  })
})
