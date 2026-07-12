import { beforeEach, describe, expect, test, vi } from "vitest"

// --- top-level spies (captured by vi.mock factory closures) ---
const findFirstMock = vi.fn()
const updateMock = vi.fn()
const setMock = vi.fn()
const whereUpdateMock = vi.fn()
const selectLimitMock = vi.fn()
const transactionMock = vi.fn()
const order: string[] = []

// --- module mocks (hoisted) ---
vi.mock("../src/contacts-on-sequences", () => ({
  getContactInboxes: vi.fn(),
}))

vi.mock("../src/dispatch-manager", () => ({
  createDispatch: vi.fn(),
}))

vi.mock("../src/calculate-next-run-at", () => ({
  calculateNextRunAtFromStep: vi.fn(),
}))

vi.mock("../src/send-time-validator", () => ({
  calculateNextValidSendTime: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactsOnSequenceModel: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
    },
    select: () => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          orderBy: (_ord: unknown) => ({
            limit: (...args: unknown[]) => selectLimitMock(...args),
          }),
        }),
      }),
    }),
    update: (table: unknown) => {
      updateMock(table)
      return {
        set: (vals: unknown) => {
          setMock(vals)
          return {
            where: (...args: unknown[]) => whereUpdateMock(...args),
          }
        },
      }
    },
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
  and: (...a: unknown[]) => ({ __and: a }),
  eq: (c: unknown, v: unknown) => ({ __eq: [c, v] }),
  asc: (c: unknown) => ({ __asc: c }),
  gt: (c: unknown, v: unknown) => ({ __gt: [c, v] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: { id: "__cos_id", workspaceId: "__cos_ws" },
  sequenceStepModel: {
    sequenceId: "__step_seqId",
    order: "__step_order",
    isActive: "__step_isActive",
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "test-id",
  }
})

import { advanceEnrollment } from "../src/advance-enrollment"
// --- lazy imports after mocks ---
import { calculateNextRunAtFromStep } from "../src/calculate-next-run-at"
import { getContactInboxes } from "../src/contacts-on-sequences"
import { createDispatch } from "../src/dispatch-manager"
import { calculateNextValidSendTime } from "../src/send-time-validator"

// --- helpers ---
const SENT_AT = new Date("2024-03-01T12:00:00Z")
const NEXT_RUN_AT = new Date("2024-03-02T09:00:00Z")

const NEXT_STEP = {
  id: "step-2",
  order: 1,
  delayDays: 1,
  delayMinutes: 0,
  delayUnit: null,
  specificDateTime: null,
  anytime: true,
  sendTimeStart: null,
  sendTimeEnd: null,
  sendDays: null,
}

function makeActiveEnrollment(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "enrollment-1",
    workspaceId: "ws-1",
    sequenceId: "seq-1",
    contactId: "contact-1",
    status: "active",
    lastStepId: null,
    currentStep: 0,
    ...overrides,
  }
}

function makeParams(
  overrides: Partial<Parameters<typeof advanceEnrollment>[0]> = {},
): Parameters<typeof advanceEnrollment>[0] {
  return {
    enrollmentId: "enrollment-1",
    workspaceId: "ws-1",
    sequenceId: "seq-1",
    contactId: "contact-1",
    currentStep: { id: "step-1", order: 0 },
    sentAt: SENT_AT,
    scheduler: { addToSchedule: vi.fn() } as unknown as Parameters<
      typeof advanceEnrollment
    >[0]["scheduler"],
    ...overrides,
  }
}

const FAKE_DISPATCH = { id: "dispatch-1", bucket: 7, runAtMs: "1700000000000" }

