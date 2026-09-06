import type { Job } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------- db client stub (source passes `db` through as dbClient) ----------
vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
}))

// ---------- scheduler / redis spies ----------
// removeFromScheduleSpy is accessed at instance-creation time (during tests,
// not at import time), so vi.hoisted is not needed.
const removeFromScheduleSpy = vi.fn()

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class MockSchedulerClient {
    removeFromSchedule = removeFromScheduleSpy
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: {
    useExisting: vi.fn().mockResolvedValue({}),
  },
}))

// ---------- sequence-scheduler spies ----------
// sequence-flow.ts now delegates all dispatch persistence to
// sequenceDispatchUtils.{findRunning,markCompleted,markCanceled,markFailed}.
const advanceEnrollmentSpy = vi.fn()
const findRunningSpy = vi.fn()
const markCompletedSpy = vi.fn()
const markCanceledSpy = vi.fn()
const markFailedSpy = vi.fn()

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  advanceEnrollment: (...args: unknown[]) => advanceEnrollmentSpy(...args),
  sequenceDispatchUtils: {
    findRunning: (...args: unknown[]) => findRunningSpy(...args),
    markCompleted: (...args: unknown[]) => markCompletedSpy(...args),
    markCanceled: (...args: unknown[]) => markCanceledSpy(...args),
    markFailed: (...args: unknown[]) => markFailedSpy(...args),
  },
}))

// ---------- step executor spy (module-level singleton in source) ----------
// Must use vi.hoisted() so the spies exist before the class field initializers
// fire at module-import time (sequence-flow.ts does `new StepExecutorService()`
// at module level, which runs before regular const declarations are initialized).
const { fetchStepSpy, validateStepSpy } = vi.hoisted(() => ({
  fetchStepSpy: vi.fn(),
  validateStepSpy: vi.fn(),
}))

vi.mock("../src/sequence-scheduler/services/step-executor.service", () => ({
  StepExecutorService: class MockStepExecutorService {
    fetchStep = fetchStepSpy
    validateStep = validateStepSpy
  },
}))

// ---------- send-flow-direct spy ----------
const sendFlowDirectSpy = vi.fn()

vi.mock("../src/integration/handlers/send-flow-direct", () => ({
  sendFlowDirect: (...args: unknown[]) => sendFlowDirectSpy(...args),
}))

// ---------- logger spy ----------
const loggerErrorSpy = vi.fn()

vi.mock("../src/lib/logger", () => ({
  logger: { error: (...args: unknown[]) => loggerErrorSpy(...args) },
}))

import { handleSendSequenceFlow } from "../src/integration/handlers/sequence-flow"

// ---------- fixtures ----------

function makeData(
  overrides: Record<string, unknown> = {},
): Parameters<typeof handleSendSequenceFlow>[0] {
  return {
    dispatchId: "dispatch-1",
    workspaceId: "ws-1",
    stepId: "step-1",
    bucket: 42,
    contactId: "contact-1",
    sequenceId: "seq-1",
    enrollmentId: "enroll-1",
    metadata: {},
    ...overrides,
  } as unknown as Parameters<typeof handleSendSequenceFlow>[0]
}

function makeJob(
  overrides: Partial<{
    attemptsMade: number
    attempts: number
    id: string
  }> = {},
): Job {
  const { attemptsMade = 0, attempts = 3, id = "job-1" } = overrides
  return {
    id,
    attemptsMade,
    opts: { attempts },
  } as unknown as Job
}

function makeDispatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "dispatch-1",
    workspaceId: "ws-1",
    status: "pending",
    completedAt: null,
    ...overrides,
  }
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "step-1",
    order: 1,
    isActive: true,
    flow: { id: "flow-1" },
    ...overrides,
  }
}

beforeEach(() => {
  // sequence-scheduler defaults
  findRunningSpy.mockResolvedValue(makeDispatch())
  markCompletedSpy.mockResolvedValue(undefined)
  markCanceledSpy.mockResolvedValue(undefined)
  markFailedSpy.mockResolvedValue(undefined)

  // scheduler defaults
  removeFromScheduleSpy.mockResolvedValue(undefined)
  advanceEnrollmentSpy.mockResolvedValue(undefined)

  // step executor defaults
  const step = makeStep()
  fetchStepSpy.mockResolvedValue(step)
  validateStepSpy.mockReturnValue({ valid: true, step })

  // send-flow-direct default
  sendFlowDirectSpy.mockResolvedValue(new Date())
})

// ---------- tests ----------

