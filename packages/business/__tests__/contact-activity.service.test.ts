import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dbTransaction: vi.fn(),
  deleteByContactIds: vi.fn(),
  deleteWorkspaceBatch: vi.fn(),
  hasWorkspaceRows: vi.fn(),
  insertKeywordMessage: vi.fn(),
  lockWorkspaceForChildWrite: vi.fn(),
  upsertActivities: vi.fn(),
  upsertLastDelivered: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.dbTransaction },
}))

vi.mock("@chatbotx.io/database/repositories/workspace", () => ({
  workspaceRepository: {
    lockWorkspaceForChildWrite: mocks.lockWorkspaceForChildWrite,
  },
}))

vi.mock("@chatbotx.io/database/repositories/contact-activity", () => ({
  CONTACT_ACTIVITY_TABLES: [
    "ContactActivity",
    "ContactKeywordMessage",
    "ContactState",
  ],
  contactActivityRepository: {
    deleteByContactIds: mocks.deleteByContactIds,
    deleteWorkspaceBatch: mocks.deleteWorkspaceBatch,
    hasWorkspaceRows: mocks.hasWorkspaceRows,
    insertKeywordMessage: mocks.insertKeywordMessage,
    upsertActivities: mocks.upsertActivities,
    upsertLastDelivered: mocks.upsertLastDelivered,
  },
}))

const {
  contactActivityService,
  CONTACT_ACTIVITY_WRITE_CHUNK_SIZE,
  KEYWORD_MESSAGE_MATCH_MAX_CHARS,
} = await import("../src/contact-activity/service")

const T0 = new Date("2026-01-01T00:00:00Z")
const T1 = new Date("2026-01-02T00:00:00Z")
const tx = { tag: "tx" }