// --- test setup ---
beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  // default: active enrollment exists
  findFirstMock.mockResolvedValue(makeActiveEnrollment())
  // default: no next step
  selectLimitMock.mockResolvedValue([])
  // default: update resolves
  whereUpdateMock.mockResolvedValue(undefined)
  // default: one inbox
  vi.mocked(getContactInboxes).mockResolvedValue([
    { id: "inbox-1" },
  ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
  // default: dispatch created
  vi.mocked(createDispatch).mockResolvedValue(FAKE_DISPATCH)
  // default: calculateNextRunAtFromStep returns NEXT_RUN_AT
  vi.mocked(calculateNextRunAtFromStep).mockReturnValue(NEXT_RUN_AT)
  // default: calculateNextValidSendTime passes through
  vi.mocked(calculateNextValidSendTime).mockImplementation(
    (date: unknown) => date as Date,
  )
})

// ---------------------------------------------------------------------------
describe("advanceEnrollment", () => {
  describe("when enrollment is not found", () => {
    test("throws with message containing the enrollment id", async () => {
      findFirstMock.mockResolvedValue(undefined)

      await expect(
        advanceEnrollment(makeParams({ enrollmentId: "missing-id" })),
      ).rejects.toThrow("Enrollment missing-id not found")
    })
  })

  describe("when enrollment status is not active", () => {
    test("returns without updating when status is paused", async () => {
      findFirstMock.mockResolvedValue(
        makeActiveEnrollment({ status: "paused" }),
      )

      await advanceEnrollment(makeParams())

      expect(updateMock).not.toHaveBeenCalled()
    })

    test("returns without updating when status is completed", async () => {
      findFirstMock.mockResolvedValue(
        makeActiveEnrollment({ status: "completed" }),
      )

      await advanceEnrollment(makeParams())

      expect(updateMock).not.toHaveBeenCalled()
    })
  })

  describe("when enrollment has already been advanced past the current step", () => {
    test("returns without updating when lastStepId matches currentStep.id", async () => {
      findFirstMock.mockResolvedValue(
        makeActiveEnrollment({ lastStepId: "step-1" }),
      )

      await advanceEnrollment(
        makeParams({ currentStep: { id: "step-1", order: 0 } }),
      )

      expect(updateMock).not.toHaveBeenCalled()
    })
  })

  describe("when there is no next step (sequence completed)", () => {
    test("updates enrollment status to completed", async () => {
      selectLimitMock.mockResolvedValue([])

      await advanceEnrollment(makeParams())

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      )
    })

    test("sets completedAt to the sentAt value", async () => {
      selectLimitMock.mockResolvedValue([])

      await advanceEnrollment(makeParams())

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ completedAt: SENT_AT }),
      )
    })

    test("sets nextStepId and nextRunAt to null", async () => {
      selectLimitMock.mockResolvedValue([])

      await advanceEnrollment(makeParams())

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ nextStepId: null, nextRunAt: null }),
      )
    })

    test("increments currentStep to currentStep.order + 1", async () => {
      selectLimitMock.mockResolvedValue([])

      await advanceEnrollment(
        makeParams({ currentStep: { id: "step-1", order: 2 } }),
      )

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ currentStep: 3 }),
      )
    })

    test("does not create a dispatch or call scheduler", async () => {
      selectLimitMock.mockResolvedValue([])

      await advanceEnrollment(makeParams())

      expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
    })

    test("does not start a transaction", async () => {
      selectLimitMock.mockResolvedValue([])

      await advanceEnrollment(makeParams())

      expect(transactionMock).not.toHaveBeenCalled()
    })
  })

  describe("when there is a next step", () => {
    function setUpTransactionWithTxMocks(
      txUpdateWhereMock = vi.fn().mockResolvedValue(undefined),
    ) {
      transactionMock.mockImplementation(
        async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            update: (_table: unknown) => ({
              set: (_vals: unknown) => ({
                where: txUpdateWhereMock,
              }),
            }),
          }
          const result = await cb(tx)
          order.push("tx-done")
          return result
        },
      )
      return txUpdateWhereMock
    }

    test("starts a database transaction", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      setUpTransactionWithTxMocks()

      await advanceEnrollment(makeParams())

      expect(transactionMock).toHaveBeenCalledTimes(1)
    })

    test("does NOT call the top-level db.update (uses tx.update instead)", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      setUpTransactionWithTxMocks()

      await advanceEnrollment(makeParams())

      expect(updateMock).not.toHaveBeenCalled()
    })

    test("creates a dispatch for each contact inbox inside the transaction", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      vi.mocked(getContactInboxes).mockResolvedValue([
        { id: "inbox-1" },
        { id: "inbox-2" },
      ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
      setUpTransactionWithTxMocks()

      await advanceEnrollment(makeParams())

      expect(vi.mocked(createDispatch)).toHaveBeenCalledTimes(2)
    })

    test("passes correct params to createDispatch", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      vi.mocked(calculateNextRunAtFromStep).mockReturnValue(NEXT_RUN_AT)
      vi.mocked(calculateNextValidSendTime).mockImplementation(
        (date: unknown) => date as Date,
      )
      setUpTransactionWithTxMocks()

      const params = makeParams()
      await advanceEnrollment(params)

      expect(vi.mocked(createDispatch)).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          sequenceId: "seq-1",
          contactId: "contact-1",
          stepId: "step-2",
          enrollmentId: "enrollment-1",
          runAt: NEXT_RUN_AT,
          contactInboxId: "inbox-1",
        }),
      )
    })

    test("calls scheduler.addToSchedule for each dispatch created", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      vi.mocked(getContactInboxes).mockResolvedValue([
        { id: "inbox-1" },
        { id: "inbox-2" },
      ] as unknown as Awaited<ReturnType<typeof getContactInboxes>>)
      vi.mocked(createDispatch).mockResolvedValue(FAKE_DISPATCH)
      setUpTransactionWithTxMocks()

      const mockScheduler = {
        addToSchedule: vi.fn().mockResolvedValue(undefined),
      }
      await advanceEnrollment(
        makeParams({
          scheduler: mockScheduler as unknown as Parameters<
            typeof advanceEnrollment
          >[0]["scheduler"],
        }),
      )

      expect(mockScheduler.addToSchedule).toHaveBeenCalledTimes(2)
      expect(mockScheduler.addToSchedule).toHaveBeenCalledWith(
        FAKE_DISPATCH.bucket,
        FAKE_DISPATCH.id,
        Number(FAKE_DISPATCH.runAtMs),
      )
    })

    test("schedules only after the advance transaction completes", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      setUpTransactionWithTxMocks()

      const mockScheduler = {
        addToSchedule: vi.fn().mockImplementation(() => {
          order.push("schedule")
          return Promise.resolve(undefined)
        }),
      }

      await advanceEnrollment(
        makeParams({
          scheduler: mockScheduler as unknown as Parameters<
            typeof advanceEnrollment
          >[0]["scheduler"],
        }),
      )

      expect(order).toEqual(["tx-done", "schedule"])
    })

    test("does not create dispatches when contact has no inboxes", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      vi.mocked(getContactInboxes).mockResolvedValue([])
      setUpTransactionWithTxMocks()

      await advanceEnrollment(makeParams())

      expect(vi.mocked(createDispatch)).not.toHaveBeenCalled()
    })

    test("sets lastStepId to current step id in the update", async () => {
      selectLimitMock.mockResolvedValue([NEXT_STEP])
      const txSetSpy = vi.fn()
      transactionMock.mockImplementation(
        (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const tx = {
            update: (_table: unknown) => ({
              set: (vals: unknown) => {
                txSetSpy(vals)
                return {
                  where: vi.fn().mockResolvedValue(undefined),
                }
              },
            }),
          }
          return cb(tx)
        },
      )

      await advanceEnrollment(
        makeParams({ currentStep: { id: "step-1", order: 0 } }),
      )

      expect(txSetSpy).toHaveBeenCalledWith(
        expect.objectContaining({ lastStepId: "step-1", nextStepId: "step-2" }),
      )
    })
  })
})
