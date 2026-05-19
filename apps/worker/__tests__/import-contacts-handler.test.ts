import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstInbox = vi.fn()
const findFirstContact = vi.fn()
const findFirstUsage = vi.fn()
const findManyCustomFields = vi.fn()

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
      contactModel: {
        findFirst: (...args: unknown[]) => findFirstContact(...args),
      },
      workspaceUsageModel: {
        findFirst: (...args: unknown[]) => findFirstUsage(...args),
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
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v)
        return { onConflictDoNothing: () => undefined }
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
  importModel: { id: "Import.id", contactsCount: "wu.cc" },
  workspaceUsageModel: { contactsCount: "wu.cc", workspaceId: "wu.wid" },
}))

const getObjectStream = vi.fn()
const headObject = vi.fn(async () => ({ ContentLength: 1024 }))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    getObjectStream: (path: string) => getObjectStream(path),
    headObject: (path: string) => headObject(path),
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
  "../src/default/handlers/imports/contacts"
)

const baseMeta = {
  inboxId: "100",
  channel: "messenger",
  columnMap: { phoneNumber: "phone", email: "email" },
}

const buildRow = (overrides: Record<string, unknown> = {}) => ({
  id: "imp-1",
  workspaceId: "ws-1",
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

beforeEach(() => {
  findFirstInbox.mockReset()
  findFirstContact.mockReset()
  findFirstUsage.mockReset()
  findManyCustomFields.mockReset()
  findManyCustomFields.mockResolvedValue([])
  updateSet.mockReset()
  updateWhere.mockReset()
  insertValues.mockReset()
  transactionFn.mockReset()
  getObjectStream.mockReset()
  headObject.mockReset()
  headObject.mockResolvedValue({ ContentLength: 1024 })
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

  test("processes valid CSV and marks completed with counts", async () => {
    findFirstInbox.mockResolvedValue({ id: "100" })
    findFirstContact.mockResolvedValue(undefined)
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    getObjectStream.mockResolvedValue(
      Readable.from(
        ["phone,email", "+1,first@example.com", "+2,second@example.com"].join(
          "\n",
        ),
      ),
    )

    await runContactsImport(buildRow())

    const finalUpdate = updateSet.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >
    expect(finalUpdate).toMatchObject({
      status: "completed",
      totalCount: 2,
      processedCount: 2,
      successCount: 2,
      failedCount: 0,
    })
    expect(transactionFn).toHaveBeenCalledTimes(2)
  })

  test("counts blank row as failed but continues", async () => {
    findFirstInbox.mockResolvedValue({ id: "100" })
    findFirstContact.mockResolvedValue(undefined)
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    getObjectStream.mockResolvedValue(
      Readable.from(["phone,email", ",", "+1,ok@example.com"].join("\n")),
    )

    await runContactsImport(buildRow())

    const finalUpdate = updateSet.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >
    expect(finalUpdate).toMatchObject({
      status: "completed",
      successCount: 1,
      failedCount: 1,
    })
  })

  test("marks row failed when CSV is malformed", async () => {
    findFirstInbox.mockResolvedValue({ id: "100" })
    getObjectStream.mockResolvedValue(
      Readable.from(["phone,email", '"unterminated,quote'].join("\n")),
    )

    await runContactsImport(buildRow())

    const finalUpdate = updateSet.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >
    expect(finalUpdate).toMatchObject({ status: "failed" })
  })

  test("empty CSV finishes as completed with zero counts", async () => {
    findFirstInbox.mockResolvedValue({ id: "100" })
    getObjectStream.mockResolvedValue(Readable.from(["phone,email"].join("\n")))

    await runContactsImport(buildRow())

    const finalUpdate = updateSet.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >
    expect(finalUpdate).toMatchObject({
      status: "completed",
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
    })
  })

  test("drops invalid custom field value, keeps contact", async () => {
    findFirstInbox.mockResolvedValue({ id: "100" })
    findFirstContact.mockResolvedValue(undefined)
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    findManyCustomFields.mockResolvedValue([{ id: "1", type: "number" }])
    getObjectStream.mockResolvedValue(
      Readable.from(["phone,score", "+15551234567,abc"].join("\n")),
    )

    await runContactsImport(
      buildRow({
        meta: {
          ...baseMeta,
          columnMap: { phoneNumber: "phone" },
          fieldMapping: [{ customFieldId: "1", column: "score" }],
        },
      }),
    )

    const finalUpdate = updateSet.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >
    expect(finalUpdate).toMatchObject({
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
    findFirstInbox.mockResolvedValue({ id: "100" })
    findFirstContact.mockResolvedValue(undefined)
    findFirstUsage.mockResolvedValue({ contactsCount: 0, maxContacts: 100 })
    findManyCustomFields.mockResolvedValue([{ id: "1", type: "number" }])
    getObjectStream.mockResolvedValue(
      Readable.from(["phone,score", "+15551234567,42"].join("\n")),
    )

    await runContactsImport(
      buildRow({
        meta: {
          ...baseMeta,
          columnMap: { phoneNumber: "phone" },
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
    findFirstInbox.mockResolvedValue({ id: "100" })

    await runContactsImport(buildRow({ format: "xlsx" }))

    const finalUpdate = updateSet.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >
    expect(finalUpdate).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("xlsx"),
    })
  })
})
