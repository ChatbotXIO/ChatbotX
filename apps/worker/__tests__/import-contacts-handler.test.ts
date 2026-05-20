import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstInbox = vi.fn()
const findFirstTag = vi.fn()
const findFirstUsage = vi.fn()
const findManyCustomFields = vi.fn()
const findManyContactInbox = vi.fn()

const updateSet = vi.fn()
const updateWhere = vi.fn()
const insertValues = vi.fn()
const transactionFn = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      inboxModel: {
        findFirst: (...args: unknown[]) => findFirstInbox(...args),
      },
      tagModel: {
        findFirst: (...args: unknown[]) => findFirstTag(...args),
      },
      workspaceUsageModel: {
        findFirst: (...args: unknown[]) => findFirstUsage(...args),
      },
      customFieldModel: {
        findMany: (...args: unknown[]) => findManyCustomFields(...args),
      },
      contactInboxModel: {
        findMany: (...args: unknown[]) => findManyContactInbox(...args),
      },
    },
    update: () => ({
      set: (values: unknown) => {
        updateSet(values)
        return { where: (cond: unknown) => updateWhere(cond) }
      },
    }),
    transaction: (cb: (tx: unknown) => unknown) => {
      transactionFn()
      return cb({
        insert: () => ({
          values: (v: unknown) => {
            insertValues(v)
            return { onConflictDoNothing: () => undefined }
          },
        }),
        update: () => ({
          set: () => ({ where: () => undefined }),
        }),
      })
    },
  },
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  sql: (strings: TemplateStringsArray) => strings.join(""),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {},
  contactInboxModel: {},
  contactModel: {},
  contactsToTagsModel: {},
  conversationModel: {},
  importModel: { id: "Import.id" },
  workspaceUsageModel: { contactsCount: "wu.cc", workspaceId: "wu.wid" },
}))

const getObjectStream = vi.fn()
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    getObjectStream: (path: string) => getObjectStream(path),
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "generated-id",
  }
})

vi.mock("@chatbotx.io/database/partials", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/database/partials")
  >("@chatbotx.io/database/partials")
  return actual
})

vi.mock("../src/default/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const { runImportPipeline } = await import(
  "../src/default/handlers/imports/base-import"
)
const { contactsImportHandler } = await import(
  "../src/default/handlers/imports/handler/contacts/handler"
)

const baseMeta = {
  channel: "messenger",
  columnMap: {
    contactId: "external_id",
    phoneNumber: "phone",
    email: "email",
  },
}

const buildRow = (overrides: Record<string, unknown> = {}) => ({
  id: "imp-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  fileId: "file-1",
  type: "contacts",
  format: "csv",
  status: "pending",
  file: {
    id: "file-1",
    path: "imports/contacts/ws-1/test.csv",
    fileName: "test.csv",
    mimeType: "text/csv",
  },
  meta: baseMeta,
  ...overrides,
})

const streamOf = (lines: string[]) => ({
  stream: Readable.from(lines.join("\n")),
  contentLength: 4096,
})

const lastUpdate = () =>
  updateSet.mock.calls.at(-1)?.[0] as Record<string, unknown>

beforeEach(() => {
  findFirstInbox.mockReset()
  findFirstTag.mockReset()
  findFirstUsage.mockReset()
  findManyCustomFields.mockReset()
  findManyCustomFields.mockResolvedValue([])
  findManyContactInbox.mockReset()
  findManyContactInbox.mockResolvedValue([])
  updateSet.mockReset()
  updateWhere.mockReset()
  insertValues.mockReset()
  transactionFn.mockReset()
  getObjectStream.mockReset()
})

const runContactsImport = (row: unknown) =>
  runImportPipeline(row as never, contactsImportHandler)

