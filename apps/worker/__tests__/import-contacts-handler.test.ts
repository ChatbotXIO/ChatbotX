import { Readable } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstInbox = vi.fn()
const findFirstTag = vi.fn()
const findManyCustomFields = vi.fn()
const findManyContactInbox = vi.fn()

const updateSet = vi.fn()
const updateWhere = vi.fn()
const insertValues = vi.fn()
const transactionFn = vi.fn()
const deleteWhere = vi.fn()
// `drop` = number of ContactInbox rows the simulated INSERT ... ON CONFLICT DO
// NOTHING skips (i.e. lost a race to a concurrent insert). Default 0 = no
// conflict. A mutable object so the hoisted mock factory closure observes
// per-test updates.
const conflict = { drop: 0 }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      inboxModel: {
        findFirst: (...args: unknown[]) => findFirstInbox(...args),
      },
      tagModel: {
        findFirst: (...args: unknown[]) => findFirstTag(...args),
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
            const rows = Array.isArray(v)
              ? (v as Array<{ contactId?: string; sourceId?: string }>)
              : [v as { contactId?: string; sourceId?: string }]
            return {
              onConflictDoNothing: () => ({
                // Echo back the contactId of each inserted row so the handler can
                // compute which contacts survived. ContactInbox rows carry a
                // `sourceId`; drop `inboxConflictDrop` of them to simulate a
                // concurrent-insert conflict.
                returning: () => {
                  const isContactInbox = rows.some(
                    (r) => r && typeof r === "object" && "sourceId" in r,
                  )
                  const surviving =
                    isContactInbox && conflict.drop > 0
                      ? rows.slice(0, Math.max(0, rows.length - conflict.drop))
                      : rows
                  return surviving.map((item) => ({
                    contactId: item.contactId,
                  }))
                },
              }),
            }
          },
        }),
        delete: () => ({
          where: (cond: unknown) => deleteWhere(cond),
        }),
      })
    },
  },
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {},
  contactInboxModel: {},
  contactModel: {},
  contactsToTagsModel: {},
  conversationModel: {},
  importModel: { id: "Import.id" },
}))

const workspaceFind = vi.fn()
const getDualRemainingSlots = vi.fn()
const resolveQuotaLockKey = vi.fn()
const incrementBy = vi.fn()
const getForUser = vi.fn()
// Returns the set of source ids already linked to the inbox. Per call so the
// processBatch pre-check and the locked re-check can return different sets.
const findExistingSourceIds = vi.fn(async () => new Set<string>())

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    find: (...args: unknown[]) => workspaceFind(...args),
  },
  userQuotaService: {
    getForUser: (...args: unknown[]) => getForUser(...args),
  },
  contactInboxService: {
    findExistingSourceIds: (...args: unknown[]) =>
      findExistingSourceIds(...args),
  },
  quotaEnforcementService: {
    resolveQuotaLockKey: (...args: unknown[]) => resolveQuotaLockKey(...args),
    getDualRemainingSlots: (...args: unknown[]) =>
      getDualRemainingSlots(...args),
    incrementBy: (...args: unknown[]) => incrementBy(...args),
  },
}))

const claimNewActiveContacts = vi.fn(async () => ({ counted: 0 }))
vi.mock("@chatbotx.io/analytics", () => ({
  macTrackingService: {
    claimNewActiveContacts: (...args: unknown[]) =>
      claimNewActiveContacts(...args),
  },
}))

// The contacts handler wraps quota reservation in distributedLock.runExclusive;
// without a mock it opens a real Redis connection (ECONNREFUSED). Run the body
// inline.
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: ({ fn }: { fn: () => Promise<unknown> }) => fn(),
  },
}))