describe("handleSendSequenceFlow", () => {
  describe("happy path — fresh dispatch (no completedAt)", () => {
    test("calls sendFlowDirect then marks dispatch completed", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(sendFlowDirectSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: "flow-1",
          workspaceId: "ws-1",
          contactId: "contact-1",
        }),
      )
      expect(markCompletedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchId: "dispatch-1",
          workspaceId: "ws-1",
          sentAt: expect.any(Date),
        }),
      )
    })

    test("calls advanceEnrollment with correct enrollment + step info", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(advanceEnrollmentSpy).toHaveBeenCalledTimes(1)
      expect(advanceEnrollmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollmentId: "enroll-1",
          workspaceId: "ws-1",
          sequenceId: "seq-1",
          contactId: "contact-1",
          currentStep: { id: "step-1", order: 1 },
        }),
      )
    })

    test("removes the dispatch from the schedule bucket", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(removeFromScheduleSpy).toHaveBeenCalledWith(42, "dispatch-1")
    })
  })

  describe("idempotent re-delivery — dispatch already has completedAt", () => {
    test("skips sendFlowDirect and reuses the existing sentAt", async () => {
      // Arrange
      const completedAt = new Date("2025-01-01T10:00:00Z")
      findRunningSpy.mockResolvedValue(makeDispatch({ completedAt }))

      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert — flow must NOT be sent again
      expect(sendFlowDirectSpy).not.toHaveBeenCalled()
      expect(advanceEnrollmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sentAt: completedAt }),
      )
    })
  })

  describe("dispatch not found", () => {
    test("returns early without touching db, scheduler, or advanceEnrollment", async () => {
      // Arrange
      findRunningSpy.mockResolvedValue(undefined)

      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(markCompletedSpy).not.toHaveBeenCalled()
      expect(markCanceledSpy).not.toHaveBeenCalled()
      expect(markFailedSpy).not.toHaveBeenCalled()
      expect(sendFlowDirectSpy).not.toHaveBeenCalled()
      expect(advanceEnrollmentSpy).not.toHaveBeenCalled()
      expect(removeFromScheduleSpy).not.toHaveBeenCalled()
    })
  })

  describe("step invalid — step exists in db", () => {
    beforeEach(() => {
      const step = makeStep({ isActive: false })
      fetchStepSpy.mockResolvedValue(step)
      validateStepSpy.mockReturnValue({ valid: false, reason: "step_inactive" })
    })

    test("marks dispatch canceled with the validation reason", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(markCanceledSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchId: "dispatch-1",
          workspaceId: "ws-1",
          reason: "step_inactive",
        }),
      )
    })

    test("still calls advanceEnrollment so enrollment progresses past the dead step", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(advanceEnrollmentSpy).toHaveBeenCalledTimes(1)
    })

    test("removes dispatch from schedule", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(removeFromScheduleSpy).toHaveBeenCalledWith(42, "dispatch-1")
    })

    test("does NOT call sendFlowDirect", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(sendFlowDirectSpy).not.toHaveBeenCalled()
    })
  })

  describe("step not found in db", () => {
    beforeEach(() => {
      fetchStepSpy.mockResolvedValue(undefined)
      validateStepSpy.mockReturnValue({
        valid: false,
        reason: "step_not_found",
      })
    })

    test("marks dispatch canceled", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(markCanceledSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchId: "dispatch-1",
          workspaceId: "ws-1",
          reason: "step_not_found",
        }),
      )
    })

    test("does NOT call advanceEnrollment — no step to advance past", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(advanceEnrollmentSpy).not.toHaveBeenCalled()
    })

    test("still removes dispatch from schedule", async () => {
      // Act
      await handleSendSequenceFlow(makeData(), makeJob())

      // Assert
      expect(removeFromScheduleSpy).toHaveBeenCalledWith(42, "dispatch-1")
    })
  })

  describe("sendFlowDirect throws on final attempt", () => {
    beforeEach(() => {
      sendFlowDirectSpy.mockRejectedValue(new Error("send failed"))
    })

    test("marks dispatch failed via terminal cleanup", async () => {
      // Arrange — final attempt
      const job = makeJob({ attemptsMade: 2, attempts: 3 })

      // Act
      await expect(handleSendSequenceFlow(makeData(), job)).rejects.toThrow(
        "send failed",
      )

      // Assert
      expect(markFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dispatchId: "dispatch-1",
          workspaceId: "ws-1",
          errorMessage: "send failed",
        }),
      )
    })

    test("removes dispatch from schedule during terminal cleanup", async () => {
      // Arrange
      const job = makeJob({ attemptsMade: 2, attempts: 3 })

      // Act
      await expect(handleSendSequenceFlow(makeData(), job)).rejects.toThrow()

      // Assert
      expect(removeFromScheduleSpy).toHaveBeenCalledWith(42, "dispatch-1")
    })

    test("rethrows the error so BullMQ can retry", async () => {
      // Arrange
      const job = makeJob({ attemptsMade: 2, attempts: 3 })

      // Act + Assert
      await expect(handleSendSequenceFlow(makeData(), job)).rejects.toThrow(
        "send failed",
      )
    })
  })

  describe("sendFlowDirect throws on non-final attempt", () => {
    beforeEach(() => {
      sendFlowDirectSpy.mockRejectedValue(new Error("transient error"))
    })

    test("rethrows without marking dispatch failed", async () => {
      // Arrange — first of three attempts
      const job = makeJob({ attemptsMade: 0, attempts: 3 })

      // Act
      await expect(handleSendSequenceFlow(makeData(), job)).rejects.toThrow(
        "transient error",
      )

      // Assert — no terminal cleanup
      expect(markFailedSpy).not.toHaveBeenCalled()
    })

    test("logs the error with attempt and isFinalAttempt info", async () => {
      // Arrange
      const job = makeJob({ attemptsMade: 0, attempts: 3 })

      // Act
      await expect(handleSendSequenceFlow(makeData(), job)).rejects.toThrow()

      // Assert
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          isFinalAttempt: false,
          dispatchId: "dispatch-1",
        }),
        expect.any(String),
      )
    })
  })
})