describe("contacts import pipeline", () => {
  test("marks row failed when inbox missing", async () => {
    findFirstInbox.mockResolvedValue(undefined)

    await runContactsImport(buildRow())

    const statuses = updateSet.mock.calls.map((c) => c[0])
    expect(statuses[0]).toMatchObject({ status: "processing" })
    expect(statuses.at(-1)).toMatchObject({
      status: "failed",
      errorMessage: "Inbox not found",
    })
  })

  test("inserts a batch and marks completed with counts", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    getObjectStream.mockResolvedValue(
      streamOf([
        "external_id,phone,email",
        "ext-1,+15551234567,first@example.com",
        "ext-2,+15557654321,second@example.com",
      ]),
    )

    await runContactsImport(buildRow())

    expect(lastUpdate()).toMatchObject({
      status: "completed",
      totalCount: 2,
      processedCount: 2,
      successCount: 2,
      failedCount: 0,
    })
    // One bulk transaction for the whole chunk, not one per row.
    expect(transactionFn).toHaveBeenCalledTimes(1)
  })

  test("counts blank row as failed but continues", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    getObjectStream.mockResolvedValue(
      streamOf([
        "external_id,phone,email",
        ",,",
        "ext-1,+15551234567,ok@example.com",
      ]),
    )

    await runContactsImport(buildRow())

    expect(lastUpdate()).toMatchObject({
      status: "completed",
      successCount: 1,
      failedCount: 1,
    })
  })

  test("skips a row that already exists in the inbox", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    findManyContactInbox.mockResolvedValue([{ sourceId: "ext-1" }])
    getObjectStream.mockResolvedValue(
      streamOf([
        "external_id,phone,email",
        "ext-1,+15551234567,ok@example.com",
      ]),
    )

    await runContactsImport(buildRow())

    expect(lastUpdate()).toMatchObject({
      status: "completed",
      successCount: 0,
      failedCount: 1,
    })
    expect(transactionFn).not.toHaveBeenCalled()
  })

  test("rejects rows that exceed the contact quota", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    findFirstUsage.mockResolvedValue({ contactsCount: 100, maxContacts: 100 })
    getObjectStream.mockResolvedValue(
      streamOf([
        "external_id,phone,email",
        "ext-1,+15551234567,ok@example.com",
      ]),
    )

    await runContactsImport(buildRow())

    expect(lastUpdate()).toMatchObject({
      status: "completed",
      successCount: 0,
      failedCount: 1,
    })
    expect(transactionFn).not.toHaveBeenCalled()
  })

  test("marks row failed when CSV is malformed", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    getObjectStream.mockResolvedValue(
      streamOf(["external_id,phone", '"unterminated,quote']),
    )

    await runContactsImport(buildRow())

    expect(lastUpdate()).toMatchObject({ status: "failed" })
  })

  test("empty CSV finishes as completed with zero counts", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    getObjectStream.mockResolvedValue(streamOf(["external_id,phone,email"]))

    await runContactsImport(buildRow())

    expect(lastUpdate()).toMatchObject({
      status: "completed",
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
    })
  })

  test("drops invalid custom field value, keeps contact", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    findManyCustomFields.mockResolvedValue([{ id: "1", type: "number" }])
    getObjectStream.mockResolvedValue(
      streamOf(["external_id,phone,score", "ext-1,+15551234567,abc"]),
    )

    await runContactsImport(
      buildRow({
        meta: {
          ...baseMeta,
          columnMap: { contactId: "external_id", phoneNumber: "phone" },
          fieldMapping: [{ customFieldId: "1", column: "score" }],
        },
      }),
    )

    expect(lastUpdate()).toMatchObject({
      status: "completed",
      successCount: 1,
      failedCount: 0,
    })

    const insertedCustomField = insertValues.mock.calls.find(
      (call) =>
        Array.isArray(call[0]) &&
        call[0].some((v: Record<string, unknown>) => v.customFieldId === "1"),
    )
    expect(insertedCustomField).toBeUndefined()
  })

  test("keeps valid custom field value", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    findManyCustomFields.mockResolvedValue([{ id: "1", type: "number" }])
    getObjectStream.mockResolvedValue(
      streamOf(["external_id,phone,score", "ext-1,+15551234567,42"]),
    )

    await runContactsImport(
      buildRow({
        meta: {
          ...baseMeta,
          columnMap: { contactId: "external_id", phoneNumber: "phone" },
          fieldMapping: [{ customFieldId: "1", column: "score" }],
        },
      }),
    )

    const insertedCustomField = insertValues.mock.calls.find(
      (call) =>
        Array.isArray(call[0]) &&
        call[0].some((v: Record<string, unknown>) => v.customFieldId === "1"),
    )
    expect(insertedCustomField).toBeDefined()
    expect(insertedCustomField?.[0][0]).toMatchObject({
      customFieldId: "1",
      value: "42",
    })
  })

  test("fails when format is unsupported", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    getObjectStream.mockResolvedValue(streamOf(["external_id,phone"]))

    await runContactsImport(buildRow({ format: "xlsx" }))

    expect(lastUpdate()).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("xlsx"),
    })
  })
})
