import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const findManyContacts = vi.fn()
const findManyTags = vi.fn()
const findManyCustomFields = vi.fn()
const updateSet = vi.fn()
const updateWhere = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: {
        findMany: (...args: unknown[]) => findManyContacts(...args),
      },
      tagModel: {
        findMany: (...args: unknown[]) => findManyTags(...args),
      },
      customFieldModel: {
        findMany: (...args: unknown[]) => findManyCustomFields(...args),
      },
    },
    update: () => ({
      set: (values: unknown) => {
        updateSet(values)
        return { where: (cond: unknown) => updateWhere(cond) }
      },
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  isNull: (column: unknown) => ({ isNull: column }),
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => ({ __filter: criteria }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {},
  fileModel: { id: "File.id", workspaceId: "File.workspaceId" },
}))

// Small page size keeps multi-page pagination tests to a few rows.
vi.mock("@chatbotx.io/worker-config", () => ({
  loopableItemsCount: 2,
}))

// createUpload returns a real PassThrough so backpressure runs as in production.
let uploadStream: PassThrough
const createUpload = vi.fn(() => {
  uploadStream = new PassThrough()
  return { stream: uploadStream, done: Promise.resolve() }
})
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    createUpload: (path: string, options?: unknown) =>
      createUpload(path, options),
  },
}))

// The handler imports createUpload from the node-upload subpath, not the
// filesystem barrel — mock that exact specifier or it hits real S3.
vi.mock("@chatbotx.io/filesystem/node-upload", () => ({
  createUpload: (path: string, options?: unknown) =>
    createUpload(path, options),
}))

const { loopableExportContacts } = await import(
  "../src/default/handlers/export-contacts"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

type ExportData = Parameters<typeof loopableExportContacts>[0]

const buildData = (overrides: Partial<ExportData> = {}): ExportData =>
  ({
    requestedUserId: "user-1",
    workspaceId: "ws-1",
    fileId: "file-1",
    fields: ["sys:fullName", "sys:email"],
    canExportEmailAndPhone: true,
    outputPath: "exports/ws-1/contacts.csv",
    outputFormat: "csv",
    contactIds: ["1", "2"],
    ...overrides,
  }) as ExportData

// Captures everything the handler streams to the uploader.
const captureCsv = (): { text: () => string } => {
  const chunks: Buffer[] = []
  createUpload.mockImplementationOnce(() => {
    uploadStream = new PassThrough()
    uploadStream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)))
    return { stream: uploadStream, done: Promise.resolve() }
  })
  return { text: () => Buffer.concat(chunks).toString("utf8") }
}

const lastUpdate = () =>
  updateSet.mock.calls.at(-1)?.[0] as Record<string, unknown>

const contact = (overrides: Record<string, unknown> = {}) => ({
  id: "1",
  fullName: "Jane Doe",
  email: "jane@example.com",
  contactCustomFields: [],
  tags: [],
  ...overrides,
})