describe("contactActivityService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CONTACT_ACTIVITY_WRITES_ENABLED
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx))
    mocks.lockWorkspaceForChildWrite.mockResolvedValue(true)
    mocks.upsertActivities.mockResolvedValue(1)
    mocks.upsertLastDelivered.mockResolvedValue(1)
    mocks.insertKeywordMessage.mockResolvedValue(true)
  })

  afterEach(() => {
    delete process.env.CONTACT_ACTIVITY_WRITES_ENABLED
  })

  describe("record", () => {
    test("maps omitted references to the sentinels", async () => {
      await contactActivityService.record({
        entries: [
          {
            activityType: "messageOpened",
            contactId: "1",
            occurredAt: T0,
            referenceType: "emailTopic",
          },
        ],
        workspaceId: "9",
      })

      expect(mocks.upsertActivities).toHaveBeenCalledWith(
        {
          records: [
            {
              activityType: "messageOpened",
              contactId: "1",
              occurredAt: T0,
              parentReferenceId: "0",
              referenceId: "-1",
              referenceType: "emailTopic",
            },
          ],
          workspaceId: "9",
        },
        tx,
      )
    })

    test("keeps only the earliest event for a duplicated key", async () => {
      const entry = {
        activityType: "flowExecuted" as const,
        contactId: "1",
        referenceId: "5",
        referenceType: "flow" as const,
      }

      await contactActivityService.record({
        entries: [
          { ...entry, occurredAt: T1 },
          { ...entry, occurredAt: T0 },
        ],
        workspaceId: "9",
      })

      const [{ records }] = mocks.upsertActivities.mock.calls[0] ?? []
      expect(records).toHaveLength(1)
      expect(records[0].occurredAt).toBe(T0)
    })

    test("splits large batches into bounded chunks", async () => {
      const entries = Array.from(
        { length: CONTACT_ACTIVITY_WRITE_CHUNK_SIZE + 1 },
        (_, index) => ({
          activityType: "flowExecuted" as const,
          contactId: String(index + 1),
          occurredAt: T0,
          referenceId: "5",
          referenceType: "flow" as const,
        }),
      )

      await contactActivityService.record({ entries, workspaceId: "9" })

      expect(mocks.upsertActivities).toHaveBeenCalledTimes(2)
      expect(mocks.dbTransaction).toHaveBeenCalledTimes(1)
    })

    test("writes chunks in ascending contact order so locks match the delete path", async () => {
      const entries = Array.from(
        { length: CONTACT_ACTIVITY_WRITE_CHUNK_SIZE + 2 },
        (_, index) => ({
          activityType: "flowExecuted" as const,
          // Producer order is descending; ids cross the 2^31 and digit-count boundaries.
          contactId: String(1_000_000_000_000 - index * 3000),
          occurredAt: T0,
          referenceId: "5",
          referenceType: "flow" as const,
        }),
      )

      await contactActivityService.record({ entries, workspaceId: "9" })

      const ids = mocks.upsertActivities.mock.calls.flatMap(([arg]) =>
        arg.records.map((record: { contactId: string }) =>
          BigInt(record.contactId),
        ),
      )
      expect(ids).toEqual([...ids].sort((a, b) => Number(a - b)))
      expect(mocks.upsertActivities).toHaveBeenCalledTimes(2)
    })

    test("rejects an unregistered type/reference/parent combination", async () => {
      await expect(
        contactActivityService.record({
          entries: [
            {
              activityType: "flowNodeExecuted",
              contactId: "1",
              occurredAt: T0,
              referenceId: "5",
              referenceType: "flowNode",
            },
          ],
          workspaceId: "9",
        }),
      ).rejects.toThrow("not registered")
      expect(mocks.upsertActivities).not.toHaveBeenCalled()
    })

    test("skips an activity whose id is not a bigint instead of failing the caller", async () => {
      const recorded = await contactActivityService.record({
        entries: [
          {
            activityType: "flowNodeExecuted",
            contactId: "1",
            occurredAt: T0,
            parentReferenceId: "7",
            referenceId: "start-node",
            referenceType: "flowNode",
          },
          {
            activityType: "flowExecuted",
            contactId: "1",
            occurredAt: T0,
            referenceId: "99999999999999999999",
            referenceType: "flow",
          },
        ],
        workspaceId: "9",
      })

      expect(recorded).toBe(false)
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    })

    test("still writes the valid entries of a mixed batch", async () => {
      await contactActivityService.record({
        entries: [
          {
            activityType: "flowNodeExecuted",
            contactId: "1",
            occurredAt: T0,
            parentReferenceId: "7",
            referenceId: "start-node",
            referenceType: "flowNode",
          },
          {
            activityType: "flowExecuted",
            contactId: "1",
            occurredAt: T0,
            referenceId: "7",
            referenceType: "flow",
          },
        ],
        workspaceId: "9",
      })

      expect(mocks.upsertActivities.mock.calls[0]?.[0].records).toHaveLength(1)
    })

    test("joins the caller's transaction instead of opening one", async () => {
      const callerTx = { tag: "caller" }

      await contactActivityService.record({
        entries: [
          {
            activityType: "formCompleted",
            contactId: "1",
            occurredAt: T0,
            referenceId: "5",
            referenceType: "whatsappFlow",
          },
        ],
        tx: callerTx as never,
        workspaceId: "9",
      })

      expect(mocks.dbTransaction).not.toHaveBeenCalled()
      expect(mocks.lockWorkspaceForChildWrite).toHaveBeenCalledWith(
        { workspaceId: "9" },
        callerTx,
      )
    })

    test("writes nothing once the workspace purge fence is set", async () => {
      mocks.lockWorkspaceForChildWrite.mockResolvedValue(false)

      const recorded = await contactActivityService.record({
        entries: [
          {
            activityType: "flowExecuted",
            contactId: "1",
            occurredAt: T0,
            referenceId: "5",
            referenceType: "flow",
          },
        ],
        workspaceId: "9",
      })

      expect(recorded).toBe(false)
      expect(mocks.upsertActivities).not.toHaveBeenCalled()
    })

    test("is a no-op when the writes kill switch is off", async () => {
      process.env.CONTACT_ACTIVITY_WRITES_ENABLED = "false"

      const recorded = await contactActivityService.record({
        entries: [
          {
            activityType: "flowExecuted",
            contactId: "1",
            occurredAt: T0,
            referenceId: "5",
            referenceType: "flow",
          },
        ],
        workspaceId: "9",
      })

      expect(recorded).toBe(false)
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    })

    test("ignores an empty batch without opening a transaction", async () => {
      expect(
        await contactActivityService.record({ entries: [], workspaceId: "9" }),
      ).toBe(false)
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    })
  })

  describe("recordKeywordMatch", () => {
    const input = {
      automatedResponseId: "7",
      contactId: "1",
      messageId: "100",
      occurredAt: T0,
      text: "  Xin Chào Đẹp ",
      workspaceId: "9",
    }

    test("stores the activity and the normalized message in one transaction", async () => {
      await contactActivityService.recordKeywordMatch(input)

      expect(mocks.dbTransaction).toHaveBeenCalledTimes(1)
      expect(
        mocks.upsertActivities.mock.calls[0]?.[0].records[0],
      ).toMatchObject({
        activityType: "automatedResponseMatched",
        referenceId: "7",
        referenceType: "automatedResponse",
      })
      expect(mocks.insertKeywordMessage).toHaveBeenCalledWith(
        {
          record: {
            automatedResponseId: "7",
            contactId: "1",
            messageId: "100",
            normalizedText: "xin chao dep",
            occurredAt: T0,
            text: "  Xin Chào Đẹp ",
          },
          workspaceId: "9",
        },
        tx,
      )
    })

    test("bounds the matching text of a very long message, keeping the original whole", async () => {
      const long = "x".repeat(8000)

      await contactActivityService.recordKeywordMatch({ ...input, text: long })

      const { record } = mocks.insertKeywordMessage.mock.calls[0]?.[0] as {
        record: { normalizedText: string; text: string }
      }
      expect(record.normalizedText).toHaveLength(
        KEYWORD_MESSAGE_MATCH_MAX_CHARS,
      )
      expect(record.text).toHaveLength(8000)
    })

    test("never splits a surrogate pair when truncating", async () => {
      const emoji = "😀".repeat(KEYWORD_MESSAGE_MATCH_MAX_CHARS + 10)

      await contactActivityService.recordKeywordMatch({ ...input, text: emoji })

      const { record } = mocks.insertKeywordMessage.mock.calls[0]?.[0] as {
        record: { normalizedText: string }
      }
      expect(Array.from(record.normalizedText)).toHaveLength(
        KEYWORD_MESSAGE_MATCH_MAX_CHARS,
      )
      expect(record.normalizedText.isWellFormed()).toBe(true)
    })

    test("keeps no message text when the activity was not written", async () => {
      mocks.lockWorkspaceForChildWrite.mockResolvedValue(false)

      expect(await contactActivityService.recordKeywordMatch(input)).toBe(false)
      expect(mocks.insertKeywordMessage).not.toHaveBeenCalled()
    })

    test("is a no-op when the writes kill switch is off", async () => {
      process.env.CONTACT_ACTIVITY_WRITES_ENABLED = "false"

      expect(await contactActivityService.recordKeywordMatch(input)).toBe(false)
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    })
  })

  describe("recordDelivered", () => {
    test("collapses a batch to the latest delivery per contact", async () => {
      await contactActivityService.recordDelivered({
        records: [
          { contactId: "1", deliveredAt: T0 },
          { contactId: "1", deliveredAt: T1 },
          { contactId: "2", deliveredAt: T0 },
        ],
        workspaceId: "9",
      })

      expect(mocks.upsertLastDelivered).toHaveBeenCalledTimes(1)
      expect(mocks.upsertLastDelivered.mock.calls[0]?.[0].records).toEqual([
        { contactId: "1", deliveredAt: T1 },
        { contactId: "2", deliveredAt: T0 },
      ])
    })

    test("writes delivered contacts in ascending id order", async () => {
      await contactActivityService.recordDelivered({
        records: [
          { contactId: "900", deliveredAt: T0 },
          { contactId: "5", deliveredAt: T0 },
        ],
        workspaceId: "9",
      })

      expect(
        mocks.upsertLastDelivered.mock.calls[0]?.[0].records.map(
          (record: { contactId: string }) => record.contactId,
        ),
      ).toEqual(["5", "900"])
    })

    test("writes nothing once the workspace purge fence is set", async () => {
      mocks.lockWorkspaceForChildWrite.mockResolvedValue(false)

      expect(
        await contactActivityService.recordDelivered({
          records: [{ contactId: "1", deliveredAt: T0 }],
          workspaceId: "9",
        }),
      ).toBe(false)
      expect(mocks.upsertLastDelivered).not.toHaveBeenCalled()
    })

    test("is a no-op when the writes kill switch is off", async () => {
      process.env.CONTACT_ACTIVITY_WRITES_ENABLED = "false"

      expect(
        await contactActivityService.recordDelivered({
          records: [{ contactId: "1", deliveredAt: T0 }],
          workspaceId: "9",
        }),
      ).toBe(false)
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    })
  })

  describe("deleteForContacts", () => {
    test("deletes inside the caller's transaction", async () => {
      mocks.deleteByContactIds.mockResolvedValue(4)

      const deleted = await contactActivityService.deleteForContacts({
        contactIds: ["1", "2"],
        tx: tx as never,
        workspaceId: "9",
      })

      expect(deleted).toBe(4)
      expect(mocks.deleteByContactIds).toHaveBeenCalledWith(
        { contactIds: ["1", "2"], workspaceId: "9" },
        tx,
      )
    })

    test("refuses to delete once the workspace purge has started", async () => {
      mocks.lockWorkspaceForChildWrite.mockResolvedValue(false)

      await expect(
        contactActivityService.deleteForContacts({
          contactIds: ["1"],
          tx: tx as never,
          workspaceId: "9",
        }),
      ).rejects.toThrow()
      expect(mocks.deleteByContactIds).not.toHaveBeenCalled()
    })

    test("still deletes when the writes kill switch is off", async () => {
      process.env.CONTACT_ACTIVITY_WRITES_ENABLED = "false"
      mocks.deleteByContactIds.mockResolvedValue(1)

      await contactActivityService.deleteForContacts({
        contactIds: ["1"],
        tx: tx as never,
        workspaceId: "9",
      })

      expect(mocks.deleteByContactIds).toHaveBeenCalled()
    })
  })

  describe("purgeWorkspace", () => {
    test("drains every table and reports completion", async () => {
      mocks.deleteWorkspaceBatch.mockResolvedValue(2)
      mocks.hasWorkspaceRows.mockResolvedValue(false)

      const result = await contactActivityService.purgeWorkspace({
        batchSize: 10,
        workspaceId: "9",
      })

      expect(result).toEqual({ complete: true, deleted: 6 })
      expect(
        mocks.deleteWorkspaceBatch.mock.calls.map(([arg]) => arg.table),
      ).toEqual(["ContactActivity", "ContactKeywordMessage", "ContactState"])
    })

    test("keeps draining full batches until a short one", async () => {
      mocks.deleteWorkspaceBatch
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3)
        .mockResolvedValue(0)
      mocks.hasWorkspaceRows.mockResolvedValue(false)

      const result = await contactActivityService.purgeWorkspace({
        batchSize: 10,
        workspaceId: "9",
      })

      expect(result.deleted).toBe(13)
      expect(result.complete).toBe(true)
    })

    test("reports the table that still has rows after its batch budget", async () => {
      mocks.deleteWorkspaceBatch.mockResolvedValue(10)
      mocks.hasWorkspaceRows.mockResolvedValue(true)

      const result = await contactActivityService.purgeWorkspace({
        batchSize: 10,
        maxBatches: 2,
        workspaceId: "9",
      })

      expect(result).toEqual({
        complete: false,
        deleted: 20,
        table: "ContactActivity",
      })
      expect(mocks.deleteWorkspaceBatch).toHaveBeenCalledTimes(2)
    })

    test("purges even when the writes kill switch is off", async () => {
      process.env.CONTACT_ACTIVITY_WRITES_ENABLED = "false"
      mocks.deleteWorkspaceBatch.mockResolvedValue(0)
      mocks.hasWorkspaceRows.mockResolvedValue(false)

      expect(
        (await contactActivityService.purgeWorkspace({ workspaceId: "9" }))
          .complete,
      ).toBe(true)
    })
  })
})