const getObjectStream = vi.fn()
const headObject = vi.fn()
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    getObjectStream: (path: string) => getObjectStream(path),
    // M-4: size check reads HeadObject's ContentLength before streaming.
    headObject: (path: string) => headObject(path),
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  // Unique per call: each imported contact/inbox needs a distinct id so the
  // survivor filter can tell rows apart when a conflict drops one.
  let seq = 0
  return {
    ...actual,
    createId: () => `generated-id-${seq++}`,
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
  findManyCustomFields.mockReset()
  findManyCustomFields.mockResolvedValue([])
  findManyContactInbox.mockReset()
  findManyContactInbox.mockResolvedValue([])
  findExistingSourceIds.mockReset()
  findExistingSourceIds.mockResolvedValue(new Set<string>())
  updateSet.mockReset()
  updateWhere.mockReset()
  insertValues.mockReset()
  transactionFn.mockReset()
  deleteWhere.mockReset()
  conflict.drop = 0
  getObjectStream.mockReset()
  headObject.mockReset()
  // Default: small file, passes the size check.
  headObject.mockResolvedValue({ ContentLength: 1024 })
  workspaceFind.mockReset()
  workspaceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  getDualRemainingSlots.mockReset()
  getDualRemainingSlots.mockResolvedValue(100)
  resolveQuotaLockKey.mockReset()
  resolveQuotaLockKey.mockResolvedValue("quota:user:owner-1:mac")
  incrementBy.mockReset()
  incrementBy.mockResolvedValue(undefined)
  getForUser.mockReset()
  // Owner with a billing period → import writes MAC presence rows.
  getForUser.mockResolvedValue({
    periodStart: new Date("2026-06-01T00:00:00.000Z"),
  })
  claimNewActiveContacts.mockReset()
  claimNewActiveContacts.mockResolvedValue({ counted: 0 })
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
    expect(incrementBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "mac",
      count: 2,
    })
    // The bulk path also records the info-only `contacts` total (parity with the
    // single-contact chokepoint), so the displayed contacts count doesn't drift.
    expect(incrementBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "contacts",
      count: 2,
    })
    // (b) imported contacts are recorded in the MAC ledger so the reconcile
    // counts them and a later message dedups instead of double counting.
    expect(claimNewActiveContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        contacts: expect.arrayContaining([
          expect.objectContaining({
            contactId: expect.any(String),
            contactInboxId: expect.any(String),
          }),
        ]),
      }),
      expect.anything(),
    )
  })

  test("skips the MAC ledger write for a period-less owner but still consumes quota", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    getForUser.mockResolvedValue({ periodStart: null })
    getObjectStream.mockResolvedValue(
      streamOf([
        "external_id,phone,email",
        "ext-1,+15551234567,first@example.com",
      ]),
    )

    await runContactsImport(buildRow())

    expect(claimNewActiveContacts).not.toHaveBeenCalled()
    expect(incrementBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "mac",
      count: 1,
    })
  })

  test("counts blank row as failed but continues", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
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
    findExistingSourceIds.mockResolvedValue(new Set(["ext-1"]))
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

  test("rechecks duplicates inside the quota lock before reserving MAC", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    findExistingSourceIds
      .mockResolvedValueOnce(new Set<string>())
      .mockResolvedValueOnce(new Set(["ext-1"]))
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
    expect(incrementBy).not.toHaveBeenCalled()
  })

  test("rejects rows that exceed the contact quota", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    getDualRemainingSlots.mockResolvedValue(0)
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
    // Quota check runs before the transaction, so no transaction is opened.
    expect(transactionFn).not.toHaveBeenCalled()
    expect(incrementBy).not.toHaveBeenCalled()
  })

  test("inserts only up to the remaining quota and fails the overflow", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    // Room for one more contact only.
    getDualRemainingSlots.mockResolvedValue(1)
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
      successCount: 1,
      failedCount: 1,
    })
    expect(transactionFn).toHaveBeenCalledTimes(1)
    expect(incrementBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "mac",
      count: 1,
    })
  })

  test("a late ContactInbox conflict skips only the conflicting row, not the whole batch", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    // One of the two ContactInbox inserts loses a race to a concurrent insert.
    conflict.drop = 1
    getObjectStream.mockResolvedValue(
      streamOf([
        "external_id,phone,email",
        "ext-1,+15551234567,first@example.com",
        "ext-2,+15557654321,second@example.com",
      ]),
    )

    await runContactsImport(buildRow())

    // The batch completes (no abort): the surviving contact is counted, the
    // conflicting one is reported failed, and its orphan Contact row is pruned.
    expect(lastUpdate()).toMatchObject({
      status: "completed",
      totalCount: 2,
      successCount: 1,
      failedCount: 1,
    })
    expect(transactionFn).toHaveBeenCalledTimes(1)
    expect(deleteWhere).toHaveBeenCalledTimes(1)
    // MAC is consumed only for the contact that actually inserted.
    expect(incrementBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "mac",
      count: 1,
    })
    // The MAC ledger records only the survivor.
    expect(claimNewActiveContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: expect.arrayContaining([
          expect.objectContaining({ contactId: expect.any(String) }),
        ]),
      }),
      expect.anything(),
    )
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

  test("fails the row when the file exceeds the size limit", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    // Size check uses HeadObject's ContentLength (M-4): 21 MB > 20 MB cap.
    headObject.mockResolvedValue({ ContentLength: 21 * 1024 * 1024 })
    getObjectStream.mockResolvedValue({
      stream: Readable.from("external_id,phone\next-1,+15551234567"),
    })

    await runContactsImport(buildRow())

    expect(lastUpdate()).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("MB limit"),
    })
    // The size check rejects the file before any rows are parsed.
    expect(transactionFn).not.toHaveBeenCalled()
  })

  test("fails the row when meta is malformed", async () => {
    findFirstInbox.mockResolvedValue({ id: "inbox-1", channel: "messenger" })
    getObjectStream.mockResolvedValue(
      streamOf(["external_id,phone", "ext-1,+15551234567"]),
    )

    // columnMap is required; an empty meta object fails parseMeta.
    await runContactsImport(buildRow({ meta: {} }))

    expect(lastUpdate()).toMatchObject({ status: "failed" })
    // Bad meta is rejected before the object stream is ever fetched.
    expect(getObjectStream).not.toHaveBeenCalled()
  })
})
