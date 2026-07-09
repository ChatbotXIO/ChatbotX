import { beforeEach, describe, expect, test, vi } from "vitest"

// --- top-level spies (captured by vi.mock factory closures) ---
const findFirstMock = vi.fn()
const insertMock = vi.fn()
const valuesMock = vi.fn()
const returningMock = vi.fn()
const bulkReturningMock = vi.fn()
const addToScheduleMock = vi.fn()
const transactionMock = vi.fn()
const order: string[] = []

// --- module mocks (hoisted) ---
vi.mock("../src/contacts-on-sequences", () => ({
  getContactInboxes: vi.fn(),
}))

vi.mock("../src/dispatch-manager", () => ({
  createDispatch: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactsOnSequenceModel: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
    },
    insert: (table: unknown) => {
      insertMock(table)
      return {
        values: (vals: unknown) => {
          valuesMock(vals)
          return {
            returning: (...args: unknown[]) => returningMock(...args),
            onConflictDoNothing: () => ({
              returning: (...args: unknown[]) => bulkReturningMock(...args),
            }),
          }
        },
      }
    },
    transaction: async (cb: (tx: unknown) => unknown) => {
      transactionMock()
      const result = await cb({
        query: {
          contactsOnSequenceModel: {
            findFirst: (...args: unknown[]) => findFirstMock(...args),
          },
        },
        insert: (table: unknown) => {
          insertMock(table)
          return {
            values: (vals: unknown) => {
              valuesMock(vals)
              return {
                returning: (...args: unknown[]) => returningMock(...args),
                onConflictDoNothing: () => ({
                  returning: (...args: unknown[]) => bulkReturningMock(...args),
                }),
              }
            },
          }
        },
      })
      order.push("tx-done")
      return result
    },
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: { id: "__contactsOnSequence_id" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: {
    useExisting: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  // Must be a class so it survives `new` and Biome's useArrowFunction rule
  SchedulerClient: class {
    addToSchedule = addToScheduleMock
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "test-id",
  }
})

// --- lazy imports after mocks ---
import { getContactInboxes } from "../src/contacts-on-sequences"
import { createDispatch } from "../src/dispatch-manager"
import {
  enrollContactInSequence,
  enrollContactsInSequenceBulk,
} from "../src/enroll-contact"

// --- helpers ---
const NOW = new Date("2024-03-01T10:00:00Z")

function makeEnrollParams(
  overrides: Partial<Parameters<typeof enrollContactInSequence>[0]> = {},
): Parameters<typeof enrollContactInSequence>[0] {
  return {
    workspaceId: "ws-1",
    contactId: "contact-1",
    sequenceId: "seq-1",
    nextRunAt: NOW,
    nextStepId: "step-1",
    ...overrides,
  }
}

function makeBulkParams(
  overrides: Partial<Parameters<typeof enrollContactsInSequenceBulk>[0]> = {},
): Parameters<typeof enrollContactsInSequenceBulk>[0] {
  return {
    workspaceId: "ws-1",
    enrollments: [
      {
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextRunAt: NOW,
        nextStepId: "step-1",
      },
    ],
    ...overrides,
  }
}

const FAKE_DISPATCH = { id: "dispatch-1", bucket: 42, runAtMs: "1700000000000" }

// --- test setup ---
beforeEach(() => {
  vi.clearAllMocks()
  valuesMock.mockReset()
  order.length = 0
  // default: no existing enrollment
  findFirstMock.mockResolvedValue(undefined)
  // default: successful insert returns one row
  returningMock.mockResolvedValue([{ id: "enrollment-1" }])
  // default: one contact inbox
  vi.mocked(getContactInboxes).mockResolvedValue([
    { id: "inbox-1" },
  ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
  // default: dispatch created successfully
  vi.mocked(createDispatch).mockResolvedValue(FAKE_DISPATCH)
  addToScheduleMock.mockImplementation(() => {
    order.push("schedule")
    return Promise.resolve(undefined)
  })
})

// ---------------------------------------------------------------------------
describe("enrollContactInSequence", () => {
  describe("when enrollment already exists", () => {
    test("returns early without inserting", async () => {
      findFirstMock.mockResolvedValue({ id: "existing-enrollment" })

      await enrollContactInSequence(makeEnrollParams())

      expect(insertMock).not.toHaveBeenCalled()
    })

    test("does not create a dispatch or schedule when returning early", async () => {
      findFirstMock.mockResolvedValue({ id: "existing-enrollment" })

      await enrollContactInSequence(makeEnrollParams())

      expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
      expect(addToScheduleMock).not.toHaveBeenCalled()
    })
  })

  describe("when enrollment does not exist and nextStepId is provided", () => {
    test("uses a transaction when no client is provided", async () => {
      await enrollContactInSequence(makeEnrollParams())

      expect(transactionMock).toHaveBeenCalledTimes(1)
      expect(vi.mocked(createDispatch)).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.objectContaining({
            query: expect.any(Object),
            insert: expect.any(Function),
          }),
        }),
      )
    })

    test("uses the provided root db client without wrapping another transaction", async () => {
      const { db } = await import("@chatbotx.io/database/client")

      await enrollContactInSequence(makeEnrollParams({ client: db as never }))

      expect(transactionMock).not.toHaveBeenCalled()
      expect(vi.mocked(createDispatch)).toHaveBeenCalledWith(
        expect.objectContaining({ client: db }),
      )
    })

    test("inserts a new enrollment row", async () => {
      await enrollContactInSequence(makeEnrollParams())

      expect(insertMock).toHaveBeenCalledTimes(1)
      expect(returningMock).toHaveBeenCalledTimes(1)
    })

    test("inserted ContactOnSequence carries workspaceId", async () => {
      await enrollContactInSequence(makeEnrollParams())

      expect(valuesMock.mock.calls[0][0]).toMatchObject({ workspaceId: "ws-1" })
    })

    test("creates a dispatch for each contact inbox", async () => {
      vi.mocked(getContactInboxes).mockResolvedValue([
        { id: "inbox-1" },
        { id: "inbox-2" },
      ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)

      await enrollContactInSequence(makeEnrollParams())

      expect(vi.mocked(createDispatch)).toHaveBeenCalledTimes(2)
    })

    test("passes correct params to createDispatch", async () => {
      await enrollContactInSequence(makeEnrollParams())

      expect(vi.mocked(createDispatch)).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          contactId: "contact-1",
          sequenceId: "seq-1",
          contactInboxId: "inbox-1",
          stepId: "step-1",
          enrollmentId: "enrollment-1",
          runAt: NOW,
          client: expect.any(Object),
        }),
      )
    })

    test("schedules each created dispatch", async () => {
      vi.mocked(getContactInboxes).mockResolvedValue([
        { id: "inbox-1" },
        { id: "inbox-2" },
      ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
      vi.mocked(createDispatch).mockResolvedValue(FAKE_DISPATCH)

      await enrollContactInSequence(makeEnrollParams())

      expect(addToScheduleMock).toHaveBeenCalledTimes(2)
      expect(addToScheduleMock).toHaveBeenCalledWith(
        FAKE_DISPATCH.bucket,
        FAKE_DISPATCH.id,
        Number(FAKE_DISPATCH.runAtMs),
      )
    })

    test("schedules only after the enrollment transaction completes", async () => {
      await enrollContactInSequence(makeEnrollParams())

      expect(order).toEqual(["tx-done", "schedule"])
    })

    test("does not create dispatches when contact has no inboxes", async () => {
      vi.mocked(getContactInboxes).mockResolvedValue([])

      await enrollContactInSequence(makeEnrollParams())

      expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
      expect(addToScheduleMock).not.toHaveBeenCalled()
    })
  })

  describe("when nextStepId is null", () => {
    test("inserts the enrollment row", async () => {
      await enrollContactInSequence(makeEnrollParams({ nextStepId: null }))

      expect(insertMock).toHaveBeenCalledTimes(1)
    })

    test("does not create a dispatch or schedule", async () => {
      await enrollContactInSequence(makeEnrollParams({ nextStepId: null }))

      expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
      expect(addToScheduleMock).not.toHaveBeenCalled()
    })
  })

  describe("when insert returns empty array (unexpected db failure)", () => {
    test("does not create a dispatch or schedule", async () => {
      returningMock.mockResolvedValue([])

      await enrollContactInSequence(makeEnrollParams())

      expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
      expect(addToScheduleMock).not.toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
describe("enrollContactsInSequenceBulk", () => {
  function setUpBulkInsert(
    insertedRows: Array<{
      id: string
      contactId: string
      sequenceId: string
      nextRunAt: Date | null
      nextStepId: string | null
    }>,
  ) {
    bulkReturningMock.mockResolvedValue(insertedRows)
  }

  test("calls addToSchedule for each inbox per enrollment", async () => {
    setUpBulkInsert([
      {
        id: "enroll-1",
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextRunAt: NOW,
        nextStepId: "step-1",
      },
    ])
    vi.mocked(getContactInboxes).mockResolvedValue([
      { id: "inbox-1" },
      { id: "inbox-2" },
    ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
    vi.mocked(createDispatch).mockResolvedValue(FAKE_DISPATCH)

    await enrollContactsInSequenceBulk(makeBulkParams())

    expect(addToScheduleMock).toHaveBeenCalledTimes(2)
  })

  test("does not schedule enrollments that already existed before bulk insert", async () => {
    setUpBulkInsert([])

    await enrollContactsInSequenceBulk(makeBulkParams())

    expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
    expect(addToScheduleMock).not.toHaveBeenCalled()
  })

  test("calls addToSchedule once per enrollment when one inbox exists", async () => {
    setUpBulkInsert([
      {
        id: "enroll-1",
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextRunAt: NOW,
        nextStepId: "step-1",
      },
      {
        id: "enroll-2",
        contactId: "contact-2",
        sequenceId: "seq-1",
        nextRunAt: NOW,
        nextStepId: "step-1",
      },
    ])
    vi.mocked(getContactInboxes).mockResolvedValue([
      { id: "inbox-1" },
    ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
    vi.mocked(createDispatch).mockResolvedValue(FAKE_DISPATCH)

    await enrollContactsInSequenceBulk(makeBulkParams())

    // 2 enrollments × 1 inbox each
    expect(addToScheduleMock).toHaveBeenCalledTimes(2)
  })

  test("skips enrollment when nextStepId is null", async () => {
    setUpBulkInsert([
      {
        id: "enroll-1",
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextRunAt: NOW,
        nextStepId: null,
      },
    ])

    await enrollContactsInSequenceBulk(makeBulkParams())

    expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
    expect(addToScheduleMock).not.toHaveBeenCalled()
  })

  test("skips enrollment when nextRunAt is null", async () => {
    setUpBulkInsert([
      {
        id: "enroll-1",
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextRunAt: null,
        nextStepId: "step-1",
      },
    ])

    await enrollContactsInSequenceBulk(makeBulkParams())

    expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
    expect(addToScheduleMock).not.toHaveBeenCalled()
  })

  test("skips enrollment when both nextStepId and nextRunAt are null", async () => {
    setUpBulkInsert([
      {
        id: "enroll-1",
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextRunAt: null,
        nextStepId: null,
      },
    ])

    await enrollContactsInSequenceBulk(makeBulkParams())

    expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
    expect(addToScheduleMock).not.toHaveBeenCalled()
  })

  test("passes correct params to createDispatch including enrollment id and runAt", async () => {
    const runAt = new Date("2024-06-01T09:00:00Z")
    setUpBulkInsert([
      {
        id: "enroll-42",
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextRunAt: runAt,
        nextStepId: "step-99",
      },
    ])
    vi.mocked(getContactInboxes).mockResolvedValue([
      { id: "inbox-X" },
    ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
    vi.mocked(createDispatch).mockResolvedValue(FAKE_DISPATCH)

    await enrollContactsInSequenceBulk(makeBulkParams())

    expect(vi.mocked(createDispatch)).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        sequenceId: "seq-1",
        contactInboxId: "inbox-X",
        stepId: "step-99",
        enrollmentId: "enroll-42",
        runAt,
      }),
    )
  })
})