beforeEach(() => {
  findManyContacts.mockReset()
  findManyTags.mockReset()
  findManyTags.mockResolvedValue([])
  findManyCustomFields.mockReset()
  findManyCustomFields.mockResolvedValue([])
  updateSet.mockReset()
  updateWhere.mockReset()
  createUpload.mockClear()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("loopableExportContacts", () => {
  test("returns early without uploading for non-csv format", async () => {
    await loopableExportContacts(
      buildData({ outputFormat: "json" as unknown as "csv" }),
    )

    expect(createUpload).not.toHaveBeenCalled()
    expect(findManyContacts).not.toHaveBeenCalled()
  })

  test("writes an escaped header row", async () => {
    const csv = captureCsv()
    findManyContacts.mockResolvedValueOnce([])

    await loopableExportContacts(buildData())

    expect(csv.text().split("\n")[0]).toBe('"Full Name","Email"')
  })

  test("exports a single page and marks the file uploaded", async () => {
    const csv = captureCsv()
    findManyContacts.mockResolvedValueOnce([contact()])

    await loopableExportContacts(buildData())

    expect(csv.text()).toBe(
      '"Full Name","Email"\n"Jane Doe","jane@example.com"\n',
    )
    expect(lastUpdate()).toMatchObject({
      status: "uploaded",
      meta: { totalRecords: 1 },
    })
    expect(lastUpdate().fileSize).toBeDefined()
  })

  test("paginates with keyset and persists progress per chunk", async () => {
    const csv = captureCsv()
    findManyContacts
      .mockResolvedValueOnce([contact({ id: "1" }), contact({ id: "2" })])
      .mockResolvedValueOnce([contact({ id: "3" })])

    await loopableExportContacts(buildData())

    expect(findManyContacts).toHaveBeenCalledTimes(2)
    expect(csv.text().trim().split("\n")).toHaveLength(4) // header + 3 rows

    // First chunk persists 2, second persists 3, final update persists 3.
    const totals = updateSet.mock.calls.map(
      (c) => (c[0] as { meta?: { totalRecords?: number } }).meta?.totalRecords,
    )
    expect(totals).toEqual([2, 3, 3])
    expect(lastUpdate()).toMatchObject({ status: "uploaded" })
  })

  test("stops paging when a full page is followed by an empty page", async () => {
    captureCsv()
    findManyContacts
      .mockResolvedValueOnce([contact({ id: "1" }), contact({ id: "2" })])
      .mockResolvedValueOnce([])

    await loopableExportContacts(buildData())

    expect(findManyContacts).toHaveBeenCalledTimes(2)
    expect(lastUpdate()).toMatchObject({
      status: "uploaded",
      meta: { totalRecords: 2 },
    })
  })

  test("marks the file failed when no contact matches", async () => {
    captureCsv()
    findManyContacts.mockResolvedValueOnce([])

    await loopableExportContacts(buildData())

    expect(lastUpdate()).toMatchObject({
      status: "failed",
      meta: { totalRecords: 0 },
    })
  })

  test("marks the file failed and rethrows when the query errors", async () => {
    captureCsv()
    const boom = new Error("db down")
    findManyContacts.mockRejectedValueOnce(boom)

    await expect(loopableExportContacts(buildData())).rejects.toThrow("db down")

    expect(lastUpdate()).toMatchObject({ status: "failed" })
  })

  test("renders tag membership as Yes/No", async () => {
    const csv = captureCsv()
    findManyTags.mockResolvedValueOnce([{ id: "t1", name: "VIP" }])
    findManyContacts
      .mockResolvedValueOnce([
        contact({ id: "1", tags: [{ id: "t1" }] }),
        contact({ id: "2", tags: [] }),
      ])
      .mockResolvedValueOnce([])

    await loopableExportContacts(
      buildData({ fields: ["sys:fullName", "tag:t1"] }),
    )

    const rows = csv.text().trim().split("\n")
    expect(rows[0]).toBe('"Full Name","VIP"')
    expect(rows[1]).toBe('"Jane Doe","Yes"')
    expect(rows[2]).toBe('"Jane Doe","No"')
  })

  test("renders custom field values with an empty fallback", async () => {
    const csv = captureCsv()
    findManyCustomFields.mockResolvedValueOnce([{ id: "c1", name: "Plan" }])
    findManyContacts
      .mockResolvedValueOnce([
        contact({
          id: "1",
          contactCustomFields: [{ customFieldId: "c1", value: "Pro" }],
        }),
        contact({ id: "2", contactCustomFields: [] }),
      ])
      .mockResolvedValueOnce([])

    await loopableExportContacts(
      buildData({ fields: ["sys:fullName", "cus:c1"] }),
    )

    const rows = csv.text().trim().split("\n")
    expect(rows[0]).toBe('"Full Name","Plan"')
    expect(rows[1]).toBe('"Jane Doe","Pro"')
    expect(rows[2]).toBe('"Jane Doe",""')
  })

  test("serializes Date as ISO and null as an empty string", async () => {
    const csv = captureCsv()
    findManyContacts.mockResolvedValueOnce([
      contact({
        id: "1",
        blockedAt: new Date("2026-01-02T03:04:05.000Z"),
        email: null,
      }),
    ])

    await loopableExportContacts(
      buildData({ fields: ["sys:blockedAt", "sys:email"] }),
    )

    expect(csv.text().trim().split("\n")[1]).toBe(
      '"2026-01-02T03:04:05.000Z",""',
    )
  })

  test("filters by contactIds when no filter is supplied", async () => {
    captureCsv()
    findManyContacts.mockResolvedValueOnce([])

    await loopableExportContacts(
      buildData({ contactIds: ["7", "8"], filter: undefined }),
    )

    const where = findManyContacts.mock.calls[0][0] as { where: unknown }
    expect(where.where).toMatchObject({
      workspaceId: "ws-1",
      id: { in: ["7", "8"] },
    })
  })

  test("applies keyword and contactFilter when a filter is supplied", async () => {
    captureCsv()
    findManyContacts.mockResolvedValueOnce([])

    await loopableExportContacts(
      buildData({
        contactIds: undefined,
        filter: {
          keyword: "Acme",
          contactFilter: { operator: "and", conditions: [] },
        },
      }),
    )

    const where = findManyContacts.mock.calls[0][0] as {
      where: Record<string, unknown>
    }
    expect(where.where.workspaceId).toBe("ws-1")
    expect(where.where.OR).toBeDefined()
    expect(where.where.__filter).toEqual({
      operator: "and",
      conditions: [],
    })
  })

  test("marks the file failed and rethrows when the upload itself fails", async () => {
    findManyContacts.mockResolvedValueOnce([])
    createUpload.mockImplementationOnce(() => {
      uploadStream = new PassThrough()
      uploadStream.resume()
      const done = Promise.reject(new Error("s3 upload failed"))
      // Silence the unhandled-rejection tracker; the handler still awaits it.
      done.catch(() => undefined)
      return { stream: uploadStream, done }
    })

    await expect(loopableExportContacts(buildData())).rejects.toThrow(
      "s3 upload failed",
    )

    expect(lastUpdate()).toMatchObject({ status: "failed" })
  })

  test("escapes a formula-injection value in an exported contact field", async () => {
    const csv = captureCsv()
    findManyContacts.mockResolvedValueOnce([
      contact({ id: "1", fullName: "=cmd|' /C calc'!A1" }),
    ])

    await loopableExportContacts(buildData())

    expect(csv.text().trim().split("\n")[1]).toBe(
      `"'=cmd|' /C calc'!A1","jane@example.com"`,
    )
  })
})
