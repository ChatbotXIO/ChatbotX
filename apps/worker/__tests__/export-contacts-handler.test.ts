import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const findManyContacts = vi.fn()
const listAdIdsByContacts = vi.fn()
const findManyTags = vi.fn()
const findManyCustomFields = vi.fn()
const findFirstWorkspace = vi.fn()
const updateSet = vi.fn()
const updateWhere = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactRepository: {
    listForExportPage: (...args: unknown[]) => findManyContacts(...args),
  },
  fileRepository: {
    updateForWorkspace: (input: { values: unknown }) => {
      updateSet(input.values)
      return updateWhere(input)
    },
  },
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => ({ __filter: criteria }),
  pruneEmailPhoneFilterConditions: (criteria: unknown) => criteria,
}))

vi.mock("@chatbotx.io/business", () => ({
  // The handler reads the workspace timezone to format date/datetime custom
  // fields for CSV export.
  workspaceService: {
    find: (...args: unknown[]) => findFirstWorkspace(...args),
  },
  contactReferralEventService: {
    listAdIdsByContacts: (...args: unknown[]) => listAdIdsByContacts(...args),
  },
  tagService: {
    findManyByIds: (...args: unknown[]) => findManyTags(...args),
  },
  customFieldService: {
    findManyByIds: (...args: unknown[]) => findManyCustomFields(...args),
  },
}))

const recordAuditLog = vi.fn()
vi.mock("@chatbotx.io/business/audit", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks")
  const storage = new AsyncLocalStorage<Record<string, unknown>>()
  return {
    SYSTEM_ACTOR: "system",
    withAuditContext: (actor: Record<string, unknown>, fn: () => unknown) =>
      storage.run(actor, fn),
    getAuditActor: () => storage.getStore(),
    auditService: { record: (...args: unknown[]) => recordAuditLog(...args) },
  }
})

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

const { loopableExportContacts, resolveExportRelations } = await import(
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
  listAdIdsByContacts.mockReset()
  findManyTags.mockReset()
  findManyTags.mockResolvedValue([])
  findManyCustomFields.mockReset()
  findManyCustomFields.mockResolvedValue([])
  findFirstWorkspace.mockReset()
  findFirstWorkspace.mockResolvedValue({ timezone: "UTC" })
  updateSet.mockReset()
  updateWhere.mockReset()
  createUpload.mockClear()
  recordAuditLog.mockReset()
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
    expect(recordAuditLog).toHaveBeenCalledWith({
      action: "export",
      detail: "exported contacts",
      userId: "user-1",
      workspaceId: "ws-1",
      source: "default:exportContacts",
    })
  })

  test("paginates with keyset and persists progress at most every 5 seconds", async () => {
    const csv = captureCsv()
    findManyContacts
      .mockResolvedValueOnce([contact({ id: "1" }), contact({ id: "2" })])
      .mockResolvedValueOnce([contact({ id: "3" }), contact({ id: "4" })])
      .mockResolvedValueOnce([contact({ id: "5" })])
    // Start, then page 1 within the interval, page 2 past it, page 3 within.
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(4999)
      .mockReturnValueOnce(5000)
      .mockReturnValue(5000)

    await loopableExportContacts(buildData())
    now.mockRestore()

    expect(findManyContacts).toHaveBeenCalledTimes(3)
    expect(csv.text().trim().split("\n")).toHaveLength(6) // header + 5 rows

    // Only page 2 saved progress mid-export; the final update has the total.
    const totals = updateSet.mock.calls.map(
      (c) => (c[0] as { meta?: { totalRecords?: number } }).meta?.totalRecords,
    )
    expect(totals).toEqual([4, 5])
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
    expect(recordAuditLog).not.toHaveBeenCalled()
  })

  test("marks the file failed and rethrows when the query errors", async () => {
    captureCsv()
    const boom = new Error("db down")
    findManyContacts.mockRejectedValueOnce(boom)

    await expect(loopableExportContacts(buildData())).rejects.toThrow("db down")

    expect(lastUpdate()).toMatchObject({ status: "failed" })
    expect(recordAuditLog).not.toHaveBeenCalled()
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

  test("asks each page only for the relations the selected columns render", async () => {
    captureCsv()
    findManyContacts.mockResolvedValueOnce([])

    await loopableExportContacts(
      buildData({ fields: ["sys:contactId", "cus:cf-1", "tag:t-1"] }),
    )

    expect(findManyContacts.mock.calls[0][0]).toMatchObject({
      relations: {
        customFieldIds: ["cf-1"],
        tagIds: ["t-1"],
        contactInboxes: "earliest",
      },
    })
  })

  test("does not stall on a write once the upload has failed", async () => {
    findManyContacts.mockResolvedValue([contact()])
    let failUpload: (error: Error) => void = () => undefined
    createUpload.mockImplementationOnce(() => {
      // Nothing reads the stream, as when every lib-storage part upload has
      // failed: a write would wait on backpressure forever.
      uploadStream = new PassThrough({ highWaterMark: 1 })
      const done = new Promise<void>((_, reject) => {
        failUpload = reject
      })
      return { stream: uploadStream, done }
    })

    const exported = loopableExportContacts(buildData())
    // The header write is now stuck on backpressure.
    await vi.waitFor(() => expect(uploadStream.writableNeedDrain).toBe(true))
    failUpload(new Error("s3 part upload failed"))

    await expect(exported).rejects.toThrow("s3 part upload failed")
    expect(lastUpdate()).toMatchObject({ status: "failed" })
  })

  test("loads the ad ids of a whole page in ONE query, only when the Ad IDs column is selected", async () => {
    const csv = captureCsv()
    findManyContacts
      .mockResolvedValueOnce([
        contact({ id: "1", firstName: "A" }),
        contact({ id: "2", firstName: "B" }),
      ])
      .mockResolvedValueOnce([contact({ id: "3", firstName: "C" })])
      .mockResolvedValueOnce([])
    listAdIdsByContacts
      .mockResolvedValueOnce(new Map([["1", ["1001", "1002"]]]))
      .mockResolvedValueOnce(new Map())

    await loopableExportContacts(
      buildData({ fields: ["sys:firstName", "sys:adIds"] }),
    )

    // Two pages with contacts => two batched lookups, never one per contact.
    expect(listAdIdsByContacts).toHaveBeenCalledTimes(2)
    expect(listAdIdsByContacts).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      contactIds: ["1", "2"],
    })
    expect(csv.text().trim().split("\n").slice(1)).toEqual([
      '"A","1001, 1002"',
      '"B",""',
      '"C",""',
    ])
  })

  test("marks the file failed and rethrows when the ad id lookup fails, instead of writing a partial column", async () => {
    const csv = captureCsv()
    findManyContacts.mockResolvedValueOnce([contact({ id: "1" })])
    listAdIdsByContacts.mockRejectedValueOnce(new Error("statement timeout"))

    await expect(
      loopableExportContacts(buildData({ fields: ["sys:adIds"] })),
    ).rejects.toThrow("statement timeout")

    expect(lastUpdate()).toMatchObject({ status: "failed" })
    // Only the header was written; no row was emitted without its ad ids.
    expect(csv.text().trim().split("\n")).toEqual(['"Ad IDs"'])
  })

  test("does not touch the ad log when the Ad IDs column is NOT selected (regression)", async () => {
    captureCsv()
    findManyContacts.mockResolvedValueOnce([contact({ id: "1" })])

    await loopableExportContacts(buildData())

    expect(listAdIdsByContacts).not.toHaveBeenCalled()
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

describe("resolveExportRelations", () => {
  const field = (type: "contact" | "custom" | "tag", value: string) => ({
    type,
    value,
    header: value,
  })

  test("needs no relation for plain contact columns", () => {
    expect(resolveExportRelations([field("contact", "fullName")])).toEqual({
      customFieldIds: [],
      tagIds: [],
      contactInboxes: "none",
    })
  })

  test("the Contact Id column needs only the earliest inbox row", () => {
    expect(
      resolveExportRelations([field("contact", "contactId")]).contactInboxes,
    ).toBe("earliest")
  })

  test("the WhatsApp User ID column needs every inbox row, even with Contact Id", () => {
    expect(
      resolveExportRelations([
        field("contact", "contactId"),
        field("contact", "sourceUserId"),
      ]).contactInboxes,
    ).toBe("all")
  })

  test("narrows custom fields and tags to the selected ones", () => {
    expect(
      resolveExportRelations([
        field("custom", "cf-1"),
        field("tag", "t-1"),
        field("tag", "t-2"),
      ]),
    ).toMatchObject({ customFieldIds: ["cf-1"], tagIds: ["t-1", "t-2"] })
  })
})
